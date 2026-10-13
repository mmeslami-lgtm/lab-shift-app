-- STAGING-SETUP.sql – baut die komplette Datenbank fuer die TEST-Umgebung auf (Skripte 1 bis 19 hintereinander).
-- NUR im Test-Projekt ausfuehren (transport-scanner / dienstplaner-test), NIEMALS im echten Projekt.
-- Supabase -> Test-Projekt -> SQL Editor -> alles einfuegen -> Run.


-- ===================== 1-attendance-schema.sql =====================
-- ============================================================================
-- Attendance (Hozur o Ghiab) Schema — for Supabase (PostgreSQL)
-- ============================================================================
-- Design goals:
--  1. Works with ANY chip/badge reader brand, since almost all of them boil
--     down to "badge X was scanned at time Y" as the minimum common data —
--     everything else (device model, direction, extra fields) is optional.
--  2. Keeps the RAW scan log separate from the DERIVED work-session data, so
--     you never lose original device data even if your pairing logic changes.
--  3. Can compare actual attendance against the shifts planned in the
--     scheduler tool, to flag late arrivals / early departures / no-shows.
--
-- HOW TO USE:
--   1. Open your Supabase project -> SQL Editor -> New query.
--   2. Paste this whole file and click "Run".
--   3. Tables, indexes, and the comparison view will all be created together.
-- ============================================================================

-- ============================================================================
-- GERMANY-SPECIFIC LEGAL NOTES (read before going live — not a substitute for
-- advice from a lawyer/Steuerberater, but the concrete points that shape this
-- schema's design):
--
--  • Arbeitszeiterfassungspflicht: since the BAG ruling (Beschluss 1 ABR
--    22/21, 13 Sep 2022), employers must systematically record start, end,
--    and duration of daily working time with an "objective, reliable, and
--    accessible" system. This schema's append-only attendance_events +
--    auditable attendance_corrections table is designed to meet that bar —
--    never edit attendance_events directly; log corrections instead.
--
--  • Biometrics vs. chip/badge: a Berlin-Brandenburg labor court (LAG) ruled
--    employees do NOT have to accept a fingerprint-based time clock —
--    biometric data is "special category" data under GDPR Art. 9, legally
--    risky for this purpose. Sticking with RFID chip/badge (as you're doing)
--    avoids that whole problem — this schema assumes chip/badge, not
--    biometrics, throughout.
--
--  • Retention (Aufbewahrungspflicht): ArbZG requires records be kept at
--    least 2 years; if the data feeds payroll, tax/social-security rules
--    (§147 AO, §41 EStG) commonly require 6-10 years instead. Confirm the
--    right figure for your case with a Steuerberater, then enforce it with a
--    scheduled deletion job rather than deleting by hand.
--
--  • Betriebsrat (works council): if your company has one, introducing ANY
--    system capable of monitoring employee behavior — which a time clock
--    is — requires works-council co-determination under §87 Abs. 1 Nr. 6
--    BetrVG. This is a process/legal step, not a database one, but it needs
--    to happen before rollout.
--
--  • Data minimization: only store what attendance actually needs. Treat
--    raw_payload (jsonb) as a place for device metadata, not a dumping
--    ground — don't let a device vendor talk you into logging more than
--    "badge + timestamp" without a clear reason.
-- ============================================================================

-- Supabase usually has this on by default, but enabling it explicitly here
-- makes this script safe to run on a completely fresh project too.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) staff — the people being tracked. If you already have a "staff" table
--    (e.g. from the shift-scheduler tool), you can rename/merge into this one
--    instead of creating a duplicate — just make sure the columns line up.
-- ---------------------------------------------------------------------------
create table if not exists staff (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text,
  weekly_hours  numeric(5,2) default 38.5,   -- Vollzeit/Teilzeit/Minijob hours
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) badges — maps a physical card/chip/fob to a staff member. A person can
--    have more than one badge over time (lost card, replacement, etc.), so
--    this is a separate table rather than a column on staff.
-- ---------------------------------------------------------------------------
create table if not exists badges (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id) on delete cascade,
  badge_code    text not null unique,         -- the raw ID the reader reports
  issued_at     timestamptz not null default now(),
  revoked_at    timestamptz,                  -- null = currently active
  created_at    timestamptz not null default now()
);
create index if not exists idx_badges_staff on badges(staff_id);

-- ---------------------------------------------------------------------------
-- 3) attendance_events — the RAW log, one row per physical scan. Keep every
--    device's payload as-is in raw_payload (jsonb) so nothing is ever lost,
--    no matter which brand/model you end up buying.
--    - direction: 'in' | 'out' | 'unknown' — many cheap readers don't know
--      which direction it was; leave 'unknown' and let the pairing logic in
--      section (4) work it out from alternating scans instead.
-- ---------------------------------------------------------------------------
create table if not exists attendance_events (
  id            bigint generated always as identity primary key,
  badge_code    text not null,                -- raw code from the device
  staff_id      uuid references staff(id),     -- resolved via badges table (nullable: an
                                                -- unrecognized badge still gets logged, just
                                                -- unresolved, so nothing silently disappears)
  scanned_at    timestamptz not null,
  direction     text check (direction in ('in','out','unknown')) default 'unknown',
  device_id     text,                          -- which reader/door, if you have more than one
  raw_payload   jsonb,                         -- whatever extra the device sends
  created_at    timestamptz not null default now()
);
create index if not exists idx_events_staff_time on attendance_events(staff_id, scanned_at);
create index if not exists idx_events_badge_time on attendance_events(badge_code, scanned_at);

-- Auto-resolve staff_id from badge_code whenever a new event comes in, using
-- whichever badge assignment was active at the scan time.
create or replace function resolve_attendance_staff()
returns trigger as $$
begin
  if new.staff_id is null then
    select b.staff_id into new.staff_id
    from badges b
    where b.badge_code = new.badge_code
      and b.issued_at <= new.scanned_at
      and (b.revoked_at is null or b.revoked_at > new.scanned_at)
    order by b.issued_at desc
    limit 1;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_resolve_attendance_staff on attendance_events;
create trigger trg_resolve_attendance_staff
  before insert on attendance_events
  for each row execute function resolve_attendance_staff();

-- ---------------------------------------------------------------------------
-- 4) attendance_sessions — DERIVED work sessions (one check-in + its matching
--    check-out), computed from attendance_events. Recompute this any time
--    with the function below — it's safe to re-run, it clears and rebuilds.
-- ---------------------------------------------------------------------------
create table if not exists attendance_sessions (
  id            bigint generated always as identity primary key,
  staff_id      uuid not null references staff(id) on delete cascade,
  check_in      timestamptz not null,
  check_out     timestamptz,                   -- null = still clocked in / missing scan
  in_event_id   bigint references attendance_events(id),
  out_event_id  bigint references attendance_events(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_sessions_staff_day on attendance_sessions(staff_id, check_in);

-- Rebuilds attendance_sessions for one staff member over a date range, by
-- pairing consecutive events chronologically (first unmatched scan = in,
-- next one = out, and so on) — works whether or not the device reports
-- direction, since it just alternates.
create or replace function rebuild_attendance_sessions(p_staff_id uuid, p_from date, p_to date)
returns void as $$
declare
  ev record;
  pending_in timestamptz := null;
  pending_in_id bigint := null;
begin
  delete from attendance_sessions
  where staff_id = p_staff_id
    and check_in >= p_from and check_in < (p_to + interval '1 day');

  for ev in
    select id, scanned_at, direction
    from attendance_events
    where staff_id = p_staff_id
      and scanned_at >= p_from and scanned_at < (p_to + interval '1 day')
    order by scanned_at asc
  loop
    if pending_in is null then
      pending_in := ev.scanned_at;
      pending_in_id := ev.id;
    else
      insert into attendance_sessions (staff_id, check_in, check_out, in_event_id, out_event_id)
      values (p_staff_id, pending_in, ev.scanned_at, pending_in_id, ev.id);
      pending_in := null;
      pending_in_id := null;
    end if;
  end loop;

  -- leftover unmatched check-in (still clocked in, or a missing check-out scan)
  if pending_in is not null then
    insert into attendance_sessions (staff_id, check_in, check_out, in_event_id, out_event_id)
    values (p_staff_id, pending_in, null, pending_in_id, null);
  end if;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 4b) attendance_corrections — MANUAL fixes (e.g. a supervisor adjusting a
--     missed scan) must be auditable, never silent overwrites of raw device
--     data. German case law (BAG-Beschluss 1 ABR 22/21) expects the time-
--     recording system to be "objective, reliable, and accessible" — an
--     always-traceable correction trail is part of meeting that bar.
-- ---------------------------------------------------------------------------
create table if not exists attendance_corrections (
  id              bigint generated always as identity primary key,
  session_id      bigint references attendance_sessions(id) on delete set null,
  staff_id        uuid not null references staff(id) on delete cascade,
  field           text not null check (field in ('check_in','check_out')),
  old_value       timestamptz,
  new_value       timestamptz not null,
  reason          text not null,              -- required: why the correction was made
  corrected_by    text not null,               -- name/ID of whoever made the change
  corrected_at    timestamptz not null default now()
);
create index if not exists idx_corrections_staff on attendance_corrections(staff_id);

-- ---------------------------------------------------------------------------
-- 5) scheduled_shifts — the PLANNED shifts, mirroring what the shift-scheduler
--    tool generates. Export/import a month's schedule into this table (e.g.
--    via the "copy as text" output, reshaped into rows) to enable comparison.
-- ---------------------------------------------------------------------------
create table if not exists scheduled_shifts (
  id                bigint generated always as identity primary key,
  staff_id          uuid not null references staff(id) on delete cascade,
  shift_date        date not null,
  shift_key         text not null,             -- e.g. 'F','S','N','M','B' or any custom key
  shift_label       text,                       -- e.g. 'Frühdienst'
  planned_start     timestamptz not null,
  planned_end       timestamptz not null,
  created_at        timestamptz not null default now(),
  unique (staff_id, shift_date, shift_key)
);
create index if not exists idx_shifts_staff_date on scheduled_shifts(staff_id, shift_date);

-- ---------------------------------------------------------------------------
-- 6) attendance_variance — a VIEW (not a stored table) comparing each planned
--    shift against the closest actual attendance session for that person and
--    day, flagging lateness / early departure / no-shows automatically.
--    Being a view means it's always fresh — no separate recompute step needed.
-- ---------------------------------------------------------------------------
create or replace view attendance_variance as
select
  s.id                                   as shift_id,
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
) a on true;

-- ---------------------------------------------------------------------------
-- Row Level Security — Supabase enables RLS-friendly setups by default.
-- Uncomment and adjust once you've decided who (which Supabase auth roles)
-- should be able to read/write each table. Left off for now so you can test
-- freely with the default Supabase API key during setup.
-- ---------------------------------------------------------------------------
-- alter table staff enable row level security;
-- alter table badges enable row level security;
-- alter table attendance_events enable row level security;
-- alter table attendance_sessions enable row level security;
-- alter table attendance_corrections enable row level security;
-- alter table scheduled_shifts enable row level security;


-- ===================== 2-multi-tenant-schema.sql =====================
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


