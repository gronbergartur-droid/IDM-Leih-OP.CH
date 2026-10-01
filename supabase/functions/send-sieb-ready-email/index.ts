// IDM Mobile - notifies a supplier by e-mail that a loaner Sieb has been
// sterilized and is ready for pickup/return, attaching the freshly
// photographed hygiene passport (a new one every sterilization cycle).
//
// Runs with the caller's own JWT forwarded (not the service role), so every
// read/write here is still subject to the RLS policies in
// supabase/migrations/0002_auth_roles.sql and 0003_sieb_readiness.sql - an
// inactive account can't reach this function's data any more than it could
// through the REST API directly. The recipient address is looked up
// server-side from the supplier record, never trusted from the client.
//
// Requires the RESEND_API_KEY secret (Supabase Dashboard -> Edge Functions
// -> Secrets). RESEND_FROM_EMAIL is optional and defaults to Resend's
// shared sandbox sender, which only delivers to the Resend account owner's
// own address - a verified sending domain is required to actually reach
// suppliers in production.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "onboarding@resend.dev";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// The browser sends a CORS preflight (OPTIONS) before the actual POST for
// any cross-origin request carrying an Authorization header - which every
// call here does. Without handling it and echoing these headers on every
// response (success and error alike), the preflight itself gets rejected
// and the browser never even sends the real request, surfacing to the
// Supabase JS client as an opaque "Failed to send a request to the Edge
// Function" with no further detail.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonError("Method not allowed.", 405);
  if (!RESEND_API_KEY) return jsonError("RESEND_API_KEY ist nicht konfiguriert.", 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError("Nicht angemeldet.", 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return jsonError("Nicht angemeldet.", 401);

  let body: { caseId?: string; hygienePassportPhotoDataUrl?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Ungültige Anfrage.", 400);
  }
  const { caseId, hygienePassportPhotoDataUrl } = body;
  if (!caseId || !hygienePassportPhotoDataUrl) {
    return jsonError("caseId und Foto sind erforderlich.", 400);
  }

  const match = /^data:(image\/\w+);base64,(.+)$/.exec(hygienePassportPhotoDataUrl);
  if (!match) return jsonError("Ungültiges Bildformat.", 400);
  const [, mimeType, base64Content] = match;
  const extension = mimeType.split("/")[1] || "jpg";

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile) return jsonError("Profil nicht gefunden oder nicht freigeschaltet.", 403);

  const { data: loanCase, error: caseError } = await supabase
    .from("loan_cases")
    .select("id, tray_id, supplier_id, operation_note, operation_date")
    .eq("id", caseId)
    .maybeSingle();
  if (caseError || !loanCase) return jsonError("Fall nicht gefunden.", 404);

  const [{ data: tray }, { data: supplier }] = await Promise.all([
    supabase.from("trays").select("code, name").eq("id", loanCase.tray_id).maybeSingle(),
    supabase.from("suppliers").select("name, contact_email").eq("id", loanCase.supplier_id).maybeSingle(),
  ]);

  if (!supplier?.contact_email) {
    return jsonError("Für diesen Lieferanten ist keine E-Mail-Adresse hinterlegt.", 422);
  }

  const subject = `Sieb ${tray?.code ?? ""} bereit für Abholung`;
  const bodyHtml = `
    <p>Guten Tag,</p>
    <p>das Leihsieb <strong>${escapeHtml(tray?.code ?? "")}${
      tray?.name ? ` – ${escapeHtml(tray.name)}` : ""
    }</strong> wurde sterilisiert und ist bereit für die Abholung bzw. den Rückversand.</p>
    <p>Der Hygiene-Pass der aktuellen Sterilisationscharge ist als Anhang beigefügt.</p>
    ${loanCase.operation_note ? `<p>Referenz: ${escapeHtml(loanCase.operation_note)}</p>` : ""}
    ${loanCase.operation_date ? `<p>Operationsdatum: ${escapeHtml(loanCase.operation_date)}</p>` : ""}
    <p>Freundliche Grüsse<br/>AEMP</p>
  `;

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [supplier.contact_email],
      subject,
      html: bodyHtml,
      attachments: [{ filename: `hygiene-pass.${extension}`, content: base64Content }],
    }),
  });

  if (!emailResponse.ok) {
    const detail = await emailResponse.text();
    return jsonError(`E-Mail-Versand fehlgeschlagen: ${detail}`, 502);
  }

  const now = new Date().toISOString();
  const { data: updatedCase, error: updateError } = await supabase
    .from("loan_cases")
    .update({
      hygiene_passport_photo_url: hygienePassportPhotoDataUrl,
      readiness_notified_at: now,
    })
    .eq("id", caseId)
    .select("*")
    .single();
  if (updateError) return jsonError(updateError.message, 500);

  await supabase.from("audit_log").insert({
    id: crypto.randomUUID(),
    entity_type: "case",
    entity_id: caseId,
    action: "case_readiness_notified",
    performed_by: profile.display_name,
    details: { supplierEmail: supplier.contact_email, trayCode: tray?.code ?? null },
    created_at: now,
  });

  return new Response(JSON.stringify(updatedCase), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
