-- IDM-Leih-OP.CH - Repair AI confirmation security hardening.
--
-- RLS controls which ROWS a role can touch, not which COLUMNS. The
-- existing "Active users update repair_cases" policy (0008_repair_cases.sql)
-- is a blanket `for update ... using (is_active_user())` with no column
-- restriction, so any active authenticated user could PATCH ai_suggestion,
-- ai_confirmation, confirmed_by or confirmed_at directly via the REST API -
-- bypassing resolveAiConfirmation() entirely and forging a human
-- confirmation (including impersonating a different confirmed_by) that
-- never actually happened.
--
-- Column-level privileges close this without touching the row-level
-- policy or any other column: `authenticated` loses UPDATE on exactly
-- these four columns. The two legitimate writers - analyze-repair-photo
-- (writes ai_suggestion) and the new confirm-repair-ai Edge Function
-- (writes ai_confirmation/confirmed_by/confirmed_at, plus
-- instrument_name/ref_number which stay authenticated-writable) - both
-- switch to using the service-role key for that one write, after
-- independently verifying the caller's identity/active status via their
-- own JWT first (see supabase/functions/confirm-repair-ai/index.ts).
--
-- Deliberately out of scope here: repair_cases.status/closed_by/closed_at
-- (the close-case flow) - not AI/confirmation-related, not flagged by this
-- audit, left for a separate pass to keep this change narrowly scoped and
-- reviewable.

revoke update (ai_suggestion, ai_confirmation, confirmed_by, confirmed_at)
  on repair_cases from authenticated;
