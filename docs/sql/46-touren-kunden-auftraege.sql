-- 46 – Touren D3a: Kunden, Adressen, Aufträge, Leistungen, Zusatzfelder, Rolle „Büro“, Produkt „touren“
-- Allgemein für alle Firmen und Branchen (Reinigung, Technik, Pflege …), nicht nur Dubai.
-- Rechte:
--   * Inhaber, Leitung und die neue Rolle „office“ (Büro / Disposition) sehen und bearbeiten Kunden und Aufträge.
--   * „office“ bekommt dadurch KEINE weiteren Rechte: alle bisherigen Tabellen prüfen owner/supervisor/planner
--     oder die eigene Person – Büro sieht dort nur, was auch Mitarbeitende sehen (Zeiterfassung, Krank usw. nicht).
--   * Leistungen und Zusatzfelder ändern nur Inhaber/Leitung.
--   * Mitarbeitende sehen in D3a noch nichts (kommt mit „My jobs“ in D3b).
--   * Löschen gibt es nicht: Kunden/Adressen „inaktiv“, Aufträge „storniert“.
-- Kein Preis (Entscheidung Nutzer 21.11.2026).

-- 1) neue Rolle und neues Produkt
alter table memberships drop constraint if exists memberships_role_check;
alter table memberships add constraint memberships_role_check check (role in ('owner', 'supervisor', 'planner', 'employee', 'office'));
alter table org_products drop constraint if exists org_products_product_check;
alter table org_products add constraint org_products_product_check check (product in ('lab_planner', 'generic_planner', 'employee_app', 'time_tracking', 'touren'));

-- 2) wer darf Touren bearbeiten: Inhaber, Leitung, Büro – und die Firma hat das Produkt
create or replace function public.is_touren_staff(o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join organizations g on g.id = m.org_id and g.active
    where m.user_id = auth.uid() and m.org_id = o and m.role in ('owner', 'supervisor', 'office')
  ) and org_has_product(o, 'touren')
$$;
revoke all on function public.is_touren_staff(uuid) from public, anon;
grant execute on function public.is_touren_staff(uuid) to authenticated, service_role;

-- 3) Tabellen
create table if not exists customers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  customer_no    integer not null,
  kind           text not null default 'person' check (kind in ('person', 'company')),
  name           text not null check (length(btrim(name)) between 1 and 200),
  company        text check (company is null or length(company) <= 200),
  phone          text check (phone is null or phone ~ '^\+?[0-9]{5,20}$'),
  email          text check (email is null or length(email) <= 200),
  notes_staff    text check (notes_staff is null or length(notes_staff) <= 4000),
  notes_internal text check (notes_internal is null or length(notes_internal) <= 4000),
  source         text not null default 'phone' check (source in ('phone', 'whatsapp', 'website', 'email', 'in_person', 'referral', 'other')),
  active         boolean not null default true,
  extra          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid default auth.uid(),
  unique (org_id, customer_no)
);
create unique index if not exists customers_phone_uq on customers (org_id, phone) where phone is not null;
create index if not exists customers_org_name on customers (org_id, lower(name));

create table if not exists customer_addresses (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  label       text check (label is null or length(label) <= 100),
  address     text not null check (length(btrim(address)) between 1 and 500),
  maps_url    text check (maps_url is null or length(maps_url) <= 2000),
  lat         double precision check (lat is null or lat between -90 and 90),
  lng         double precision check (lng is null or lng between -180 and 180),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);
create index if not exists customer_addresses_cust on customer_addresses (customer_id);

create table if not exists service_types (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 100),
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists service_types_org on service_types (org_id, sort_order);

create table if not exists custom_fields (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  entity        text not null check (entity in ('customer', 'job')),
  name          text not null check (length(btrim(name)) between 1 and 100),
  kind          text not null default 'text' check (kind in ('text', 'number', 'bool', 'date', 'select')),
  options       text[] not null default '{}',
  required      boolean not null default false,
  staff_visible boolean not null default false,
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists custom_fields_org on custom_fields (org_id, entity, sort_order);

create table if not exists jobs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  job_no          integer not null,
  customer_id     uuid not null references customers(id) on delete restrict,
  address_id      uuid references customer_addresses(id) on delete set null,
  address_text    text not null check (length(btrim(address_text)) between 1 and 500),
  maps_url        text check (maps_url is null or length(maps_url) <= 2000),
  lat             double precision check (lat is null or lat between -90 and 90),
  lng             double precision check (lng is null or lng between -180 and 180),
  work_date       date not null,
  start_time      time not null,
  duration_min    integer not null check (duration_min between 5 and 1440),
  service_type_id uuid references service_types(id) on delete set null,
  staff_needed    integer not null default 1 check (staff_needed between 1 and 50),
  notes_staff     text check (notes_staff is null or length(notes_staff) <= 4000),
  notes_internal  text check (notes_internal is null or length(notes_internal) <= 4000),
  source          text not null default 'phone' check (source in ('phone', 'whatsapp', 'website', 'email', 'in_person', 'referral', 'other')),
  status          text not null default 'new' check (status in ('new', 'accepted', 'done', 'cancelled')),
  cancel_reason   text check (cancel_reason is null or length(cancel_reason) <= 500),
  extra           jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid default auth.uid(),
  unique (org_id, job_no)
);
create index if not exists jobs_org_date on jobs (org_id, work_date, start_time);
create index if not exists jobs_customer on jobs (customer_id, work_date desc);

