-- 23-personalnummer-schema.sql  (Personalnummer pro Person, z. B. für den Stundenzettel / die Lohnabrechnung)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-22. Safe to run again.
alter table staff add column if not exists personnel_no text check (personnel_no is null or length(personnel_no) between 1 and 30);
create unique index if not exists staff_personnel_no_per_org on staff (org_id, personnel_no) where personnel_no is not null and personnel_no <> '';
