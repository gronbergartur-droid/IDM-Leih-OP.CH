// IDM-Leih-OP.CH - Repair AI confirmation security hardening.
//
// Human confirmation of a Cloud Agent repair-photo suggestion
// (Übernehmen/Korrigieren/Anderes Instrument/Ablehnen - see
// src/features/repair/RepairDetailPage.tsx) used to be a direct client
// UPDATE on repair_cases. RLS only restricts which ROWS a role can touch,
// not which COLUMNS, so any active authenticated user could instead PATCH
// ai_confirmation/confirmed_by/confirmed_at directly via the REST API and
// forge a confirmation - including putting someone else's name on it -
// that never actually happened. supabase/migrations/
// 0013_repair_cases_column_protection.sql revokes UPDATE on those columns
// (plus ai_suggestion) from `authenticated` entirely; this function is now
// the only legitimate way to write them.
//
// Two Supabase clients, two different jobs:
// - `supabase` (anon key + forwarded user JWT) proves who the caller is
//   and that RLS already lets them see this row - exactly the same trust
//   boundary every other screen sits behind. Also used for the audit_log
//   insert, which stays subject to its own existing RLS
//   (performed_by = current_display_name()).
// - `privileged` (service role key, Supabase's own built-in secret -
//   nothing new to configure) performs the one write that needed the
//   column-grant revoked above bypassed, only after the checks below
//   pass. The service role is never given more than this single,
//   narrowly-scoped write.
//
// confirmedBy is deliberately never taken from the client - it is always
// the caller's own profile.display_name, so this can't be spoofed.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_ACTIONS = ["accepted", "corrected", "other_instrument", "rejected"] as const;
type AiConfirmationAction = (typeof VALID_ACTIONS)[number];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** Ported verbatim from src/features/repair/resolveAiConfirmation.ts - keep the two in sync. */
function resolveAiConfirmation(
  existing: { instrumentName: string; refNumber: string | null },
  aiSuggestion: { instrumentCandidate: string; refCandidate: string | null } | null,
  action: AiConfirmationAction,
  override: { instrumentName?: string; refNumber?: string | null } | null,
): { instrumentName: string; refNumber: string | null } {
  if (action === "accepted") {
    if (!aiSuggestion) return existing;
    return { instrumentName: aiSuggestion.instrumentCandidate, refNumber: aiSuggestion.refCandidate };
  }
  if (action === "corrected" || action === "other_instrument") {
    return {
      instrumentName: override?.instrumentName?.trim() || existing.instrumentName,
      refNumber: override?.refNumber !== undefined ? override.refNumber : existing.refNumber,
    };
  }
  return existing; // 'rejected'
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonError("Method not allowed.", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError("Nicht angemeldet.", 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return jsonError("Nicht angemeldet.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile) return jsonError("Profil nicht gefunden oder nicht freigeschaltet.", 403);

  let body: {
    repairCaseId?: unknown;
    action?: unknown;
    override?: { instrumentName?: unknown; refNumber?: unknown } | null;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Ungültige Anfrage.", 400);
  }

  const { repairCaseId, action, override } = body;
  if (typeof repairCaseId !== "string" || !repairCaseId) return jsonError("repairCaseId ist erforderlich.", 400);
  if (typeof action !== "string" || !VALID_ACTIONS.includes(action as AiConfirmationAction)) {
    return jsonError("action ist ungültig.", 400);
  }
  const normalizedOverride =
    override && typeof override === "object"
      ? {
          instrumentName: typeof override.instrumentName === "string" ? override.instrumentName : undefined,
          refNumber: typeof override.refNumber === "string" ? override.refNumber : undefined,
        }
      : null;
  if (
    (action === "corrected" || action === "other_instrument") &&
    !normalizedOverride?.instrumentName?.trim()
  ) {
    return jsonError("instrumentName ist für diese Aktion erforderlich.", 400);
  }

  const { data: repairCase, error: caseError } = await supabase
    .from("repair_cases")
    .select("*")
    .eq("id", repairCaseId)
    .maybeSingle();
  if (caseError || !repairCase) return jsonError("Reparatur nicht gefunden.", 404);
  if (!repairCase.ai_suggestion) return jsonError("Für diese Reparatur liegt kein KI-Vorschlag vor.", 422);
  if (repairCase.ai_confirmation) return jsonError("Dieser KI-Vorschlag wurde bereits bestätigt.", 409);

  const resolved = resolveAiConfirmation(
    { instrumentName: repairCase.instrument_name, refNumber: repairCase.ref_number },
    repairCase.ai_suggestion,
    action as AiConfirmationAction,
    normalizedOverride,
  );

  const now = new Date().toISOString();
  const privileged = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: updated, error: updateError } = await privileged
    .from("repair_cases")
    .update({
      instrument_name: resolved.instrumentName,
      ref_number: resolved.refNumber,
      ai_confirmation: action,
      confirmed_by: profile.display_name,
      confirmed_at: now,
    })
    .eq("id", repairCaseId)
    .select("*")
    .single();
  if (updateError) return jsonError(updateError.message, 500);

  await supabase.from("audit_log").insert({
    id: crypto.randomUUID(),
    entity_type: "repair",
    entity_id: repairCaseId,
    action: "repair_ai_confirmed",
    performed_by: profile.display_name,
    details: { decision: action },
    created_at: now,
  });

  return new Response(JSON.stringify(updated), { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
});