-- ===================== 3-approval-archive-schema.sql =====================
-- ============================================================================
-- PART 3 — Freigabe durch die Inhaber + unveränderliches Archiv mit Aufbewahrungsfrist
-- ============================================================================
-- Run ONCE in Supabase -> SQL Editor, after multi-tenant-schema.sql (part 2).
--
-- What this adds:
--   * organizations.require_approval  (default true)  supervisors must submit, owners approve
--   * organizations.retention_years   (default 6)     how long a month's plan is archived
--   * schedule_months      one row per company + month with its status: draft / pending / published
--   * schedule_versions    immutable archive: every submission, rejection and publication is stored as a
--                          snapshot (who, when, what) with a "keep until" date
--   * save_draft(...)      saves a whole draft month in ONE transaction (instead of many single calls)
--   * submit_month / reject_month / publish_month / set_org_settings / purge_expired_versions
--
-- Retention (see the notes in the chat): 2 years is the legal minimum for working-time records
-- (§ 16 ArbZG, § 17 MiLoG); payroll-relevant documents are 6 years (§ 41 EStG, § 147 AO). The default
-- here is 6 years, counted to 31 December of the sixth year after the plan's year. It is NOT kept
-- forever on purpose (data protection: storage limitation). Deleting is always a manual owner action.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) Company settings
-- ---------------------------------------------------------------------------
alter table organizations add column if not exists require_approval boolean not null default true;
alter table organizations add column if not exists retention_years int not null default 6;
alter table organizations drop constraint if exists organizations_retention_check;
alter table organizations add constraint organizations_retention_check check (retention_years between 2 and 10);


-- ---------------------------------------------------------------------------
-- 2) Status per month + immutable archive
-- ---------------------------------------------------------------------------
create table if not exists schedule_months (
  org_id          uuid not null references organizations(id) on delete cascade,
  year            int  not null,
  month           int  not null check (month between 1 and 12),
  status          text not null default 'draft' check (status in ('draft', 'pending', 'published')),
  has_newer_draft boolean not null default false,   -- published, but a newer draft exists
  submitted_by    uuid references auth.users(id),
  submitted_at    timestamptz,
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  published_at    timestamptz,
  review_note     text,                              -- reason of the last rejection
  updated_at      timestamptz not null default now(),
  primary key (org_id, year, month)
);

create table if not exists schedule_versions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  year         int  not null,
  month        int  not null check (month between 1 and 12),
  event        text not null check (event in ('submitted', 'rejected', 'published')),
  actor        uuid references auth.users(id),
  actor_email  text,
  note         text,
  snapshot     jsonb not null,                       -- { defs: [...], shifts: [...] } as it was at that moment
  keep_until   date  not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_versions_org_month on schedule_versions (org_id, year, month, created_at);


-- ---------------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------------
create or replace function is_org_owner(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join organizations g on g.id = m.org_id and g.active
    where m.user_id = auth.uid() and m.org_id = o and m.role = 'owner'
  )
$$;
revoke all on function is_org_owner(uuid) from public, anon;
grant execute on function is_org_owner(uuid) to authenticated;

-- A plain-data picture of one month in one status (used for the archive).
create or replace function plan_snapshot(p_org uuid, p_year int, p_month int, p_status text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'defs', coalesce((
      select jsonb_agg(jsonb_build_object('key', d.key, 'label', d.label, 'start', d.start_time, 'end', d.end_time, 'sort', d.sort_order) order by d.sort_order)
      from shift_definitions d where d.org_id = p_org and d.active
    ), '[]'::jsonb),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object('staff_id', s.staff_id, 'name', st.name, 'date', s.shift_date, 'key', s.shift_key, 'label', s.shift_label) order by s.shift_date, s.shift_key, st.name)
      from scheduled_shifts s join staff st on st.id = s.staff_id
      where s.org_id = p_org and s.status = p_status
        and s.shift_date >= make_date(p_year, p_month, 1)
        and s.shift_date <  (make_date(p_year, p_month, 1) + interval '1 month')::date
    ), '[]'::jsonb)
  )
$$;
revoke all on function plan_snapshot(uuid, int, int, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4) Workflow functions (all checks happen here, inside the database)
-- ---------------------------------------------------------------------------

-- Save a whole draft month atomically. p_shifts = [{staff_id, date, key, label, start, end}, ...]
create or replace function save_draft(p_org uuid, p_year int, p_month int, p_shifts jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  d_from date := make_date(p_year, p_month, 1);
  d_to   date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  n int;
begin
  if not (is_org_supervisor(p_org) and org_has_planner(p_org)) then
    raise exception 'Nur die Leitung einer Firma mit Dienstplaner darf Pläne speichern';
  end if;
  if jsonb_typeof(p_shifts) is distinct from 'array' then
    raise exception 'Ungültige Daten';
  end if;

  delete from scheduled_shifts
  where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;

  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status)
  select p_org, (x->>'staff_id')::uuid, (x->>'date')::date, x->>'key', x->>'label',
         (x->>'start')::timestamptz, (x->>'end')::timestamptz, 'draft'
  from jsonb_array_elements(p_shifts) x
  where (x->>'date')::date >= d_from and (x->>'date')::date < d_to;
  get diagnostics n = row_count;

  insert into schedule_months (org_id, year, month, status, has_newer_draft, updated_at)
  values (p_org, p_year, p_month, 'draft', false, now())
  on conflict (org_id, year, month) do update set
    -- a pending submission is withdrawn when the draft changes; a published month keeps being published
    status          = case when schedule_months.status = 'published' then 'published' else 'draft' end,
    has_newer_draft = (schedule_months.status = 'published'),
    updated_at      = now();
  return n;
end;
$$;

create or replace function submit_month(p_org uuid, p_year int, p_month int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_keep int; v_n int;
begin
  if not (is_org_supervisor(p_org) and org_has_planner(p_org)) then
    raise exception 'Nur die Leitung einer Firma mit Dienstplaner darf Pläne einreichen';
  end if;
  select count(*) into v_n from scheduled_shifts
   where org_id = p_org and status = 'draft'
     and shift_date >= make_date(p_year, p_month, 1) and shift_date < (make_date(p_year, p_month, 1) + interval '1 month')::date;
  if v_n = 0 then raise exception 'Für diesen Monat gibt es keinen Entwurf'; end if;
  select retention_years into v_keep from organizations where id = p_org;

  insert into schedule_months (org_id, year, month, status, submitted_by, submitted_at, review_note, updated_at)
  values (p_org, p_year, p_month, 'pending', auth.uid(), now(), null, now())
  on conflict (org_id, year, month) do update set
    status = 'pending', submitted_by = auth.uid(), submitted_at = now(), review_note = null, updated_at = now();

  insert into schedule_versions (org_id, year, month, event, actor, actor_email, snapshot, keep_until)
  values (p_org, p_year, p_month, 'submitted', auth.uid(), (select email from auth.users where id = auth.uid()),
          plan_snapshot(p_org, p_year, p_month, 'draft'), make_date(p_year + v_keep, 12, 31));
end;
$$;

create or replace function reject_month(p_org uuid, p_year int, p_month int, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_keep int; v_status text;
begin
  if not (is_org_owner(p_org) and org_has_planner(p_org)) then
    raise exception 'Nur die Inhaber dürfen Pläne zurückweisen';
  end if;
  select status into v_status from schedule_months where org_id = p_org and year = p_year and month = p_month;
  if v_status is distinct from 'pending' then raise exception 'Dieser Monat wartet nicht auf Freigabe'; end if;
  select retention_years into v_keep from organizations where id = p_org;

  update schedule_months set status = 'draft', review_note = nullif(trim(p_note), ''), updated_at = now()
   where org_id = p_org and year = p_year and month = p_month;

  insert into schedule_versions (org_id, year, month, event, actor, actor_email, note, snapshot, keep_until)
  values (p_org, p_year, p_month, 'rejected', auth.uid(), (select email from auth.users where id = auth.uid()), nullif(trim(p_note), ''),
          plan_snapshot(p_org, p_year, p_month, 'draft'), make_date(p_year + v_keep, 12, 31));
end;
$$;

-- Publish = what employees see. Owners always may; supervisors only if the company does not require approval.
-- (This replaces the earlier publish_month with the same name and arguments.)
create or replace function publish_month(p_org uuid, p_year int, p_month int)
returns void language plpgsql security definer set search_path = public as $$
declare
  d_from date := make_date(p_year, p_month, 1);
  d_to   date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  v_role text; v_req boolean; v_keep int; v_n int;
begin
  if not org_has_planner(p_org) then
    raise exception 'Diese Firma hat keinen Dienstplaner';
  end if;
  select m.role into v_role from memberships m where m.user_id = auth.uid() and m.org_id = p_org;
  select require_approval, retention_years into v_req, v_keep from organizations where id = p_org and active;
  if v_role is null or v_role = 'employee' then
    raise exception 'Nur die Leitung darf veröffentlichen';
  end if;
  if v_role = 'supervisor' and v_req then
    raise exception 'Die Freigabe muss durch die Inhaber erfolgen. Bitte zur Freigabe einreichen.';
  end if;

  select count(*) into v_n from scheduled_shifts where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;
  if v_n = 0 then raise exception 'Für diesen Monat gibt es keinen Entwurf'; end if;

  delete from scheduled_shifts where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to;
  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status, published_at)
  select org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, 'published', now()
  from scheduled_shifts
  where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;

  insert into schedule_months (org_id, year, month, status, has_newer_draft, approved_by, approved_at, published_at, review_note, updated_at)
  values (p_org, p_year, p_month, 'published', false, auth.uid(), now(), now(), null, now())
  on conflict (org_id, year, month) do update set
    status = 'published', has_newer_draft = false, approved_by = auth.uid(), approved_at = now(),
    published_at = now(), review_note = null, updated_at = now();

  insert into schedule_versions (org_id, year, month, event, actor, actor_email, snapshot, keep_until)
  values (p_org, p_year, p_month, 'published', auth.uid(), (select email from auth.users where id = auth.uid()),
          plan_snapshot(p_org, p_year, p_month, 'published'), make_date(p_year + v_keep, 12, 31));
end;
$$;

-- Owners change the two company settings (they cannot touch anything else of the organization row).
create or replace function set_org_settings(p_org uuid, p_require_approval boolean, p_retention_years int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_owner(p_org) then raise exception 'Nur die Inhaber dürfen die Einstellungen ändern'; end if;
  if p_retention_years < 2 or p_retention_years > 10 then raise exception 'Aufbewahrung: 2 bis 10 Jahre'; end if;
  update organizations set require_approval = p_require_approval, retention_years = p_retention_years where id = p_org;
end;
$$;

-- Manual clean-up after the retention period: removes archive entries and the stored plans whose
-- "keep until" date has passed. Returns the number of removed rows. Owners only.
create or replace function purge_expired_versions(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_keep int; a int; b int; c int;
begin
  if not is_org_owner(p_org) then raise exception 'Nur die Inhaber dürfen löschen'; end if;
  select retention_years into v_keep from organizations where id = p_org;

  delete from schedule_versions where org_id = p_org and keep_until < current_date;
  get diagnostics a = row_count;
  delete from scheduled_shifts
   where org_id = p_org and make_date(extract(year from shift_date)::int + v_keep, 12, 31) < current_date;
  get diagnostics b = row_count;
  delete from schedule_months
   where org_id = p_org and make_date(year + v_keep, 12, 31) < current_date;
  get diagnostics c = row_count;
  return a + b + c;
end;
$$;

revoke all on function save_draft(uuid, int, int, jsonb) from public, anon;
revoke all on function submit_month(uuid, int, int) from public, anon;
revoke all on function reject_month(uuid, int, int, text) from public, anon;
revoke all on function publish_month(uuid, int, int) from public, anon;
revoke all on function set_org_settings(uuid, boolean, int) from public, anon;
revoke all on function purge_expired_versions(uuid) from public, anon;
grant execute on function save_draft(uuid, int, int, jsonb) to authenticated;
grant execute on function submit_month(uuid, int, int) to authenticated;
grant execute on function reject_month(uuid, int, int, text) to authenticated;
grant execute on function publish_month(uuid, int, int) to authenticated;
grant execute on function set_org_settings(uuid, boolean, int) to authenticated;
grant execute on function purge_expired_versions(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 5) Row Level Security: bosses read; NOBODY writes these two tables directly (only the functions above)
-- ---------------------------------------------------------------------------
alter table schedule_months   enable row level security;
alter table schedule_versions enable row level security;

drop policy if exists mt_smonths_select on schedule_months;
create policy mt_smonths_select on schedule_months for select to authenticated
  using (is_org_supervisor(org_id));

drop policy if exists mt_sversions_select on schedule_versions;
create policy mt_sversions_select on schedule_versions for select to authenticated
  using (is_org_supervisor(org_id));


-- ---------------------------------------------------------------------------
-- 6) Fill the status table for months that were already saved before this script existed
-- ---------------------------------------------------------------------------
insert into schedule_months (org_id, year, month, status, published_at)
select org_id, extract(year from shift_date)::int, extract(month from shift_date)::int, 'published', now()
from scheduled_shifts where status = 'published'
group by org_id, extract(year from shift_date), extract(month from shift_date)
on conflict (org_id, year, month) do nothing;

insert into schedule_months (org_id, year, month, status)
select org_id, extract(year from shift_date)::int, extract(month from shift_date)::int, 'draft'
from scheduled_shifts where status = 'draft'
group by org_id, extract(year from shift_date), extract(month from shift_date)
on conflict (org_id, year, month) do nothing;


-- ---------------------------------------------------------------------------
-- 7) OPTIONAL — test the two-person approval (a Leitung submits, the Inhaber approves)
-- ---------------------------------------------------------------------------
-- a) Supabase -> Authentication -> Users -> Add user: leitung@test.de (Auto Confirm), copy its User UID.
-- b) insert into memberships (user_id, org_id, role)
--    select '<UID-von-leitung>', id, 'supervisor' from organizations where name = 'Testfirma A (Labor)';
-- c) Log in as leitung@test.de: the planner offers "Zur Freigabe einreichen" (not "Veröffentlichen").
--    Log in as a-chef@test.de (Inhaber): open /freigaben, review and "Freigeben" or "Zurückweisen".
-- To switch the approval requirement off/on for a company:
--    update organizations set require_approval = false where name = 'Testfirma A (Labor)';
-- ---------------------------------------------------------------------------


