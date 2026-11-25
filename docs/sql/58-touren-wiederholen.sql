-- 58 – Touren D3c-2: regelmäßige Aufträge (Wunsch Nutzer 24.11.2026)
-- Eine „Reihe“ (job_series) beschreibt: Kunde, Adresse, Uhrzeit, Dauer, Leistung … und eine Regel
--   (jede Woche / alle 2 Wochen an bestimmten Wochentagen, oder jeden Monat am selben Tag).
-- Die einzelnen Termine sind ganz normale Aufträge (jobs.series_id) – immer 12 Wochen im Voraus.
-- touren_series_fill(org) füllt auf; die App ruft sie beim Öffnen von „Aufträge“ auf.
-- Ändern, Pausieren, Beenden nur über die Funktionen unten (sie passen die Termine mit an).
-- Begonnene oder erledigte Termine (arrived_at gesetzt, status done/cancelled) werden nie angefasst.
-- Die Mitarbeiter-App ändert sich nicht.

create table if not exists public.job_series (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  address_id      uuid references customer_addresses(id) on delete set null,
  address_text    text not null check (length(btrim(address_text)) between 1 and 500),
  maps_url        text check (maps_url is null or length(maps_url) <= 2000),
  lat             double precision check (lat is null or lat between -90 and 90),
  lng             double precision check (lng is null or lng between -180 and 180),
  start_time      time not null,
  duration_min    integer not null check (duration_min between 5 and 1440),
  service_type_id uuid references service_types(id) on delete set null,
  staff_needed    integer not null default 1 check (staff_needed between 1 and 50),
  material        text check (material is null or material in ('customer', 'ours')),
  notes_staff     text check (notes_staff is null or length(notes_staff) <= 4000),
  notes_internal  text check (notes_internal is null or length(notes_internal) <= 4000),
  source          text not null default 'phone',
  extra           jsonb not null default '{}'::jsonb,
  freq            text not null check (freq in ('week', 'month')),
  every           integer not null default 1 check (every between 1 and 12),
  weekdays        integer[] not null default '{}',          -- ISO: 1 = Mo … 7 = So (nur bei freq = week)
  start_date      date not null,                            -- Anker (Woche / Tag im Monat)
  end_date        date,
  pause_from      date,
  pause_until     date,
  pause_reason    text check (pause_reason is null or length(pause_reason) <= 200),
  same_team       boolean not null default false,
  staff_ids       uuid[] not null default '{}',
  generated_until date,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  check (freq <> 'week' or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7])),
  check (end_date is null or end_date >= start_date - 1),
  check (pause_until is null or pause_from is not null and pause_until >= pause_from)
);
create index if not exists job_series_org on public.job_series (org_id, customer_id);

alter table public.jobs add column if not exists series_id uuid references public.job_series(id) on delete set null;
create index if not exists jobs_series on public.jobs (series_id, work_date) where series_id is not null;

-- Prüfung beim Anlegen: alles gehört zur selben Firma
create or replace function public.job_series_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then raise exception 'Firma kann nicht geändert werden'; end if;
  if not exists (select 1 from customers c where c.id = new.customer_id and c.org_id = new.org_id) then raise exception 'Kunde gehört nicht zu dieser Firma'; end if;
  if new.address_id is not null and not exists (select 1 from customer_addresses a where a.id = new.address_id and a.customer_id = new.customer_id) then raise exception 'Adresse gehört nicht zu diesem Kunden'; end if;
  if new.service_type_id is not null and not exists (select 1 from service_types s where s.id = new.service_type_id and s.org_id = new.org_id) then raise exception 'Leistung gehört nicht zu dieser Firma'; end if;
  if exists (select 1 from unnest(new.staff_ids) x where not exists (select 1 from staff s where s.id = x and s.org_id = new.org_id)) then raise exception 'Person gehört nicht zu dieser Firma'; end if;
  if tg_op = 'INSERT' then
    new.created_at := now(); new.generated_until := null;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    new.created_at := old.created_at; new.created_by := old.created_by;
  end if;
  return new;
