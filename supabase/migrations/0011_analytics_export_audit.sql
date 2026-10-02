-- IDM-Leih-OP.CH v2.2 Phase 6 - Advanced Analytics
--
-- Analytics itself stays read-only and needs no new tables (see
-- MASTER-PROMPT-v2.2.md section 14: "Analytics is read-only"). The only
-- schema change needed is extending the audit_log action check constraint
-- so the new "analytics_exported" audit entry (logged when a user
-- downloads the Analytics .xlsx export) can be written.

alter table audit_log drop constraint if exists audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'scan_started', 'scan_matched', 'scan_unmatched', 'scan_confirmed',
  'scan_cancelled', 'instrument_manually_adjusted',
  'supplier_created', 'supplier_updated', 'supplier_activated',
  'supplier_deactivated', 'supplier_deleted',
  'tray_created', 'tray_updated',
  'case_intake', 'case_outtake', 'case_compared', 'case_readiness_notified',
  'archive_downloaded', 'physician_created',
  'repair_reported', 'repair_closed', 'repair_ai_analyzed', 'repair_ai_confirmed',
  'analytics_exported'
));