-- ===================== 4-edit-month-schema.sql =====================
-- ============================================================================
-- PART 4 — Gespeicherten Monat wieder bearbeiten (z. B. Krankheit mitten im Monat)
-- ============================================================================
-- Run ONCE in Supabase -> SQL Editor, AFTER approval-archive-schema.sql (part 3).
--
-- What this adds:
--   * schedule_months.holidays      the holiday days of the month, so a saved plan can be reopened exactly
--   * schedule_months.change_note   the reason of the last submission ("Krankheit Anna 12.-15.")
--   * save_draft(..., p_holidays)   also stores the holidays
--   * submit_month(..., p_note)     stores the reason (shown to the Inhaber and in the archive)
--   * publish_month(..., p_note)    stores/keeps the reason in the archive entry
-- The old versions of these three functions are removed first (otherwise the database could not
-- decide which one to call). Existing data is not touched.
-- ============================================================================

alter table schedule_months add column if not exists holidays int[] not null default '{}';
alter table schedule_months add column if not exists change_note text;

drop function if exists save_draft(uuid, int, int, jsonb);
drop function if exists submit_month(uuid, int, int);
drop function if exists publish_month(uuid, int, int);


-- Save a whole draft month atomically (now with the holidays of the month)
create or replace function save_draft(p_org uuid, p_year int, p_month int, p_shifts jsonb, p_holidays int[] default '{}')
returns int language plpgsql security definer set search_path = public as $$
declare
  d_from date := make_date(p_year, p_month, 1);
  d_to   date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  n int;
begin
  if not (is_org_supervisor(p_org) and org_has_planner(p_org)) then
    raise exception 'Nur die Leitung einer Firma mit Dienstplaner darf Pläne speichern';
  end if;
  if jsonb_typeof(p_shifts) is distinct from 'array' then
    raise exception 'Ungültige Daten';
  end if;

  delete from scheduled_shifts
  where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;

  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status)
  select p_org, (x->>'staff_id')::uuid, (x->>'date')::date, x->>'key', x->>'label',
         (x->>'start')::timestamptz, (x->>'end')::timestamptz, 'draft'
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
end;
$$;