end $$;

drop trigger if exists trg_series_guard on public.job_series;
create trigger trg_series_guard before insert or update on public.job_series for each row execute function job_series_guard();
drop trigger if exists trg_trial_guard on public.job_series;
create trigger trg_trial_guard before insert or update or delete on public.job_series for each row execute function trial_guard();

alter table public.job_series enable row level security;
revoke all on public.job_series from anon;
revoke all on public.job_series from authenticated;
grant select, insert on public.job_series to authenticated;
drop policy if exists series_select on public.job_series;
drop policy if exists series_insert on public.job_series;
create policy series_select on public.job_series for select to authenticated using (is_touren_staff(org_id));
create policy series_insert on public.job_series for insert to authenticated with check (is_touren_staff(org_id));

-- Passt das Datum zur Regel?
create or replace function public.touren_series_hit(s job_series, d date) returns boolean
language sql immutable as $$
  select d >= s.start_date
     and (s.end_date is null or d <= s.end_date)
     and not (s.pause_from is not null and d between s.pause_from and coalesce(s.pause_until, d))
     and case when s.freq = 'week' then
           extract(isodow from d)::int = any (s.weekdays)
           and ((date_trunc('week', d)::date - date_trunc('week', s.start_date)::date) / 7) % s.every = 0
         else
           ((extract(year from d) - extract(year from s.start_date)) * 12 + extract(month from d) - extract(month from s.start_date))::int % s.every = 0
           and extract(day from d) = least(extract(day from s.start_date), extract(day from (date_trunc('month', d) + interval '1 month - 1 day')))
         end
$$;

