-- 48 – Touren D3b (22.11.2026): Personal zuteilen, Startpunkt, Fähigkeiten, Bezugsperson/Ausschluss, Branchenvorlage, „My jobs“.
-- Allgemein für alle Branchen (Reinigung, Pflege & Betreuung, Hausmeister & Technik, Allgemein) – Vorlage wählt /admin.
-- Datenschutz:
--   * Wohnadresse/Startpunkt der Mitarbeitenden sieht nur Inhaber/Leitung. Büro bekommt nur die ENTFERNUNG (vom Server gerechnet).
--   * Büro sieht den Fairness-Prozentsatz, nicht Vertragsstunden. Abwesenheit nur „abwesend“ (kein Grund → keine Gesundheitsdaten).
--   * Mitarbeitende sehen nur eigene Einsätze von heute/morgen; Hinweise und Zusatzfelder nur am Tag selbst; keine Telefonnummer des Kunden.

-- 1) Einstellungen je Firma
create table if not exists touren_settings (
  org_id      uuid primary key references organizations(id) on delete cascade,
  industry    text not null default 'general' check (industry in ('cleaning', 'care', 'facility', 'general')),
  near_km     numeric(5,1) not null default 3 check (near_km between 0 and 100),
  fairness_pp numeric(5,1) not null default 10 check (fairness_pp between 0 and 100),
  travel_min  integer not null default 30 check (travel_min between 0 and 240),
  updated_at  timestamptz not null default now()
);

-- 2) Orte der Firma (Unterkunft, Büro, Lager …) – Startpunkt für den ersten Einsatz
create table if not exists touren_places (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  kind       text not null default 'accommodation' check (kind in ('accommodation', 'office', 'depot', 'other')),
  name       text not null check (length(btrim(name)) between 1 and 100),
  address    text check (address is null or length(address) <= 500),
  maps_url   text check (maps_url is null or length(maps_url) <= 2000),
  lat        double precision check (lat is null or lat between -90 and 90),
  lng        double precision check (lng is null or lng between -180 and 180),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) Startpunkt je Mitarbeiter:in (Ort der Firma ODER eigene Wohnadresse)
create table if not exists staff_touren (
  staff_id      uuid primary key references staff(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  start_kind    text not null default 'none' check (start_kind in ('none', 'place', 'home')),
  place_id      uuid references touren_places(id) on delete set null,
  home_address  text check (home_address is null or length(home_address) <= 500),
  home_maps_url text check (home_maps_url is null or length(home_maps_url) <= 2000),
  home_lat      double precision check (home_lat is null or home_lat between -90 and 90),
  home_lng      double precision check (home_lng is null or home_lng between -180 and 180),
  updated_at    timestamptz not null default now()
);

-- 4) Fähigkeiten / Qualifikationen
create table if not exists skills (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 100),
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists staff_skills (
  staff_id uuid not null references staff(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  org_id   uuid not null references organizations(id) on delete cascade,
  primary key (staff_id, skill_id)
);
create table if not exists service_skills (
  service_type_id uuid not null references service_types(id) on delete cascade,
  skill_id        uuid not null references skills(id) on delete cascade,
  org_id          uuid not null references organizations(id) on delete cascade,
  primary key (service_type_id, skill_id)
);

-- 5) Kunde: bevorzugt / bitte nicht
create table if not exists customer_staff_pref (
  customer_id uuid not null references customers(id) on delete cascade,
  staff_id    uuid not null references staff(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        text not null check (kind in ('preferred', 'excluded')),
  created_at  timestamptz not null default now(),
  primary key (customer_id, staff_id)
);

-- 6) Zuteilung: mehrere Personen je Auftrag
create table if not exists job_staff (
  job_id     uuid not null references jobs(id) on delete cascade,
  staff_id   uuid not null references staff(id) on delete restrict,
  org_id     uuid not null references organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (job_id, staff_id)
);
create index if not exists job_staff_staff on job_staff (staff_id);

