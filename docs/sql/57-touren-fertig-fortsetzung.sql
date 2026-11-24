-- 57 – Touren D3c-1: „Ich bin da“ / „Fertig“ / „Nicht fertig – morgen weiter“ (Wunsch Nutzer 24.11.2026)
-- * Mitarbeiter-App: Knopf in der großen Karte (nächster Einsatz) → job_checkin / job_finish.
-- * Fertig: Ist-Zeit (angekommen → fertig) zählt für die Stunden; dauert es länger: Grund (optional).
-- * Nicht fertig: Auftrag = erledigt (teilweise) + Fortsetzung (gleicher Kunde/Adresse/Leistung, Restdauer, nächster Tag,
--   gleiche Uhrzeit) mit needs_confirm = true: das Büro klärt den Termin mit dem Kunden; bis dahin sehen die
--   Mitarbeitenden die Fortsetzung NICHT (my_jobs, my_jobs_range, my_next_job, my_trips).
-- * touren_attention: „Bitte prüfen“ im Büro – läuft länger (mit dem nächsten Einsatz derselben Person) und offene Fortsetzungen.
alter table public.jobs add column if not exists arrived_at timestamptz;
alter table public.jobs add column if not exists finished_at timestamptz;
alter table public.jobs add column if not exists outcome text check (outcome is null or outcome in ('done', 'partial'));
alter table public.jobs add column if not exists overrun_reason text check (overrun_reason is null or length(overrun_reason) <= 200);
alter table public.jobs add column if not exists parent_job_id uuid references public.jobs(id) on delete set null;
alter table public.jobs add column if not exists needs_confirm boolean not null default false;
create index if not exists jobs_needs_confirm on public.jobs(org_id) where needs_confirm;
create index if not exists jobs_parent on public.jobs(parent_job_id) where parent_job_id is not null;

