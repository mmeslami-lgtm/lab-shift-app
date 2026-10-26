-- 32: „Mehrere Standorte“ – neue Form (ersetzt die Tabelle Person × Tag aus Skript 31). Nur Dienstplaner „allgemein“.
-- Schon auf der echten Datenbank ausgeführt (Migration "mehrere_standorte").
--
-- * Freischaltung NUR durch die Plattform-Verwaltung (/admin): org_features 'einsatzorte_standorte'.
--   Erst dann darf Inhaber/Leitung „Mehrere Einsatzorte“ einschalten (org_features 'einsatzorte' über set_location_mode).
-- * work_locations: + code (Kürzel statt Farbe, z. B. N1) + team_period ('month' | 'week').
-- * shift_definitions: + location_id, count_weekday, count_weekend  (Schichten je Ort, eigene Besetzung).
-- * scheduled_shifts: + location_id  (der Ort steht an der Schicht selbst; draft/published wie bisher).
-- * location_team: wer gehört in welchem Zeitraum (Monat ab dem 1. / Woche ab Montag) zu welchem Ort.
-- * save_draft / publish_month / discard_draft / plan_snapshot nehmen location_id mit.
--   save_draft: mit Orten nie zwei Schichten einer Person am selben Tag.
-- * location_assignments (Skript 31) wird nicht mehr benutzt (leer), bleibt aber bestehen.

create or replace function public.org_feature_on(o uuid, f text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_features where org_id = o and feature = f and enabled)
$$;
revoke all on function public.org_feature_on(uuid, text) from public, anon;
grant execute on function public.org_feature_on(uuid, text) to authenticated;

-- ---- Orte: Kürzel + Team-Zeitraum ----
alter table public.work_locations add column if not exists code text;
alter table public.work_locations add column if not exists team_period text not null default 'month';
alter table public.work_locations drop constraint if exists work_locations_code_chk;
alter table public.work_locations add constraint work_locations_code_chk check (code is null or code ~ '^[A-Z0-9ÄÖÜ-]{1,6}$');
alter table public.work_locations drop constraint if exists work_locations_team_period_chk;
alter table public.work_locations add constraint work_locations_team_period_chk check (team_period in ('month', 'week'));
create unique index if not exists work_locations_code_uq on public.work_locations (org_id, code) where code is not null;
alter table public.work_locations drop constraint if exists work_locations_id_org_uq;
alter table public.work_locations add constraint work_locations_id_org_uq unique (id, org_id);

-- ---- Schichten je Ort ----
alter table public.shift_definitions add column if not exists location_id uuid;
alter table public.shift_definitions add column if not exists count_weekday integer;
alter table public.shift_definitions add column if not exists count_weekend integer;
alter table public.shift_definitions drop constraint if exists shift_definitions_location_fk;
alter table public.shift_definitions add constraint shift_definitions_location_fk foreign key (location_id, org_id) references public.work_locations (id, org_id);
alter table public.shift_definitions drop constraint if exists shift_definitions_counts_chk;
alter table public.shift_definitions add constraint shift_definitions_counts_chk
  check ((count_weekday is null or count_weekday between 0 and 20) and (count_weekend is null or count_weekend between 0 and 20));

-- ---- Ort an der geplanten Schicht ----
alter table public.scheduled_shifts add column if not exists location_id uuid;
alter table public.scheduled_shifts drop constraint if exists scheduled_shifts_location_fk;
alter table public.scheduled_shifts add constraint scheduled_shifts_location_fk foreign key (location_id, org_id) references public.work_locations (id, org_id);

-- ---- Team je Ort und Zeitraum ----
create table if not exists public.location_team (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  location_id  uuid not null,
  staff_id     uuid not null,
  period_start date not null,
  primary key (location_id, staff_id, period_start),
  foreign key (location_id, org_id) references public.work_locations (id, org_id) on delete cascade,
  foreign key (staff_id, org_id) references public.staff (id, org_id) on delete cascade
);
create index if not exists location_team_org_idx on public.location_team (org_id, period_start);
alter table public.location_team enable row level security;
revoke all on public.location_team from anon, authenticated;
grant select on public.location_team to authenticated;
drop policy if exists location_team_select on public.location_team;
create policy location_team_select on public.location_team for select to authenticated using (is_org_supervisor(org_id));