-- 7) Prüfungen: alles gehört zur selben Firma; keine Überschneidung bei einer Person
create or replace function public.touren_link_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jobs; s_name text; clash record;
begin
  if tg_table_name in ('staff_touren', 'staff_skills', 'customer_staff_pref', 'job_staff') then
    if not exists (select 1 from staff s where s.id = new.staff_id and s.org_id = new.org_id) then raise exception 'Person gehört nicht zu dieser Firma'; end if;
  end if;
  if tg_table_name = 'staff_touren' then
    if new.place_id is not null and not exists (select 1 from touren_places p where p.id = new.place_id and p.org_id = new.org_id) then raise exception 'Ort gehört nicht zu dieser Firma'; end if;
    new.updated_at := now();
  elsif tg_table_name = 'staff_skills' then
    if not exists (select 1 from skills k where k.id = new.skill_id and k.org_id = new.org_id) then raise exception 'Fähigkeit gehört nicht zu dieser Firma'; end if;
  elsif tg_table_name = 'service_skills' then
    if not exists (select 1 from skills k where k.id = new.skill_id and k.org_id = new.org_id) then raise exception 'Fähigkeit gehört nicht zu dieser Firma'; end if;
    if not exists (select 1 from service_types t where t.id = new.service_type_id and t.org_id = new.org_id) then raise exception 'Leistung gehört nicht zu dieser Firma'; end if;
  elsif tg_table_name = 'customer_staff_pref' then
    if not exists (select 1 from customers c where c.id = new.customer_id and c.org_id = new.org_id) then raise exception 'Kunde gehört nicht zu dieser Firma'; end if;
  elsif tg_table_name = 'job_staff' then
    select * into j from jobs where id = new.job_id;
    if j.id is null or j.org_id <> new.org_id then raise exception 'Auftrag gehört nicht zu dieser Firma'; end if;
    if j.status = 'cancelled' then raise exception 'Der Auftrag ist storniert.'; end if;
    if not exists (select 1 from staff s where s.id = new.staff_id and s.active) then raise exception 'Diese Person ist nicht aktiv.'; end if;
    select o.job_no, o.start_time, o.duration_min into clash
      from job_staff x join jobs o on o.id = x.job_id
      where x.staff_id = new.staff_id and o.id <> j.id and o.status <> 'cancelled' and o.work_date = j.work_date
        and o.start_time < (j.start_time + make_interval(mins => j.duration_min))
        and j.start_time < (o.start_time + make_interval(mins => o.duration_min))
      limit 1;
    if found then raise exception 'Diese Person hat zu dieser Zeit schon einen anderen Auftrag.'; end if;
    new.created_at := now();
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  elsif tg_table_name = 'touren_settings' then
    new.updated_at := now();
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['touren_settings', 'touren_places', 'staff_touren', 'skills', 'staff_skills', 'service_skills', 'customer_staff_pref', 'job_staff'] loop
    execute format('drop trigger if exists trg_touren_link on %I', t);
    if t not in ('touren_places', 'skills') then
      execute format('create trigger trg_touren_link before insert or update on %I for each row execute function touren_link_guard()', t);
    end if;
    execute format('drop trigger if exists trg_trial_guard on %I', t);
    execute format('create trigger trg_trial_guard before insert or update or delete on %I for each row execute function trial_guard()', t);
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- 8) RLS
-- Einstellungen, Orte, Fähigkeiten, Leistungs-Fähigkeiten: lesen alle Touren-Berechtigten, ändern Inhaber/Leitung
do $$ declare t text; begin
  foreach t in array array['touren_settings', 'touren_places', 'skills', 'service_skills'] loop
    execute format('drop policy if exists %I on %I', t || '_sel', t);
    execute format('drop policy if exists %I on %I', t || '_ins', t);
    execute format('drop policy if exists %I on %I', t || '_upd', t);
    execute format('drop policy if exists %I on %I', t || '_del', t);
    execute format('create policy %I on %I for select to authenticated using (is_touren_staff(org_id))', t || '_sel', t);
    execute format('create policy %I on %I for insert to authenticated with check (is_org_leader(org_id) and is_touren_staff(org_id))', t || '_ins', t);
    execute format('create policy %I on %I for update to authenticated using (is_org_leader(org_id) and is_touren_staff(org_id)) with check (is_org_leader(org_id) and is_touren_staff(org_id))', t || '_upd', t);
    if t = 'service_skills' then
      execute format('create policy %I on %I for delete to authenticated using (is_org_leader(org_id) and is_touren_staff(org_id))', t || '_del', t);
    end if;
  end loop;
