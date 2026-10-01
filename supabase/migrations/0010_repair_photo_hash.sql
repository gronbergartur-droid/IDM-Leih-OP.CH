-- IDM-Leih-OP.CH v2.2 Phase 4 - Photo Archive
--
-- Stores a perceptual difference-hash (dHash) of each repair case's overview
-- photo, so visually similar/identical past photos can be found later
-- (Hamming distance over this hash, computed client-side - see
-- features/repair/imageHash.ts). Not an AI/vision call: a cheap,
-- deterministic signal used only to surface candidate matches for a human
-- to review, never to merge or auto-link cases.

alter table repair_cases
  add column if not exists photo_hash text;