-- ---- „Ein Arbeitsort“ / „Mehrere Einsatzorte“: Einschalten nur, wenn /admin es freigegeben hat ----
create or replace function public.set_location_mode(p_org uuid, p_multi boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if not org_has_product(p_org, 'generic_planner') then raise exception 'Einsatzorte gibt es nur im Dienstplaner (allgemein)'; end if;
  if coalesce(p_multi, false) and not org_feature_on(p_org, 'einsatzorte_standorte') then
    raise exception '„Mehrere Standorte“ ist für diese Firma nicht freigeschaltet'; end if;
  insert into org_features (org_id, feature, enabled, updated_at, updated_by)
  values (p_org, 'einsatzorte', coalesce(p_multi, false), now(), auth.uid())
  on conflict (org_id, feature) do update set enabled = excluded.enabled, updated_at = now(), updated_by = auth.uid();
end $$;

-- ---- Ort anlegen / ändern (nie löschen, nur inaktiv) ----
drop function if exists public.save_work_location(uuid, uuid, text, text, text, boolean);
create or replace function public.save_work_location(p_org uuid, p_id uuid, p_name text, p_code text, p_address text, p_team_period text, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text := upper(trim(coalesce(p_code, '')));
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if not org_has_product(p_org, 'generic_planner') then raise exception 'Einsatzorte gibt es nur im Dienstplaner (allgemein)'; end if;
  if not org_feature_on(p_org, 'einsatzorte_standorte') then raise exception '„Mehrere Standorte“ ist für diese Firma nicht freigeschaltet'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Bitte einen Namen eingeben'; end if;
  if v_code !~ '^[A-Z0-9ÄÖÜ-]{1,6}$' then raise exception 'Kürzel: 1 bis 6 Buchstaben oder Ziffern, z. B. N1'; end if;
  if coalesce(p_team_period, 'month') not in ('month', 'week') then raise exception 'Ungültiger Zeitraum'; end if;
  if exists (select 1 from work_locations where org_id = p_org and lower(trim(name)) = lower(trim(p_name)) and id is distinct from p_id) then
    raise exception 'Diesen Ort gibt es schon'; end if;
  if exists (select 1 from work_locations where org_id = p_org and code = v_code and id is distinct from p_id) then
    raise exception 'Dieses Kürzel gibt es schon'; end if;
  if p_id is null then
    insert into work_locations (org_id, name, code, address, team_period, active, sort_order)
    values (p_org, trim(p_name), v_code, nullif(trim(coalesce(p_address, '')), ''), coalesce(p_team_period, 'month'), coalesce(p_active, true),
            coalesce((select max(sort_order) + 1 from work_locations where org_id = p_org), 0))
    returning id into v_id;
  else
    update work_locations set name = trim(p_name), code = v_code, address = nullif(trim(coalesce(p_address, '')), ''),
           team_period = coalesce(p_team_period, team_period), active = coalesce(p_active, active)
     where id = p_id and org_id = p_org returning id into v_id;
    if v_id is null then raise exception 'Ort nicht gefunden'; end if;
  end if;
  return v_id;
end $$;

-- ---- Schicht eines Ortes anlegen (p_key null) / ändern. Nie löschen, nur inaktiv (alte Pläne behalten ihre Bezeichnung) ----
create or replace function public.save_location_shift(p_org uuid, p_location uuid, p_key text, p_label text, p_start time, p_end time,
  p_weekday integer, p_weekend integer, p_rest boolean, p_active boolean)
returns text language plpgsql security definer set search_path = public as $$
declare v_key text := nullif(trim(coalesce(p_key, '')), ''); n int;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if not org_feature_on(p_org, 'einsatzorte_standorte') then raise exception '„Mehrere Standorte“ ist für diese Firma nicht freigeschaltet'; end if;
  if not exists (select 1 from work_locations where id = p_location and org_id = p_org) then raise exception 'Ort nicht gefunden'; end if;
  if length(trim(coalesce(p_label, ''))) = 0 then raise exception 'Bitte einen Namen für die Schicht eingeben'; end if;
  if p_start is null or p_end is null or p_start = p_end then raise exception 'Bitte Beginn und Ende der Schicht eingeben'; end if;
  if coalesce(p_weekday, 0) not between 0 and 20 or coalesce(p_weekend, 0) not between 0 and 20 then raise exception 'Personen: 0 bis 20'; end if;
  if v_key is null then
    v_key := 'L' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 7));
    insert into shift_definitions (org_id, key, label, start_time, end_time, frequency, requires_rest_after, runs_on_weekends, sort_order, active,
                                   location_id, count_weekday, count_weekend)
    values (p_org, v_key, trim(p_label), p_start, p_end, 'daily', coalesce(p_rest, false), coalesce(p_weekend, 0) > 0,
            coalesce((select max(sort_order) + 1 from shift_definitions where org_id = p_org), 0), coalesce(p_active, true),
            p_location, coalesce(p_weekday, 0), coalesce(p_weekend, 0));
  else
    update shift_definitions set label = trim(p_label), start_time = p_start, end_time = p_end, requires_rest_after = coalesce(p_rest, false),
           runs_on_weekends = coalesce(p_weekend, 0) > 0, count_weekday = coalesce(p_weekday, 0), count_weekend = coalesce(p_weekend, 0),
           active = coalesce(p_active, active)
     where org_id = p_org and key = v_key and location_id = p_location;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Schicht nicht gefunden'; end if;
  end if;
  return v_key;
