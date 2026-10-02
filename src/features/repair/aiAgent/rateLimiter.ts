/**
 * Caps how often one user can trigger idm-ai-agent's Claude/OpenAI calls
 * within a rolling window, bounding cost and abuse. The Edge Function
 * counts the caller's own recent audit_log rows and passes that count in
 * here - this module only holds the threshold logic, so it can be unit
 * tested without a database.
 *
 * Ported verbatim into supabase/functions/idm-ai-agent/index.ts (Deno has
 * no import from src/) - keep the two in sync.
 */

export const IDM_AI_AGENT_RATE_LIMIT = {
  windowMinutes: 60,
  maxRequests: 20,
} as const;

export function isRateLimited(recentRequestCount: number): boolean {
  return recentRequestCount >= IDM_AI_AGENT_RATE_LIMIT.maxRequests;
}