end $$;
revoke delete on touren_settings, touren_places, skills from authenticated;

-- Startpunkt und Fähigkeiten der Mitarbeitenden: nur Inhaber/Leitung (Wohnadresse!)
do $$ declare t text; begin
  foreach t in array array['staff_touren', 'staff_skills'] loop
    execute format('drop policy if exists %I on %I', t || '_all', t);
    execute format('create policy %I on %I for all to authenticated using (is_org_leader(org_id) and is_touren_staff(org_id)) with check (is_org_leader(org_id) and is_touren_staff(org_id))', t || '_all', t);
  end loop;
end $$;

-- Präferenzen und Zuteilungen: alle Touren-Berechtigten (auch Büro)
do $$ declare t text; begin
  foreach t in array array['customer_staff_pref', 'job_staff'] loop
    execute format('drop policy if exists %I on %I', t || '_sel', t);
    execute format('drop policy if exists %I on %I', t || '_ins', t);
    execute format('drop policy if exists %I on %I', t || '_del', t);
    execute format('drop policy if exists %I on %I', t || '_upd', t);
    execute format('create policy %I on %I for select to authenticated using (is_touren_staff(org_id))', t || '_sel', t);
    execute format('create policy %I on %I for insert to authenticated with check (is_touren_staff(org_id))', t || '_ins', t);
    execute format('create policy %I on %I for delete to authenticated using (is_touren_staff(org_id))', t || '_del', t);
    execute format('create policy %I on %I for update to authenticated using (is_touren_staff(org_id)) with check (is_touren_staff(org_id))', t || '_upd', t);
  end loop;
end $$;

-- 9) Entfernung (km, Luftlinie)
create or replace function public.touren_km(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable as $$
  select case when a_lat is null or a_lng is null or b_lat is null or b_lng is null then null
    else 2 * 6371 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2) + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))) end
$$;