-- 4) Trigger: laufende Nummer pro Firma, Zeitstempel, Firma/Ersteller nicht änderbar, Zugehörigkeit prüfen
create or replace function public.touren_row_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(tg_table_name || new.org_id::text));
    if tg_table_name = 'customers' then
      select coalesce(max(customer_no), 0) + 1 into new.customer_no from customers where org_id = new.org_id;
    elsif tg_table_name = 'jobs' then
      select coalesce(max(job_no), 0) + 1 into new.job_no from jobs where org_id = new.org_id;
    end if;
    new.created_at := now();
    if auth.uid() is not null and tg_table_name in ('customers', 'customer_addresses', 'jobs') then new.created_by := auth.uid(); end if;
  else
    if new.org_id <> old.org_id then raise exception 'Firma kann nicht geändert werden'; end if;
    new.created_at := old.created_at;
    if tg_table_name in ('customers', 'customer_addresses', 'jobs') then new.created_by := old.created_by; end if;
    if tg_table_name = 'customers' then new.customer_no := old.customer_no; end if;
    if tg_table_name = 'jobs' then new.job_no := old.job_no; end if;
  end if;
  if tg_table_name in ('customers', 'jobs') then
    new.updated_at := now();
    if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  end if;
  -- Verweise müssen zur selben Firma gehören
  if tg_table_name = 'customer_addresses' then
    if not exists (select 1 from customers c where c.id = new.customer_id and c.org_id = new.org_id) then raise exception 'Kunde gehört nicht zu dieser Firma'; end if;
  elsif tg_table_name = 'jobs' then
    if not exists (select 1 from customers c where c.id = new.customer_id and c.org_id = new.org_id) then raise exception 'Kunde gehört nicht zu dieser Firma'; end if;
    if new.address_id is not null and not exists (select 1 from customer_addresses a where a.id = new.address_id and a.customer_id = new.customer_id) then raise exception 'Adresse gehört nicht zu diesem Kunden'; end if;
    if new.service_type_id is not null and not exists (select 1 from service_types s where s.id = new.service_type_id and s.org_id = new.org_id) then raise exception 'Leistung gehört nicht zu dieser Firma'; end if;
    if new.status <> 'cancelled' then new.cancel_reason := null; end if;
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['customers', 'customer_addresses', 'service_types', 'custom_fields', 'jobs'] loop
    execute format('drop trigger if exists trg_touren_guard on %I', t);
    execute format('create trigger trg_touren_guard before insert or update on %I for each row execute function touren_row_guard()', t);
    execute format('drop trigger if exists trg_trial_guard on %I', t);
    execute format('create trigger trg_trial_guard before insert or update or delete on %I for each row execute function trial_guard()', t);
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update on %I to authenticated', t);
    execute format('revoke delete on %I from authenticated', t);
  end loop;
end $$;

-- 5) RLS
drop policy if exists touren_cust_select on customers;
drop policy if exists touren_cust_insert on customers;
drop policy if exists touren_cust_update on customers;
create policy touren_cust_select on customers for select to authenticated using (is_touren_staff(org_id));
create policy touren_cust_insert on customers for insert to authenticated with check (is_touren_staff(org_id));
create policy touren_cust_update on customers for update to authenticated using (is_touren_staff(org_id)) with check (is_touren_staff(org_id));

drop policy if exists touren_addr_select on customer_addresses;
drop policy if exists touren_addr_insert on customer_addresses;
drop policy if exists touren_addr_update on customer_addresses;
create policy touren_addr_select on customer_addresses for select to authenticated using (is_touren_staff(org_id));
create policy touren_addr_insert on customer_addresses for insert to authenticated with check (is_touren_staff(org_id));
create policy touren_addr_update on customer_addresses for update to authenticated using (is_touren_staff(org_id)) with check (is_touren_staff(org_id));

drop policy if exists touren_job_select on jobs;
drop policy if exists touren_job_insert on jobs;
drop policy if exists touren_job_update on jobs;
create policy touren_job_select on jobs for select to authenticated using (is_touren_staff(org_id));
create policy touren_job_insert on jobs for insert to authenticated with check (is_touren_staff(org_id));
create policy touren_job_update on jobs for update to authenticated using (is_touren_staff(org_id)) with check (is_touren_staff(org_id));

-- Leistungen & Zusatzfelder: lesen alle Touren-Berechtigten, ändern nur Inhaber/Leitung
drop policy if exists touren_svc_select on service_types;
drop policy if exists touren_svc_insert on service_types;
drop policy if exists touren_svc_update on service_types;
create policy touren_svc_select on service_types for select to authenticated using (is_touren_staff(org_id));
create policy touren_svc_insert on service_types for insert to authenticated with check (is_org_leader(org_id) and is_touren_staff(org_id));
create policy touren_svc_update on service_types for update to authenticated using (is_org_leader(org_id) and is_touren_staff(org_id)) with check (is_org_leader(org_id) and is_touren_staff(org_id));

drop policy if exists touren_cf_select on custom_fields;
drop policy if exists touren_cf_insert on custom_fields;
drop policy if exists touren_cf_update on custom_fields;
create policy touren_cf_select on custom_fields for select to authenticated using (is_touren_staff(org_id));
create policy touren_cf_insert on custom_fields for insert to authenticated with check (is_org_leader(org_id) and is_touren_staff(org_id));
create policy touren_cf_update on custom_fields for update to authenticated using (is_org_leader(org_id) and is_touren_staff(org_id)) with check (is_org_leader(org_id) and is_touren_staff(org_id));