-- Submit for approval, with an optional reason
create or replace function submit_month(p_org uuid, p_year int, p_month int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_keep int; v_n int; v_note text := nullif(trim(p_note), '');
begin
  if not (is_org_supervisor(p_org) and org_has_planner(p_org)) then
    raise exception 'Nur die Leitung einer Firma mit Dienstplaner darf Pläne einreichen';
  end if;
  select count(*) into v_n from scheduled_shifts
   where org_id = p_org and status = 'draft'
     and shift_date >= make_date(p_year, p_month, 1) and shift_date < (make_date(p_year, p_month, 1) + interval '1 month')::date;
  if v_n = 0 then raise exception 'Für diesen Monat gibt es keinen Entwurf'; end if;
  select retention_years into v_keep from organizations where id = p_org;

  insert into schedule_months (org_id, year, month, status, submitted_by, submitted_at, review_note, change_note, updated_at)
  values (p_org, p_year, p_month, 'pending', auth.uid(), now(), null, v_note, now())
  on conflict (org_id, year, month) do update set
    status = 'pending', submitted_by = auth.uid(), submitted_at = now(), review_note = null, change_note = v_note, updated_at = now();

  insert into schedule_versions (org_id, year, month, event, actor, actor_email, note, snapshot, keep_until)
  values (p_org, p_year, p_month, 'submitted', auth.uid(), (select email from auth.users where id = auth.uid()), v_note,
          plan_snapshot(p_org, p_year, p_month, 'draft'), make_date(p_year + v_keep, 12, 31));
end;
$$;

-- Publish. The reason is taken from the submission if none is given (Inhaber approving a Leitung's change).
create or replace function publish_month(p_org uuid, p_year int, p_month int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  d_from date := make_date(p_year, p_month, 1);
  d_to   date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  v_role text; v_req boolean; v_keep int; v_n int; v_note text;
begin
  if not org_has_planner(p_org) then
    raise exception 'Diese Firma hat keinen Dienstplaner';
  end if;
  select m.role into v_role from memberships m where m.user_id = auth.uid() and m.org_id = p_org;
  select require_approval, retention_years into v_req, v_keep from organizations where id = p_org and active;
  if v_role is null or v_role = 'employee' then
    raise exception 'Nur die Leitung darf veröffentlichen';
  end if;
  if v_role = 'supervisor' and v_req then
    raise exception 'Die Freigabe muss durch die Inhaber erfolgen. Bitte zur Freigabe einreichen.';
  end if;

  select count(*) into v_n from scheduled_shifts where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;
  if v_n = 0 then raise exception 'Für diesen Monat gibt es keinen Entwurf'; end if;

  v_note := coalesce(nullif(trim(p_note), ''),
                     (select change_note from schedule_months where org_id = p_org and year = p_year and month = p_month));

  delete from scheduled_shifts where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to;
  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status, published_at)
  select org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, 'published', now()
  from scheduled_shifts
  where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;

  insert into schedule_months (org_id, year, month, status, has_newer_draft, approved_by, approved_at, published_at, review_note, change_note, updated_at)
  values (p_org, p_year, p_month, 'published', false, auth.uid(), now(), now(), null, v_note, now())
  on conflict (org_id, year, month) do update set
    status = 'published', has_newer_draft = false, approved_by = auth.uid(), approved_at = now(),
    published_at = now(), review_note = null, change_note = v_note, updated_at = now();

  insert into schedule_versions (org_id, year, month, event, actor, actor_email, note, snapshot, keep_until)
  values (p_org, p_year, p_month, 'published', auth.uid(), (select email from auth.users where id = auth.uid()), v_note,
          plan_snapshot(p_org, p_year, p_month, 'published'), make_date(p_year + v_keep, 12, 31));
end;
$$;

revoke all on function save_draft(uuid, int, int, jsonb, int[]) from public, anon;
revoke all on function submit_month(uuid, int, int, text) from public, anon;
revoke all on function publish_month(uuid, int, int, text) from public, anon;
grant execute on function save_draft(uuid, int, int, jsonb, int[]) to authenticated;
grant execute on function submit_month(uuid, int, int, text) to authenticated;
grant execute on function publish_month(uuid, int, int, text) to authenticated;


-- ===================== 5-changes-schema.sql =====================
-- ============================================================================
-- PART 5 — Änderungen nach der Veröffentlichung nachvollziehen + Einspringer für die Leitung
-- ============================================================================
-- Run ONCE in Supabase -> SQL Editor, AFTER edit-month-schema.sql (part 4).
--
-- When an already published month is published AGAIN, the new version is compared with the one the
-- employees had seen. Every difference is stored in shift_changes:
--   cover      somebody takes over a shift of somebody else   ("Ben für Anna")  -> counts as Einspringen
--   extra      somebody gets an additional shift                                  -> counts as Einspringen
--   cancelled  somebody's shift is removed without replacement
-- The first publication of a month is not a change. Nothing is changed automatically; this only records
-- what the Leitung/Inhaber changed by hand.
--
-- Privacy: employees only see THEIR OWN entries and only "which shift changed" (view my_shift_changes) —
-- never who they replaced and never the reason. The full list is for the Leitung/Inhaber.
-- ============================================================================

create table if not exists shift_changes (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  change_date       date not null,
  shift_key         text not null,
  kind              text not null check (kind in ('cover', 'extra', 'cancelled')),
  staff_id          uuid not null,                       -- who got / lost the shift
  replaced_staff_id uuid,                                -- cover only: whose shift was taken over
  note              text,                                -- the reason given when publishing
  published_at      timestamptz not null default now(),
  manager_status    text not null default 'open' check (manager_status in ('open', 'done')),
  manager_note      text,
  status_by         uuid references auth.users(id),
  status_at         timestamptz,
  foreign key (staff_id, org_id) references staff (id, org_id) on delete cascade,
  foreign key (replaced_staff_id, org_id) references staff (id, org_id) on delete set null (replaced_staff_id)
);
create index if not exists idx_changes_org_date on shift_changes (org_id, change_date);

alter table shift_changes enable row level security;
drop policy if exists mt_changes_select on shift_changes;
create policy mt_changes_select on shift_changes for select to authenticated
  using (is_org_supervisor(org_id));
-- no insert/update/delete policy: written only by the functions below

-- What an employee may see about changes: only own entries, only date + shift + kind
-- The person who loses a shift to a replacement sees it as "cancelled" (not who replaced them, not why).
create or replace view my_shift_changes as
select c.id, c.org_id, c.change_date, c.shift_key,
       case when c.replaced_staff_id = my_staff_id(c.org_id) then 'cancelled' else c.kind end as kind,
       c.published_at
from shift_changes c
where (c.staff_id = my_staff_id(c.org_id) or c.replaced_staff_id = my_staff_id(c.org_id))
  and is_org_member(c.org_id)
  and org_has_product(c.org_id, 'employee_app');
revoke all on my_shift_changes from anon;
grant select on my_shift_changes to authenticated;


-- Publish (same rules as before) + record the differences to the previously published version
create or replace function publish_month(p_org uuid, p_year int, p_month int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  d_from date := make_date(p_year, p_month, 1);
  d_to   date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  v_role text; v_req boolean; v_keep int; v_n int; v_note text; v_had boolean;
begin
  if not org_has_planner(p_org) then
    raise exception 'Diese Firma hat keinen Dienstplaner';
  end if;
  select m.role into v_role from memberships m where m.user_id = auth.uid() and m.org_id = p_org;
  select require_approval, retention_years into v_req, v_keep from organizations where id = p_org and active;
  if v_role is null or v_role = 'employee' then
    raise exception 'Nur die Leitung darf veröffentlichen';
  end if;
  if v_role = 'supervisor' and v_req then
    raise exception 'Die Freigabe muss durch die Inhaber erfolgen. Bitte zur Freigabe einreichen.';
  end if;

  select count(*) into v_n from scheduled_shifts where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;
  if v_n = 0 then raise exception 'Für diesen Monat gibt es keinen Entwurf'; end if;

  v_note := coalesce(nullif(trim(p_note), ''),
                     (select change_note from schedule_months where org_id = p_org and year = p_year and month = p_month));

  select exists (select 1 from scheduled_shifts where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to) into v_had;

  -- differences to what the employees saw until now (only when there was a published version)
  if v_had then
    insert into shift_changes (org_id, change_date, shift_key, kind, staff_id, replaced_staff_id, note, published_at)
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
    select p_org,
           coalesce(a.shift_date, r.shift_date),
           coalesce(a.shift_key, r.shift_key),
           case when a.staff_id is not null and r.staff_id is not null then 'cover'
                when a.staff_id is not null then 'extra'
                else 'cancelled' end,
           coalesce(a.staff_id, r.staff_id),
           case when a.staff_id is not null then r.staff_id else null end,
           v_note, now()
    from added a
    full outer join removed r
      on a.shift_date = r.shift_date and a.shift_key = r.shift_key and a.rn = r.rn;
  end if;

  delete from scheduled_shifts where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to;
  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status, published_at)
  select org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, 'published', now()
  from scheduled_shifts
  where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;

  insert into schedule_months (org_id, year, month, status, has_newer_draft, approved_by, approved_at, published_at, review_note, change_note, updated_at)
  values (p_org, p_year, p_month, 'published', false, auth.uid(), now(), now(), null, v_note, now())
  on conflict (org_id, year, month) do update set
    status = 'published', has_newer_draft = false, approved_by = auth.uid(), approved_at = now(),
    published_at = now(), review_note = null, change_note = v_note, updated_at = now();

  insert into schedule_versions (org_id, year, month, event, actor, actor_email, note, snapshot, keep_until)
  values (p_org, p_year, p_month, 'published', auth.uid(), (select email from auth.users where id = auth.uid()), v_note,
          plan_snapshot(p_org, p_year, p_month, 'published'), make_date(p_year + v_keep, 12, 31));
end;
$$;


-- The Leitung marks an entry as taken into account (e.g. a bonus was decided) or opens it again
create or replace function set_change_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from shift_changes where id = p_id;
  if v_org is null or not is_org_supervisor(v_org) then
    raise exception 'Nur die Leitung darf Einträge bearbeiten';
  end if;
  if p_status not in ('open', 'done') then raise exception 'Ungültiger Status'; end if;
  update shift_changes
     set manager_status = p_status, manager_note = nullif(trim(p_note), ''), status_by = auth.uid(), status_at = now()
   where id = p_id;
end;
$$;

-- Manual clean-up after the retention period now also covers the change records
create or replace function purge_expired_versions(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_keep int; a int; b int; c int; d int;
begin
  if not is_org_owner(p_org) then raise exception 'Nur die Inhaber dürfen löschen'; end if;
  select retention_years into v_keep from organizations where id = p_org;

  delete from schedule_versions where org_id = p_org and keep_until < current_date;
  get diagnostics a = row_count;
  delete from scheduled_shifts
   where org_id = p_org and make_date(extract(year from shift_date)::int + v_keep, 12, 31) < current_date;
  get diagnostics b = row_count;
  delete from schedule_months
   where org_id = p_org and make_date(year + v_keep, 12, 31) < current_date;
  get diagnostics c = row_count;
  delete from shift_changes
   where org_id = p_org and make_date(extract(year from change_date)::int + v_keep, 12, 31) < current_date;
  get diagnostics d = row_count;
  return a + b + c + d;
end;
$$;

revoke all on function publish_month(uuid, int, int, text) from public, anon;
revoke all on function set_change_status(uuid, text, text) from public, anon;
revoke all on function purge_expired_versions(uuid) from public, anon;
grant execute on function publish_month(uuid, int, int, text) to authenticated;
grant execute on function set_change_status(uuid, text, text) to authenticated;
grant execute on function purge_expired_versions(uuid) to authenticated;


-- ===================== 6-corrections-schema.sql =====================
-- ============================================================================
-- PART 6 — Fehler korrigieren: Einträge stornieren, Rückgängig machen ohne falsche Einspringer
-- ============================================================================
-- Run ONCE in Supabase -> SQL Editor, AFTER changes-schema.sql (part 5).
--
-- Problem solved: somebody replaces the wrong person, publishes, notices the mistake and changes it back.
-- Without this script that would leave TWO entries ("Ben für Anna" and "Anna für Ben"), both open, and
-- Ben would get a Einspringen that never happened.
--
-- What this adds (nothing is ever deleted; every step stays in the history):
--   1. manager_status 'void'  An entry can be marked "Irrtum / Storno" with a reason. Voided entries are
--                             not counted, not shown as open, and employees no longer see a marker for them.
--                             The Leitung can make an entry valid again.
--   2. Automatic storno       When a publication exactly REVERSES a change whose shift has not happened yet
--                             (same day, same shift: Ben-for-Anna is followed by Anna-for-Ben, an extra shift
--                             is removed again, a cancelled shift is given back), the earlier entry is voided
--                             automatically ("automatisch storniert") and no new entry is created.
--                             Shifts in the past are never voided automatically — that stays the decision of
--                             the Leitung, because the person may really have worked.
-- ============================================================================

alter table shift_changes add column if not exists void_auto boolean not null default false;
alter table shift_changes add column if not exists voided_at timestamptz;
alter table shift_changes add column if not exists voided_by uuid references auth.users(id);

alter table shift_changes drop constraint if exists shift_changes_manager_status_check;
alter table shift_changes add constraint shift_changes_manager_status_check
  check (manager_status in ('open', 'done', 'void'));


-- Employees never see voided entries
create or replace view my_shift_changes as
select c.id, c.org_id, c.change_date, c.shift_key,
       case when c.replaced_staff_id = my_staff_id(c.org_id) then 'cancelled' else c.kind end as kind,
       c.published_at
from shift_changes c
where (c.staff_id = my_staff_id(c.org_id) or c.replaced_staff_id = my_staff_id(c.org_id))
  and c.manager_status <> 'void'
  and is_org_member(c.org_id)
  and org_has_product(c.org_id, 'employee_app');
revoke all on my_shift_changes from anon;
grant select on my_shift_changes to authenticated;


-- Leitung: open / done / void (void needs a reason)
create or replace function set_change_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from shift_changes where id = p_id;
  if v_org is null or not is_org_supervisor(v_org) then
    raise exception 'Nur die Leitung darf Einträge bearbeiten';
  end if;
  if p_status not in ('open', 'done', 'void') then raise exception 'Ungültiger Status'; end if;
  if p_status = 'void' and nullif(trim(p_note), '') is null then
    raise exception 'Bitte einen Grund für das Stornieren angeben';
  end if;
  update shift_changes
     set manager_status = p_status,
         manager_note   = case when p_status = 'open' and nullif(trim(p_note), '') is null then manager_note else nullif(trim(p_note), '') end,
         status_by      = auth.uid(),
         status_at      = now(),
         voided_at      = case when p_status = 'void' then now() else null end,
         voided_by      = case when p_status = 'void' then auth.uid() else null end,
         void_auto      = false
   where id = p_id;
end;
$$;


-- Publish: same rules as before; changes that exactly undo an earlier (not yet happened) change void that entry
create or replace function publish_month(p_org uuid, p_year int, p_month int, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  d_from date := make_date(p_year, p_month, 1);
  d_to   date := (make_date(p_year, p_month, 1) + interval '1 month')::date;
  v_role text; v_req boolean; v_keep int; v_n int; v_note text; v_had boolean;
  rec record; v_old uuid;
begin
  if not org_has_planner(p_org) then
    raise exception 'Diese Firma hat keinen Dienstplaner';
  end if;
  select m.role into v_role from memberships m where m.user_id = auth.uid() and m.org_id = p_org;
  select require_approval, retention_years into v_req, v_keep from organizations where id = p_org and active;
  if v_role is null or v_role = 'employee' then
    raise exception 'Nur die Leitung darf veröffentlichen';
  end if;
  if v_role = 'supervisor' and v_req then
    raise exception 'Die Freigabe muss durch die Inhaber erfolgen. Bitte zur Freigabe einreichen.';
  end if;

  select count(*) into v_n from scheduled_shifts where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;
  if v_n = 0 then raise exception 'Für diesen Monat gibt es keinen Entwurf'; end if;

  v_note := coalesce(nullif(trim(p_note), ''),
                     (select change_note from schedule_months where org_id = p_org and year = p_year and month = p_month));

  select exists (select 1 from scheduled_shifts where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to) into v_had;

  if v_had then
    -- the differences to what the employees saw until now
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
      -- is this exactly the opposite of an earlier, still valid entry for a shift that has not happened yet?
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
        insert into shift_changes (org_id, change_date, shift_key, kind, staff_id, replaced_staff_id, note, published_at)
        values (p_org, rec.change_date, rec.shift_key, rec.kind, rec.staff_id, rec.replaced_staff_id, v_note, now());
      end if;
    end loop;
  end if;

  delete from scheduled_shifts where org_id = p_org and status = 'published' and shift_date >= d_from and shift_date < d_to;
  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status, published_at)
  select org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, 'published', now()
  from scheduled_shifts
  where org_id = p_org and status = 'draft' and shift_date >= d_from and shift_date < d_to;

  insert into schedule_months (org_id, year, month, status, has_newer_draft, approved_by, approved_at, published_at, review_note, change_note, updated_at)
  values (p_org, p_year, p_month, 'published', false, auth.uid(), now(), now(), null, v_note, now())
  on conflict (org_id, year, month) do update set
    status = 'published', has_newer_draft = false, approved_by = auth.uid(), approved_at = now(),
    published_at = now(), review_note = null, change_note = v_note, updated_at = now();

  insert into schedule_versions (org_id, year, month, event, actor, actor_email, note, snapshot, keep_until)
  values (p_org, p_year, p_month, 'published', auth.uid(), (select email from auth.users where id = auth.uid()), v_note,
          plan_snapshot(p_org, p_year, p_month, 'published'), make_date(p_year + v_keep, 12, 31));
end;
$$;

revoke all on function publish_month(uuid, int, int, text) from public, anon;
revoke all on function set_change_status(uuid, text, text) from public, anon;
grant execute on function publish_month(uuid, int, int, text) to authenticated;
grant execute on function set_change_status(uuid, text, text) to authenticated;


-- ===================== 7-normal-changes-schema.sql =====================
-- ============================================================================
-- PART 7 — Normale Planänderung (kein Einspringen)
-- ============================================================================
-- Run ONCE in Supabase -> SQL Editor, AFTER corrections-schema.sql (part 6).
--
-- Problem solved: you plan November in October and change it two days later. That is ordinary planning,
-- not somebody stepping in at short notice, so nobody should be recorded as "Einspringer".
--
-- Two ways a change becomes a "normal" change (status 'normal': kept in the history, shown to the
-- employee as "geändert", but NOT counted as Einspringen and never "offen" for the Leitung):
--   1. Lead time    The change is published MORE than N days before the shift. N is a company setting
--                   (organizations.short_notice_days, default 7). Only changes up to N days before the
--                   shift count as short notice. What counts as "kurzfristig" is your company policy
--                   (e.g. a Betriebsvereinbarung) — set N accordingly.
--   2. Manual flag  The Leitung ticks "Normale Planänderung / Tausch (kein Einspringen)" when submitting
--                   or publishing (for example a swap both people agreed to, even though it is close to
--                   the date).
-- The Leitung can always change an entry afterwards: "Normale Änderung" <-> "Als Einspringen zählen".
-- ============================================================================

alter table organizations add column if not exists short_notice_days int not null default 7;
alter table organizations drop constraint if exists organizations_short_notice_check;
alter table organizations add constraint organizations_short_notice_check check (short_notice_days between 0 and 60);

alter table schedule_months add column if not exists change_normal boolean not null default false;

alter table shift_changes add column if not exists normal_auto boolean not null default false;  -- 'normal' because of the lead time
alter table shift_changes add column if not exists lead_days int;                                -- days between publication and the shift
alter table shift_changes drop constraint if exists shift_changes_manager_status_check;
alter table shift_changes add constraint shift_changes_manager_status_check
  check (manager_status in ('open', 'done', 'void', 'normal'));


drop function if exists submit_month(uuid, int, int, text);
drop function if exists publish_month(uuid, int, int, text);
drop function if exists set_org_settings(uuid, boolean, int);


-- Submit for approval; p_normal = "this is an ordinary plan change / swap, not Einspringen"
create or replace function submit_month(p_org uuid, p_year int, p_month int, p_note text default null, p_normal boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_keep int; v_n int; v_note text := nullif(trim(p_note), '');
begin
  if not (is_org_supervisor(p_org) and org_has_planner(p_org)) then
    raise exception 'Nur die Leitung einer Firma mit Dienstplaner darf Pläne einreichen';
  end if;
  select count(*) into v_n from scheduled_shifts
   where org_id = p_org and status = 'draft'
     and shift_date >= make_date(p_year, p_month, 1) and shift_date < (make_date(p_year, p_month, 1) + interval '1 month')::date;
  if v_n = 0 then raise exception 'Für diesen Monat gibt es keinen Entwurf'; end if;
  select retention_years into v_keep from organizations where id = p_org;

  insert into schedule_months (org_id, year, month, status, submitted_by, submitted_at, review_note, change_note, change_normal, updated_at)
  values (p_org, p_year, p_month, 'pending', auth.uid(), now(), null, v_note, coalesce(p_normal, false), now())
  on conflict (org_id, year, month) do update set
    status = 'pending', submitted_by = auth.uid(), submitted_at = now(), review_note = null,
    change_note = v_note, change_normal = coalesce(p_normal, false), updated_at = now();

  insert into schedule_versions (org_id, year, month, event, actor, actor_email, note, snapshot, keep_until)
  values (p_org, p_year, p_month, 'submitted', auth.uid(), (select email from auth.users where id = auth.uid()), v_note,
          plan_snapshot(p_org, p_year, p_month, 'draft'), make_date(p_year + v_keep, 12, 31));
end;
$$;


-- Publish. Changes to an already published month are recorded as before (Einspringen / extra / cancelled),
-- but they become 'normal' when flagged so or when they lie more than short_notice_days in the future.
create or replace function publish_month(p_org uuid, p_year int, p_month int, p_note text default null, p_normal boolean default null)
returns void language plpgsql security definer set search_path = public as $$
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
    raise exception 'Nur die Leitung darf veröffentlichen';
  end if;
  if v_role = 'supervisor' and v_req then
    raise exception 'Die Freigabe muss durch die Inhaber erfolgen. Bitte zur Freigabe einreichen.';
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
      -- exactly the opposite of an earlier, still valid entry for a shift that has not happened yet?
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
  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status, published_at)
  select org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, 'published', now()
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
$$;


-- Leitung: open / done / void / normal
create or replace function set_change_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from shift_changes where id = p_id;
  if v_org is null or not is_org_supervisor(v_org) then
    raise exception 'Nur die Leitung darf Einträge bearbeiten';
  end if;
  if p_status not in ('open', 'done', 'void', 'normal') then raise exception 'Ungültiger Status'; end if;
  if p_status = 'void' and nullif(trim(p_note), '') is null then
    raise exception 'Bitte einen Grund für das Stornieren angeben';
  end if;
  update shift_changes
     set manager_status = p_status,
         manager_note   = case when p_status in ('open', 'normal') and nullif(trim(p_note), '') is null then manager_note else nullif(trim(p_note), '') end,
         status_by      = auth.uid(),
         status_at      = now(),
         voided_at      = case when p_status = 'void' then now() else null end,
         voided_by      = case when p_status = 'void' then auth.uid() else null end,
         void_auto      = false,
         normal_auto    = false
   where id = p_id;
end;
$$;


-- Owners change the company settings (now including what counts as "kurzfristig")
create or replace function set_org_settings(p_org uuid, p_require_approval boolean, p_retention_years int, p_short_notice_days int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_owner(p_org) then raise exception 'Nur die Inhaber dürfen die Einstellungen ändern'; end if;
  if p_retention_years < 2 or p_retention_years > 10 then raise exception 'Aufbewahrung: 2 bis 10 Jahre'; end if;
  if p_short_notice_days is not null and (p_short_notice_days < 0 or p_short_notice_days > 60) then
    raise exception 'Kurzfristig: 0 bis 60 Tage';
  end if;
  update organizations
     set require_approval = p_require_approval,
         retention_years = p_retention_years,
         short_notice_days = coalesce(p_short_notice_days, short_notice_days)
   where id = p_org;
end;
$$;

revoke all on function submit_month(uuid, int, int, text, boolean) from public, anon;
revoke all on function publish_month(uuid, int, int, text, boolean) from public, anon;
revoke all on function set_change_status(uuid, text, text) from public, anon;
revoke all on function set_org_settings(uuid, boolean, int, int) from public, anon;
grant execute on function submit_month(uuid, int, int, text, boolean) to authenticated;
grant execute on function publish_month(uuid, int, int, text, boolean) to authenticated;
grant execute on function set_change_status(uuid, text, text) to authenticated;
grant execute on function set_org_settings(uuid, boolean, int, int) to authenticated;


-- ===================== 8-roles-schema.sql =====================
-- ============================================================================
-- PART 8 — Rollen: Schichtplaner schreibt, die Leitung gibt frei (der Inhaber ist dafür nicht nötig)
-- ============================================================================
-- Run ONCE in Supabase -> SQL Editor, AFTER normal-changes-schema.sql (part 7).
--
-- Roles after this script:
--   planner     Schichtplaner  writes plans, saves drafts, SUBMITS for approval. Cannot publish while the company
--                              requires approval, cannot approve/reject, cannot see the Einspringen overview,
--                              attendance data or settings.
--   supervisor  Leitung        everything a Schichtplaner can + APPROVES (publishes), rejects, decides about
--                              Einspringen, changes the company settings, manages people's logins.
--   owner       Inhaber        same as the Leitung (plus cannot be demoted). Not needed for approvals.
--   employee    Mitarbeitende  only their own data.
-- Setting organizations.require_approval (default true): true = a Schichtplaner must submit and the Leitung
-- approves; false = a Schichtplaner may publish directly.
-- ============================================================================

alter table memberships drop constraint if exists memberships_role_check;
alter table memberships add constraint memberships_role_check
  check (role in ('owner', 'supervisor', 'planner', 'employee'));

-- "may plan" = Inhaber, Leitung, Schichtplaner (this is what all planning policies already use)
create or replace function is_org_supervisor(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join organizations g on g.id = m.org_id and g.active
    where m.user_id = auth.uid() and m.org_id = o and m.role in ('owner', 'supervisor', 'planner')
  )
$$;

-- "leader" = Inhaber or Leitung: approves, decides, manages
create or replace function is_org_leader(o uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m join organizations g on g.id = m.org_id and g.active
    where m.user_id = auth.uid() and m.org_id = o and m.role in ('owner', 'supervisor')
  )
$$;
revoke all on function is_org_leader(uuid) from public, anon;
grant execute on function is_org_leader(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Functions: approvals and decisions belong to the leaders
-- ---------------------------------------------------------------------------
create or replace function publish_month(p_org uuid, p_year int, p_month int, p_note text default null, p_normal boolean default null)
returns void language plpgsql security definer set search_path = public as $$
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
      -- exactly the opposite of an earlier, still valid entry for a shift that has not happened yet?
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
  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status, published_at)
  select org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, 'published', now()
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
$$;


create or replace function reject_month(p_org uuid, p_year int, p_month int, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_keep int; v_status text;
begin
  if not (is_org_leader(p_org) and org_has_planner(p_org)) then
    raise exception 'Nur die Leitung darf Pläne zurückweisen';
  end if;
  select status into v_status from schedule_months where org_id = p_org and year = p_year and month = p_month;
  if v_status is distinct from 'pending' then raise exception 'Dieser Monat wartet nicht auf Freigabe'; end if;
  select retention_years into v_keep from organizations where id = p_org;

  update schedule_months set status = 'draft', review_note = nullif(trim(p_note), ''), updated_at = now()
   where org_id = p_org and year = p_year and month = p_month;

  insert into schedule_versions (org_id, year, month, event, actor, actor_email, note, snapshot, keep_until)
  values (p_org, p_year, p_month, 'rejected', auth.uid(), (select email from auth.users where id = auth.uid()), nullif(trim(p_note), ''),
          plan_snapshot(p_org, p_year, p_month, 'draft'), make_date(p_year + v_keep, 12, 31));
end;
$$;


create or replace function set_org_settings(p_org uuid, p_require_approval boolean, p_retention_years int, p_short_notice_days int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_leader(p_org) then raise exception 'Nur die Leitung darf die Einstellungen ändern'; end if;
  if p_retention_years < 2 or p_retention_years > 10 then raise exception 'Aufbewahrung: 2 bis 10 Jahre'; end if;
  if p_short_notice_days is not null and (p_short_notice_days < 0 or p_short_notice_days > 60) then
    raise exception 'Kurzfristig: 0 bis 60 Tage';
  end if;
  update organizations
     set require_approval = p_require_approval,
         retention_years = p_retention_years,
         short_notice_days = coalesce(p_short_notice_days, short_notice_days)
   where id = p_org;
end;
$$;


create or replace function purge_expired_versions(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_keep int; a int; b int; c int; d int;
begin
  if not is_org_leader(p_org) then raise exception 'Nur die Leitung darf löschen'; end if;
  select retention_years into v_keep from organizations where id = p_org;

  delete from schedule_versions where org_id = p_org and keep_until < current_date;
  get diagnostics a = row_count;
  delete from scheduled_shifts
   where org_id = p_org and make_date(extract(year from shift_date)::int + v_keep, 12, 31) < current_date;
  get diagnostics b = row_count;
  delete from schedule_months
   where org_id = p_org and make_date(year + v_keep, 12, 31) < current_date;
  get diagnostics c = row_count;
  delete from shift_changes
   where org_id = p_org and make_date(extract(year from change_date)::int + v_keep, 12, 31) < current_date;
  get diagnostics d = row_count;
  return a + b + c + d;
end;
$$;


create or replace function set_change_status(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from shift_changes where id = p_id;
  if v_org is null or not is_org_leader(v_org) then
    raise exception 'Nur die Leitung darf Einträge bearbeiten';
  end if;
  if p_status not in ('open', 'done', 'void', 'normal') then raise exception 'Ungültiger Status'; end if;
  if p_status = 'void' and nullif(trim(p_note), '') is null then
    raise exception 'Bitte einen Grund für das Stornieren angeben';
  end if;
  update shift_changes
     set manager_status = p_status,
         manager_note   = case when p_status in ('open', 'normal') and nullif(trim(p_note), '') is null then manager_note else nullif(trim(p_note), '') end,
         status_by      = auth.uid(),
         status_at      = now(),
         voided_at      = case when p_status = 'void' then now() else null end,
         voided_by      = case when p_status = 'void' then auth.uid() else null end,
         void_auto      = false,
         normal_auto    = false
   where id = p_id;
end;
$$;


revoke all on function publish_month(uuid, int, int, text, boolean) from public, anon;
revoke all on function reject_month(uuid, int, int, text) from public, anon;
revoke all on function set_org_settings(uuid, boolean, int, int) from public, anon;
revoke all on function purge_expired_versions(uuid) from public, anon;
revoke all on function set_change_status(uuid, text, text) from public, anon;
grant execute on function publish_month(uuid, int, int, text, boolean) to authenticated;
grant execute on function reject_month(uuid, int, int, text) to authenticated;
grant execute on function set_org_settings(uuid, boolean, int, int) to authenticated;
grant execute on function purge_expired_versions(uuid) to authenticated;
grant execute on function set_change_status(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- Policies that must be leader-only (a Schichtplaner keeps staff, wishes, shifts, definitions, months)
-- ---------------------------------------------------------------------------
drop policy if exists mt_badges_supervisor on badges;
create policy mt_badges_supervisor on badges for all to authenticated
  using (is_org_leader(org_id)) with check (is_org_leader(org_id));

drop policy if exists mt_devices_supervisor on devices;
create policy mt_devices_supervisor on devices for all to authenticated
  using (is_org_leader(org_id)) with check (is_org_leader(org_id));

drop policy if exists mt_events_select on attendance_events;
create policy mt_events_select on attendance_events for select to authenticated
  using (is_org_leader(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));

drop policy if exists mt_sessions_select on attendance_sessions;
create policy mt_sessions_select on attendance_sessions for select to authenticated
  using (is_org_leader(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists mt_sessions_supervisor on attendance_sessions;
create policy mt_sessions_supervisor on attendance_sessions for all to authenticated
  using (is_org_leader(org_id)) with check (is_org_leader(org_id));

drop policy if exists mt_corr_select on attendance_corrections;
create policy mt_corr_select on attendance_corrections for select to authenticated
  using (is_org_leader(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists mt_corr_insert on attendance_corrections;
create policy mt_corr_insert on attendance_corrections for insert to authenticated
  with check (is_org_leader(org_id));

drop policy if exists mt_rt_write on request_types;
create policy mt_rt_write on request_types for all to authenticated
  using (is_org_leader(org_id)) with check (is_org_leader(org_id));

drop policy if exists mt_req_supervisor on requests;
create policy mt_req_supervisor on requests for all to authenticated
  using (is_org_leader(org_id)) with check (is_org_leader(org_id));

drop policy if exists mt_vac_supervisor on vacation_entitlements;
create policy mt_vac_supervisor on vacation_entitlements for all to authenticated
  using (is_org_leader(org_id)) with check (is_org_leader(org_id));

drop policy if exists mt_changes_select on shift_changes;
create policy mt_changes_select on shift_changes for select to authenticated
  using (is_org_leader(org_id));

-- logins/roles of people: leaders manage them (never an owner row)
drop policy if exists mt_mem_supervisor on memberships;
create policy mt_mem_supervisor on memberships for all to authenticated
  using (is_org_leader(org_id) and role <> 'owner')
  with check (is_org_leader(org_id) and role in ('employee', 'planner', 'supervisor'));


-- ===================== 9-admin-schema.sql =====================
-- ============================================================================
-- PART 9 — Plattform-Verwaltung (/admin): Protokoll der Admin-Aktionen
-- ============================================================================
-- Already applied to the real project through the Supabase connector. Keep this file for the record
-- (or run it in a new project). Run ONCE in Supabase -> SQL Editor.
--
-- The /admin page (only for rows of platform_admins) does its work in a server route with the service_role
-- key. Every action is written to admin_log, which nobody can read through the normal API (RLS on, no policy).
--
-- To make yourself platform admin (after creating YOUR login with a STRONG password in Authentication -> Users):
--   insert into platform_admins (user_id) select id from auth.users where email = 'DEINE-ECHTE-EMAIL';
-- ============================================================================

create table if not exists admin_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  actor       uuid,
  actor_email text,
  action      text not null,
  org_id      uuid,
  target      text,
  detail      jsonb
);
create index if not exists idx_admin_log_at on admin_log (at desc);
alter table admin_log enable row level security;


-- ===================== 10-opening-days-schema.sql =====================
-- 10-opening-days-schema.sql  (Dienstplaner allgemein: Öffnungstage + Betriebsschließung)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-9. Safe to run again.
--
--   * organizations.open_weekdays       days of the week the company is open (0 = Sonntag ... 6 = Samstag),
--                                        default: all seven days (as before)
--   * organizations.closed_on_holidays  true = closed on public holidays
--   * month_closures                    whole company closed on certain days of one month (z. B. 24-31)
--   * set_opening_days(...)             Leitung/Inhaber change the opening days
--   * set_month_closed_days(...)        Leitung/Inhaber/Schichtplaner set the closed days of a month
-- Nothing else changes. The lab planner ignores these settings (a lab is always open).

alter table organizations add column if not exists open_weekdays smallint[] not null default '{0,1,2,3,4,5,6}';
alter table organizations add column if not exists closed_on_holidays boolean not null default false;

create table if not exists month_closures (
  org_id     uuid not null references organizations(id) on delete cascade,
  year       int  not null check (year between 2000 and 2100),
  month      int  not null check (month between 1 and 12),
  days       int[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (org_id, year, month)
);
alter table month_closures enable row level security;

-- every member of the company may read (employees see "geschlossen"); writing only through the function below
drop policy if exists mc_select on month_closures;
create policy mc_select on month_closures for select using (is_org_member(org_id) or is_platform_admin());

create or replace function set_opening_days(p_org uuid, p_open_weekdays smallint[], p_closed_on_holidays boolean)
returns void language plpgsql security definer set search_path = public as $$
declare clean smallint[];
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber dürfen die Öffnungstage ändern'; end if;
  select coalesce(array_agg(distinct d order by d), '{}') into clean
    from unnest(coalesce(p_open_weekdays, '{}')) d where d between 0 and 6;
  if array_length(clean, 1) is null then raise exception 'Mindestens ein Tag muss geöffnet sein'; end if;
  update organizations set open_weekdays = clean, closed_on_holidays = coalesce(p_closed_on_holidays, false) where id = p_org;
end $$;

create or replace function set_month_closed_days(p_org uuid, p_year int, p_month int, p_days int[])
returns void language plpgsql security definer set search_path = public as $$
declare clean int[]; last_day int;
begin
  if not is_org_supervisor(p_org) then raise exception 'Keine Berechtigung'; end if;
  if p_month < 1 or p_month > 12 or p_year < 2000 or p_year > 2100 then raise exception 'Ungültiger Monat'; end if;
  last_day := extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'));
  select coalesce(array_agg(distinct d order by d), '{}') into clean
    from unnest(coalesce(p_days, '{}')) d where d between 1 and last_day;
  insert into month_closures (org_id, year, month, days, updated_at, updated_by)
  values (p_org, p_year, p_month, clean, now(), auth.uid())
  on conflict (org_id, year, month) do update set days = excluded.days, updated_at = now(), updated_by = auth.uid();
end $$;

revoke all on function set_opening_days(uuid, smallint[], boolean) from public, anon;
revoke all on function set_month_closed_days(uuid, int, int, int[]) from public, anon;
grant execute on function set_opening_days(uuid, smallint[], boolean) to authenticated;
grant execute on function set_month_closed_days(uuid, int, int, int[]) to authenticated;


-- ===================== 11-wishes-schema.sql =====================
-- 11-wishes-schema.sql  (Wünsche: Mitarbeitende -> Leitung)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-10. Safe to run again.
--
-- The table "wishes" already exists (script 2). This adds a simple approval flow:
--   draft      the employee is still collecting wishes (only they see it)
--   submitted  sent to the Leitung with one button ("An die Leitung senden")
--   approved / rejected   decided by Leitung or Inhaber (optional note)
-- Employees: insert their own drafts, delete their own wishes until a decision, send drafts.
-- They can never approve anything. Approved wishes are only TAKEN INTO a plan when the Leitung
-- presses "in den Plan übernehmen" in the planner; nothing changes automatically.

alter table wishes add column if not exists status        text not null default 'draft';
alter table wishes add column if not exists submitted_at  timestamptz;
alter table wishes add column if not exists decided_by    uuid;
alter table wishes add column if not exists decided_at    timestamptz;
alter table wishes add column if not exists decision_note text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'wishes_status_check') then
    alter table wishes add constraint wishes_status_check check (status in ('draft', 'submitted', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wishes_work_needs_shift') then
    alter table wishes add constraint wishes_work_needs_shift check (wish_type = 'free' or shift_key is not null);
  end if;
end $$;

create index if not exists wishes_org_status on wishes (org_id, status, date_from);

-- employees: only their own DRAFTS may be created, nothing pre-decided
drop policy if exists mt_wish_insert_own on wishes;
create policy mt_wish_insert_own on wishes for insert
  with check (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')
              and status = 'draft' and decided_by is null and decided_at is null and submitted_at is null);

-- employees: withdraw own wishes only while no decision was made
drop policy if exists mt_wish_delete_own on wishes;
create policy mt_wish_delete_own on wishes for delete
  using (staff_id = my_staff_id(org_id) and status in ('draft', 'submitted'));

-- "An die Leitung senden": all own drafts of this company -> submitted. Returns how many were sent.
create or replace function submit_my_wishes(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare me uuid := my_staff_id(p_org); n int;
begin
  if me is null or not org_has_product(p_org, 'employee_app') then raise exception 'Keine Berechtigung'; end if;
  update wishes set status = 'submitted', submitted_at = now()
   where org_id = p_org and staff_id = me and status = 'draft';
  get diagnostics n = row_count;
  return n;
end $$;

-- Leitung / Inhaber decide (or reopen with 'submitted')
create or replace function decide_wish(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare w wishes;
begin
  select * into w from wishes where id = p_id;
  if w.id is null or not is_org_leader(w.org_id) then raise exception 'Nur Leitung oder Inhaber dürfen Wünsche entscheiden'; end if;
  if p_status not in ('approved', 'rejected', 'submitted') then raise exception 'Ungültiger Status'; end if;
  if w.status = 'draft' then raise exception 'Dieser Wunsch wurde noch nicht gesendet'; end if;
  update wishes set status = p_status,
    decided_by = case when p_status = 'submitted' then null else auth.uid() end,
    decided_at = case when p_status = 'submitted' then null else now() end,
    decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_id;
end $$;

revoke all on function submit_my_wishes(uuid) from public, anon;
revoke all on function decide_wish(uuid, text, text) from public, anon;
grant execute on function submit_my_wishes(uuid) to authenticated;
grant execute on function decide_wish(uuid, text, text) to authenticated;


-- ===================== 12-hour-balance-schema.sql =====================
-- 12-hour-balance-schema.sql  (Stundensaldo: Überstunden / Minusstunden von Monat zu Monat)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-11. Safe to run again.
--
-- One row per person and month, written when the Leitung presses "Monat abschließen & archivieren":
--   contract_hours  the person's hours for that month from the contract (weekly hours, open days, leave)
--   planned_hours   the hours in the plan
--   sat_short / sun_short / night_short   weekend days / nights fewer than the fair share
-- Saldo of a person = sum of (planned - contract) of all EARLIER months. Next month's goal is
-- contract - saldo (Überstunden are given back as fewer hours, Minusstunden are caught up).
-- Pressing the button again for the same month overwrites that month (never counted twice).
-- Before this script the saldo lived only in the browser of one computer.

create table if not exists staff_month_balance (
  org_id          uuid not null references organizations(id) on delete cascade,
  staff_id        uuid not null,
  year            int  not null check (year between 2000 and 2100),
  month           int  not null check (month between 1 and 12),
  contract_hours  numeric(7,2) not null default 0,
  planned_hours   numeric(7,2) not null default 0,
  sat_short       numeric(5,2) not null default 0,
  sun_short       numeric(5,2) not null default 0,
  night_short     numeric(5,2) not null default 0,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  primary key (org_id, staff_id, year, month),
  foreign key (staff_id, org_id) references staff(id, org_id) on delete cascade
);
alter table staff_month_balance enable row level security;

drop policy if exists smb_select on staff_month_balance;
create policy smb_select on staff_month_balance for select
  using (is_org_supervisor(org_id) or staff_id = my_staff_id(org_id) or is_platform_admin());

-- p_rows: [{ "staff_id": "...", "contract_hours": 169.4, "planned_hours": 172.5,
--            "sat_short": 0, "sun_short": 1, "night_short": 0.5 }, ...]
create or replace function save_month_balances(p_org uuid, p_year int, p_month int, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  if not is_org_supervisor(p_org) then raise exception 'Keine Berechtigung'; end if;
  if p_month < 1 or p_month > 12 or p_year < 2000 or p_year > 2100 then raise exception 'Ungültiger Monat'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if not exists (select 1 from staff where id = (r->>'staff_id')::uuid and org_id = p_org) then continue; end if; -- only own staff
    insert into staff_month_balance (org_id, staff_id, year, month, contract_hours, planned_hours, sat_short, sun_short, night_short, updated_at, updated_by)
    values (p_org, (r->>'staff_id')::uuid, p_year, p_month,
            greatest(0, coalesce((r->>'contract_hours')::numeric, 0)), greatest(0, coalesce((r->>'planned_hours')::numeric, 0)),
            greatest(0, coalesce((r->>'sat_short')::numeric, 0)), greatest(0, coalesce((r->>'sun_short')::numeric, 0)),
            greatest(0, coalesce((r->>'night_short')::numeric, 0)), now(), auth.uid())
    on conflict (org_id, staff_id, year, month) do update set
      contract_hours = excluded.contract_hours, planned_hours = excluded.planned_hours,
      sat_short = excluded.sat_short, sun_short = excluded.sun_short, night_short = excluded.night_short,
      updated_at = now(), updated_by = auth.uid();
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function save_month_balances(uuid, int, int, jsonb) from public, anon;
grant execute on function save_month_balances(uuid, int, int, jsonb) to authenticated;


-- ===================== 13-half-days-schema.sql =====================
-- 13-half-days-schema.sql  (Dienstplaner allgemein: halbe Tage – nur vormittags / nur nachmittags geöffnet)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-12. Safe to run again.
--
--   * organizations.half_day_config  {"weekdays": {"3": "am"}, "shifts": {"M": "pm"}}
--         weekdays: day of the week (0 = Sonntag … 6 = Samstag) -> "am" (nur vormittags) / "pm" (nur nachmittags)
--         shifts:   manual choice whether a shift belongs to the morning or the afternoon
--                   (without a choice: start before 12:00 = morning, otherwise afternoon)
--   * month_closures.am_days / pm_days   single days of one month open only in the morning / afternoon
--   * set_opening_days(...) and set_month_closed_days(...) get one more optional parameter each;
--     old calls with fewer parameters keep working.

alter table organizations add column if not exists half_day_config jsonb not null default '{}'::jsonb;
alter table month_closures add column if not exists am_days int[] not null default '{}';
alter table month_closures add column if not exists pm_days int[] not null default '{}';

drop function if exists set_opening_days(uuid, smallint[], boolean);
create or replace function set_opening_days(p_org uuid, p_open_weekdays smallint[], p_closed_on_holidays boolean, p_half_day_config jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare clean smallint[]; cfg jsonb; wd jsonb := '{}'::jsonb; sh jsonb := '{}'::jsonb; k text; v text;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber dürfen die Öffnungstage ändern'; end if;
  select coalesce(array_agg(distinct d order by d), '{}') into clean
    from unnest(coalesce(p_open_weekdays, '{}')) d where d between 0 and 6;
  if array_length(clean, 1) is null then raise exception 'Mindestens ein Tag muss geöffnet sein'; end if;
  if p_half_day_config is not null then
    for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_half_day_config->'weekdays', '{}'::jsonb)) loop
      if k ~ '^[0-6]$' and v in ('am', 'pm') then wd := wd || jsonb_build_object(k, v); end if;
    end loop;
    for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_half_day_config->'shifts', '{}'::jsonb)) loop
      if length(k) between 1 and 40 and v in ('am', 'pm') then sh := sh || jsonb_build_object(k, v); end if;
    end loop;
    cfg := jsonb_build_object('weekdays', wd, 'shifts', sh);
  end if;
  update organizations set open_weekdays = clean, closed_on_holidays = coalesce(p_closed_on_holidays, false),
         half_day_config = coalesce(cfg, half_day_config)
   where id = p_org;
end $$;

drop function if exists set_month_closed_days(uuid, int, int, int[]);
create or replace function set_month_closed_days(p_org uuid, p_year int, p_month int, p_days int[], p_am_days int[] default null, p_pm_days int[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare clean int[]; am int[]; pm int[]; last_day int;
begin
  if not is_org_supervisor(p_org) then raise exception 'Keine Berechtigung'; end if;
  if p_month < 1 or p_month > 12 or p_year < 2000 or p_year > 2100 then raise exception 'Ungültiger Monat'; end if;
  last_day := extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'));
  select coalesce(array_agg(distinct d order by d), '{}') into clean from unnest(coalesce(p_days, '{}')) d where d between 1 and last_day;
  select coalesce(array_agg(distinct d order by d), '{}') into am from unnest(coalesce(p_am_days, '{}')) d where d between 1 and last_day and not d = any(clean);
  select coalesce(array_agg(distinct d order by d), '{}') into pm from unnest(coalesce(p_pm_days, '{}')) d where d between 1 and last_day and not d = any(clean) and not d = any(am);
  insert into month_closures (org_id, year, month, days, am_days, pm_days, updated_at, updated_by)
  values (p_org, p_year, p_month, clean, am, pm, now(), auth.uid())
  on conflict (org_id, year, month) do update set days = excluded.days,
    am_days = case when p_am_days is null then month_closures.am_days else excluded.am_days end,
    pm_days = case when p_pm_days is null then month_closures.pm_days else excluded.pm_days end,
    updated_at = now(), updated_by = auth.uid();
end $$;

revoke all on function set_opening_days(uuid, smallint[], boolean, jsonb) from public, anon;
revoke all on function set_month_closed_days(uuid, int, int, int[], int[], int[]) from public, anon;
grant execute on function set_opening_days(uuid, smallint[], boolean, jsonb) to authenticated;
grant execute on function set_month_closed_days(uuid, int, int, int[], int[], int[]) to authenticated;


-- ===================== 14-middle-shift-days-schema.sql =====================
-- 14-middle-shift-days-schema.sql  (Dienstplaner Labor: Mitteldienst & Co. auch freitags / samstags / sonntags?)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-13. Safe to run again.
-- Three switches per extra shift (Mitteldienst, Büro, own shifts). Defaults = behaviour before:
-- Monday-Friday yes, Saturday/Sunday no. Holidays stay free of these shifts.
alter table shift_definitions add column if not exists on_friday   boolean not null default true;
alter table shift_definitions add column if not exists on_saturday boolean not null default false;
alter table shift_definitions add column if not exists on_sunday   boolean not null default false;


-- ===================== 15-security-hardening.sql =====================
-- 15-security-hardening.sql  (Sicherheits-Audit Oktober 2026)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-14. Safe to run again.
--
-- A) Not-logged-in visitors ("anon") get NO table rights at all (the app never reads tables without
--    login). Logged-in users lose TRUNCATE / TRIGGER / REFERENCES (TRUNCATE would ignore RLS).
--    Row Level Security (company separation) stays as it is; this only removes rights nobody needs.
-- B) Zeiterfassung is tamper-proof:
--    * every raw stamp (attendance_events) gets the SERVER time (UTC); a different device time is
--      only kept as information in raw_payload.device_scanned_at
--    * raw stamps and corrections can never be changed or deleted (also not by the Leitung)
--    * sessions (check-in/check-out) can only be changed through correct_attendance(...),
--      which needs a reason and writes the old and the new value into attendance_corrections

-- A) rights -------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;

-- B) Zeiterfassung ------------------------------------------------------------------------------
create or replace function attendance_server_time() returns trigger language plpgsql as $$
begin
  if new.scanned_at is not null and abs(extract(epoch from (new.scanned_at - now()))) > 120 then
    new.raw_payload := coalesce(new.raw_payload, '{}'::jsonb) || jsonb_build_object('device_scanned_at', new.scanned_at);
  end if;
  new.scanned_at := now();   -- server time, stored as UTC (timestamptz)
  new.created_at := now();
  return new;
end $$;
drop trigger if exists trg_attendance_server_time on attendance_events;
create trigger trg_attendance_server_time before insert on attendance_events for each row execute function attendance_server_time();

create or replace function attendance_forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'Zeiterfassung ist unveränderlich: % auf % ist nicht erlaubt. Korrekturen nur über correct_attendance (mit Grund).', tg_op, tg_table_name;
end $$;
drop trigger if exists trg_events_immutable on attendance_events;
create trigger trg_events_immutable before update or delete on attendance_events for each row execute function attendance_forbid_change();
drop trigger if exists trg_corrections_immutable on attendance_corrections;
create trigger trg_corrections_immutable before update or delete on attendance_corrections for each row execute function attendance_forbid_change();

-- sessions: logged-in users may only read; changes come from the system or from correct_attendance
drop policy if exists mt_sessions_supervisor on attendance_sessions;
create or replace function attendance_sessions_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Arbeitszeiten werden nur über correct_attendance (mit Grund) geändert';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_sessions_guard on attendance_sessions;
create trigger trg_sessions_guard before update or delete on attendance_sessions for each row execute function attendance_sessions_guard();

-- corrections are written ONLY by correct_attendance (no direct inserts any more)
drop policy if exists mt_corr_insert on attendance_corrections;

create or replace function correct_attendance(p_session_id bigint, p_field text, p_new_value timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s attendance_sessions; old_v timestamptz;
begin
  select * into s from attendance_sessions where id = p_session_id;
  if s.id is null or not is_org_leader(s.org_id) then raise exception 'Nur Leitung oder Inhaber dürfen Arbeitszeiten korrigieren'; end if;
  if p_field not in ('check_in', 'check_out') then raise exception 'Ungültiges Feld'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Bitte einen Grund angeben'; end if;
  old_v := case when p_field = 'check_in' then s.check_in else s.check_out end;
  insert into attendance_corrections (session_id, staff_id, field, old_value, new_value, reason, corrected_by, corrected_at, org_id)
  values (s.id, s.staff_id, p_field, old_v, p_new_value, trim(p_reason), auth.uid()::text, now(), s.org_id);
  if p_field = 'check_in' then update attendance_sessions set check_in = p_new_value where id = s.id;
  else update attendance_sessions set check_out = p_new_value where id = s.id; end if;
end $$;
revoke all on function correct_attendance(bigint, text, timestamptz, text) from public, anon;
grant execute on function correct_attendance(bigint, text, timestamptz, text) to authenticated;

-- C) fixed search_path for trigger/helper functions (Supabase security advisor)
alter function public.resolve_attendance_staff() set search_path = public;
alter function public.rebuild_attendance_sessions(uuid, date, date) set search_path = public;
alter function public.attendance_server_time() set search_path = public;
alter function public.attendance_forbid_change() set search_path = public;
alter function public.attendance_sessions_guard() set search_path = public;
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='requests_set_decision' loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;


-- ===================== 16-zeiterfassung-schema.sql =====================
-- 16-zeiterfassung-schema.sql  (Zeiterfassung Stufe 1: Terminal mit QR-Code + PIN, "Zeiten" in der App)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-15. Safe to run again.
--
--  * new product "time_tracking" (Zeiterfassung), switched on per company in /admin
--  * terminal_tokens: the QR code on the terminal changes every ~30 s; a token is valid 60 s
--  * staff_pins: personal stamp PIN (bcrypt), set by the employee in the app; a separate table
--    nobody can read (not even the Leitung), so a short PIN can never be guessed from its hash
--  * pin_failures: wrong PINs on the terminal (5 wrong in 15 min = PIN blocked for 15 min)
--  * every new stamp updates the sessions by itself (trigger): "in" opens a session,
--    "out" closes the open one. Nothing is deleted; corrections (correct_attendance) stay.

alter table org_products drop constraint if exists org_products_product_check;
alter table org_products add constraint org_products_product_check
  check (product in ('lab_planner', 'generic_planner', 'employee_app', 'time_tracking'));

create table if not exists staff_pins (
  staff_id   uuid primary key references staff(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);
alter table staff_pins enable row level security;        -- no policies: only functions / server

create table if not exists terminal_tokens (
  token      text primary key,
  device_id  uuid not null references devices(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  expires_at timestamptz not null
);
alter table terminal_tokens enable row level security;   -- no policies: only the server (service_role)
create index if not exists terminal_tokens_exp on terminal_tokens (expires_at);

create table if not exists pin_failures (
  id       bigserial primary key,
  staff_id uuid not null references staff(id) on delete cascade,
  at       timestamptz not null default now()
);
alter table pin_failures enable row level security;      -- no policies: only the server
create index if not exists pin_failures_staff on pin_failures (staff_id, at);

-- the employee sets / changes the own PIN (4-6 digits); stored only as bcrypt hash
create or replace function set_my_pin(p_org uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := my_staff_id(p_org);
begin
  if me is null then raise exception 'Keine Berechtigung'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'Die PIN muss aus 4 bis 6 Ziffern bestehen'; end if;
  if p_pin in ('0000','1111','1234','12345','123456','4321','9999') then raise exception 'Diese PIN ist zu einfach'; end if;
  insert into staff_pins (staff_id, org_id, pin_hash, updated_at) values (me, p_org, extensions.crypt(p_pin, extensions.gen_salt('bf')), now())
  on conflict (staff_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end $$;

-- Leitung / Inhaber remove a forgotten PIN (the person then sets a new one in the app)
create or replace function reset_staff_pin(p_org uuid, p_staff uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  delete from staff_pins where staff_id = p_staff and org_id = p_org;
end $$;

-- does the person have a PIN? (for the app, without showing anything of the hash)
create or replace function my_pin_is_set(p_org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from staff_pins where staff_id = my_staff_id(p_org) and org_id = p_org);
$$;

-- for the server only: check a PIN
create or replace function check_staff_pin(p_staff uuid, p_pin text)
returns boolean language sql security definer set search_path = public, extensions stable as $$
  select coalesce((select pin_hash = extensions.crypt(p_pin, pin_hash) from staff_pins where staff_id = p_staff), false);
$$;

-- sessions follow the stamps automatically
create or replace function attendance_apply_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare open_id bigint; dir text := new.direction;
begin
  if new.staff_id is null then return new; end if;
  select id into open_id from attendance_sessions
   where staff_id = new.staff_id and check_out is null and check_in > new.scanned_at - interval '20 hours'
   order by check_in desc limit 1;
  if dir is null then dir := case when open_id is not null then 'out' else 'in' end; end if; -- chip readers send no direction
  if dir = 'out' then
    if open_id is not null then
      update attendance_sessions set check_out = new.scanned_at, out_event_id = new.id where id = open_id;
    else -- "Gehen" without "Kommen": keep it visible as an open entry for the Leitung
      insert into attendance_sessions (org_id, staff_id, check_in, check_out, in_event_id, out_event_id)
      values (new.org_id, new.staff_id, null, new.scanned_at, null, new.id);
    end if;
  else
    insert into attendance_sessions (org_id, staff_id, check_in, check_out, in_event_id, out_event_id)
    values (new.org_id, new.staff_id, new.scanned_at, null, new.id, null);
  end if;
  return new;
end $$;
drop trigger if exists trg_attendance_apply on attendance_events;
create trigger trg_attendance_apply after insert on attendance_events for each row execute function attendance_apply_event();

alter table attendance_sessions alter column check_in drop not null;

revoke all on function set_my_pin(uuid, text) from public, anon;
revoke all on function reset_staff_pin(uuid, uuid) from public, anon;
revoke all on function my_pin_is_set(uuid) from public, anon;
revoke all on function check_staff_pin(uuid, text) from public, anon, authenticated;
grant execute on function set_my_pin(uuid, text) to authenticated;
grant execute on function reset_staff_pin(uuid, uuid) to authenticated;
grant execute on function my_pin_is_set(uuid) to authenticated;
grant execute on function check_staff_pin(uuid, text) to service_role;


-- ===================== 17-chipkarten-schema.sql =====================
-- 17-chipkarten-schema.sql  (Zeiterfassung: Chipkarte am Terminal, optional Karte + PIN)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-16. Safe to run again.
--  * one card number can belong to only ONE active person per company
--  * organizations.card_requires_pin: false = card alone is enough (default); true = card + PIN
--  * set_card_requires_pin(...): Leitung / Inhaber switch it

create unique index if not exists badges_active_code on badges (org_id, badge_code) where revoked_at is null;
alter table organizations add column if not exists card_requires_pin boolean not null default false;

create or replace function set_card_requires_pin(p_org uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  update organizations set card_requires_pin = coalesce(p_on, false) where id = p_org;
end $$;
revoke all on function set_card_requires_pin(uuid, boolean) from public, anon;
grant execute on function set_card_requires_pin(uuid, boolean) to authenticated;

-- QR codes carry the direction chosen on the terminal (Kommen / Gehen); the phone then only confirms
alter table terminal_tokens add column if not exists direction text check (direction in ('in', 'out'));

-- Terminal setup WITHOUT logging in on the tablet: the Leitung creates a one-time code in "Anwesenheit"
-- (from any computer or phone), somebody types it on the tablet at /terminal. Only a hash is stored;
-- a code works once and for 24 hours. No policies: only the server reads this table.
create table if not exists terminal_pair_codes (
  id          bigserial primary key,
  org_id      uuid not null references organizations(id) on delete cascade,
  code_hash   text not null unique,
  name        text not null default 'Terminal',
  expires_at  timestamptz not null,
  used_at     timestamptz,
  device_id   uuid references devices(id) on delete set null,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
alter table terminal_pair_codes enable row level security;


-- ===================== 18-antraege-schema.sql =====================
-- 18-antraege-schema.sql  (Anträge: Urlaub / Fortbildung / Krankmeldung aus der Mitarbeiter-App)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-17. Safe to run again.
-- The tables requests / request_types exist since the first scripts (RLS: the person sees only own
-- requests, Leitung/Inhaber decide). New: a reason the Leitung can give with the decision, and a
-- length limit for the note.
alter table requests add column if not exists decision_note text check (decision_note is null or length(decision_note) <= 500);
alter table requests drop constraint if exists requests_note_len;
alter table requests add constraint requests_note_len check (note is null or length(note) <= 500);


-- ===================== 19-org-features-schema.sql =====================
-- 19-org-features-schema.sql  (Funktionen pro Firma / Feature-Schalter)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-18. Safe to run again.
-- Special wishes of ONE customer are built behind a switch; only that company gets it.
-- Members of a company may read their company's switches; only the server (platform admin) writes.
create table if not exists org_features (
  org_id     uuid not null references organizations(id) on delete cascade,
  feature    text not null check (feature ~ '^[a-z0-9_]{2,60}$'),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (org_id, feature)
);
alter table org_features enable row level security;
drop policy if exists org_features_select on org_features;
create policy org_features_select on org_features for select using (is_org_member(org_id) or is_platform_admin());
revoke insert, update, delete, truncate on org_features from authenticated, anon;

