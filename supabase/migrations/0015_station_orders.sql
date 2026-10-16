-- IDM-Leih-OP.CH - Sterimaterial-Bestellung (station-based sterile material
-- ordering from AEMP) - digital version of the paper "Bestellung
-- Sterimaterial" form (per-station checklist with quantities, an
-- Aufbereitung priority, and a photo confirming the material actually left
-- AEMP, rather than trusting a status on word alone).

create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_code text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One row per orderable line on a station's reference checklist, grouped by
-- category (mirrors the paper form's coloured sections, e.g. "HNO-Wagen
-- (Gang)"). Reference data, not user-editable from the app in this pass -
-- seeded below alongside tray_instruments-style rows.
create table if not exists station_material_items (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations (id) on delete cascade,
  category text not null,
  name text not null,
  position integer not null default 0,
  unique (station_id, name)
);

create index if not exists station_material_items_station_id_idx on station_material_items (station_id);

create table if not exists station_orders (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations (id) on delete restrict,
  priority text not null check (priority in ('express', '24h', '48h')),
  -- One JSON array of { materialItemId, category, name, quantity }, snapshotted
  -- at order time so a later rename of the reference item doesn't rewrite
  -- order history - same convention as repair_cases.ai_suggestion.
  lines jsonb not null default '[]',
  note text,
  status text not null default 'open' check (status in ('open', 'fulfilled')),
  ordered_by text not null,
  ordered_at timestamptz not null default now(),
  -- "Ausgang aus AEMP": photo proof the material actually left AEMP, not
  -- trusted on word alone - same pattern as loan_cases.hygienePassportPhotoUrl.
  exit_photo_url text,
  fulfilled_by text,
  fulfilled_at timestamptz
);

create index if not exists station_orders_station_id_idx on station_orders (station_id);
create index if not exists station_orders_status_idx on station_orders (status);
create index if not exists station_orders_ordered_at_idx on station_orders (ordered_at desc);

alter table stations enable row level security;
alter table station_material_items enable row level security;
alter table station_orders enable row level security;

create policy "Active users read stations" on stations
  for select to authenticated using (is_active_user());

create policy "Active users read station_material_items" on station_material_items
  for select to authenticated using (is_active_user());

create policy "Active users read station_orders" on station_orders
  for select to authenticated using (is_active_user());
create policy "Active users create station_orders" on station_orders
  for insert to authenticated with check (is_active_user() and ordered_by = current_display_name());
create policy "Active users fulfill station_orders" on station_orders
  for update to authenticated using (is_active_user())
  with check (is_active_user() and (fulfilled_by is null or fulfilled_by = current_display_name()));

alter table audit_log drop constraint if exists audit_log_entity_type_check;
alter table audit_log add constraint audit_log_entity_type_check check (entity_type in (
  'scan', 'tray', 'supplier', 'case', 'archive', 'physician', 'repair', 'analytics', 'station_order'
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
  'repair_reported', 'repair_closed', 'repair_ai_analyzed', 'repair_ai_confirmed',
  'analytics_exported', 'station_order_created', 'station_order_fulfilled'
));

-- Seed: Interdisziplinäre Notfallstation, transcribed from the AEMP paper
-- form "Bestellung Sterimaterial Interdisziplinäre Notfallstation" (Spital
-- Schwyz, Druckdatum 28.10.2025). The four categories match the form's
-- coloured sections. on conflict keeps this idempotent across re-runs.
insert into stations (id, name, short_code, active) values
  ('11111111-1111-1111-1111-111111111111', 'Interdisziplinäre Notfallstation', 'NOTFALL', true)
on conflict (id) do nothing;

insert into station_material_items (station_id, category, name, position) values
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Chirurgische Pinzette', 1),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Nadelhalter', 2),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'scharfer Löffel', 3),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Thoraxklemme gebogen', 4),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Thoraxklemme gerade', 5),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Gebogene, anatomische Moskitoklemme', 6),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Tuchklemme', 7),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Selbsthalter-Klemme', 8),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Hacken', 9),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Rouxhacken', 10),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'zwei Zinkhacken', 11),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'drei Zinkhacken', 12),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Lidhalter', 13),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Müsli-/Kornzange', 14),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Flachzange', 15),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Luerzange', 16),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Kneifzange/Seitenschneider', 17),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Jakobsfutter', 18),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Schraubenzieher', 19),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Schlüssel', 20),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Stevens Schere', 21),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Dissektor (Helge Burmeister)', 22),
  ('11111111-1111-1111-1111-111111111111', 'Sterimaterial Interventionsraum', 'Friedmann Zange (Helge Burmeister)', 23),
  ('11111111-1111-1111-1111-111111111111', 'Set''s (Interventionsraum)', 'Kleine Wundversorgung', 24),
  ('11111111-1111-1111-1111-111111111111', 'Set''s (Interventionsraum)', 'Grosse Wundversorgung', 25),
  ('11111111-1111-1111-1111-111111111111', 'Set''s (Interventionsraum)', 'Feine Wundversorgung', 26),
  ('11111111-1111-1111-1111-111111111111', 'Set''s (Interventionsraum)', 'Hand-Set', 27),
  ('11111111-1111-1111-1111-111111111111', 'HNO-Wagen (Gang)', 'HNO Pinzetten', 28),
  ('11111111-1111-1111-1111-111111111111', 'HNO-Wagen (Gang)', 'Nasenspekulare', 29),
  ('11111111-1111-1111-1111-111111111111', 'HNO-Wagen (Gang)', 'Kinder Nasenspekulum', 30),
  ('11111111-1111-1111-1111-111111111111', 'HNO-Wagen (Gang)', 'Zungen-/Mundspatel', 31),
  ('11111111-1111-1111-1111-111111111111', 'HNO-Wagen (Gang)', 'HNO-Klemme', 32),
  ('11111111-1111-1111-1111-111111111111', 'HNO-Wagen (Gang)', 'Rachenspiegel', 33),
  ('11111111-1111-1111-1111-111111111111', 'HNO-Wagen (Gang)', 'Fisch- oder Hechtmäulchen', 34),
  ('11111111-1111-1111-1111-111111111111', 'HNO-Wagen (Gang)', 'Nasenhäckchen', 35),
  ('11111111-1111-1111-1111-111111111111', 'Proktowagen (Cystoraum)', 'Proctoskop', 36),
  ('11111111-1111-1111-1111-111111111111', 'Proktowagen (Cystoraum)', 'Rektoskop', 37),
  ('11111111-1111-1111-1111-111111111111', 'Proktowagen (Cystoraum)', 'Zweiwege-Hahn', 38),
  ('11111111-1111-1111-1111-111111111111', 'Proktowagen (Cystoraum)', 'Saug- und Spülrohr', 39),
  ('11111111-1111-1111-1111-111111111111', 'Proktowagen (Cystoraum)', 'Biopsiezangen', 40)
on conflict (station_id, name) do nothing;
