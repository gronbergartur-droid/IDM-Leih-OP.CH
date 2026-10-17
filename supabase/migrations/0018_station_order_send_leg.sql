-- Sterimaterial-Bestellung: documents the "send" leg of the round trip
-- (station -> AEMP), not just the "return" leg ("Ausgang aus AEMP") that
-- 0015 already covered. Matches the paper form's "Datum"/"Name" fields and
-- extends the existing photo-confirmation pattern to the AEMP handover
-- name too, so neither leg is trusted on word alone.

alter table station_orders add column if not exists order_date date not null default current_date;
alter table station_orders add column if not exists sender_name text not null default '';
alter table station_orders add column if not exists send_photo_url text not null default '';
alter table station_orders add column if not exists fulfilled_by_name text;