create or replace function public.job_checkin(p_job uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare j jobs; me uuid;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null then raise exception 'Auftrag nicht gefunden'; end if;
  me := my_staff_id(j.org_id);
  if me is null or not exists (select 1 from job_staff where job_id = j.id and staff_id = me) then raise exception 'Das ist nicht dein Einsatz.'; end if;
  if j.status = 'cancelled' then raise exception 'Der Auftrag ist storniert.'; end if;
  if j.work_date <> (now() at time zone org_tz(j.org_id))::date then raise exception 'Dieser Einsatz ist nicht heute.'; end if;
  update jobs set arrived_at = coalesce(arrived_at, now()) where id = j.id returning * into j;
  return jsonb_build_object('arrived_at', j.arrived_at);
end $$;
revoke all on function public.job_checkin(uuid) from public, anon;
grant execute on function public.job_checkin(uuid) to authenticated;

create or replace function public.job_finish(p_job uuid, p_outcome text, p_remaining_min integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare j jobs; me uuid; nid uuid; rest int;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null then raise exception 'Auftrag nicht gefunden'; end if;
  me := my_staff_id(j.org_id);
  if me is null or not exists (select 1 from job_staff where job_id = j.id and staff_id = me) then raise exception 'Das ist nicht dein Einsatz.'; end if;
  if j.status = 'cancelled' then raise exception 'Der Auftrag ist storniert.'; end if;
  if p_outcome not in ('done', 'partial') then raise exception 'Ungültig'; end if;
  if j.work_date > (now() at time zone org_tz(j.org_id))::date then raise exception 'Dieser Einsatz ist noch nicht dran.'; end if;
  if j.finished_at is not null then return jsonb_build_object('already', true, 'outcome', j.outcome); end if; -- Kolleg:in war schneller
  if p_outcome = 'partial' then
    rest := round(coalesce(p_remaining_min, 0) / 15.0) * 15;
    if rest < 15 or rest > 1440 then raise exception 'Bitte angeben, wie lange es noch dauert.'; end if;
  end if;
  update jobs set arrived_at = coalesce(arrived_at, now()), finished_at = now(), outcome = p_outcome, status = 'done',
    overrun_reason = nullif(left(trim(coalesce(p_reason, '')), 200), '')
    where id = j.id;
  if p_outcome = 'partial' and not exists (select 1 from jobs c where c.parent_job_id = j.id and c.status <> 'cancelled') then
    insert into jobs (org_id, customer_id, address_id, address_text, maps_url, lat, lng, work_date, start_time, duration_min,
                      service_type_id, staff_needed, notes_staff, notes_internal, source, status, extra, material, parent_job_id, needs_confirm)
    values (j.org_id, j.customer_id, j.address_id, j.address_text, j.maps_url, j.lat, j.lng, j.work_date + 1, j.start_time, rest,
            j.service_type_id, j.staff_needed, j.notes_staff, j.notes_internal, 'other', 'new', j.extra, j.material, j.id, true)
    returning id into nid;
  end if;
  return jsonb_build_object('ok', true, 'continuation', nid);
end $$;
revoke all on function public.job_finish(uuid, text, integer, text) from public, anon;
grant execute on function public.job_finish(uuid, text, integer, text) to authenticated;

create or replace function public.touren_attention(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d0 date; t0 time;
begin
  if not is_touren_staff(p_org) then raise exception 'Keine Berechtigung'; end if;
  d0 := (now() at time zone org_tz(p_org))::date; t0 := (now() at time zone org_tz(p_org))::time;
  return jsonb_build_object(
    'overrun', coalesce((select jsonb_agg(jsonb_build_object(
        'job_id', j.id, 'job_no', j.job_no, 'customer', c.name, 'end', to_char(j.start_time + make_interval(mins => j.duration_min), 'HH24:MI'),
        'over_min', floor(extract(epoch from (t0 - (j.start_time + make_interval(mins => j.duration_min)))) / 60),
        'staff', (select jsonb_agg(s.name order by s.name) from job_staff x join staff s on s.id = x.staff_id where x.job_id = j.id),
        'next', (select jsonb_build_object('start', to_char(n.start_time, 'HH24:MI'), 'customer', nc.name, 'staff', s2.name)
                 from job_staff x2 join jobs n on n.id = x2.job_id join customers nc on nc.id = n.customer_id join staff s2 on s2.id = x2.staff_id
                 where x2.staff_id in (select staff_id from job_staff where job_id = j.id) and n.id <> j.id and n.work_date = d0
                   and n.start_time > j.start_time and n.status in ('new', 'accepted') and not n.needs_confirm
                 order by n.start_time limit 1)) order by j.start_time)
      from jobs j join customers c on c.id = j.customer_id
      where j.org_id = p_org and j.work_date = d0 and j.arrived_at is not null and j.finished_at is null and j.status <> 'cancelled'
        and j.start_time + make_interval(mins => j.duration_min) > j.start_time
        and (j.start_time + make_interval(mins => j.duration_min)) < t0), '[]'::jsonb),
    'confirm', coalesce((select jsonb_agg(jsonb_build_object(
        'job_id', j.id, 'job_no', j.job_no, 'customer', c.name, 'work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'),
        'duration_min', j.duration_min, 'parent_no', p.job_no) order by j.work_date, j.start_time)
      from jobs j join customers c on c.id = j.customer_id left join jobs p on p.id = j.parent_job_id
      where j.org_id = p_org and j.needs_confirm and j.status <> 'cancelled'), '[]'::jsonb)
  );
end $$;
revoke all on function public.touren_attention(uuid) from public, anon;
grant execute on function public.touren_attention(uuid) to authenticated;

create or replace function public.my_jobs(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid; today date;
begin
  me := my_staff_id(p_org);
  if me is null or not org_has_product(p_org, 'touren') or not is_org_member(p_org) then return '[]'::jsonb; end if;
  today := (now() at time zone org_tz(p_org))::date;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', j.id, 'job_no', j.job_no, 'work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'), 'duration_min', j.duration_min,
      'status', j.status, 'address', j.address_text, 'maps_url', j.maps_url, 'lat', j.lat, 'lng', j.lng,
      'service', st.name, 'material', j.material,
      'arrived_at', j.arrived_at, 'finished_at', j.finished_at, 'outcome', j.outcome,
      'customer', case when c.kind = 'company' and c.company is not null then c.company else c.name end,
      'notes', case when j.work_date = today then nullif(concat_ws(E'\n', c.notes_staff, j.notes_staff), '') end,
      'fields', case when j.work_date = today then (
          select jsonb_agg(jsonb_build_object('name', f.name, 'kind', f.kind, 'value', coalesce(j.extra -> (f.id::text), c.extra -> (f.id::text))) order by f.entity desc, f.sort_order)
          from custom_fields f where f.org_id = p_org and f.active and f.staff_visible
            and coalesce(j.extra -> (f.id::text), c.extra -> (f.id::text)) is not null
            and ((f.entity = 'job' and j.extra ? f.id::text) or (f.entity = 'customer' and c.extra ? f.id::text))) end,
      'team', (select jsonb_agg(s2.name order by s2.name) from job_staff x2 join staff s2 on s2.id = x2.staff_id where x2.job_id = j.id and x2.staff_id <> me)
    ) order by j.work_date, j.start_time)
    from job_staff x join jobs j on j.id = x.job_id join customers c on c.id = j.customer_id left join service_types st on st.id = j.service_type_id
    where x.staff_id = me and j.org_id = p_org and j.status <> 'cancelled' and not j.needs_confirm and j.work_date between today and today + 1), '[]'::jsonb);
