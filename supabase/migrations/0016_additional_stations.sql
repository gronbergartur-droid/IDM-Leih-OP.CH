-- Sterimaterial-Bestellung: three more stations, transcribed from the
-- stations' own AEMP paper forms (Spital Schwyz). Each form lists a single
-- flat checklist with no coloured sections, so every item here uses the
-- single category "Instrumente".

insert into stations (id, name, short_code, active) values
  ('22222222-2222-2222-2222-222222222222', 'A10 Hebammen', 'A10', true),
  ('33333333-3333-3333-3333-333333333333', 'B05 Gyni Praxis', 'B05', true),
  ('44444444-4444-4444-4444-444444444444', 'Intensivbehandlungsstation', 'IBS', true)
on conflict (id) do nothing;

-- "Bestellung Sterilmaterial A10 Hebammen" (gueltig ab 15.06.2026,
-- Druckdatum 12.10.2026).
insert into station_material_items (station_id, category, name, position) values
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Nahtinstrumente', 1),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Geburtshilfe Spekula', 2),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Schere gross spitz-stumpf', 3),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Nabelschere', 4),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Gerade Schere', 5),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Episiotomieschere', 6),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Mayoschere', 7),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Pinzetten chirurgisch', 8),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Pinzetten anatomisch', 9),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Pean gerade', 10),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Pean gebogen', 11),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Kocherklemme', 12),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Nadelhalter', 13),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Verschiedene Curetten', 14),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Vacuum', 15),
  ('22222222-2222-2222-2222-222222222222', 'Instrumente', 'Forceps', 16)
on conflict (station_id, name) do nothing;

-- "Bestellung Sterilmaterial B 05 Gyni Praxis" (gueltig ab 23.09.2026).
insert into station_material_items (station_id, category, name, position) values
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Uterus Dilatator (Hegar) versch. Grössen', 1),
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Spekulum Cusco Virgo', 2),
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Spekulum Cusco Figur 1', 3),
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Spekulum Cusco Figur C', 4),
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Spekulum Kristeller Virgo', 5),
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Spekulum Kristeller Figur 1', 6),
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Spekulum Kristeller Figur C', 7),
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Hysterometer', 8),
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Schere lang gebogen', 9),
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Kugelzange', 10),
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Kornzange', 11),
  ('33333333-3333-3333-3333-333333333333', 'Instrumente', 'Klemme lang gebogen', 12)
on conflict (station_id, name) do nothing;

-- "Intensivbehandlungsstation" (Druckdatum 30.12.2025).
insert into station_material_items (station_id, category, name, position) values
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'CO2 Messzelle', 1),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Compliance - Lunge', 2),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Führungsdraht', 3),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Kübeli gross', 4),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Kübeli klein', 5),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Magill-Zange', 6),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Mundspatel', 7),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Nadelhalter', 8),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Nierenschale', 9),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Sicherheitsnadel', 10),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Silberfusskabel', 11),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Sugi-Ansatzstück Metall (einzeln verpackt)', 12),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Sugiglasdeckel', 13),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Thoraxklemme', 14),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Trachealspreizer', 15),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Verbandschere', 16),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Expirations Ventil', 17),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Scheren gross spitz-stumpf', 18),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Scheren klein spitz-spitz', 19),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Pinzetten chirurgisch', 20),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Pinzetten anatomisch', 21),
  ('44444444-4444-4444-4444-444444444444', 'Instrumente', 'Klemme', 22)
on conflict (station_id, name) do nothing;
