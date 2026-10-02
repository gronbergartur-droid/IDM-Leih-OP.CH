// IDM-Leih-OP.CH v2.2 Phase 3 - IDM Intelligence Pilot (Cloud Agent).
//
// Runs assistive, photo-based recognition over an already-reported repair
// case (supabase/migrations/0008_repair_cases.sql,
// 0009_repair_ai_suggestion.sql): candidate instrument, REF/article number
// if visible, cautiously-worded visible defect candidates, a confidence
// score and the evidence behind it. This is always a *proposal* - see
// docs/roadmap/v2.2/MASTER-PROMPT-v2.2.md section 4 "Prohibited AI
// actions": the model is never asked for, and must never be trusted to
// give, a fitness-for-use/safety verdict, and nothing here changes
// workflow status or master data on its own. A human must explicitly
// accept/correct/reject the result (confirmRepairAiSuggestion in
// src/services/supabaseProvider.ts) before it becomes the case's recorded
// instrument/REF.
//
// Idempotent: if ai_suggestion is already set for this case, the existing
// stored result is returned as-is rather than calling the model again
// (acceptance test "duplicate processing of the same image is idempotent").
//
// Runs with the caller's own JWT forwarded (not the service role), so RLS
// still applies exactly as it would through the REST API directly.
//
// Requires the ANTHROPIC_API_KEY secret (Supabase Dashboard -> Edge
// Functions -> Secrets). ANTHROPIC_MODEL is optional and defaults to
// Claude Sonnet 5.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const VISIBLE_DEFECT_CANDIDATES = [
  "sichtbare Deformation",
  "sichtbarer Bruch",
  "möglicher Riss",
  "Korrosion",
  "Verfärbung",
  "beschädigte Oberfläche",
  "fehlendes sichtbares Teil",
  "Verschleiss",
  "verbogene Spitze",
  "unregelmässiger Schluss",
];