end $$;
revoke all on function public.my_jobs(uuid) from public, anon;
grant execute on function public.my_jobs(uuid) to authenticated;

create or replace function public.my_jobs_range(p_org uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid;
begin
  me := my_staff_id(p_org);
  if me is null or not org_has_product(p_org, 'touren') or not is_org_member(p_org) then return '[]'::jsonb; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'Zeitraum zu lang'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', j.id, 'work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'), 'duration_min', j.duration_min,
      'address', j.address_text, 'maps_url', j.maps_url, 'lat', j.lat, 'lng', j.lng, 'service', st.name,
      'customer', case when c.kind = 'company' and c.company is not null then c.company else c.name end
    ) order by j.work_date, j.start_time)
    from job_staff x join jobs j on j.id = x.job_id join customers c on c.id = j.customer_id left join service_types st on st.id = j.service_type_id
    where x.staff_id = me and j.org_id = p_org and j.status <> 'cancelled' and not j.needs_confirm and j.work_date between p_from and p_to), '[]'::jsonb);
end $$;
revoke all on function public.my_jobs_range(uuid, date, date) from public, anon;
grant execute on function public.my_jobs_range(uuid, date, date) to authenticated;

create or replace function public.my_next_job(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid; d0 date; r jsonb;
begin
  me := my_staff_id(p_org);
  if me is null or not org_has_product(p_org, 'touren') or not is_org_member(p_org) then return null; end if;
  d0 := (now() at time zone org_tz(p_org))::date;
  select jsonb_build_object('work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI')) into r
    from job_staff x join jobs j on j.id = x.job_id
    where x.staff_id = me and j.org_id = p_org and j.status <> 'cancelled' and not j.needs_confirm and j.work_date between d0 + 2 and d0 + 60
    order by j.work_date, j.start_time limit 1;
  return r;
end $$;
revoke all on function public.my_next_job(uuid) from public, anon;
grant execute on function public.my_next_job(uuid) to authenticated;

