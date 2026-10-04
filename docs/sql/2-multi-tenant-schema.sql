-- ============================================================================
-- PART 2 (multi-tenant / SaaS) — REPLACES the earlier single-company "connect-apps" script
-- ============================================================================
-- Run this ONCE in Supabase -> SQL Editor, AFTER attendance-schema.sql (part 1).
-- Do NOT run the older connect-apps-schema.sql (it was for one single company).
--
-- Model:
--   * organizations      one row per customer company
--   * org_products       which products a company has: lab_planner, generic_planner, employee_app
--                        (this is the switch that "connects" the employee app to a planner)
--   * memberships        which login belongs to which company, with the role owner/supervisor/employee
--   * every data table   carries org_id; Row Level Security lets a user only touch rows of
--                        companies they belong to — one company can never see another's data
--
-- Both planners (lab + generic) write the SAME tables (shift_definitions, scheduled_shifts), so the
-- employee app works with either of them.
--
-- THIS SCRIPT IS FOR A DATABASE WITHOUT REAL DATA (test data only). It stops if it finds rows.
-- Requires Postgres 15+ (every current Supabase project).
-- The /api/attendance route (service_role key) bypasses RLS and must be updated to send the
-- device credentials — the updated project zip does that.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0) Safety: only run on a database that holds no real data yet
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from staff) or exists (select 1 from badges)
     or exists (select 1 from attendance_events) or exists (select 1 from attendance_sessions)
     or exists (select 1 from attendance_corrections) or exists (select 1 from scheduled_shifts) then
    raise exception 'Die Tabellen enthalten schon Daten. Dieses Skript ist für eine Datenbank ohne echte Daten gedacht. Lösche zuerst die Testdaten (z. B. "truncate staff cascade;") oder frage nach einer Migration mit Daten.';
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 1) Remove leftovers of the older single-company draft (safe if they do not exist)
-- ---------------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('staff', 'badges', 'attendance_events', 'attendance_sessions', 'attendance_corrections', 'scheduled_shifts')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

drop view if exists approved_absences;
drop view if exists vacation_balance;
drop view if exists team_directory;
drop view if exists attendance_variance;
drop table if exists vacation_entitlements, wishes, requests, request_types, shift_definitions cascade;
drop function if exists my_staff_id();
drop function if exists is_supervisor();
drop function if exists publish_month(int, int);
alter table staff drop column if exists auth_user_id;
alter table staff drop column if exists role;


-- ---------------------------------------------------------------------------
-- 2) Tenancy
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists org_products (
  org_id      uuid not null references organizations(id) on delete cascade,
  product     text not null check (product in ('lab_planner', 'generic_planner', 'employee_app')),
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (org_id, product)
);

-- You (the platform operator). Nobody can read or write this table through the API.
create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists memberships (
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  role        text not null check (role in ('owner', 'supervisor', 'employee')),
  staff_id    uuid,                                -- which staff row this login is (employees)
  created_at  timestamptz not null default now(),
  primary key (user_id, org_id)
);
create index if not exists idx_memberships_org on memberships (org_id);


-- ---------------------------------------------------------------------------
-- 3) Existing tables get an org_id (and can only point to staff of the SAME company)
-- ---------------------------------------------------------------------------
alter table staff                  add column if not exists org_id uuid not null references organizations(id) on delete cascade;
alter table badges                 add column if not exists org_id uuid not null references organizations(id) on delete cascade;
alter table attendance_events      add column if not exists org_id uuid not null references organizations(id) on delete cascade;
alter table attendance_sessions    add column if not exists org_id uuid not null references organizations(id) on delete cascade;
alter table attendance_corrections add column if not exists org_id uuid not null references organizations(id) on delete cascade;
alter table scheduled_shifts       add column if not exists org_id uuid not null references organizations(id) on delete cascade;

