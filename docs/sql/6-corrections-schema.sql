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