-- Stunden: Ist-Zeit statt Plan, wenn vorhanden
create or replace function public.touren_day_context(p_org uuid, p_day date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare leader boolean; m_from date; m_to date; res jsonb;
begin
  if not is_touren_staff(p_org) then raise exception 'Keine Berechtigung'; end if;
  leader := is_org_leader(p_org);
  m_from := date_trunc('month', p_day)::date; m_to := (date_trunc('month', p_day) + interval '1 month')::date;
  with st as (
    select s.id, s.name, s.weekly_hours, t.start_kind, t.place_id,
      case when t.start_kind = 'place' then p.lat when t.start_kind = 'home' then t.home_lat end as slat,
      case when t.start_kind = 'place' then p.lng when t.start_kind = 'home' then t.home_lng end as slng,
      case when t.start_kind = 'place' then p.name when t.start_kind = 'home' then 'home' end as slabel
    from staff s left join staff_touren t on t.staff_id = s.id left join touren_places p on p.id = t.place_id
    where s.org_id = p_org and s.active
  ),
  hrs as (
    select x.staff_id, sum(case when j.arrived_at is not null and j.finished_at is not null and j.finished_at > j.arrived_at
                               then extract(epoch from (j.finished_at - j.arrived_at)) / 60.0 else j.duration_min end) / 60.0 as h
    from job_staff x join jobs j on j.id = x.job_id
    where x.org_id = p_org and j.status <> 'cancelled' and j.work_date >= m_from and j.work_date < m_to
    group by x.staff_id
  ),
  absent as (
    select s.id as staff_id from staff s where s.org_id = p_org and touren_is_absent(p_org, s.id, p_day)
  ),
  dayjobs as (select id, lat, lng from jobs where org_id = p_org and work_date = p_day)
  select jsonb_build_object(
    'leader', leader,
    'settings', coalesce((select to_jsonb(ts) - 'org_id' - 'updated_at' from touren_settings ts where ts.org_id = p_org),
                         jsonb_build_object('industry', 'general', 'near_km', 3, 'fairness_pp', 10, 'travel_min', 30)),
    'staff', coalesce((select jsonb_agg(jsonb_build_object(
        'id', st.id, 'name', st.name,
        'skills', coalesce((select jsonb_agg(k.skill_id) from staff_skills k where k.staff_id = st.id), '[]'::jsonb),
        'start_label', st.slabel,
        'start_km', coalesce((select jsonb_object_agg(d.id::text, round(touren_km(st.slat, st.slng, d.lat, d.lng)::numeric, 2)) from dayjobs d where touren_km(st.slat, st.slng, d.lat, d.lng) is not null), '{}'::jsonb),
        'pct', case when coalesce(st.weekly_hours, 0) > 0 then round((coalesce(h.h, 0) / (st.weekly_hours * 52 / 12) * 100)::numeric, 1) end,
        'hours', case when leader then round(coalesce(h.h, 0)::numeric, 1) end,
        'target', case when leader and coalesce(st.weekly_hours, 0) > 0 then round((st.weekly_hours * 52 / 12)::numeric, 1) end,
        'absent', exists (select 1 from absent a where a.staff_id = st.id)
      ) order by st.name) from st left join hrs h on h.staff_id = st.id), '[]'::jsonb),
    'assign', coalesce((select jsonb_agg(jsonb_build_object('job_id', x.job_id, 'staff_id', x.staff_id))
        from job_staff x join jobs j on j.id = x.job_id where x.org_id = p_org and j.work_date = p_day), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('customer_id', q.customer_id, 'staff_id', q.staff_id, 'n', q.n)) from (
        select j.customer_id, x.staff_id, count(*) as n from job_staff x join jobs j on j.id = x.job_id
        where x.org_id = p_org and j.status <> 'cancelled' and j.work_date < p_day and j.work_date >= p_day - 180
          and j.customer_id in (select customer_id from jobs where org_id = p_org and work_date = p_day)
        group by j.customer_id, x.staff_id) q), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke all on function public.touren_day_context(uuid, date) from public, anon;
grant execute on function public.touren_day_context(uuid, date) to authenticated;

create or replace function public.my_trips(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid; d0 date; vis jsonb;
begin
  me := my_staff_id(p_org);
  if me is null or not org_has_product(p_org, 'touren') or not exists (select 1 from touren_drivers where staff_id = me and org_id = p_org) then
    return jsonb_build_object('is_driver', false);
  end if;
  d0 := (now() at time zone org_tz(p_org))::date;
  -- (Tag, Person), die diese Fahrerin heute/morgen fährt
  select coalesce(jsonb_agg(jsonb_build_object('d', q.d, 's', q.s)), '[]'::jsonb) into vis from (
    select distinct j.work_date d, x.staff_id s from job_staff x join jobs j on j.id = x.job_id
    where x.org_id = p_org and j.work_date between d0 and d0 + 1 and j.status <> 'cancelled' and not j.needs_confirm
      and not touren_is_absent(p_org, x.staff_id, j.work_date) and touren_driver_for(p_org, x.staff_id, j.work_date) = me) q;
  return jsonb_build_object(
    'is_driver', true, 'today', d0,
    -- eigene Aufträge der Fahrer:in (für die Warnung „arbeitet zu dieser Zeit selbst“)
    'busy', coalesce((select jsonb_agg(jsonb_build_object('work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'), 'duration_min', j.duration_min))
      from job_staff x join jobs j on j.id = x.job_id where x.staff_id = me and j.work_date between d0 and d0 + 1 and j.status <> 'cancelled' and not j.needs_confirm), '[]'::jsonb),
    'travel_min', coalesce((select travel_min from touren_settings where org_id = p_org), 30),
    'staff', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'phone', s.phone, 'start_kind', coalesce(t.start_kind, 'none'),
        'start_name', case when t.start_kind = 'place' then p.name end,
        'start_address', case when t.start_kind = 'place' then p.address when t.start_kind = 'home' then t.home_address end,
        'start_lat', case when t.start_kind = 'place' then p.lat when t.start_kind = 'home' then t.home_lat end,
        'start_lng', case when t.start_kind = 'place' then p.lng when t.start_kind = 'home' then t.home_lng end))
      from staff s left join staff_touren t on t.staff_id = s.id left join touren_places p on p.id = t.place_id
      where s.org_id = p_org and s.id in (select (e->>'s')::uuid from jsonb_array_elements(vis) e)), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', j.id, 'work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'), 'duration_min', j.duration_min,
        'address', j.address_text, 'lat', j.lat, 'lng', j.lng, 'maps_url', j.maps_url,
        'customer', case when c.kind = 'company' and c.company is not null then c.company || ' – ' || c.name else c.name end,
        'staff', (select jsonb_agg(x.staff_id) from job_staff x where x.job_id = j.id and (j.work_date, x.staff_id) in (select (e->>'d')::date, (e->>'s')::uuid from jsonb_array_elements(vis) e)),
        'absent', '[]'::jsonb) order by j.work_date, j.start_time)
      from jobs j join customers c on c.id = j.customer_id
      where j.org_id = p_org and j.status <> 'cancelled' and not j.needs_confirm and exists (select 1 from job_staff x where x.job_id = j.id and (j.work_date, x.staff_id) in (select (e->>'d')::date, (e->>'s')::uuid from jsonb_array_elements(vis) e))), '[]'::jsonb)
  );
end $$;
revoke all on function public.my_trips(uuid) from public, anon;
grant execute on function public.my_trips(uuid) to authenticated;