-- Per-person settings the planners need.
alter table staff add column if not exists employment_type text not null default 'full';
alter table staff drop constraint if exists staff_employment_type_check;
alter table staff add constraint staff_employment_type_check check (employment_type in ('full', 'part', 'mini'));
alter table staff add column if not exists night_exempt boolean not null default false;
alter table staff add column if not exists weekend_exempt boolean not null default false;
alter table staff add column if not exists is_team_lead boolean not null default false;

alter table staff drop constraint if exists staff_id_org_unique;
alter table staff add constraint staff_id_org_unique unique (id, org_id);

alter table memberships drop constraint if exists memberships_staff_fk;
alter table memberships add constraint memberships_staff_fk
  foreign key (staff_id, org_id) references staff (id, org_id) on delete set null (staff_id);

alter table badges drop constraint if exists badges_staff_org_fk;
alter table badges add constraint badges_staff_org_fk
  foreign key (staff_id, org_id) references staff (id, org_id) on delete cascade;
alter table attendance_events drop constraint if exists events_staff_org_fk;
alter table attendance_events add constraint events_staff_org_fk
  foreign key (staff_id, org_id) references staff (id, org_id);
alter table attendance_sessions drop constraint if exists sessions_staff_org_fk;
alter table attendance_sessions add constraint sessions_staff_org_fk
  foreign key (staff_id, org_id) references staff (id, org_id) on delete cascade;
alter table attendance_corrections drop constraint if exists corrections_staff_org_fk;
alter table attendance_corrections add constraint corrections_staff_org_fk
  foreign key (staff_id, org_id) references staff (id, org_id) on delete cascade;
alter table scheduled_shifts drop constraint if exists shifts_staff_org_fk;
alter table scheduled_shifts add constraint shifts_staff_org_fk
  foreign key (staff_id, org_id) references staff (id, org_id) on delete cascade;

-- A badge code only has to be unique inside one company.
alter table badges drop constraint if exists badges_badge_code_key;
create unique index if not exists badges_org_code_uniq on badges (org_id, badge_code);

create index if not exists idx_staff_org on staff (org_id);
create index if not exists idx_events_org_time on attendance_events (org_id, scanned_at);
create index if not exists idx_sessions_org on attendance_sessions (org_id, check_in);
create index if not exists idx_shifts_org_date on scheduled_shifts (org_id, shift_date);

-- Draft vs. published plans. The planners write 'draft'; publish_month() copies to 'published';
-- the employee app only ever reads 'published'.
alter table scheduled_shifts add column if not exists status text not null default 'draft';
alter table scheduled_shifts drop constraint if exists scheduled_shifts_status_check;
alter table scheduled_shifts add constraint scheduled_shifts_status_check check (status in ('draft', 'published'));
alter table scheduled_shifts add column if not exists published_at timestamptz;
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.scheduled_shifts'::regclass
      and contype = 'u'
      and (
        select array_agg(attname order by attname)
        from pg_attribute
        where attrelid = conrelid and attnum = any (conkey)
      ) = array['shift_date', 'shift_key', 'staff_id']::name[]
  loop
    execute format('alter table scheduled_shifts drop constraint %I', c.conname);
  end loop;
end $$;
create unique index if not exists scheduled_shifts_uniq
  on scheduled_shifts (staff_id, shift_date, shift_key, status);


