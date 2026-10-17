-- 22-kein-buero-schema.sql  (Dienstplaner Labor: Person "Befreit von Büro")
-- Run ONCE in the Supabase SQL Editor, after scripts 1-21. Safe to run again.
-- A person with no_office = true never gets the Büro shift from the generator (manual entry stays possible).
alter table staff add column if not exists no_office boolean not null default false;
