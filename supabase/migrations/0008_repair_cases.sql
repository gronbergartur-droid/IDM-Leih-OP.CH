-- IDM-Leih-OP.CH v2.2 Phase 2 - Repair Photo Foundation
--
-- Storage-only foundation for the future IDM Intelligence Repair Photo
-- Analysis module (see docs/roadmap/v2.2/): lets staff report a damaged/
-- defective instrument with up to three photos (Gesamtansicht Pflicht,
-- Defekt/REF optional) and a free-text description. No AI involved yet -
-- Phase 3 adds the Cloud Agent recognition on top of this table.

create table if not exists repair_cases (
  id uuid primary key default gen_random_uuid(),
  -- The Sieb this instrument normally belongs to, if known.
  tray_id uuid references trays (id) on delete set null,
  supplier_id uuid references suppliers (id) on delete set null,
  instrument_name text not null,
  -- Paths/URLs into Supabase Storage, not base64 blobs (same convention as scans.captured_image_url).
  overview_photo_url text not null,
  defect_photo_url text,
  ref_photo_url text,
  defect_note text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  performed_by text not null,
  closed_by text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists repair_cases_tray_id_idx on repair_cases (tray_id);
create index if not exists repair_cases_supplier_id_idx on repair_cases (supplier_id);
create index if not exists repair_cases_status_idx on repair_cases (status);
create index if not exists repair_cases_created_at_idx on repair_cases (created_at desc);

alter table repair_cases enable row level security;

create policy "Active users read repair_cases" on repair_cases
  for select to authenticated using (is_active_user());
create policy "Active users write repair_cases" on repair_cases
  for insert to authenticated with check (is_active_user());
create policy "Active users update repair_cases" on repair_cases
  for update to authenticated using (is_active_user()) with check (is_active_user());

alter table audit_log drop constraint if exists audit_log_entity_type_check;
alter table audit_log add constraint audit_log_entity_type_check check (entity_type in (
  'scan', 'tray', 'supplier', 'case', 'archive', 'physician', 'repair'
));

alter table audit_log drop constraint if exists audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'scan_started', 'scan_matched', 'scan_unmatched', 'scan_confirmed',
  'scan_cancelled', 'instrument_manually_adjusted',
  'supplier_created', 'supplier_updated', 'supplier_activated',
  'supplier_deactivated', 'supplier_deleted',
  'tray_created', 'tray_updated',
  'case_intake', 'case_outtake', 'case_compared', 'case_readiness_notified',
  'archive_downloaded', 'physician_created',
  'repair_reported', 'repair_closed'
));