-- ---------------------------------------------------------------------------
-- 4) Helper functions used by the policies (SECURITY DEFINER so they can read the tenancy
--    tables without triggering those tables' own policies)
-- ---------------------------------------------------------------------------
create or replace function is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

create or replace function my_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select m.org_id from memberships m join organizations o on o.id = m.org_id and o.active
  where m.user_id = auth.uid()
$$;

create or replace function is_org_member(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join organizations g on g.id = m.org_id and g.active
    where m.user_id = auth.uid() and m.org_id = o
  )
$$;

create or replace function is_org_supervisor(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join organizations g on g.id = m.org_id and g.active
    where m.user_id = auth.uid() and m.org_id = o and m.role in ('owner', 'supervisor')
  )
$$;

create or replace function my_staff_id(o uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select m.staff_id from memberships m where m.user_id = auth.uid() and m.org_id = o
$$;

create or replace function org_has_product(o uuid, p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_products x join organizations g on g.id = x.org_id and g.active
    where x.org_id = o and x.product = p and x.enabled
  )
$$;

create or replace function org_has_planner(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_products x join organizations g on g.id = x.org_id and g.active
    where x.org_id = o and x.product in ('lab_planner', 'generic_planner') and x.enabled
  )
$$;

revoke all on function is_platform_admin() from public, anon;
revoke all on function my_org_ids() from public, anon;
revoke all on function is_org_member(uuid) from public, anon;
revoke all on function is_org_supervisor(uuid) from public, anon;
revoke all on function my_staff_id(uuid) from public, anon;
revoke all on function org_has_product(uuid, text) from public, anon;
revoke all on function org_has_planner(uuid) from public, anon;
grant execute on function is_platform_admin() to authenticated;
grant execute on function my_org_ids() to authenticated;
grant execute on function is_org_member(uuid) to authenticated;
grant execute on function is_org_supervisor(uuid) to authenticated;
grant execute on function my_staff_id(uuid) to authenticated;
grant execute on function org_has_product(uuid, text) to authenticated;
grant execute on function org_has_planner(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 5) Per-company data: shifts, requests, wishes, vacation, devices
-- ---------------------------------------------------------------------------
create table if not exists shift_definitions (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  key                  text not null,
  label                text not null,
  start_time           time not null,
  end_time             time not null,                 -- end <= start means the shift crosses midnight
  frequency            text not null default 'daily' check (frequency in ('daily', 'quota')),
  quota_per_month      int check (quota_per_month is null or quota_per_month > 0),
  prefer_team_lead     boolean not null default false,
  requires_rest_after  boolean not null default false,
  runs_on_weekends     boolean not null default true,
  sort_order           int not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  unique (org_id, key)
);

create table if not exists request_types (
  org_id         uuid not null references organizations(id) on delete cascade,
  key            text not null,
  label          text not null,
  uses_vacation  boolean not null default false,
  active         boolean not null default true,
  sort_order     int not null default 0,
  primary key (org_id, key)
);

create table if not exists requests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  staff_id    uuid not null,
  type_key    text not null,
  date_from   date not null,
  date_to     date not null,
  days        numeric(5,1) not null default 0 check (days >= 0),
  note        text,
  status      text not null default 'open' check (status in ('open', 'approved', 'denied')),
  decided_by  uuid references staff(id),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (date_to >= date_from),
  foreign key (staff_id, org_id) references staff (id, org_id) on delete cascade,
  foreign key (org_id, type_key) references request_types (org_id, key)
);
create index if not exists idx_requests_org_staff on requests (org_id, staff_id, date_from);

create table if not exists wishes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  staff_id    uuid not null,
  wish_type   text not null check (wish_type in ('free', 'work')),
  date_from   date not null,
  date_to     date not null,
  shift_key   text,
  note        text,
  created_at  timestamptz not null default now(),
  check (date_to >= date_from),
  foreign key (staff_id, org_id) references staff (id, org_id) on delete cascade
);
create index if not exists idx_wishes_org_staff on wishes (org_id, staff_id, date_from);

create table if not exists vacation_entitlements (
  org_id      uuid not null references organizations(id) on delete cascade,
  staff_id    uuid not null,
  year        int not null,
  days_total  numeric(5,1) not null check (days_total >= 0),
  primary key (staff_id, year),
  foreign key (staff_id, org_id) references staff (id, org_id) on delete cascade
);

