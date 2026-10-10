-- 15-security-hardening.sql  (Sicherheits-Audit Oktober 2026)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-14. Safe to run again.
--
-- A) Not-logged-in visitors ("anon") get NO table rights at all (the app never reads tables without
--    login). Logged-in users lose TRUNCATE / TRIGGER / REFERENCES (TRUNCATE would ignore RLS).
--    Row Level Security (company separation) stays as it is; this only removes rights nobody needs.
-- B) Zeiterfassung is tamper-proof:
--    * every raw stamp (attendance_events) gets the SERVER time (UTC); a different device time is
--      only kept as information in raw_payload.device_scanned_at
--    * raw stamps and corrections can never be changed or deleted (also not by the Leitung)
--    * sessions (check-in/check-out) can only be changed through correct_attendance(...),
--      which needs a reason and writes the old and the new value into attendance_corrections

-- A) rights -------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;

-- B) Zeiterfassung ------------------------------------------------------------------------------
create or replace function attendance_server_time() returns trigger language plpgsql as $$
begin
  if new.scanned_at is not null and abs(extract(epoch from (new.scanned_at - now()))) > 120 then
    new.raw_payload := coalesce(new.raw_payload, '{}'::jsonb) || jsonb_build_object('device_scanned_at', new.scanned_at);
  end if;
  new.scanned_at := now();   -- server time, stored as UTC (timestamptz)
  new.created_at := now();
  return new;
end $$;
drop trigger if exists trg_attendance_server_time on attendance_events;
create trigger trg_attendance_server_time before insert on attendance_events for each row execute function attendance_server_time();

create or replace function attendance_forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'Zeiterfassung ist unveränderlich: % auf % ist nicht erlaubt. Korrekturen nur über correct_attendance (mit Grund).', tg_op, tg_table_name;
end $$;
drop trigger if exists trg_events_immutable on attendance_events;
create trigger trg_events_immutable before update or delete on attendance_events for each row execute function attendance_forbid_change();
drop trigger if exists trg_corrections_immutable on attendance_corrections;
create trigger trg_corrections_immutable before update or delete on attendance_corrections for each row execute function attendance_forbid_change();

-- sessions: logged-in users may only read; changes come from the system or from correct_attendance
drop policy if exists mt_sessions_supervisor on attendance_sessions;
create or replace function attendance_sessions_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Arbeitszeiten werden nur über correct_attendance (mit Grund) geändert';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_sessions_guard on attendance_sessions;
create trigger trg_sessions_guard before update or delete on attendance_sessions for each row execute function attendance_sessions_guard();

-- corrections are written ONLY by correct_attendance (no direct inserts any more)
drop policy if exists mt_corr_insert on attendance_corrections;

create or replace function correct_attendance(p_session_id bigint, p_field text, p_new_value timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s attendance_sessions; old_v timestamptz;
begin
  select * into s from attendance_sessions where id = p_session_id;
  if s.id is null or not is_org_leader(s.org_id) then raise exception 'Nur Leitung oder Inhaber dürfen Arbeitszeiten korrigieren'; end if;
  if p_field not in ('check_in', 'check_out') then raise exception 'Ungültiges Feld'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Bitte einen Grund angeben'; end if;
  old_v := case when p_field = 'check_in' then s.check_in else s.check_out end;
  insert into attendance_corrections (session_id, staff_id, field, old_value, new_value, reason, corrected_by, corrected_at, org_id)
  values (s.id, s.staff_id, p_field, old_v, p_new_value, trim(p_reason), auth.uid()::text, now(), s.org_id);
  if p_field = 'check_in' then update attendance_sessions set check_in = p_new_value where id = s.id;
  else update attendance_sessions set check_out = p_new_value where id = s.id; end if;
end $$;
revoke all on function correct_attendance(bigint, text, timestamptz, text) from public, anon;
grant execute on function correct_attendance(bigint, text, timestamptz, text) to authenticated;

-- C) fixed search_path for trigger/helper functions (Supabase security advisor)
alter function public.resolve_attendance_staff() set search_path = public;
alter function public.rebuild_attendance_sessions(uuid, date, date) set search_path = public;
alter function public.attendance_server_time() set search_path = public;
alter function public.attendance_forbid_change() set search_path = public;
alter function public.attendance_sessions_guard() set search_path = public;
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='requests_set_decision' loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;
