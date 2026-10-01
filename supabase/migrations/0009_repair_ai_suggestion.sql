-- IDM-Leih-OP.CH v2.2 Phase 3 - IDM Intelligence Pilot (Cloud Agent)
--
-- Adds assistive AI recognition on top of the Phase 2 repair_cases table:
-- a single immutable jsonb proposal (ai_suggestion, matching the same
-- RepairAiSuggestion shape the app uses, same convention as
-- loan_cases.comparison) plus the human's decision on it. The AI proposal
-- is never overwritten or deleted - only the case's own
-- instrument_name/ref_number are updated once a human confirms/corrects,
-- so both the original suggestion and the final value stay auditable.

alter table repair_cases
  add column if not exists ref_number text,
  add column if not exists ai_suggestion jsonb,
  add column if not exists ai_confirmation text
    check (ai_confirmation in ('accepted', 'corrected', 'other_instrument', 'rejected')),
  add column if not exists confirmed_by text,
  add column if not exists confirmed_at timestamptz;

alter table audit_log drop constraint if exists audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'scan_started', 'scan_matched', 'scan_unmatched', 'scan_confirmed',
  'scan_cancelled', 'instrument_manually_adjusted',
  'supplier_created', 'supplier_updated', 'supplier_activated',
  'supplier_deactivated', 'supplier_deleted',
  'tray_created', 'tray_updated',
  'case_intake', 'case_outtake', 'case_compared', 'case_readiness_notified',
  'archive_downloaded', 'physician_created',
  'repair_reported', 'repair_closed', 'repair_ai_analyzed', 'repair_ai_confirmed'
));
