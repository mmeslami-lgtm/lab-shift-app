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
