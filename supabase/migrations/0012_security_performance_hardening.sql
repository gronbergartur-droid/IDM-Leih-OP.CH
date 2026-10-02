-- IDM-Leih-OP.CH v2.2 Phase 8 - Production Hardening (security/privacy audit).
--
-- Addresses findings from Supabase's own security + performance advisors
-- (mcp__Supabase__get_advisors), all purely hygiene/performance - no
-- behavioural change to any existing feature:
--
-- 1. RLS initplan: every policy below calls a STABLE helper function
--    (is_active_user()/is_admin()/current_display_name()) or auth.uid()
--    directly in its USING/WITH CHECK clause. Without wrapping the call in
--    a scalar subquery, Postgres may re-evaluate it once per row instead
--    of once per statement. Wrapping as `(select fn())` is the documented
--    Supabase/Postgres fix (see auth_rls_initplan lint) and is logically
--    identical - the boolean result is exactly the same, just evaluated
--    once. The advisor only flagged `profiles` (the only table calling
--    auth.uid() directly), but every other table has the same pattern via
--    is_active_user()/current_display_name(), so all are fixed together.
-- 2. Unindexed foreign keys: loan_cases.operateur_id and
--    scans.operateur_id had no covering index.
-- 3. SECURITY DEFINER functions executable by `anon`: is_active_user(),
--    is_admin() and current_display_name() only need to run for signed-in
--    users (they read auth.uid(), which is null for anon anyway - not a
--    data leak, but least-privilege hygiene); handle_new_auth_user() and
--    prevent_self_role_escalation() are trigger functions never meant to
--    be called directly at all. EXECUTE is revoked from `anon` only -
--    `authenticated` keeps it, since RLS evaluation and the
--    prevent_self_role_escalation trigger (which fires on every
--    authenticated profiles UPDATE, not just role changes) both still
--    need it to keep working exactly as before.
--
-- Not addressed here (deliberately, see PR description):
-- - "Leaked password protection disabled" - an Auth service setting
--   (Dashboard: Authentication -> Policies), not a database object; no
--   migration can change it.
-- - "Unused index" findings - expected at this pre-pilot traffic volume;
--   these indexes were deliberately added for known query patterns
--   (status/created_at filters, alias/specialty search) and removing them
--   now would be premature.

-- 1. RLS initplan fix - wrap stable helper calls in a scalar subquery so
-- they evaluate once per statement instead of once per row.

alter policy "Active users append audit_log" on public.audit_log
  with check ((select is_active_user()) and (performed_by = (select current_display_name())));
alter policy "Active users read audit_log" on public.audit_log
  using ((select is_active_user()));

alter policy "Active users read loan_cases" on public.loan_cases
  using ((select is_active_user()));
alter policy "Active users update loan_cases" on public.loan_cases
  using ((select is_active_user()))
  with check ((select is_active_user()) and ((performed_by_outtake is null) or (performed_by_outtake = (select current_display_name()))));
alter policy "Active users write loan_cases" on public.loan_cases
  with check ((select is_active_user()) and (performed_by_intake = (select current_display_name())));

alter policy "Active users read physicians" on public.physicians
  using ((select is_active_user()));
alter policy "Active users write physicians" on public.physicians
  with check ((select is_active_user()));

alter policy "Read own profile or admin reads all" on public.profiles
  using ((id = (select auth.uid())) or (select is_admin()));
alter policy "Update own profile or admin updates any" on public.profiles
  using ((id = (select auth.uid())) or (select is_admin()))
  with check ((id = (select auth.uid())) or (select is_admin()));

alter policy "Active users read repair_cases" on public.repair_cases
  using ((select is_active_user()));
alter policy "Active users update repair_cases" on public.repair_cases
  using ((select is_active_user()))
  with check ((select is_active_user()));
alter policy "Active users write repair_cases" on public.repair_cases
  with check ((select is_active_user()));

alter policy "Active users read scans" on public.scans
  using ((select is_active_user()));
alter policy "Active users update scans" on public.scans
  using ((select is_active_user()))
  with check ((select is_active_user()) and (performed_by = (select current_display_name())));
alter policy "Active users write scans" on public.scans
  with check ((select is_active_user()) and (performed_by = (select current_display_name())));

alter policy "Active users delete suppliers" on public.suppliers
  using ((select is_active_user()));
alter policy "Active users read suppliers" on public.suppliers
  using ((select is_active_user()));
alter policy "Active users update suppliers" on public.suppliers
  using ((select is_active_user()))
  with check ((select is_active_user()));
alter policy "Active users write suppliers" on public.suppliers
  with check ((select is_active_user()));

alter policy "Active users delete tray_instruments" on public.tray_instruments
  using ((select is_active_user()));
alter policy "Active users read tray_instruments" on public.tray_instruments
  using ((select is_active_user()));
alter policy "Active users update tray_instruments" on public.tray_instruments
  using ((select is_active_user()))
  with check ((select is_active_user()));
alter policy "Active users write tray_instruments" on public.tray_instruments
  with check ((select is_active_user()));

alter policy "Active users read trays" on public.trays
  using ((select is_active_user()));
alter policy "Active users update trays" on public.trays
  using ((select is_active_user()))
  with check ((select is_active_user()));
alter policy "Active users write trays" on public.trays
  with check ((select is_active_user()));

-- 2. Missing foreign-key indexes.

create index if not exists loan_cases_operateur_id_idx on public.loan_cases (operateur_id);
create index if not exists scans_operateur_id_idx on public.scans (operateur_id);

-- 3. Least-privilege: anon never needs to call these directly.

revoke execute on function public.is_active_user() from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.current_display_name() from anon;
revoke execute on function public.handle_new_auth_user() from anon;
revoke execute on function public.prevent_self_role_escalation() from anon;