-- Team einem Termin geben (Überschneidung / inaktiv → Person wird übersprungen)
create or replace function public.touren_series_assign(p_job uuid, p_staff uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare x uuid; o uuid;
begin
  select org_id into o from jobs where id = p_job;
  foreach x in array coalesce(p_staff, '{}') loop
    begin
      insert into job_staff (job_id, staff_id, org_id) values (p_job, x, o) on conflict do nothing;
    exception when others then null;
    end;
  end loop;
end $$;

-- Termine einer Reihe in einem Zeitraum anlegen (nur fehlende Tage)
create or replace function public.touren_series_gen(p_series uuid, p_from date, p_to date) returns integer
language plpgsql security definer set search_path = public as $$
declare s job_series; d date; n integer := 0; jid uuid;
begin
  select * into s from job_series where id = p_series;
  if s.id is null or p_from > p_to then return 0; end if;
  d := p_from;
  while d <= p_to loop
    if touren_series_hit(s, d) and not exists (select 1 from jobs where series_id = s.id and work_date = d) then
      insert into jobs (org_id, job_no, customer_id, address_id, address_text, maps_url, lat, lng, work_date, start_time, duration_min,
                        service_type_id, staff_needed, material, notes_staff, notes_internal, source, status, extra, series_id)
      values (s.org_id, 0, s.customer_id, s.address_id, s.address_text, s.maps_url, s.lat, s.lng, d, s.start_time, s.duration_min,
              s.service_type_id, s.staff_needed, s.material, s.notes_staff, s.notes_internal, s.source, 'accepted', s.extra, s.id)
      returning id into jid;
      if s.same_team then perform touren_series_assign(jid, s.staff_ids); end if;
      n := n + 1;
    end if;
    d := d + 1;
  end loop;
  return n;
end $$;

-- Auffüllen: alle Reihen der Firma bis heute + 12 Wochen
create or replace function public.touren_series_fill(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare s job_series; today date; a date; b date; n integer := 0;
begin
  if not is_touren_staff(p_org) then raise exception 'Keine Berechtigung'; end if;
  if trial_expired(p_org) then return 0; end if;
  today := (now() at time zone org_tz(p_org))::date;
  for s in select * from job_series where org_id = p_org and (end_date is null or end_date >= coalesce(generated_until + 1, start_date)) loop
    a := case when s.generated_until is null then s.start_date else greatest(s.generated_until + 1, today) end;
    b := least(coalesce(s.end_date, today + 84), today + 84);
    if a <= b then n := n + touren_series_gen(s.id, a, b); end if;
    if b > coalesce(s.generated_until, b - 1) then update job_series set generated_until = b where id = s.id; end if;
  end loop;
  return n;
end $$;

-- noch nicht begonnene Termine einer Reihe ab/bis Datum
create or replace function public.touren_series_open_jobs(p_series uuid, p_from date, p_to date) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from jobs where series_id = p_series and work_date between p_from and p_to
    and status in ('new', 'accepted') and arrived_at is null and finished_at is null
$$;

-- Pausieren (p_until = null → Pause aufheben, ausgefallene Termine kommen zurück)
create or replace function public.touren_series_pause(p_series uuid, p_from date, p_until date, p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare s job_series; n integer := 0; today date;
begin
  select * into s from job_series where id = p_series;
  if s.id is null or not is_touren_staff(s.org_id) then raise exception 'Keine Berechtigung'; end if;
  today := (now() at time zone org_tz(s.org_id))::date;
  if p_until is null then
    if s.pause_from is null then return 0; end if;
    update job_series set pause_from = null, pause_until = null, pause_reason = null where id = s.id;
    if s.generated_until is not null then
      n := touren_series_gen(s.id, greatest(s.pause_from, today), least(s.pause_until, s.generated_until));
    end if;
    return n;
  end if;
  if p_from is null or p_until < p_from then raise exception 'Bitte den Zeitraum prüfen.'; end if;
  update job_series set pause_from = p_from, pause_until = p_until, pause_reason = nullif(btrim(coalesce(p_reason, '')), '') where id = s.id;
  delete from jobs where id in (select touren_series_open_jobs(s.id, p_from, p_until));
  get diagnostics n = row_count;
  return n;
end $$;

-- Beenden: letzter Termin am p_last; spätere offene Termine werden gelöscht
create or replace function public.touren_series_end(p_series uuid, p_last date) returns integer
language plpgsql security definer set search_path = public as $$
declare s job_series; n integer;
begin
  select * into s from job_series where id = p_series;
  if s.id is null or not is_touren_staff(s.org_id) then raise exception 'Keine Berechtigung'; end if;
  if p_last is null then raise exception 'Bitte ein Datum wählen.'; end if;
  update job_series set end_date = greatest(p_last, start_date - 1) where id = s.id;
  delete from jobs where id in (select touren_series_open_jobs(s.id, p_last + 1, 'infinity'::date));
  get diagnostics n = row_count;
  return n;
end $$;

-- Ändern ab Datum: p enthält nur die geänderten Felder.
-- Regel geändert (freq/every/weekdays) → offene Termine ab p_from neu; sonst offene Termine ab p_from angepasst.
create or replace function public.touren_series_change(p_series uuid, p_from date, p jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare s job_series; t job_series; rule boolean; jid uuid; n integer := 0;
begin
  select * into s from job_series where id = p_series;
  if s.id is null or not is_touren_staff(s.org_id) then raise exception 'Keine Berechtigung'; end if;
  if p_from is null then raise exception 'Bitte ein Datum wählen.'; end if;
  rule := (p ? 'freq' and p->>'freq' is distinct from s.freq)
       or (p ? 'every' and (p->>'every')::int is distinct from s.every)
       or (p ? 'weekdays' and array(select jsonb_array_elements_text(p->'weekdays')::int order by 1) is distinct from array(select unnest(s.weekdays) order by 1));
  update job_series set
    address_id      = case when p ? 'address_text' then nullif(p->>'address_id', '')::uuid else address_id end,
    address_text    = coalesce(p->>'address_text', address_text),
    maps_url        = case when p ? 'address_text' then nullif(p->>'maps_url', '') else maps_url end,
    lat             = case when p ? 'address_text' then (p->>'lat')::double precision else lat end,
    lng             = case when p ? 'address_text' then (p->>'lng')::double precision else lng end,
    start_time      = coalesce((p->>'start_time')::time, start_time),
    duration_min    = coalesce((p->>'duration_min')::int, duration_min),
    service_type_id = case when p ? 'service_type_id' then nullif(p->>'service_type_id', '')::uuid else service_type_id end,
    staff_needed    = coalesce((p->>'staff_needed')::int, staff_needed),
    material        = case when p ? 'material' then nullif(p->>'material', '') else material end,
    notes_staff     = case when p ? 'notes_staff' then nullif(p->>'notes_staff', '') else notes_staff end,
    notes_internal  = case when p ? 'notes_internal' then nullif(p->>'notes_internal', '') else notes_internal end,
    extra           = coalesce(p->'extra', extra),
    freq            = coalesce(p->>'freq', freq),
    every           = coalesce((p->>'every')::int, every),
    weekdays        = case when p ? 'weekdays' then array(select jsonb_array_elements_text(p->'weekdays')::int) else weekdays end,
    start_date      = case when rule then p_from else start_date end,
    same_team       = case when p ? 'staff_ids' then cardinality(array(select jsonb_array_elements_text(p->'staff_ids'))) > 0 else same_team end,
    staff_ids       = case when p ? 'staff_ids' then array(select jsonb_array_elements_text(p->'staff_ids')::uuid) else staff_ids end
  where id = s.id
  returning * into t;

  if rule then
    delete from jobs where id in (select touren_series_open_jobs(s.id, p_from, 'infinity'::date));
    if t.generated_until is not null then n := touren_series_gen(s.id, p_from, t.generated_until); end if;
    return n;
  end if;

  update jobs j set
    address_id = t.address_id, address_text = t.address_text, maps_url = t.maps_url, lat = t.lat, lng = t.lng,
    start_time = t.start_time, duration_min = t.duration_min, service_type_id = t.service_type_id, staff_needed = t.staff_needed,
    material = t.material, notes_staff = t.notes_staff, notes_internal = t.notes_internal, extra = t.extra
  where j.id in (select touren_series_open_jobs(s.id, p_from, 'infinity'::date));
  get diagnostics n = row_count;

  if p ? 'staff_ids' then
    for jid in select touren_series_open_jobs(s.id, p_from, 'infinity'::date) loop
      delete from job_staff where job_id = jid;
      perform touren_series_assign(jid, t.staff_ids);
    end loop;
  end if;
  return n;
end $$;

-- „Immer dasselbe Personal“: Team eines Termins für alle späteren offenen Termine übernehmen
create or replace function public.touren_series_team_from(p_job uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare j jobs; ids uuid[]; jid uuid; n integer := 0;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or j.series_id is null or not is_touren_staff(j.org_id) then raise exception 'Keine Berechtigung'; end if;
  ids := array(select staff_id from job_staff where job_id = j.id order by created_at);
  update job_series set staff_ids = ids, same_team = cardinality(ids) > 0 where id = j.series_id;
  for jid in select touren_series_open_jobs(j.series_id, j.work_date + 1, 'infinity'::date) loop
    delete from job_staff where job_id = jid;
    perform touren_series_assign(jid, ids);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.touren_series_hit(job_series, date) from public, anon;
revoke all on function public.touren_series_assign(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.touren_series_gen(uuid, date, date) from public, anon, authenticated;
revoke all on function public.touren_series_open_jobs(uuid, date, date) from public, anon, authenticated;
revoke all on function public.touren_series_fill(uuid) from public, anon;
revoke all on function public.touren_series_pause(uuid, date, date, text) from public, anon;
revoke all on function public.touren_series_end(uuid, date) from public, anon;
revoke all on function public.touren_series_change(uuid, date, jsonb) from public, anon;
revoke all on function public.touren_series_team_from(uuid) from public, anon;
grant execute on function public.touren_series_fill(uuid) to authenticated;
grant execute on function public.touren_series_pause(uuid, date, date, text) to authenticated;
grant execute on function public.touren_series_end(uuid, date) to authenticated;
grant execute on function public.touren_series_change(uuid, date, jsonb) to authenticated;
grant execute on function public.touren_series_team_from(uuid) to authenticated;
