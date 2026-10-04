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
