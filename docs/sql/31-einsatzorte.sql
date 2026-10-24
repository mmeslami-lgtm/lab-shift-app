-- 31: Einsatzorte (mehrere Arbeitsorte) – nur Dienstplaner „allgemein“ (generic_planner).
-- Schon auf der echten Datenbank ausgeführt (Migration "einsatzorte").
--
-- * org_features 'einsatzorte' = „Mehrere Einsatzorte“ (aus = „Ein Arbeitsort“, alles wie vorher)
-- * work_locations: Name, Adresse, Farbe; nie gelöscht, nur inaktiv (Stundenzettel früherer Monate bleiben richtig)
-- * location_assignments: Person + Tag + Ort, mit status draft/published wie scheduled_shifts.
--   Entwurf speichern: save_location_draft (zusammen mit „Zwischenspeichern“ des Plans).
--   Veröffentlichen: Trigger auf schedule_months kopiert den Entwurf -> published, egal auf welchem Weg
--   der Monat veröffentlicht wird (direkt oder über „Freigaben“). discard_draft setzt auch die Orte zurück.
--   Mitarbeitende sehen nur published (wie den Plan).

create table if not exists public.work_locations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  address     text check (address is null or length(address) <= 200),
  color       text not null default '#0d9488' check (color ~ '^#[0-9a-fA-F]{6}$'),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists work_locations_org_idx on public.work_locations (org_id);

create table if not exists public.location_assignments (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  staff_id    uuid not null,
  work_date   date not null,
  location_id uuid not null references public.work_locations(id),
  status      text not null check (status in ('draft', 'published')),
  primary key (org_id, staff_id, work_date, status),
  foreign key (staff_id, org_id) references public.staff(id, org_id) on delete cascade
);
create index if not exists location_assignments_month_idx on public.location_assignments (org_id, status, work_date);

alter table public.work_locations enable row level security;
alter table public.location_assignments enable row level security;
revoke all on public.work_locations from anon, authenticated;
revoke all on public.location_assignments from anon, authenticated;
grant select on public.work_locations to authenticated;
grant select on public.location_assignments to authenticated;

drop policy if exists work_locations_select on public.work_locations;
create policy work_locations_select on public.work_locations for select to authenticated
  using (is_org_supervisor(org_id) or is_org_member(org_id));
drop policy if exists location_assignments_select on public.location_assignments;
create policy location_assignments_select on public.location_assignments for select to authenticated
  using (is_org_supervisor(org_id) or (status = 'published' and is_org_member(org_id) and org_has_product(org_id, 'employee_app')));