-- 10) Tageskontext für die Zuteilung (Inhaber, Leitung, Büro)
create or replace function public.touren_day_context(p_org uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare leader boolean; m_from date; m_to date; res jsonb;
begin
  if not is_touren_staff(p_org) then raise exception 'Keine Berechtigung'; end if;
  leader := is_org_leader(p_org);
  m_from := date_trunc('month', p_day)::date; m_to := (date_trunc('month', p_day) + interval '1 month')::date;
  with st as (
    select s.id, s.name, s.weekly_hours, t.start_kind, t.place_id,
      case when t.start_kind = 'place' then p.lat when t.start_kind = 'home' then t.home_lat end as slat,
      case when t.start_kind = 'place' then p.lng when t.start_kind = 'home' then t.home_lng end as slng,
      case when t.start_kind = 'place' then p.name when t.start_kind = 'home' then 'home' end as slabel
    from staff s left join staff_touren t on t.staff_id = s.id left join touren_places p on p.id = t.place_id
    where s.org_id = p_org and s.active
  ),
  hrs as (
    select x.staff_id, sum(j.duration_min) / 60.0 as h
    from job_staff x join jobs j on j.id = x.job_id
    where x.org_id = p_org and j.status <> 'cancelled' and j.work_date >= m_from and j.work_date < m_to
    group by x.staff_id
  ),
  absent as (
    select staff_id from requests where org_id = p_org and status = 'approved' and p_day between date_from and date_to
    union select staff_id from attendance_absences where org_id = p_org and work_date = p_day and voided_at is null
  ),
  dayjobs as (select id, lat, lng from jobs where org_id = p_org and work_date = p_day)
  select jsonb_build_object(
    'leader', leader,
    'settings', coalesce((select to_jsonb(ts) - 'org_id' - 'updated_at' from touren_settings ts where ts.org_id = p_org),
                         jsonb_build_object('industry', 'general', 'near_km', 3, 'fairness_pp', 10, 'travel_min', 30)),
    'staff', coalesce((select jsonb_agg(jsonb_build_object(
        'id', st.id, 'name', st.name,
        'skills', coalesce((select jsonb_agg(k.skill_id) from staff_skills k where k.staff_id = st.id), '[]'::jsonb),
        'start_label', st.slabel,
        'start_km', coalesce((select jsonb_object_agg(d.id::text, round(touren_km(st.slat, st.slng, d.lat, d.lng)::numeric, 2)) from dayjobs d where touren_km(st.slat, st.slng, d.lat, d.lng) is not null), '{}'::jsonb),
        'pct', case when coalesce(st.weekly_hours, 0) > 0 then round((coalesce(h.h, 0) / (st.weekly_hours * 52 / 12) * 100)::numeric, 1) end,
        'hours', case when leader then round(coalesce(h.h, 0)::numeric, 1) end,
        'target', case when leader and coalesce(st.weekly_hours, 0) > 0 then round((st.weekly_hours * 52 / 12)::numeric, 1) end,
        'absent', exists (select 1 from absent a where a.staff_id = st.id)
      ) order by st.name) from st left join hrs h on h.staff_id = st.id), '[]'::jsonb),
    'assign', coalesce((select jsonb_agg(jsonb_build_object('job_id', x.job_id, 'staff_id', x.staff_id))
        from job_staff x join jobs j on j.id = x.job_id where x.org_id = p_org and j.work_date = p_day), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('customer_id', q.customer_id, 'staff_id', q.staff_id, 'n', q.n)) from (
        select j.customer_id, x.staff_id, count(*) as n from job_staff x join jobs j on j.id = x.job_id
        where x.org_id = p_org and j.status <> 'cancelled' and j.work_date < p_day and j.work_date >= p_day - 180
          and j.customer_id in (select customer_id from jobs where org_id = p_org and work_date = p_day)
        group by j.customer_id, x.staff_id) q), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke all on function public.touren_day_context(uuid, date) from public, anon;
grant execute on function public.touren_day_context(uuid, date) to authenticated;

-- 11) Zahl für das rote Abzeichen: kommende Aufträge ohne volles Personal (30 Tage)
create or replace function public.touren_open_count(p_org uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when not is_touren_staff(p_org) then 0 else (
    select count(*)::int from jobs j
    where j.org_id = p_org and j.status in ('new', 'accepted')
      and j.work_date between (now() at time zone org_tz(p_org))::date and (now() at time zone org_tz(p_org))::date + 30
      and (select count(*) from job_staff x where x.job_id = j.id) < j.staff_needed
  ) end
$$;
revoke all on function public.touren_open_count(uuid) from public, anon;
grant execute on function public.touren_open_count(uuid) to authenticated;

-- 12) „My jobs“ für Mitarbeitende: eigene Einsätze heute und morgen
create or replace function public.my_jobs(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid; today date;
begin
  me := my_staff_id(p_org);
  if me is null or not org_has_product(p_org, 'touren') or not is_org_member(p_org) then return '[]'::jsonb; end if;
  today := (now() at time zone org_tz(p_org))::date;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', j.id, 'job_no', j.job_no, 'work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'), 'duration_min', j.duration_min,
      'status', j.status, 'address', j.address_text, 'maps_url', j.maps_url, 'lat', j.lat, 'lng', j.lng,
      'service', st.name, 'material', j.material,
      'customer', case when c.kind = 'company' and c.company is not null then c.company else c.name end,
      'notes', case when j.work_date = today then nullif(concat_ws(E'\n', c.notes_staff, j.notes_staff), '') end,
      'fields', case when j.work_date = today then (
          select jsonb_agg(jsonb_build_object('name', f.name, 'kind', f.kind, 'value', coalesce(j.extra -> (f.id::text), c.extra -> (f.id::text))) order by f.entity desc, f.sort_order)
          from custom_fields f where f.org_id = p_org and f.active and f.staff_visible
            and coalesce(j.extra -> (f.id::text), c.extra -> (f.id::text)) is not null
            and ((f.entity = 'job' and j.extra ? f.id::text) or (f.entity = 'customer' and c.extra ? f.id::text))) end,
      'team', (select jsonb_agg(s2.name order by s2.name) from job_staff x2 join staff s2 on s2.id = x2.staff_id where x2.job_id = j.id and x2.staff_id <> me)
    ) order by j.work_date, j.start_time)
    from job_staff x join jobs j on j.id = x.job_id join customers c on c.id = j.customer_id left join service_types st on st.id = j.service_type_id
    where x.staff_id = me and j.org_id = p_org and j.status <> 'cancelled' and j.work_date between today and today + 1), '[]'::jsonb);
