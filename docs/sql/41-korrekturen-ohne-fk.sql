-- 41-korrekturen-ohne-fk.sql  (8 Nov 2026) – Run ONCE. Safe to run again. Already run (migration korrekturen_ohne_fk_41).
-- "Entfernen" (script 36) failed for a stamp that had corrections: "Zeiterfassung ist unveränderlich: UPDATE auf
-- attendance_corrections ist nicht erlaubt" – the FK ON DELETE SET NULL tried to update the immutable corrections.
-- The FK is dropped; session_id stays a plain number and keeps pointing to the removed stamp in
-- attendance_sessions_removed (same id). Nothing else changes.
alter table public.attendance_corrections drop constraint if exists attendance_corrections_session_id_fkey;
comment on column public.attendance_corrections.session_id is 'id of attendance_sessions, or of attendance_sessions_removed after "Entfernen" (no FK on purpose, script 41)';
