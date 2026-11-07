-- 36-stempelung-entfernen.sql  (Paket 6f-v4, 7 Nov 2026)
-- Run ONCE. Safe to run again.
-- 1) Leitung/Inhaber can remove a wrong stamp ("Entfernen" in Anwesenheit -> Zeiten bearbeiten).
--    Nothing is lost: the row is copied to attendance_sessions_removed (times, reason, who, when), then deleted.
--    attendance_corrections / attendance_correction_requests keep their history (FK = ON DELETE SET NULL).
-- 2) save_attendance_edits: new op "remove" + refuses overlapping times for the changed stamps
--    (only here – stamping in the employee app / terminal is NOT checked and NOT blocked).

create table if not exists public.attendance_sessions_removed (
  id           bigint primary key,            -- the former attendance_sessions.id
  org_id       uuid not null references public.organizations(id) on delete cascade,
  staff_id     uuid,
  check_in     timestamptz,
  check_out    timestamptz,
  in_event_id  bigint,
  out_event_id bigint,
  created_at   timestamptz,
  reason       text not null,
  removed_by   text,
  removed_at   timestamptz not null default now()
);
create index if not exists attendance_sessions_removed_org_idx on public.attendance_sessions_removed (org_id, removed_at);
alter table public.attendance_sessions_removed enable row level security;
drop policy if exists "Leitung liest entfernte Stempelungen" on public.attendance_sessions_removed;
create policy "Leitung liest entfernte Stempelungen" on public.attendance_sessions_removed
  for select to authenticated using (is_org_leader(org_id));
revoke all on public.attendance_sessions_removed from anon, authenticated;
grant select on public.attendance_sessions_removed to authenticated;

create or replace function public.remove_attendance_session(p_session_id bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s attendance_sessions;
begin
  select * into s from attendance_sessions where id = p_session_id;
  if s.id is null or not is_org_leader(s.org_id) then raise exception 'Nur Leitung oder Inhaber dürfen Stempelungen entfernen'; end if;
  if s.staff_id = my_staff_id(s.org_id) and coalesce(my_role(s.org_id), '') <> 'owner' then
    raise exception 'Eigene Zeiten bitte in „Meine Zeiten“ beantragen – der Inhaber oder eine andere Leitung bestätigt sie'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Bitte einen Grund angeben'; end if;
  insert into attendance_sessions_removed (id, org_id, staff_id, check_in, check_out, in_event_id, out_event_id, created_at, reason, removed_by)
  values (s.id, s.org_id, s.staff_id, s.check_in, s.check_out, s.in_event_id, s.out_event_id, s.created_at, trim(p_reason), auth.uid()::text);
  delete from attendance_sessions where id = s.id;
end $$;
revoke all on function public.remove_attendance_session(bigint, text) from public, anon;
grant execute on function public.remove_attendance_session(bigint, text) to authenticated;

create or replace function public.save_attendance_edits(p_org uuid, p_edits jsonb, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare e jsonb; i int := 0; v_reason text := trim(coalesce(p_reason, '')); v_sid bigint; v_aid bigint;
        v_ids bigint[] := '{}'; v_bad record;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber dürfen Arbeitszeiten ändern'; end if;
  if length(v_reason) < 3 then raise exception 'Bitte einen Grund angeben'; end if;
  if jsonb_typeof(p_edits) is distinct from 'array' or jsonb_array_length(p_edits) = 0 then raise exception 'Keine Änderungen'; end if;
  if jsonb_array_length(p_edits) > 300 then raise exception 'Zu viele Änderungen auf einmal (höchstens 300)'; end if;

  for e in select value from jsonb_array_elements(p_edits) loop
    i := i + 1;
    begin
      if e->>'op' = 'fix' then
        v_sid := (e->>'session_id')::bigint;
        if not exists (select 1 from attendance_sessions where id = v_sid and org_id = p_org) then raise exception 'Stempelung nicht gefunden'; end if;
        if nullif(e->>'check_in', '') is null and nullif(e->>'check_out', '') is null then raise exception 'Kommen oder Gehen fehlt'; end if;
        if nullif(e->>'check_in', '') is not null then perform correct_attendance(v_sid, 'check_in', (e->>'check_in')::timestamptz, v_reason); end if;
        if nullif(e->>'check_out', '') is not null then perform correct_attendance(v_sid, 'check_out', (e->>'check_out')::timestamptz, v_reason); end if;
        if exists (select 1 from attendance_sessions where id = v_sid and check_out is not null and check_out <= check_in) then
          raise exception 'Gehen liegt vor Kommen';
        end if;
        v_ids := v_ids || v_sid;
      elsif e->>'op' = 'add' then
        v_sid := add_attendance_session(p_org, (e->>'staff_id')::uuid, (e->>'check_in')::timestamptz, (e->>'check_out')::timestamptz, v_reason);
        v_ids := v_ids || v_sid;
      elsif e->>'op' = 'remove' then
        v_sid := (e->>'session_id')::bigint;
        if not exists (select 1 from attendance_sessions where id = v_sid and org_id = p_org) then raise exception 'Stempelung nicht gefunden'; end if;
        perform remove_attendance_session(v_sid, v_reason);
      elsif e->>'op' = 'absence' then
        perform set_absence(p_org, (e->>'staff_id')::uuid, (e->>'date')::date, e->>'kind', e->>'note');
      elsif e->>'op' = 'unabsence' then
        v_aid := (e->>'absence_id')::bigint;
        if not exists (select 1 from attendance_absences where id = v_aid and org_id = p_org) then raise exception 'Abwesenheit nicht gefunden'; end if;
        perform void_absence(v_aid, v_reason);
      else
        raise exception 'Unbekannte Änderung';
      end if;
    exception when others then
      raise exception 'Änderung %: %', i, sqlerrm;
    end;
  end loop;

  -- no overlapping times after saving (only for the stamps changed or added here; an open stamp counts as one moment)
  select a.check_in a_in, a.check_out a_out, b.check_in b_in, b.check_out b_out into v_bad
  from attendance_sessions a
  join attendance_sessions b on b.org_id = a.org_id and b.staff_id = a.staff_id and b.id <> a.id
  where a.id = any(v_ids)
    and a.check_in < coalesce(b.check_out, b.check_in + interval '1 second')
    and b.check_in < coalesce(a.check_out, a.check_in + interval '1 second')
  limit 1;
  if found then
    raise exception 'Überschneidung mit einer anderen Stempelung am % (% – %). Bitte die doppelte Stempelung zuerst „Entfernen“.',
      to_char(v_bad.b_in at time zone 'Europe/Berlin', 'DD.MM.'),
      to_char(v_bad.b_in at time zone 'Europe/Berlin', 'HH24:MI'),
      coalesce(to_char(v_bad.b_out at time zone 'Europe/Berlin', 'HH24:MI'), 'Gehen fehlt');
  end if;
  return i;
end $$;
