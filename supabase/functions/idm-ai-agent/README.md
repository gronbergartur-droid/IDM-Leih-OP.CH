# idm-ai-agent

Minimal skeleton of the external "IDM AI Agent v1" master prompt
("Security Hardening + AI Agent Architecture"). This is a deliberately
scoped slice, not the full spec - see the decision history below before
extending it.

## What this is

A drop-in alternative to `analyze-repair-photo` for repair-photo analysis,
switched on per-deployment via `VITE_IDM_AI_AGENT_ENABLED` (default off;
see `.env.example`). On top of `analyze-repair-photo`'s existing,
already-reviewed behaviour, it adds:

- **Prompt-injection protection** (master prompt §9): the human-authored
  `defect_note` is untrusted free text. It is wrapped in an explicit
  `<user_report>...</user_report>` block, and the system prompt states
  outright that this block is never a source of instructions - "ignoriere
  vorherige Anweisungen" written in a defect note is just defect-note
  text.
- **`uncertainties` in the structured output** (master prompt §7/8): short,
  factual caveats about *this* analysis (e.g. "Etikett teilweise
  verdeckt"), never a safety/fitness verdict. Additive and optional on
  `RepairAiSuggestion` (`src/types/database.ts`), so existing rows and the
  legacy function's output keep working unchanged.
- There is still no code path here that can set `ai_confirmation` or any
  other recommendation stronger than "a human should look at this" - see
  `confirm-repair-ai`, a separate, human-driven function. This function
  only ever proposes.

## What this deliberately is NOT (yet)

The full spec describes a multi-tool Agent: 7 read-only tools
(`analyzeRepairPhoto`, `findInstrument`, `findInstrumentByRef`,
`findSimilarRepairCases`, `getRepairHistory`, `getTrayComposition`,
`getSupplierInfo`), a `recommendedAction` enum pinned to `HUMAN_REVIEW`, an
`AIProvider` abstraction over Anthropic/OpenAI, a rate limiter, and an
18-case security test matrix.

None of that is built here. Reasons, in order:

1. The user was offered four scope options for the spec (RLS fix only /
   RLS fix + minimal Agent skeleton / full spec as written / report only)
   and explicitly chose the RLS fix first, then this minimal skeleton as a
   separate, later step - not the full architecture.
2. A real multi-tool Agent with provider abstraction, rate limiting and a
   dedicated security test suite is a large, security-sensitive surface
   (it would be the thing actually calling an LLM with repository data) to
   add to a live hospital app that already has two other PRs pending
   review. Building it in one more unreviewed pass would make review
   harder, not easier.
3. Everything this file touches - photo handling, idempotency, the
   service-role write pattern, CORS, audit logging - is intentionally
   identical to the already-reviewed `analyze-repair-photo`, so the only
   genuinely new surface a reviewer has to reason about is the two
   additions listed above.

If the 7-tool architecture is wanted later, it should be its own
explicitly-scoped increment (most naturally: one new tool + its own
security tests at a time), not a retrofit onto this file.

## Operating this function

- Requires the `ANTHROPIC_API_KEY` secret (same one `analyze-repair-photo`
  already uses - nothing new to configure).
- Deploy it alongside, not instead of, `analyze-repair-photo` - the latter
  remains the default path.
- `audit_log` entries use the existing `repair_ai_analyzed` action with
  `details.via: "idm-ai-agent"` so both paths show up in the same audit
  trail, distinguishable by that field; no new audit-action enum value was
  added for this minimal pass.
