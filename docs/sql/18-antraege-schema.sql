-- 18-antraege-schema.sql  (Anträge: Urlaub / Fortbildung / Krankmeldung aus der Mitarbeiter-App)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-17. Safe to run again.
-- The tables requests / request_types exist since the first scripts (RLS: the person sees only own
-- requests, Leitung/Inhaber decide). New: a reason the Leitung can give with the decision, and a
-- length limit for the note.
alter table requests add column if not exists decision_note text check (decision_note is null or length(decision_note) <= 500);
alter table requests drop constraint if exists requests_note_len;
alter table requests add constraint requests_note_len check (note is null or length(note) <= 500);
