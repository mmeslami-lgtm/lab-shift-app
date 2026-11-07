-- 37-einspringen-kette.sql  (Paket 6m, 7 Nov 2026) – Run ONCE. Safe to run again.
-- Chain: A krank -> B springt ein; later B krank -> C. Before, B's Einspringen stayed counted (Freigaben & Archiv,
-- fairness count in "Krankmeldung / Ausfall") although B did not work. Now: when a person is taken OUT of a shift
-- (cover or cancelled), their own earlier Einspringen in that same shift (kind cover/extra, status open/done) is voided
-- automatically – for any date. Normal plan changes (status normal) stay untouched (history of the plan).
-- Only this block is new in publish_month; everything else is unchanged.

create or replace function public.publish_month(p_org uuid, p_year integer, p_month integer, p_note text default null, p_normal boolean default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
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
      -- 37: the person taken out of this shift had jumped in here before and did not work it -> that Einspringen is void
      if rec.kind in ('cover', 'cancelled') then
        update shift_changes
           set manager_status = 'void', void_auto = true, voided_at = now(), voided_by = auth.uid(),
               manager_note = trim(coalesce(manager_note || ' · ', '') || 'Automatisch storniert: Person wieder ausgetragen (hat nicht gearbeitet)')
         where org_id = p_org and change_date = rec.change_date and shift_key = rec.shift_key
           and kind in ('cover', 'extra') and manager_status in ('open', 'done') and voided_at is null
           and staff_id = case when rec.kind = 'cover' then rec.replaced_staff_id else rec.staff_id end;
      end if;
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
  insert into scheduled_shifts (org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, status, published_at, location_id)
  select org_id, staff_id, shift_date, shift_key, shift_label, planned_start, planned_end, 'published', now(), location_id
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
$function$;

-- one-time clean-up of existing data: Einspringen (open/done) of a person who is no longer in that published shift
update shift_changes c
   set manager_status = 'void', void_auto = true, voided_at = now(),
       manager_note = trim(coalesce(c.manager_note || ' · ', '') || 'Automatisch storniert (Bereinigung 37): Person nicht mehr in dieser Schicht')
 where c.kind in ('cover', 'extra') and c.manager_status in ('open', 'done') and c.voided_at is null
   and exists (select 1 from scheduled_shifts p where p.org_id = c.org_id and p.status = 'published'
               and date_trunc('month', p.shift_date) = date_trunc('month', c.change_date))
   and not exists (select 1 from scheduled_shifts p where p.org_id = c.org_id and p.status = 'published'
               and p.shift_date = c.change_date and p.shift_key = c.shift_key and p.staff_id = c.staff_id);
