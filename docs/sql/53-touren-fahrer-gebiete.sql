-- 53 – Touren: Gebiet einer Fahrer:in auf der Karte (Wunsch Nutzer 23.11.2026: „محدوده جغرافیایی باید باشه“)
-- Gebiet = Mittelpunkt (Adresse / Kartenlink / Standort) + Radius in km; mehrere je Fahrer:in möglich.
-- Zählt der Abholort der Person (Unterkunft oder Zuhause). Liegt er in mehreren Gebieten: der nächste Mittelpunkt gewinnt.
-- Reihenfolge in touren_driver_for: 1) Tageszuteilung (Büro), 2) Gebiet (nächster Mittelpunkt),
-- 3) Unterkunft / „Zuhause“, 4) „Alle Fahrten“. Kein Treffer = „Noch ohne Fahrer:in“.
create table if not exists public.touren_driver_areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  driver_id uuid not null references public.touren_drivers(staff_id) on delete cascade,
  address text,
  maps_url text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_km numeric not null default 10 check (radius_km > 0 and radius_km <= 200),
  created_at timestamptz not null default now()
);
create index if not exists touren_driver_areas_driver on public.touren_driver_areas(driver_id);

create or replace function public.touren_area_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from touren_drivers d where d.staff_id = new.driver_id and d.org_id = new.org_id) then raise exception 'Fahrer:in gehört nicht zu dieser Firma'; end if;
  return new;
end $$;
drop trigger if exists trg_area_guard on public.touren_driver_areas;
create trigger trg_area_guard before insert or update on public.touren_driver_areas for each row execute function touren_area_guard();
drop trigger if exists trg_trial_guard on public.touren_driver_areas;
create trigger trg_trial_guard before insert or update or delete on public.touren_driver_areas for each row execute function trial_guard();

alter table public.touren_driver_areas enable row level security;
drop policy if exists tda_select on public.touren_driver_areas;
create policy tda_select on public.touren_driver_areas for select using (is_touren_staff(org_id));
drop policy if exists tda_write on public.touren_driver_areas;
create policy tda_write on public.touren_driver_areas for all using (is_org_leader(org_id) and is_touren_staff(org_id)) with check (is_org_leader(org_id) and is_touren_staff(org_id));
grant select, insert, update, delete on public.touren_driver_areas to authenticated;

create or replace function public.touren_driver_for(p_org uuid, p_staff uuid, p_day date)
returns uuid language sql stable security definer set search_path = public as $$
  with sp as (
    select t.start_kind, t.place_id,
      case when t.start_kind = 'place' then p.lat when t.start_kind = 'home' then t.home_lat end as lat,
      case when t.start_kind = 'place' then p.lng when t.start_kind = 'home' then t.home_lng end as lng
    from staff_touren t left join touren_places p on p.id = t.place_id where t.staff_id = p_staff
  )
  select coalesce(
    (select driver_id from touren_trip_driver where org_id = p_org and work_date = p_day and staff_id = p_staff),
    (select q.id from (
       select d.staff_id as id, ds.name, d.scope_all,
         (select min(touren_km(a.lat, a.lng, sp.lat, sp.lng)) from touren_driver_areas a, sp
           where a.driver_id = d.staff_id and touren_km(a.lat, a.lng, sp.lat, sp.lng) <= a.radius_km) as area_km,
         exists (select 1 from sp where (sp.start_kind = 'place' and sp.place_id = any(d.places)) or (sp.start_kind = 'home' and d.home)) as fixed
       from touren_drivers d join staff ds on ds.id = d.staff_id and ds.active
       where d.org_id = p_org and d.staff_id <> p_staff) q
     where q.scope_all or q.area_km is not null or q.fixed
     order by (q.area_km is null), q.area_km, (not q.fixed), q.scope_all, q.name
     limit 1))
$$;
revoke all on function public.touren_driver_for(uuid, uuid, date) from public, anon, authenticated;
