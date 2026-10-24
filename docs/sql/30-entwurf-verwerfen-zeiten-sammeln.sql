-- 30: Entwurf verwerfen (Dienstplan) + gesammelte Zeitänderungen (Anwesenheit).
-- Schon auf der echten Datenbank ausgeführt (Migration "entwurf_verwerfen_zeiten_sammeln").
--
-- discard_draft(p_org, p_year, p_month)
--   Für einen Monat mit veröffentlichter Fassung: zwischengespeicherter / eingereichter Entwurf wird verworfen.
--   Entwurf = wieder genau die veröffentlichte Fassung, has_newer_draft = false, Status wieder "published",
--   Begründung einer Einreichung gelöscht. Mitarbeitende merken nichts (sie sehen immer nur "published").
--   Wer darf: wie save_draft (Inhaber, Leitung, Schichtplaner) in einer Firma mit Dienstplaner.
--
-- save_attendance_edits(p_org, p_edits jsonb, p_reason)
--   Alle in „Zeiten bearbeiten“ gesammelten Änderungen in EINER Transaktion: entweder alle oder keine.
--   Einträge: {op:"fix", session_id, check_in?, check_out?} | {op:"add", staff_id, check_in, check_out}
--             {op:"absence", staff_id, date, kind, note?}   | {op:"unabsence", absence_id}
--   Benutzt die bestehenden Funktionen (correct_attendance, add_attendance_session, set_absence, void_absence),
--   also gelten alle bisherigen Regeln (Grund, eigene Zeiten, 16 Stunden, Protokoll in attendance_corrections).
--
-- Nebenbei behoben: set_absence kannte nur 6 Gründe, die Tabelle (und die App) aber 12
--   (krank_ohne, sonderurlaub, dienstreise, kur, mutterschutz, elternzeit gaben „Ungültiger Grund“).

create or replace function public.discard_draft(p_org uuid, p_year integer, p_month integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  d_from date := make_date(p_year, p_month, 1);
  d_to   date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  n int;
begin
  if not (is_org_supervisor(p_org) and org_has_planner(p_org)) then
    raise exception 'Nur Inhaber, Leitung oder Schichtplaner dürfen Entwürfe verwerfen';
  end if;
  if not exists (select 1 from scheduled_shifts where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to) then
    raise exception 'Für diesen Monat gibt es keine veröffentlichte Fassung';
  end if;

  delete from scheduled_shifts where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;
  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status)
  select org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, 'draft'
    from scheduled_shifts
   where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to;
  get diagnostics n = row_count;

  update schedule_months
     set status = 'published', has_newer_draft = false, review_note = null, change_note = null, change_normal = false, updated_at = now()
   where org_id = p_org and year = p_year and month = p_month;
  return n;
end $$;

create or replace function public.save_attendance_edits(p_org uuid, p_edits jsonb, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare e jsonb; i int := 0; v_reason text := trim(coalesce(p_reason, '')); v_sid bigint; v_aid bigint;
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
      elsif e->>'op' = 'add' then
        perform add_attendance_session(p_org, (e->>'staff_id')::uuid, (e->>'check_in')::timestamptz, (e->>'check_out')::timestamptz, v_reason);
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
  return i;
end $$;

create or replace function public.set_absence(p_org uuid, p_staff uuid, p_date date, p_kind text, p_note text)
returns bigint language plpgsql security definer set search_path = public as $$
declare aid bigint;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if not exists (select 1 from staff where id = p_staff and org_id = p_org) then raise exception 'Person gehört nicht zu dieser Firma'; end if;
  if p_kind not in ('krank', 'krank_ohne', 'urlaub', 'sonderurlaub', 'fortbildung', 'dienstreise', 'kur', 'mutterschutz', 'elternzeit',
                    'ueberstunden', 'unentschuldigt', 'sonstiges') then raise exception 'Ungültiger Grund'; end if;
  update attendance_absences set voided_at = now(), voided_by = auth.uid(), void_reason = 'ersetzt'
   where staff_id = p_staff and work_date = p_date and voided_at is null;
  insert into attendance_absences (org_id, staff_id, work_date, kind, note, created_by)
  values (p_org, p_staff, p_date, p_kind, nullif(trim(coalesce(p_note, '')), ''), auth.uid()) returning id into aid;
  return aid;
end $$;

revoke all on function public.discard_draft(uuid, integer, integer) from public, anon;
revoke all on function public.save_attendance_edits(uuid, jsonb, text) from public, anon;
grant execute on function public.discard_draft(uuid, integer, integer) to authenticated;
grant execute on function public.save_attendance_edits(uuid, jsonb, text) to authenticated;