end $$;

-- ---- Team eines Ortes für einen Zeitraum ersetzen (Monat: Tag 1, Woche: Montag) ----
create or replace function public.save_location_team(p_org uuid, p_location uuid, p_period_start date, p_staff uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_period text; n int;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if not org_feature_on(p_org, 'einsatzorte_standorte') then raise exception '„Mehrere Standorte“ ist für diese Firma nicht freigeschaltet'; end if;
  select team_period into v_period from work_locations where id = p_location and org_id = p_org;
  if v_period is null then raise exception 'Ort nicht gefunden'; end if;
  if v_period = 'month' and extract(day from p_period_start) <> 1 then raise exception 'Monat: Zeitraum beginnt am 1.'; end if;
  if v_period = 'week' and extract(isodow from p_period_start) <> 1 then raise exception 'Woche: Zeitraum beginnt am Montag'; end if;
  if exists (select 1 from unnest(coalesce(p_staff, '{}')) s where not exists (select 1 from staff where id = s and org_id = p_org)) then
    raise exception 'Unbekannte Person'; end if;
  delete from location_team where location_id = p_location and period_start = p_period_start;
  insert into location_team (org_id, location_id, staff_id, period_start)
  select distinct p_org, p_location, s, p_period_start from unnest(coalesce(p_staff, '{}')) s;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.set_location_mode(uuid, boolean) from public, anon;
revoke all on function public.save_work_location(uuid, uuid, text, text, text, text, boolean) from public, anon;
revoke all on function public.save_location_shift(uuid, uuid, text, text, time, time, integer, integer, boolean, boolean) from public, anon;
revoke all on function public.save_location_team(uuid, uuid, date, uuid[]) from public, anon;
grant execute on function public.set_location_mode(uuid, boolean) to authenticated;
grant execute on function public.save_work_location(uuid, uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.save_location_shift(uuid, uuid, text, text, time, time, integer, integer, boolean, boolean) to authenticated;
grant execute on function public.save_location_team(uuid, uuid, date, uuid[]) to authenticated;

-- ---- Entwurf speichern: + location_id; mit Orten nie zwei Schichten am selben Tag ----
create or replace function public.save_draft(p_org uuid, p_year integer, p_month integer, p_shifts jsonb, p_holidays integer[] default '{}'::integer[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  d_from date := make_date(p_year, p_month, 1);
  d_to   date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  n int; v_dup record;
begin
  if not (is_org_supervisor(p_org) and org_has_planner(p_org)) then
    raise exception 'Nur die Leitung einer Firma mit Dienstplaner darf Pläne speichern';
  end if;
  if jsonb_typeof(p_shifts) is distinct from 'array' then
    raise exception 'Ungültige Daten';
  end if;
  if exists (select 1 from jsonb_array_elements(p_shifts) x where nullif(x->>'location_id', '') is not null
              and not exists (select 1 from work_locations w where w.id = (x->>'location_id')::uuid and w.org_id = p_org)) then
    raise exception 'Unbekannter Einsatzort';
  end if;
  if exists (select 1 from jsonb_array_elements(p_shifts) x where nullif(x->>'location_id', '') is not null) then
    select st.name, (x->>'date')::date as d into v_dup
      from jsonb_array_elements(p_shifts) x join staff st on st.id = (x->>'staff_id')::uuid
     group by st.name, (x->>'staff_id'), (x->>'date') having count(*) > 1 limit 1;
    if found then
      raise exception '% hat am % zwei Schichten – eine Person kann an einem Tag nur eine Schicht haben', v_dup.name, to_char(v_dup.d, 'DD.MM.YYYY');
    end if;
  end if;

  delete from scheduled_shifts
  where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;

  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status, location_id)
  select p_org, (x->>'staff_id')::uuid, (x->>'date')::date, x->>'key', x->>'label',
         (x->>'start')::timestamptz, (x->>'end')::timestamptz, 'draft', nullif(x->>'location_id', '')::uuid
  from jsonb_array_elements(p_shifts) x
  where (x->>'date')::date >= d_from and (x->>'date')::date < d_to;
  get diagnostics n = row_count;

  insert into schedule_months (org_id, year, month, status, has_newer_draft, holidays, updated_at)
  values (p_org, p_year, p_month, 'draft', false, coalesce(p_holidays, '{}'), now())
  on conflict (org_id, year, month) do update set
    status          = case when schedule_months.status = 'published' then 'published' else 'draft' end,
    has_newer_draft = (schedule_months.status = 'published'),
    holidays        = coalesce(p_holidays, '{}'),
    updated_at      = now();
  return n;
end $$;

-- ---- Versionen: Ort mit in die Momentaufnahme ----
create or replace function public.plan_snapshot(p_org uuid, p_year integer, p_month integer, p_status text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'defs', coalesce((
      select jsonb_agg(jsonb_build_object('key', d.key, 'label', d.label, 'start', d.start_time, 'end', d.end_time, 'sort', d.sort_order, 'location_id', d.location_id) order by d.sort_order)
      from shift_definitions d where d.org_id = p_org and d.active
    ), '[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object('staff_id', s.staff_id, 'name', st.name, 'date', s.shift_date, 'key', s.shift_key, 'label', s.shift_label, 'location_id', s.location_id) order by s.shift_date, s.shift_key, st.name)
      from scheduled_shifts s join staff st on st.id = s.staff_id
      where s.org_id = p_org and s.status = p_status
        and s.shift_date >= make_date(p_year, p_month, 1)
        and s.shift_date <  (make_date(p_year, p_month, 1) + interval '1 month')::date
    ), '[]'::jsonb)
  )
$$;

-- ---- Verwerfen: + location_id ----
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
  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status, location_id)
  select org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, 'draft', location_id
    from scheduled_shifts
   where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to;
  get diagnostics n = row_count;
  delete from location_assignments where org_id = p_org and status = 'draft' and work_date >= d_from and work_date < d_to;
  insert into location_assignments (org_id, staff_id, work_date, location_id, status)
  select org_id, staff_id, work_date, location_id, 'draft' from location_assignments
   where org_id = p_org and status = 'published' and work_date >= d_from and work_date < d_to;
  update schedule_months
     set status = 'published', has_newer_draft = false, review_note = null, change_note = null, change_normal = false, updated_at = now()
   where org_id = p_org and year = p_year and month = p_month;
  return n;
end $$;

-- ---- Veröffentlichen: + location_id (sonst unverändert) ----
-- (der Rest von publish_month ist wortgleich mit der bisherigen Fassung)
create or replace function public.publish_month(p_org uuid, p_year integer, p_month integer, p_note text default null::text, p_normal boolean default null::boolean)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  d_from date := make_date(p_year, p_month, 1);
  d_to   date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  v_role text; v_req boolean; v_keep int; v_days int; v_n int; v_note text; v_had boolean; v_normal boolean;
  rec record; v_old uuid; v_lead int; v_status text;
begin
  if not org_has_planner(p_org) then
    raise exception 'Diese Firma hat keinen Dienstplaner';
  end if;
  select m.role into v_role from memberships m where m.user_id = auth.uid() and m.org_id = p_org;
  select require_approval, retention_years, short_notice_days into v_req, v_keep, v_days from organizations where id = p_org and active;
  if v_role is null or v_role = 'employee' then
    raise exception 'Nur Schichtplaner, Leitung und Inhaber dürfen veröffentlichen';
  end if;
  if v_role = 'planner' and v_req then
    raise exception 'Die Freigabe muss durch die Leitung erfolgen. Bitte zur Freigabe einreichen.';
  end if;

  select count(*) into v_n from scheduled_shifts where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;
  if v_n = 0 then raise exception 'Für diesen Monat gibt es keinen Entwurf'; end if;

  v_note := coalesce(nullif(trim(p_note), ''),
                     (select change_note from schedule_months where org_id = p_org and year = p_year and month = p_month));
  v_normal := coalesce(p_normal,
                       (select change_normal from schedule_months where org_id = p_org and year = p_year and month = p_month),
                       false);

  select exists (select 1 from scheduled_shifts where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to) into v_had;

  if v_had then
    drop table if exists pg_temp._nc;
    create temp table _nc on commit drop as
    with old_s as (
      select staff_id, shift_date, shift_key from scheduled_shifts
      where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to
    ), new_s as (
      select staff_id, shift_date, shift_key from scheduled_shifts
      where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to
    ), removed as (
      select o.staff_id, o.shift_date, o.shift_key,
             row_number() over (partition by o.shift_date, o.shift_key order by o.staff_id) as rn
      from old_s o
      where not exists (select 1 from new_s n where n.staff_id = o.staff_id and n.shift_date = o.shift_date and n.shift_key = o.shift_key)
    ), added as (
      select n.staff_id, n.shift_date, n.shift_key,
             row_number() over (partition by n.shift_date, n.shift_key order by n.staff_id) as rn
      from new_s n
      where not exists (select 1 from old_s o where o.staff_id = n.staff_id and o.shift_date = n.shift_date and o.shift_key = n.shift_key)
    )
    select coalesce(ad.shift_date, rm.shift_date) as change_date,
           coalesce(ad.shift_key, rm.shift_key)   as shift_key,
           case when ad.staff_id is not null and rm.staff_id is not null then 'cover'
                when ad.staff_id is not null then 'extra'
                else 'cancelled' end              as kind,
           coalesce(ad.staff_id, rm.staff_id)     as staff_id,
           case when ad.staff_id is not null then rm.staff_id else null end as replaced_staff_id
    from added ad
    full outer join removed rm
      on ad.shift_date = rm.shift_date and ad.shift_key = rm.shift_key and ad.rn = rm.rn;

    for rec in select * from _nc loop
      v_old := null;
      if rec.kind = 'cover' then
        select id into v_old from shift_changes
         where org_id = p_org and change_date = rec.change_date and shift_key = rec.shift_key
           and kind = 'cover' and staff_id = rec.replaced_staff_id and replaced_staff_id = rec.staff_id
           and manager_status <> 'void' and change_date >= current_date
         order by published_at desc limit 1;
      elsif rec.kind = 'extra' then
        select id into v_old from shift_changes
         where org_id = p_org and change_date = rec.change_date and shift_key = rec.shift_key
           and kind = 'cancelled' and staff_id = rec.staff_id
           and manager_status <> 'void' and change_date >= current_date
         order by published_at desc limit 1;
      else
        select id into v_old from shift_changes
         where org_id = p_org and change_date = rec.change_date and shift_key = rec.shift_key
           and kind = 'extra' and staff_id = rec.staff_id
           and manager_status <> 'void' and change_date >= current_date
         order by published_at desc limit 1;
      end if;

      if v_old is not null then
        update shift_changes
           set manager_status = 'void', void_auto = true, voided_at = now(), voided_by = auth.uid(),
               manager_note = trim(coalesce(manager_note || ' · ', '') || 'Automatisch storniert: durch spätere Veröffentlichung rückgängig gemacht')
         where id = v_old;
      else
        v_lead := rec.change_date - current_date;
        v_status := case when v_normal or v_lead > v_days then 'normal' else 'open' end;
        insert into shift_changes (org_id, change_date, shift_key, kind, staff_id, replaced_staff_id, note, published_at, manager_status, normal_auto, lead_days)
        values (p_org, rec.change_date, rec.shift_key, rec.kind, rec.staff_id, rec.replaced_staff_id, v_note, now(),
                v_status, (v_status = 'normal' and not v_normal), v_lead);
      end if;
    end loop;
  end if;

  delete from scheduled_shifts where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to;
  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status, published_at, location_id)
  select org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, 'published', now(), location_id
  from scheduled_shifts
  where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;

  insert into schedule_months (org_id, year, month, status, has_newer_draft, approved_by, approved_at, published_at, review_note, change_note, change_normal, updated_at)
  values (p_org, p_year, p_month, 'published', false, auth.uid(), now(), now(), null, v_note, false, now())
  on conflict (org_id, year, month) do update set
    status = 'published', has_newer_draft = false, approved_by = auth.uid(), approved_at = now(),
    published_at = now(), review_note = null, change_note = v_note, change_normal = false, updated_at = now();

  insert into schedule_versions (org_id, year, month, event, actor, actor_email, note, snapshot, keep_until)
  values (p_org, p_year, p_month, 'published', auth.uid(), (select email from auth.users where id = auth.uid()), v_note,
          plan_snapshot(p_org, p_year, p_month, 'published'), make_date(p_year + v_keep, 12, 31));
end;
$function$;