-- Time-clock devices. The device sends its serial + a secret; only a SHA-256 hash is stored.
-- Register one like this:
--   insert into devices (org_id, serial, name, secret_hash)
--   values ('<org-id>', 'SN-12345', 'Eingang', encode(digest('<geheimes-passwort>', 'sha256'), 'hex'));
create table if not exists devices (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  serial       text not null unique,
  name         text,
  secret_hash  text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 6) Functions and triggers
-- ---------------------------------------------------------------------------
-- Resolve the person from the badge, inside the same company only.
create or replace function resolve_attendance_staff()
returns trigger language plpgsql as $$
begin
  if new.staff_id is null then
    select b.staff_id into new.staff_id
    from badges b
    where b.org_id = new.org_id
      and b.badge_code = new.badge_code
      and b.issued_at <= new.scanned_at
      and (b.revoked_at is null or b.revoked_at > new.scanned_at)
    order by b.issued_at desc
    limit 1;
  end if;
  return new;
end;
$$;

-- Pairs scans into sessions (same logic as part 1, now carrying org_id). Server-side only.
create or replace function rebuild_attendance_sessions(p_staff_id uuid, p_from date, p_to date)
returns void language plpgsql as $$
declare
  ev record;
  v_org uuid;
  pending_in timestamptz := null;
  pending_in_id bigint := null;
begin
  select org_id into v_org from staff where id = p_staff_id;
  if v_org is null then raise exception 'Unbekannte Person'; end if;

  delete from attendance_sessions
  where staff_id = p_staff_id and check_in >= p_from and check_in < (p_to + interval '1 day');

  for ev in
    select id, scanned_at from attendance_events
    where staff_id = p_staff_id and scanned_at >= p_from and scanned_at < (p_to + interval '1 day')
    order by scanned_at asc
  loop
    if pending_in is null then
      pending_in := ev.scanned_at;
      pending_in_id := ev.id;
    else
      insert into attendance_sessions (org_id, staff_id, check_in, check_out, in_event_id, out_event_id)
      values (v_org, p_staff_id, pending_in, ev.scanned_at, pending_in_id, ev.id);
      pending_in := null;
      pending_in_id := null;
    end if;
  end loop;

  if pending_in is not null then
    insert into attendance_sessions (org_id, staff_id, check_in, check_out, in_event_id, out_event_id)
    values (v_org, p_staff_id, pending_in, null, pending_in_id, null);
  end if;
end;
$$;
revoke all on function rebuild_attendance_sessions(uuid, date, date) from public, anon, authenticated;

-- Record who approved/denied a request, and when.
create or replace function requests_set_decision()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'denied') then
    new.decided_by := my_staff_id(new.org_id);
    new.decided_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_requests_decision on requests;
create trigger trg_requests_decision
  before update on requests
  for each row execute function requests_set_decision();

-- Copy one month of drafts to 'published' (what employees see). Drafts stay editable.
create or replace function publish_month(p_org uuid, p_year int, p_month int)
returns void language plpgsql security definer set search_path = public as $$
declare
  d_from date := make_date(p_year, p_month, 1);
  d_to   date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
begin
  if not (is_org_supervisor(p_org) and org_has_planner(p_org)) then
    raise exception 'Nur die Leitung einer Firma mit Dienstplaner darf Pläne veröffentlichen';
  end if;

  delete from scheduled_shifts
  where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to;

  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status, published_at)
  select org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, 'published', now()
  from scheduled_shifts
  where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;
end;
$$;
revoke all on function publish_month(uuid, int, int) from public, anon;
grant execute on function publish_month(uuid, int, int) to authenticated;

