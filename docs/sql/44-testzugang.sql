-- 44 – Testzugang 14 Tage (Paket 38b)
-- Einmal im Supabase SQL-Editor ausführen (Claude führt es über MCP aus).
--
-- 1) organizations.trial_reminder_sent_at: Erinnerung an den Admin (30 Tage nach Ablauf) nur einmal
-- 2) demo_requests.org_id: welche Testfirma aus dieser Anfrage entstanden ist
-- 3) trial_expired(org): Testphase vorbei?
-- 4) trial_guard: nach Ablauf darf niemand mit Rolle Inhaber/Leitung/Schichtplaner etwas speichern
--    (nur Ansicht). Mitarbeitende (Rolle employee) und der Server (service_role: Stempeln, /admin)
--    sind NICHT betroffen – Stempeln läuft immer über den Server.
-- 5) create_sample_staff(org, anzahl): fiktive Mitarbeitende für Testfirmen (Inhaber/Leitung)
-- 6) delete_trial_org(org): Testfirma komplett löschen (nur Server/Admin, nur Testfirmen)

alter table public.organizations add column if not exists trial_reminder_sent_at timestamptz;
alter table public.demo_requests add column if not exists org_id uuid references public.organizations(id) on delete set null;

create or replace function public.trial_expired(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select trial_until is not null and trial_until < now() from organizations where id = p_org), false)
$$;
grant execute on function public.trial_expired(uuid) to authenticated;

create or replace function public.trial_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb; o uuid; r text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  j := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o := nullif(case when tg_table_name = 'organizations' then j->>'id' else j->>'org_id' end, '')::uuid;
  if o is not null and trial_expired(o) then
    select role into r from memberships where user_id = auth.uid() and org_id = o;
    if r is not null and r <> 'employee' then
      raise exception 'Testphase abgelaufen – nur Ansicht. Bitte wenden Sie sich an info@dienstigo.de.' using errcode = 'P0001';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','staff','memberships','scheduled_shifts','schedule_months','schedule_versions','shift_changes',
    'shift_definitions','month_closures','staff_month_balance','staff_start_balance','staff_start_balance_log',
    'staff_vacation','vacation_entitlements','requests','request_types','wishes','attendance_absences',
    'attendance_correction_requests','attendance_corrections','attendance_events','attendance_sessions',
    'attendance_sessions_removed','attendance_review_seen','overtime_payouts','badges','devices','staff_pins',
    'terminal_pair_codes','terminal_tokens','work_locations','location_assignments','location_team','org_features','org_products'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_trial_guard on public.%I', t);
      execute format('create trigger trg_trial_guard before insert or update or delete on public.%I for each row execute function public.trial_guard()', t);
    end if;
  end loop;
end $$;

-- fiktive Mitarbeitende (Namen erfunden). Nur Testfirmen, nur Inhaber/Leitung, 1–200 pro Aufruf, beliebig oft.
create or replace function public.create_sample_staff(p_org uuid, p_count int)
returns int language plpgsql security definer set search_path = public as $$
declare
  fn text[] := array['Lena','Jonas','Mia','Paul','Emma','Felix','Hanna','Lukas','Sophie','Max','Lea','Tim','Clara','Noah','Marie','Elias','Lina','Ben','Nora','Finn','Ida','Leon','Greta','Jan','Frida','Moritz','Amelie','Tom','Paula','Erik'];
  ln text[] := array['Beispiel','Muster','Probe','Testmann','Fiktiv','Demo','Sample','Vorlage','Modell','Entwurf','Platzhalter','Übung','Spiel','Schema','Skizze'];
  r text; n int := 0; i int := 0; nm text; et text; wh numeric; nextno int;
begin
  select role into r from memberships where user_id = auth.uid() and org_id = p_org;
  if r is null or r not in ('owner','supervisor') then raise exception 'Nur Inhaber oder Leitung dieser Firma.'; end if;
  if not exists (select 1 from organizations where id = p_org and trial_until is not null) then
    raise exception 'Beispiel-Mitarbeitende gibt es nur in der Testphase.';
  end if;
  if trial_expired(p_org) then raise exception 'Testphase abgelaufen – nur Ansicht.'; end if;
  if p_count is null or p_count < 1 or p_count > 200 then raise exception 'Bitte eine Anzahl von 1 bis 200 angeben.'; end if;
  select coalesce(max(personnel_no::int), 1000) + 1 into nextno from staff where org_id = p_org and personnel_no ~ '^[0-9]{1,9}$';
  while n < p_count loop
    nm := fn[1 + floor(random() * array_length(fn, 1))::int] || ' ' || ln[1 + floor(random() * array_length(ln, 1))::int];
    i := 0;
    while exists (select 1 from staff where org_id = p_org and lower(name) = lower(nm)) loop
      i := i + 1; -- Name schon vergeben: Nummer anhängen ("Lena Muster 2")
      nm := regexp_replace(nm, ' [0-9]+$', '') || ' ' || (i + 1);
    end loop;
    -- Mischung: 6 von 10 Vollzeit, 2 Teilzeit, 2 Minijob
    case (n % 10)
      when 0,1,2,3,4,5 then et := 'full'; wh := case when n % 2 = 0 then 40 else 38.5 end;
      when 6,7 then et := 'part'; wh := case when n % 2 = 0 then 20 else 30 end;
      else et := 'mini'; wh := 10;
    end case;
    insert into staff (org_id, name, weekly_hours, employment_type, active, personnel_no)
    values (p_org, nm, wh, et, true, (nextno + n)::text);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.create_sample_staff(uuid, int) from public, anon;
grant execute on function public.create_sample_staff(uuid, int) to authenticated;

-- Testfirma komplett löschen: nur Server (service_role), nur Firmen mit Testphase.
-- Die Zeiterfassung ist sonst unveränderlich; hier werden die Sperren nur für diesen einen Löschvorgang ausgesetzt.
create or replace function public.delete_trial_org(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then raise exception 'Nur Plattform-Verwaltung.'; end if;
  if not exists (select 1 from organizations where id = p_org and trial_until is not null) then
    raise exception 'Nur Testfirmen können gelöscht werden.';
  end if;
  alter table attendance_events disable trigger trg_events_immutable;
  alter table attendance_corrections disable trigger trg_corrections_immutable;
  delete from organizations where id = p_org;
  alter table attendance_events enable trigger trg_events_immutable;
  alter table attendance_corrections enable trigger trg_corrections_immutable;
end $$;
revoke all on function public.delete_trial_org(uuid) from public, anon, authenticated;
grant execute on function public.delete_trial_org(uuid) to service_role;
