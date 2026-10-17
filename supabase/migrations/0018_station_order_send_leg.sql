-- Sterimaterial-Bestellung: documents the "send" leg of the round trip
-- (station -> AEMP), not just the "return" leg ("Ausgang aus AEMP") that
-- 0015 already covered. Matches the paper form's "Datum" field with a
-- photo of the material before it leaves the station, same
-- photo-confirmation pattern as the AEMP handover. No separate "Name"
-- field - the logged-in account's identity (ordered_by/fulfilled_by)
-- already covers that.

alter table station_orders add column if not exists order_date date not null default current_date;
alter table station_orders add column if not exists send_photo_url text not null default '';