-- Create a customer company in one call (platform admin, SQL Editor, or your own admin backend).
create or replace function create_organization(p_name text, p_owner uuid, p_products text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if not (is_platform_admin() or coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres') then
    raise exception 'Nur Plattform-Admins dürfen Firmen anlegen';
  end if;
  insert into organizations (name) values (p_name) returning id into o;
  insert into org_products (org_id, product) select o, unnest(p_products);
  insert into memberships (user_id, org_id, role) values (p_owner, o, 'owner');
  -- a starting set of request types; the supervisor can edit or delete them
  insert into request_types (org_id, key, label, uses_vacation, sort_order) values
    (o, 'urlaub',      'Urlaub',                true,  1),
    (o, 'fortbildung', 'Fortbildung',           false, 2),
    (o, 'krank',       'Krankmeldung / Attest', false, 3);
  return o;
end;
$$;
revoke all on function create_organization(text, uuid, text[]) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 7) Views (they respect RLS; employees only ever see what the policies allow)
-- ---------------------------------------------------------------------------
create view attendance_variance with (security_invoker = true) as
select
  s.id                                   as shift_id,
  s.org_id,
  s.staff_id,
  st.name                                as staff_name,
  s.shift_date,
  s.shift_key,
  s.shift_label,
  s.planned_start,
  s.planned_end,
  a.check_in,
  a.check_out,
  case when a.check_in is null then true else false end          as no_show,
  case when a.check_in is not null and a.check_in > s.planned_start
       then round(extract(epoch from (a.check_in - s.planned_start)) / 60)
       else 0 end                                                 as late_minutes,
  case when a.check_out is not null and a.check_out < s.planned_end
       then round(extract(epoch from (s.planned_end - a.check_out)) / 60)
       else 0 end                                                 as left_early_minutes,
  case when a.check_out is not null and a.check_out > s.planned_end
       then round(extract(epoch from (a.check_out - s.planned_end)) / 60)
       else 0 end                                                 as overtime_minutes
from scheduled_shifts s
join staff st on st.id = s.staff_id
left join lateral (
  select check_in, check_out
  from attendance_sessions a
  where a.staff_id = s.staff_id
    and a.check_in::date = s.shift_date
  order by abs(extract(epoch from (a.check_in - s.planned_start)))
  limit 1
) a on true
where s.status = 'published';

create view vacation_balance with (security_invoker = true) as
select
  e.org_id,
  e.staff_id,
  e.year,
  e.days_total,
  coalesce(sum(r.days) filter (where r.status in ('open', 'approved')), 0)                as days_used,
  e.days_total - coalesce(sum(r.days) filter (where r.status in ('open', 'approved')), 0) as days_left
from vacation_entitlements e
left join requests r
  on r.staff_id = e.staff_id
 and extract(year from r.date_from)::int = e.year
 and exists (select 1 from request_types t where t.org_id = r.org_id and t.key = r.type_key and t.uses_vacation)
group by e.org_id, e.staff_id, e.year, e.days_total;

-- The planners read approved absences from here and treat them like Urlaub/Krank.
create view approved_absences with (security_invoker = true) as
select org_id, staff_id, type_key, date_from, date_to
from requests
where status = 'approved';

-- Names only (no email / contract data), restricted to your own company.
create view team_directory as
select s.id, s.org_id, s.name
from staff s
where s.active
  and is_org_member(s.org_id)
  and (org_has_product(s.org_id, 'employee_app') or is_org_supervisor(s.org_id));
revoke all on team_directory from anon;
grant select on team_directory to authenticated;


-- ---------------------------------------------------------------------------
-- 8) Row Level Security — the actual company isolation
-- ---------------------------------------------------------------------------
alter table organizations          enable row level security;
alter table org_products           enable row level security;
alter table platform_admins        enable row level security;   -- no policy: closed to the API
alter table memberships            enable row level security;
alter table staff                  enable row level security;
alter table badges                 enable row level security;
alter table attendance_events      enable row level security;
alter table attendance_sessions    enable row level security;
alter table attendance_corrections enable row level security;
alter table scheduled_shifts       enable row level security;
alter table shift_definitions      enable row level security;
alter table request_types          enable row level security;
alter table requests               enable row level security;
alter table wishes                 enable row level security;
alter table vacation_entitlements  enable row level security;
alter table devices                enable row level security;

