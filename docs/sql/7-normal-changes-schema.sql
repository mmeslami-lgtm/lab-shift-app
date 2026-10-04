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
