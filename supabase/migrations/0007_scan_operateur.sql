-- IDM Mobile - Operateur/OP-Datum je Scan (nicht nur je Sieb-Fall)
--
-- Angefragt: auf der "Sieb-SET erfassen"-Seite sollen Operateur und OP-Datum
-- ebenfalls erfasst werden koennen. Ein SET besteht aus mehreren
-- eigenstaendigen (standalone) Scans ohne Sieb-Fall, daher reicht das
-- bestehende operateur_id/operation_date-Feld auf loan_cases dafuer nicht -
-- die Angaben werden stattdessen direkt am jeweiligen Scan gespeichert.

alter table scans
  add column if not exists operation_date date;

alter table scans
  add column if not exists operateur_id uuid references physicians (id) on delete set null;
