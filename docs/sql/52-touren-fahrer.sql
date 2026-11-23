-- 52 – Touren: Fahrer:innen (Wunsch Nutzer 23.11.2026)
-- Eine Fahrerin / ein Fahrer ist eine Person aus „Mitarbeitende“ mit Zugang zur Mitarbeiter-App (kann auch selbst
-- Aufträge haben). In der App erscheint dann zusätzlich „Fahrten“ (heute + morgen).
-- Bereich: A) fest – „alle“ oder bestimmte Unterkünfte und/oder „Zuhause“ (Personal, das von zu Hause abgeholt wird);
--          B) pro Tag – das Büro teilt eine Person für einen Tag einer Fahrerin zu (geht vor A).
-- Sicherheit: alles in eigenen Tabellen/Funktionen; ohne Eintrag sieht niemand etwas Neues.
create table if not exists public.touren_drivers (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  scope_all boolean not null default true,
  places uuid[] not null default '{}',
  home boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists touren_drivers_org on public.touren_drivers(org_id);
create table if not exists public.touren_trip_driver (
  org_id uuid not null references public.organizations(id) on delete cascade,
  work_date date not null,
  staff_id uuid not null references public.staff(id) on delete cascade,
  driver_id uuid not null references public.touren_drivers(staff_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (work_date, staff_id)
);
create index if not exists touren_trip_driver_org on public.touren_trip_driver(org_id, work_date);

create or replace function public.touren_driver_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from staff s where s.id = new.staff_id and s.org_id = new.org_id) then raise exception 'Person gehört nicht zu dieser Firma'; end if;
  if tg_table_name = 'touren_drivers' then
    if exists (select 1 from unnest(new.places) p where not exists (select 1 from touren_places t where t.id = p and t.org_id = new.org_id)) then raise exception 'Ort gehört nicht zu dieser Firma'; end if;
  else
    if not exists (select 1 from touren_drivers d where d.staff_id = new.driver_id and d.org_id = new.org_id) then raise exception 'Fahrer:in gehört nicht zu dieser Firma'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_driver_guard on public.touren_drivers;
create trigger trg_driver_guard before insert or update on public.touren_drivers for each row execute function touren_driver_guard();
drop trigger if exists trg_driver_guard on public.touren_trip_driver;
create trigger trg_driver_guard before insert or update on public.touren_trip_driver for each row execute function touren_driver_guard();
drop trigger if exists trg_trial_guard on public.touren_drivers;
create trigger trg_trial_guard before insert or update or delete on public.touren_drivers for each row execute function trial_guard();
drop trigger if exists trg_trial_guard on public.touren_trip_driver;
create trigger trg_trial_guard before insert or update or delete on public.touren_trip_driver for each row execute function trial_guard();

alter table public.touren_drivers enable row level security;
alter table public.touren_trip_driver enable row level security;
drop policy if exists td_select on public.touren_drivers;
create policy td_select on public.touren_drivers for select using (is_touren_staff(org_id));
drop policy if exists td_write on public.touren_drivers;
create policy td_write on public.touren_drivers for all using (is_org_leader(org_id) and is_touren_staff(org_id)) with check (is_org_leader(org_id) and is_touren_staff(org_id));
drop policy if exists ttd_all on public.touren_trip_driver;
create policy ttd_all on public.touren_trip_driver for all using (is_touren_staff(org_id)) with check (is_touren_staff(org_id));
grant select, insert, update, delete on public.touren_drivers, public.touren_trip_driver to authenticated;

-- Wer fährt Person p am Tag d? (Zuteilung B vor Bereich A; bei mehreren passenden: alphabetisch erste)
create or replace function public.touren_driver_for(p_org uuid, p_staff uuid, p_day date)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select driver_id from touren_trip_driver where org_id = p_org and work_date = p_day and staff_id = p_staff),
    (select d.staff_id from touren_drivers d join staff ds on ds.id = d.staff_id and ds.active
       left join staff_touren t on t.staff_id = p_staff
      where d.org_id = p_org and d.staff_id <> p_staff
        and (d.scope_all or (t.start_kind = 'place' and t.place_id = any(d.places)) or (t.start_kind = 'home' and d.home))
      order by d.scope_all, ds.name limit 1))
$$;
revoke all on function public.touren_driver_for(uuid, uuid, date) from public, anon, authenticated;

