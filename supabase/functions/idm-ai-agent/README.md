# idm-ai-agent

Full build of the external "IDM AI Agent v1" master prompt
("Security Hardening + AI Agent Architecture"), built in two steps: a
minimal single-call skeleton first, then extended to the architecture
below once the user explicitly chose that scope over stopping at the
skeleton. `analyze-repair-photo` remains the simpler, already-reviewed
default path - this function is opt-in via `VITE_IDM_AI_AGENT_ENABLED`
(see `.env.example`) and never replaces it.

## Architecture

- **Multi-step tool use** (`tools.ts`): the model may call up to 6
  read-only lookup tools before finalizing its proposal - `find_instrument`,
  `find_instrument_by_ref`, `find_similar_repair_cases`,
  `get_repair_history`, `get_tray_composition`, `get_supplier_info`. Every
  tool runs through the **caller's own forwarded JWT**, never the
  service-role client, so ordinary RLS (`is_active_user()`) applies
  exactly as it would to any other read in the app - no tool can see more
  than the signed-in user already could, and none of them write anything.
  The orchestration loop in `index.ts` is capped at `MAX_TOOL_ITERATIONS`
  (4) round-trips so a confused model can't loop indefinitely.
- **Provider abstraction** (`provider.ts`): `AIProvider` interface with
  `AnthropicProvider` (default, the one provider actually exercised
  against this project) and `OpenAIProvider` (selected via the
  `AI_PROVIDER=openai` secret). **OpenAIProvider has not been
  independently verified** - there's no `OPENAI_API_KEY` configured in
  the environment this was built in, so its request/response mapping has
  only been reviewed by reading, never exercised against a real response.
  Review it carefully (or just don't set `AI_PROVIDER`) before relying on
  it.
- **Prompt-injection mitigation** (`index.ts`, ported from
  `src/features/repair/aiAgent/promptInjectionGuard.ts`): the defect
  note - and any other case's defect note a tool result returns - is
  human-authored free text wrapped in `<user_report>` tags with
  escaped-looking nested tag attempts neutralized, plus an explicit system
  prompt instruction never to treat that content as instructions. This is
  a best-effort mitigation, not a guarantee - see the next point for the
  actual safety boundary.
- **Structural safety invariant, enforced in code, not prompt wording**
  (`validateAgentOutput`, ported from `src/features/repair/aiAgent/
  validateAgentOutput.ts`): the returned/stored `recommendedAction` is
  **always** `"HUMAN_REVIEW"`, regardless of what the model actually
  returned. There is no code path anywhere in this function that branches
  on `recommendedAction` or on anything else the model says - it can only
  ever produce a proposal for a human to review via the existing
  Übernehmen/Korrigieren/Anderes Instrument/Ablehnen flow
  (`confirm-repair-ai`). If the model is ever steered into returning
  something other than `"HUMAN_REVIEW"` (a prompt-injection success, in
  effect), that's recorded as `recommendedActionAnomaly` in the audit log
  entry rather than silently dropped - a detection signal, never acted on.
  `defectCandidates` is independently filtered against the same fixed
  vocabulary the prompt restricts the model to, for the same
  never-trust-the-model-structurally reason.
- **Rate limiting** (`isRateLimited`, ported from `src/features/repair/
  aiAgent/rateLimiter.ts`): a caller is capped at 20 analyses per rolling
  60 minutes, counted from their own `repair_ai_analyzed` audit_log rows.

## Why three modules are duplicated between `src/` and here

`promptInjectionGuard.ts`, `validateAgentOutput.ts` and `rateLimiter.ts`
exist twice: as plain, framework-free TypeScript under
`src/features/repair/aiAgent/` (with vitest tests - this project's
closest approximation of the master prompt's security test matrix, given
this environment has no local Deno runtime to test the real Edge Function
against), and ported verbatim into `index.ts`'s own module scope, since
Deno Edge Functions can't import from `src/`. Each ported copy says so and
points back to its source. `tools.ts` has no such pure-logic counterpart -
it only ever runs here, so there was nothing to extract for vitest
coverage; its DB-querying logic is reviewed by reading, not tested.

## Deliberately out of scope

- A dedicated instrument-master-by-REF catalog: this schema has no such
  table, so `find_instrument_by_ref` searches historical `repair_cases`
  instead and says so in its own description/result.
- Per-tool rate limiting or caching (one limit covers the whole function).
- Streaming responses.
- A UI surface for `recommendedActionAnomaly` - it's an audit-log-only
  signal for now; promoting it to a visible admin alert is a reasonable
  future increment if it's ever actually triggered.

## Operating this function

- Requires `ANTHROPIC_API_KEY` (same secret `analyze-repair-photo` already
  uses). `ANTHROPIC_MODEL` is an optional override.
- To use OpenAI instead, set `AI_PROVIDER=openai` and `OPENAI_API_KEY`
  (`OPENAI_MODEL` optional, defaults to `gpt-4o`) - see the verification
  caveat above first.
- `audit_log` entries use the existing `repair_ai_analyzed` action with
  `details: { via: "idm-ai-agent", toolsUsed: [...] , recommendedActionAnomaly?: ... }`
  so both this function and `analyze-repair-photo` show up in the same
  audit trail, distinguishable by `via`.