-- organizations / products: members read; only the platform admin (you) changes them
drop policy if exists mt_org_select on organizations;
create policy mt_org_select on organizations for select to authenticated
  using (id in (select my_org_ids()) or is_platform_admin());
drop policy if exists mt_org_admin on organizations;
create policy mt_org_admin on organizations for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists mt_prod_select on org_products;
create policy mt_prod_select on org_products for select to authenticated
  using (org_id in (select my_org_ids()) or is_platform_admin());
drop policy if exists mt_prod_admin on org_products;
create policy mt_prod_admin on org_products for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- memberships: see your own; a supervisor manages the company's members (but never owners)
drop policy if exists mt_mem_select on memberships;
create policy mt_mem_select on memberships for select to authenticated
  using (user_id = auth.uid() or is_org_supervisor(org_id) or is_platform_admin());
drop policy if exists mt_mem_supervisor on memberships;
create policy mt_mem_supervisor on memberships for all to authenticated
  using (is_org_supervisor(org_id) and role <> 'owner')
  with check (is_org_supervisor(org_id) and role in ('employee', 'supervisor'));
drop policy if exists mt_mem_admin on memberships;
create policy mt_mem_admin on memberships for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- staff
drop policy if exists mt_staff_select on staff;
create policy mt_staff_select on staff for select to authenticated
  using (is_org_supervisor(org_id) or (id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists mt_staff_supervisor on staff;
create policy mt_staff_supervisor on staff for all to authenticated
  using (is_org_supervisor(org_id)) with check (is_org_supervisor(org_id));

-- badges + devices: supervisor only
drop policy if exists mt_badges_supervisor on badges;
create policy mt_badges_supervisor on badges for all to authenticated
  using (is_org_supervisor(org_id)) with check (is_org_supervisor(org_id));
drop policy if exists mt_devices_supervisor on devices;
create policy mt_devices_supervisor on devices for all to authenticated
  using (is_org_supervisor(org_id)) with check (is_org_supervisor(org_id));

-- attendance: employees read their own (only with the employee app); raw scans are never edited
drop policy if exists mt_events_select on attendance_events;
create policy mt_events_select on attendance_events for select to authenticated
  using (is_org_supervisor(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));

drop policy if exists mt_sessions_select on attendance_sessions;
create policy mt_sessions_select on attendance_sessions for select to authenticated
  using (is_org_supervisor(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists mt_sessions_supervisor on attendance_sessions;
create policy mt_sessions_supervisor on attendance_sessions for all to authenticated
  using (is_org_supervisor(org_id)) with check (is_org_supervisor(org_id));

drop policy if exists mt_corr_select on attendance_corrections;
create policy mt_corr_select on attendance_corrections for select to authenticated
  using (is_org_supervisor(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists mt_corr_insert on attendance_corrections;
create policy mt_corr_insert on attendance_corrections for insert to authenticated
  with check (is_org_supervisor(org_id));

-- shift definitions + shifts: a planner product is needed to write; employees (with the employee app) read published
drop policy if exists mt_sdef_select on shift_definitions;
create policy mt_sdef_select on shift_definitions for select to authenticated
  using (is_org_supervisor(org_id) or (is_org_member(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists mt_sdef_write on shift_definitions;
create policy mt_sdef_write on shift_definitions for all to authenticated
  using (is_org_supervisor(org_id) and org_has_planner(org_id))
  with check (is_org_supervisor(org_id) and org_has_planner(org_id));

drop policy if exists mt_shifts_select on scheduled_shifts;
create policy mt_shifts_select on scheduled_shifts for select to authenticated
  using (is_org_supervisor(org_id)
         or (status = 'published' and is_org_member(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists mt_shifts_write on scheduled_shifts;
create policy mt_shifts_write on scheduled_shifts for all to authenticated
  using (is_org_supervisor(org_id) and org_has_planner(org_id))
  with check (is_org_supervisor(org_id) and org_has_planner(org_id));

-- request types
drop policy if exists mt_rt_select on request_types;
create policy mt_rt_select on request_types for select to authenticated
  using (is_org_supervisor(org_id) or (is_org_member(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists mt_rt_write on request_types;
create policy mt_rt_write on request_types for all to authenticated
  using (is_org_supervisor(org_id)) with check (is_org_supervisor(org_id));

-- requests: employees create their own ('open' only), read their own, withdraw their own open ones
drop policy if exists mt_req_select on requests;
create policy mt_req_select on requests for select to authenticated
  using (is_org_supervisor(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists mt_req_insert_own on requests;
create policy mt_req_insert_own on requests for insert to authenticated
  with check (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')
              and status = 'open' and decided_by is null and decided_at is null);
drop policy if exists mt_req_delete_own on requests;
create policy mt_req_delete_own on requests for delete to authenticated
  using (staff_id = my_staff_id(org_id) and status = 'open');
drop policy if exists mt_req_supervisor on requests;
create policy mt_req_supervisor on requests for all to authenticated
  using (is_org_supervisor(org_id)) with check (is_org_supervisor(org_id));

-- wishes
drop policy if exists mt_wish_select on wishes;
create policy mt_wish_select on wishes for select to authenticated
  using (is_org_supervisor(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists mt_wish_insert_own on wishes;
create policy mt_wish_insert_own on wishes for insert to authenticated
  with check (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app'));
drop policy if exists mt_wish_delete_own on wishes;
create policy mt_wish_delete_own on wishes for delete to authenticated
  using (staff_id = my_staff_id(org_id));
drop policy if exists mt_wish_supervisor on wishes;
create policy mt_wish_supervisor on wishes for all to authenticated
  using (is_org_supervisor(org_id)) with check (is_org_supervisor(org_id));

-- vacation entitlement
drop policy if exists mt_vac_select on vacation_entitlements;
create policy mt_vac_select on vacation_entitlements for select to authenticated
  using (is_org_supervisor(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists mt_vac_supervisor on vacation_entitlements;
create policy mt_vac_supervisor on vacation_entitlements for all to authenticated
  using (is_org_supervisor(org_id)) with check (is_org_supervisor(org_id));


-- ---------------------------------------------------------------------------
-- 9) FIRST-TIME SETUP — run these by hand, one at a time (NOT part of the automatic script)
-- ---------------------------------------------------------------------------
-- a) Create your own login: Supabase -> Authentication -> Users -> Add user. Copy the "User UID".
-- b) Make yourself platform admin:
--      insert into platform_admins (user_id) values ('<DEINE-USER-UID>');
-- c) Create a customer company (and its owner, who must already have a login):
--      select create_organization('Firma Muster GmbH', '<OWNER-USER-UID>', array['lab_planner', 'employee_app']);
--    -> returns the new company's id. Products: 'lab_planner', 'generic_planner', 'employee_app'.
-- d) Add an employee and link their login:
--      insert into staff (org_id, name, email, weekly_hours) values ('<ORG-ID>', 'Anna Keller', 'anna@firma.de', 38.5) returning id;
--      insert into memberships (user_id, org_id, role, staff_id) values ('<ANNA-USER-UID>', '<ORG-ID>', 'employee', '<STAFF-ID>');
-- e) CONNECT / DISCONNECT the employee app for a company at any time (this is the switch):
--      insert into org_products (org_id, product) values ('<ORG-ID>', 'employee_app')
--        on conflict (org_id, product) do update set enabled = true;      -- connect
--      update org_products set enabled = false where org_id = '<ORG-ID>' and product = 'employee_app';  -- disconnect
-- f) Check that every table has RLS on (rowsecurity must be true everywhere):
--      select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
-- ---------------------------------------------------------------------------
