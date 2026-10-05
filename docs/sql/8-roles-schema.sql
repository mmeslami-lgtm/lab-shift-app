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
