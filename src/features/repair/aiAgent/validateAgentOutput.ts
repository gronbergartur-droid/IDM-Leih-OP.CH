/**
 * Validates and sanitizes idm-ai-agent's final, parsed JSON response before
 * anything downstream (persistence, audit log) sees it. This is the actual
 * safety boundary the IDM AI Agent spec asks for - not the prompt wording,
 * not the <user_report> wrapping (see promptInjectionGuard.ts), but a
 * structural guarantee enforced in code: recommendedAction on the object
 * this function returns is ALWAYS "HUMAN_REVIEW", regardless of what the
 * model actually said. There is no code path anywhere in idm-ai-agent that
 * branches on recommendedAction - the field exists so that if the model is
 * ever steered (via prompt injection or otherwise) into returning
 * "APPROVE"/"REJECT"/"SAFE"/"UNSAFE", that attempt is visible
 * (recommendedActionAnomaly) rather than silently swallowed, while the
 * actual stored suggestion is unaffected.
 *
 * defectCandidates is filtered against the same fixed vocabulary the
 * system prompt already restricts the model to - belt and suspenders: the
 * model is asked to only pick from that list, this filters out anything
 * else it returns anyway.
 *
 * Ported verbatim into supabase/functions/idm-ai-agent/index.ts (Deno has
 * no import from src/) - keep the two in sync.
 */

export const VISIBLE_DEFECT_CANDIDATES = [
  'sichtbare Deformation',
  'sichtbarer Bruch',
  'möglicher Riss',
  'Korrosion',
  'Verfärbung',
  'beschädigte Oberfläche',
  'fehlendes sichtbares Teil',
  'Verschleiss',
  'verbogene Spitze',
  'unregelmässiger Schluss',
] as const;

export interface AgentAnalysis {
  instrumentCandidate: string;
  refCandidate: string | null;
  defectCandidates: string[];
  confidence: number;
  evidence: string[];
  uncertainties: string[];
  /** Always "HUMAN_REVIEW" - see module comment. */
  recommendedAction: 'HUMAN_REVIEW';
  /** The raw value the model returned for recommendedAction, only set when it was NOT "HUMAN_REVIEW" - an anomaly worth auditing, never acted on. */
  recommendedActionAnomaly: string | null;
}

function toStringArray(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, maxLength);
}

/** Returns null if the raw value is too malformed to use at all (missing the two required fields). */
export function validateAgentOutput(raw: unknown): AgentAnalysis | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.instrumentCandidate !== 'string' || !r.instrumentCandidate.trim()) return null;
  if (typeof r.confidence !== 'number' || Number.isNaN(r.confidence)) return null;

  const rawRecommendedAction = typeof r.recommendedAction === 'string' ? r.recommendedAction : null;
  const allowedDefects = new Set<string>(VISIBLE_DEFECT_CANDIDATES);

  return {
    instrumentCandidate: r.instrumentCandidate,
    refCandidate: typeof r.refCandidate === 'string' && r.refCandidate.trim() ? r.refCandidate : null,
    defectCandidates: toStringArray(r.defectCandidates, 10).filter((d) => allowedDefects.has(d)),
    confidence: Math.max(0, Math.min(100, r.confidence)),
    evidence: toStringArray(r.evidence, 5),
    uncertainties: toStringArray(r.uncertainties, 5),
    recommendedAction: 'HUMAN_REVIEW',
    recommendedActionAnomaly: rawRecommendedAction && rawRecommendedAction !== 'HUMAN_REVIEW' ? rawRecommendedAction : null,
  };
}