end $$;
revoke all on function public.my_jobs(uuid) from public, anon;
grant execute on function public.my_jobs(uuid) to authenticated;

-- 13) Branchenvorlage (nur Plattform-Verwaltung / /admin): Branche setzen und – nur wenn noch leer – Leistungen und Fähigkeiten anlegen
create or replace function public.touren_apply_template(p_org uuid, p_industry text, p_lang text)
returns void language plpgsql security definer set search_path = public as $$
declare svc text[]; sk text[]; en boolean := p_lang = 'en'; i int;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not is_platform_admin() then raise exception 'Nur Plattform-Verwaltung.'; end if;
  if p_industry not in ('cleaning', 'care', 'facility', 'general') then raise exception 'Unbekannte Branche'; end if;
  insert into touren_settings (org_id, industry) values (p_org, p_industry)
    on conflict (org_id) do update set industry = excluded.industry;
  if p_industry = 'cleaning' then
    svc := case when en then array['Regular cleaning', 'Deep cleaning', 'Window cleaning', 'Move-in/out cleaning', 'Office cleaning'] else array['Unterhaltsreinigung', 'Grundreinigung', 'Fensterreinigung', 'Endreinigung', 'Büroreinigung'] end;
    sk := case when en then array['Window cleaning', 'Driving licence', 'Team lead'] else array['Glasreinigung', 'Führerschein', 'Objektleitung'] end;
  elsif p_industry = 'care' then
    svc := case when en then array['Basic care', 'Medical care', 'Medication', 'Household help', 'Companionship'] else array['Grundpflege', 'Behandlungspflege', 'Medikamentengabe', 'Hauswirtschaft', 'Betreuung'] end;
    sk := case when en then array['Registered nurse', 'Care assistant', 'Driving licence'] else array['Pflegefachkraft', 'Pflegehilfskraft', 'Führerschein'] end;
  elsif p_industry = 'facility' then
    svc := case when en then array['Maintenance', 'Repair', 'Garden care', 'Winter service', 'Inspection'] else array['Wartung', 'Reparatur', 'Gartenpflege', 'Winterdienst', 'Kontrollgang'] end;
    sk := case when en then array['Electrical', 'Plumbing', 'Driving licence'] else array['Elektro', 'Sanitär', 'Führerschein'] end;
  else svc := array[]::text[]; sk := array[]::text[];
  end if;
  if not exists (select 1 from service_types where org_id = p_org) then
    for i in 1 .. coalesce(array_length(svc, 1), 0) loop insert into service_types (org_id, name, sort_order) values (p_org, svc[i], i); end loop;
  end if;
  if not exists (select 1 from skills where org_id = p_org) then
    for i in 1 .. coalesce(array_length(sk, 1), 0) loop insert into skills (org_id, name, sort_order) values (p_org, sk[i], i); end loop;
  end if;
end $$;
revoke all on function public.touren_apply_template(uuid, text, text) from public, anon, authenticated;
grant execute on function public.touren_apply_template(uuid, text, text) to service_role;