-- Transport-Blatt (51) + Fahrer:innen und wer wen fährt
create or replace function public.touren_transport(p_org uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_touren_staff(p_org) then raise exception 'Keine Berechtigung'; end if;
  if p_to < p_from or p_to - p_from > 31 then raise exception 'Zeitraum zu lang'; end if;
  return jsonb_build_object(
    'travel_min', coalesce((select travel_min from touren_settings where org_id = p_org), 30),
    'staff', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'phone', s.phone, 'start_kind', coalesce(t.start_kind, 'none'),
        'start_name', case when t.start_kind = 'place' then p.name end,
        'start_address', case when t.start_kind = 'place' then p.address when t.start_kind = 'home' then t.home_address end))
      from staff s left join staff_touren t on t.staff_id = s.id left join touren_places p on p.id = t.place_id
      where s.org_id = p_org and s.id in (select x.staff_id from job_staff x join jobs j on j.id = x.job_id
                                          where x.org_id = p_org and j.work_date between p_from and p_to and j.status <> 'cancelled')), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', j.id, 'work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'), 'duration_min', j.duration_min,
        'address', j.address_text, 'customer', case when c.kind = 'company' and c.company is not null then c.company || ' – ' || c.name else c.name end,
        'staff', coalesce((select jsonb_agg(x.staff_id) from job_staff x where x.job_id = j.id), '[]'::jsonb),
        'absent', coalesce((select jsonb_agg(x.staff_id) from job_staff x where x.job_id = j.id and touren_is_absent(p_org, x.staff_id, j.work_date)), '[]'::jsonb))
        order by j.work_date, j.start_time)
      from jobs j join customers c on c.id = j.customer_id
      where j.org_id = p_org and j.work_date between p_from and p_to and j.status <> 'cancelled'), '[]'::jsonb),
    'drivers', coalesce((select jsonb_agg(jsonb_build_object('id', d.staff_id, 'name', s.name, 'phone', s.phone) order by s.name)
      from touren_drivers d join staff s on s.id = d.staff_id where d.org_id = p_org and s.active), '[]'::jsonb),
    'driver_of', coalesce((select jsonb_agg(jsonb_build_object('work_date', q.d, 'staff_id', q.s, 'driver_id', touren_driver_for(p_org, q.s, q.d),
        'manual', exists (select 1 from touren_trip_driver m where m.org_id = p_org and m.work_date = q.d and m.staff_id = q.s)))
      from (select distinct j.work_date d, x.staff_id s from job_staff x join jobs j on j.id = x.job_id
            where x.org_id = p_org and j.work_date between p_from and p_to and j.status <> 'cancelled') q), '[]'::jsonb)
  );
end $$;
revoke all on function public.touren_transport(uuid, date, date) from public, anon;
grant execute on function public.touren_transport(uuid, date, date) to authenticated;

-- Mitarbeiter-App „Fahrten“: nur für Fahrer:innen, nur heute und morgen, nur die eigenen Fahrgäste.
-- Kein Telefon des Kunden. Wer keine Fahrer:in ist, bekommt nur {is_driver:false}.
create or replace function public.my_trips(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid; d0 date; vis jsonb;
begin
  me := my_staff_id(p_org);
  if me is null or not org_has_product(p_org, 'touren') or not exists (select 1 from touren_drivers where staff_id = me and org_id = p_org) then
    return jsonb_build_object('is_driver', false);
  end if;
  d0 := (now() at time zone org_tz(p_org))::date;
  -- (Tag, Person), die diese Fahrerin heute/morgen fährt
  select coalesce(jsonb_agg(jsonb_build_object('d', q.d, 's', q.s)), '[]'::jsonb) into vis from (
    select distinct j.work_date d, x.staff_id s from job_staff x join jobs j on j.id = x.job_id
    where x.org_id = p_org and j.work_date between d0 and d0 + 1 and j.status <> 'cancelled'
      and not touren_is_absent(p_org, x.staff_id, j.work_date) and touren_driver_for(p_org, x.staff_id, j.work_date) = me) q;
  return jsonb_build_object(
    'is_driver', true, 'today', d0,
    'travel_min', coalesce((select travel_min from touren_settings where org_id = p_org), 30),
    'staff', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'phone', s.phone, 'start_kind', coalesce(t.start_kind, 'none'),
        'start_name', case when t.start_kind = 'place' then p.name end,
        'start_address', case when t.start_kind = 'place' then p.address when t.start_kind = 'home' then t.home_address end,
        'start_lat', case when t.start_kind = 'place' then p.lat when t.start_kind = 'home' then t.home_lat end,
        'start_lng', case when t.start_kind = 'place' then p.lng when t.start_kind = 'home' then t.home_lng end))
      from staff s left join staff_touren t on t.staff_id = s.id left join touren_places p on p.id = t.place_id
      where s.org_id = p_org and s.id in (select (e->>'s')::uuid from jsonb_array_elements(vis) e)), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', j.id, 'work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'), 'duration_min', j.duration_min,
        'address', j.address_text, 'lat', j.lat, 'lng', j.lng, 'maps_url', j.maps_url,
        'customer', case when c.kind = 'company' and c.company is not null then c.company || ' – ' || c.name else c.name end,
        'staff', (select jsonb_agg(x.staff_id) from job_staff x where x.job_id = j.id and (j.work_date, x.staff_id) in (select (e->>'d')::date, (e->>'s')::uuid from jsonb_array_elements(vis) e)),
        'absent', '[]'::jsonb) order by j.work_date, j.start_time)
      from jobs j join customers c on c.id = j.customer_id
      where j.org_id = p_org and j.status <> 'cancelled' and exists (select 1 from job_staff x where x.job_id = j.id and (j.work_date, x.staff_id) in (select (e->>'d')::date, (e->>'s')::uuid from jsonb_array_elements(vis) e))), '[]'::jsonb)
  );
end $$;
revoke all on function public.my_trips(uuid) from public, anon;
grant execute on function public.my_trips(uuid) to authenticated;