-- „Ein Arbeitsort“ / „Mehrere Einsatzorte“ (Inhaber/Leitung)
create or replace function public.set_location_mode(p_org uuid, p_multi boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if not org_has_product(p_org, 'generic_planner') then raise exception 'Einsatzorte gibt es nur im Dienstplaner (allgemein)'; end if;
  insert into org_features (org_id, feature, enabled, updated_at, updated_by)
  values (p_org, 'einsatzorte', coalesce(p_multi, false), now(), auth.uid())
  on conflict (org_id, feature) do update set enabled = excluded.enabled, updated_at = now(), updated_by = auth.uid();
end $$;

-- Ort anlegen (p_id null) oder ändern; löschen gibt es nicht, nur active = false
create or replace function public.save_work_location(p_org uuid, p_id uuid, p_name text, p_address text, p_color text, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if not org_has_product(p_org, 'generic_planner') then raise exception 'Einsatzorte gibt es nur im Dienstplaner (allgemein)'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Bitte einen Namen eingeben'; end if;
  if exists (select 1 from work_locations where org_id = p_org and lower(trim(name)) = lower(trim(p_name)) and id is distinct from p_id) then
    raise exception 'Diesen Ort gibt es schon'; end if;
  if p_id is null then
    insert into work_locations (org_id, name, address, color, active, sort_order)
    values (p_org, trim(p_name), nullif(trim(coalesce(p_address, '')), ''), coalesce(p_color, '#0d9488'), coalesce(p_active, true),
            coalesce((select max(sort_order) + 1 from work_locations where org_id = p_org), 0))
    returning id into v_id;
  else
    update work_locations set name = trim(p_name), address = nullif(trim(coalesce(p_address, '')), ''), color = coalesce(p_color, color), active = coalesce(p_active, active)
     where id = p_id and org_id = p_org returning id into v_id;
    if v_id is null then raise exception 'Ort nicht gefunden'; end if;
  end if;
  return v_id;
end $$;

-- Entwurf der Orte eines Monats ersetzen. p_rows: [{staff_id, date, location_id}]
create or replace function public.save_location_draft(p_org uuid, p_year integer, p_month integer, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  d_from date := make_date(p_year, p_month, 1);
  d_to   date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  n int;
begin
  if not (is_org_supervisor(p_org) and org_has_planner(p_org)) then raise exception 'Nur die Leitung einer Firma mit Dienstplaner darf Pläne speichern'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'Ungültige Daten'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
              where not exists (select 1 from work_locations w where w.id = (x->>'location_id')::uuid and w.org_id = p_org)) then
    raise exception 'Unbekannter Einsatzort'; end if;
  delete from location_assignments where org_id = p_org and status = 'draft' and work_date >= d_from and work_date < d_to;
  insert into location_assignments (org_id, staff_id, work_date, location_id, status)
  select distinct on ((x->>'staff_id')::uuid, (x->>'date')::date) p_org, (x->>'staff_id')::uuid, (x->>'date')::date, (x->>'location_id')::uuid, 'draft'
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
   where (x->>'date')::date >= d_from and (x->>'date')::date < d_to;
  get diagnostics n = row_count;
  return n;
end $$;

-- Veröffentlichen: Orte des Monats Entwurf -> published (läuft in der Transaktion von publish_month)
create or replace function public.publish_locations_trg() returns trigger language plpgsql security definer set search_path = public as $$
declare d_from date; d_to date;
begin
  if new.status <> 'published' or new.published_at is null then return null; end if;
  if tg_op = 'UPDATE' and new.published_at is not distinct from old.published_at then return null; end if;
  d_from := make_date(new.year, new.month, 1);
  d_to := (d_from + interval '1 month')::date;
  delete from location_assignments where org_id = new.org_id and status = 'published' and work_date >= d_from and work_date < d_to;
  insert into location_assignments (org_id, staff_id, work_date, location_id, status)
  select org_id, staff_id, work_date, location_id, 'published' from location_assignments
   where org_id = new.org_id and status = 'draft' and work_date >= d_from and work_date < d_to;
  return null;
end $$;
drop trigger if exists publish_locations on public.schedule_months;
create trigger publish_locations after insert or update of published_at, status on public.schedule_months
  for each row execute function public.publish_locations_trg();

-- discard_draft (Skript 30) setzt jetzt auch die Orte auf die veröffentlichte Fassung zurück
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

  delete from location_assignments where org_id = p_org and status = 'draft' and work_date >= d_from and work_date < d_to;
  insert into location_assignments (org_id, staff_id, work_date, location_id, status)
  select org_id, staff_id, work_date, location_id, 'draft' from location_assignments
   where org_id = p_org and status = 'published' and work_date >= d_from and work_date < d_to;

  update schedule_months
     set status = 'published', has_newer_draft = false, review_note = null, change_note = null, change_normal = false, updated_at = now()
   where org_id = p_org and year = p_year and month = p_month;
  return n;
end $$;

revoke all on function public.publish_locations_trg() from public, anon, authenticated;
revoke all on function public.set_location_mode(uuid, boolean) from public, anon;
revoke all on function public.save_work_location(uuid, uuid, text, text, text, boolean) from public, anon;
revoke all on function public.save_location_draft(uuid, integer, integer, jsonb) from public, anon;
grant execute on function public.set_location_mode(uuid, boolean) to authenticated;
grant execute on function public.save_work_location(uuid, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.save_location_draft(uuid, integer, integer, jsonb) to authenticated;
