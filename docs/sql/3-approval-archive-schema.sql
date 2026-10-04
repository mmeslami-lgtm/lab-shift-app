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
