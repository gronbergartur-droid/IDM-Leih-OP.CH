// IDM-Leih-OP.CH v2.2 Phase 7 - Cloud Agent Analytics.
//
// Answers a natural-language question about IDM Analytics
// (docs/roadmap/v2.2/MASTER-PROMPT-v2.2.md section 13). Stateless and
// read-only: no table is written, nothing here can change operational
// data, and the model is never given raw case/scan/repair records - only
// the same already-computed, already-aggregated KPI snapshot a human sees
// on /analytics (see src/features/analytics/types/analytics.ts
// AnalyticsSnapshot). This is the safety boundary: the model can only
// quote numbers that already exist in that snapshot, never derive new
// ones from source data it was never given, so "every numeric answer must
// be traceable to a query/filter/time range" holds by construction.
//
// Runs with the caller's own JWT forwarded (not the service role) purely
// to confirm the caller is an active, provisioned user - the same gate
// every other screen in this app sits behind.
//
// Requires the ANTHROPIC_API_KEY secret (same one Phase 3's
// analyze-repair-photo uses - no new secret to configure).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_QUESTION_LENGTH = 500;

const SYSTEM_PROMPT = `Du bist ein unterstützender Analytics-Assistent für die AEMP (Aufbereitungseinheit für Medizinprodukte) eines Schweizer Spitals. Du beantwortest Fragen zu bereits berechneten IDM-Analytics-Kennzahlen, die dir als JSON-Datenstruktur ("snapshot") mitgegeben werden.

ABSOLUT VERBINDLICHE REGELN:
- Du darfst AUSSCHLIESSLICH Zahlen und Fakten aus dem mitgegebenen "snapshot" verwenden. Du darfst NICHTS schätzen, hochrechnen, interpolieren, erfinden oder aus allgemeinem Wissen ergänzen.
- Wenn die Frage mit den Daten im snapshot nicht beantwortet werden kann (z. B. weil die gefragte Zeitspanne oder Kategorie nicht enthalten ist), sag das explizit auf Deutsch - z. B. "Diese Frage kann anhand der verfügbaren Daten nicht beantwortet werden." - statt zu raten oder einen ähnlichen Wert zu nennen.
- Du gibst NIEMALS eine Aussage zur Sicherheit, Einsatzfähigkeit, Qualität oder Vertrauenswürdigkeit eines Lieferanten/Instruments/Mitarbeitenden ab - nur die nackten, bereits vorhandenen Zahlen.
- Antworte kurz und sachlich auf Deutsch, nenne die konkrete(n) Zahl(en) und den Zeitraum/Filter aus snapshot.filterLabel.
- "basis": liste die exakten Top-Level-Felder von snapshot auf, die du für die Antwort verwendet hast (z. B. ["reparatur", "instrumentRows"]).

Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt, ohne Markdown, ohne Erklärung davor oder danach, exakt in diesem Format:
{
  "answer": string,
  "basis": string[]
}`;

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
  if (!ANTHROPIC_API_KEY) return jsonError("ANTHROPIC_API_KEY ist nicht konfiguriert.", 500);

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

  let body: { question?: unknown; snapshot?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("Ungültige Anfrage.", 400);
  }

  const { question, snapshot } = body;
  if (typeof question !== "string" || question.trim().length === 0) {
    return jsonError("question ist erforderlich.", 400);
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return jsonError(`Frage ist zu lang (max. ${MAX_QUESTION_LENGTH} Zeichen).`, 400);
  }
  if (!snapshot || typeof snapshot !== "object") {
    return jsonError("snapshot ist erforderlich.", 400);
  }

  const userMessage = `snapshot:\n${JSON.stringify(snapshot)}\n\nFrage: ${question.trim()}`;

  const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!aiResponse.ok) {
    const detail = await aiResponse.text();
    return jsonError(`Cloud-Agent-Abfrage fehlgeschlagen: ${detail}`, 502);
  }

  const aiData = await aiResponse.json();
  const rawText: string | undefined = aiData?.content?.[0]?.text;
  if (!rawText) return jsonError("KI-Antwort enthielt keinen Text.", 502);

  let parsed: { answer?: unknown; basis?: unknown };
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return jsonError("KI-Antwort war kein gültiges JSON.", 502);
  }
  if (typeof parsed.answer !== "string") {
    return jsonError("KI-Antwort hatte ein unerwartetes Format.", 502);
  }

  const result = {
    answer: parsed.answer,
    basis: Array.isArray(parsed.basis) ? parsed.basis.filter((b: unknown) => typeof b === "string") : [],
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