const SYSTEM_PROMPT = `Du bist ein unterstützender Bilderkennungs-Assistent für die AEMP (Aufbereitungseinheit für Medizinprodukte) eines Schweizer Spitals. Du analysierst Fotos eines gemeldeten, moeglicherweise defekten chirurgischen Instruments.

Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt, ohne Markdown, ohne Erklaerung davor oder danach, exakt in diesem Format:
{
  "instrumentCandidate": string,
  "refCandidate": string | null,
  "defectCandidates": string[],
  "confidence": number,
  "evidence": string[]
}

Regeln:
- "instrumentCandidate": wahrscheinlichste Bezeichnung des Instruments (Deutsch, Schweiz), basierend ausschliesslich auf dem sichtbaren Erscheinungsbild.
- "refCandidate": REF/Artikelnummer NUR wenn auf einem Etikett im Bild klar lesbar, sonst null. Nicht raten.
- "defectCandidates": waehle ausschliesslich aus dieser Liste, nur was im Bild sichtbar ist (leeres Array wenn kein Defekt sichtbar): ${JSON.stringify(VISIBLE_DEFECT_CANDIDATES)}.
- "confidence": 0-100, deine Sicherheit bei der Instrument-Erkennung (nicht beim Defekt).
- "evidence": 2-5 kurze, sachliche Stichpunkte auf Deutsch, die deine Einschaetzung stuetzen (z.B. "Form aehnlich bekannten Scheren", "Hersteller-Praegung erkennbar").
- Du bewertest NIEMALS, ob das Instrument sicher, einsatzfaehig oder reparabel ist - das ist nicht deine Aufgabe und entscheidet ausschliesslich Fachpersonal.
- Bei Unsicherheit: niedrige confidence statt Raten.`;

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

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonError("Method not allowed.", 405);
  if (!ANTHROPIC_API_KEY) return jsonError("ANTHROPIC_API_KEY ist nicht konfiguriert.", 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError("Nicht angemeldet.", 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return jsonError("Nicht angemeldet.", 401);

  let body: { repairCaseId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Ungültige Anfrage.", 400);
  }
  const { repairCaseId } = body;
  if (!repairCaseId) return jsonError("repairCaseId ist erforderlich.", 400);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile) return jsonError("Profil nicht gefunden oder nicht freigeschaltet.", 403);

  const { data: repairCase, error: caseError } = await supabase
    .from("repair_cases")
    .select("*")
    .eq("id", repairCaseId)
    .maybeSingle();
  if (caseError || !repairCase) return jsonError("Reparatur nicht gefunden.", 404);

  // Idempotent - a result already exists, don't call the model again.
  if (repairCase.ai_suggestion) {
    return new Response(JSON.stringify(repairCase), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const photos: { label: string; dataUrl: string }[] = [
    { label: "Gesamtansicht", dataUrl: repairCase.overview_photo_url },
    ...(repairCase.defect_photo_url ? [{ label: "Defekt-Nahaufnahme", dataUrl: repairCase.defect_photo_url }] : []),
    ...(repairCase.ref_photo_url ? [{ label: "REF/Artikelnummer-Nahaufnahme", dataUrl: repairCase.ref_photo_url }] : []),
  ];

  const content: Record<string, unknown>[] = [];
  for (const photo of photos) {
    const parsed = parseDataUrl(photo.dataUrl);
    if (!parsed) continue;
    content.push({ type: "text", text: photo.label + ":" });
    content.push({
      type: "image",
      source: { type: "base64", media_type: parsed.mediaType, data: parsed.base64 },
    });
  }
  if (content.length === 0) return jsonError("Keine auswertbaren Fotos vorhanden.", 422);
  content.push({
    type: "text",
    text: `Gemeldete Fehlerbeschreibung durch das Personal: "${repairCase.defect_note}"`,
  });

  const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    }),
  });

  if (!aiResponse.ok) {
    const detail = await aiResponse.text();
    return jsonError(`KI-Analyse fehlgeschlagen: ${detail}`, 502);
  }

  const aiData = await aiResponse.json();
  const rawText: string | undefined = aiData?.content?.[0]?.text;
  if (!rawText) return jsonError("KI-Antwort enthielt keinen Text.", 502);

  let parsed: {
    instrumentCandidate?: unknown;
    refCandidate?: unknown;
    defectCandidates?: unknown;
    confidence?: unknown;
    evidence?: unknown;
  };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return jsonError("KI-Antwort war kein gültiges JSON.", 502);
  }

  if (typeof parsed.instrumentCandidate !== "string" || typeof parsed.confidence !== "number") {
    return jsonError("KI-Antwort hatte ein unerwartetes Format.", 502);
  }

  const now = new Date().toISOString();
  const aiSuggestion = {
    instrumentCandidate: parsed.instrumentCandidate,
    refCandidate: typeof parsed.refCandidate === "string" ? parsed.refCandidate : null,
    defectCandidates: Array.isArray(parsed.defectCandidates)
      ? parsed.defectCandidates.filter((d: unknown) => typeof d === "string")
      : [],
    confidence: Math.max(0, Math.min(100, parsed.confidence)),
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence.filter((e: unknown) => typeof e === "string") : [],
    model: ANTHROPIC_MODEL,
    analyzedAt: now,
  };

  const { data: updated, error: updateError } = await supabase
    .from("repair_cases")
    .update({ ai_suggestion: aiSuggestion })
    .eq("id", repairCaseId)
    .select("*")
    .single();
  if (updateError) return jsonError(updateError.message, 500);

  await supabase.from("audit_log").insert({
    id: crypto.randomUUID(),
    entity_type: "repair",
    entity_id: repairCaseId,
    action: "repair_ai_analyzed",
    performed_by: profile.display_name,
    details: { instrumentCandidate: aiSuggestion.instrumentCandidate, confidence: aiSuggestion.confidence },
    created_at: now,
  });

  return new Response(JSON.stringify(updated), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
