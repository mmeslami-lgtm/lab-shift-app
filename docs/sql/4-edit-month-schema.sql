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
