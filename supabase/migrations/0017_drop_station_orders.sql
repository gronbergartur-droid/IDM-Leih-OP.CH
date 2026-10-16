-- Removes the Sterimaterial-Bestellung feature (station_orders,
-- station_material_items, stations), introduced in 0015/0016 and removed
-- again before any station actually used it (0 rows in station_orders,
-- 0 audit_log rows referencing it at the time of this migration).
--
-- The audit_log check constraints are intentionally left as-is: audit_log
-- is an append-only, 10-year-retention compliance record (see README), so
-- its allow-list is never shrunk just because a feature's code is removed -
-- harmless to leave 'station_order'/'station_order_created'/
-- 'station_order_fulfilled' as inert, no-longer-producible options.

drop table if exists station_orders;
drop table if exists station_material_items;
drop table if exists stations;
