-- 54 – Touren: Sammelfahrten (Wunsch Nutzer 23.11.2026: „Wie kann Staff 4 um 14:23 gleichzeitig in Travemünde und Bohlkamp abholen?“)
-- Das Blatt rechnet jetzt eine Fahrt mit mehreren Haltestellen (Zeiten aus der Entfernung) und warnt bei Überschneidungen.
-- Dafür braucht es die Koordinaten der Abholorte und Aufträge (touren_transport) und die eigenen Aufträge der Fahrer:in (my_trips „busy“).
-- Sonst unverändert gegenüber 52.
create or replace function public.touren_transport(p_org uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_touren_staff(p_org) then raise exception 'Keine Berechtigung'; end if;
  if p_to < p_from or p_to - p_from > 31 then raise exception 'Zeitraum zu lang'; end if;
  return jsonb_build_object(
    'travel_min', coalesce((select travel_min from touren_settings where org_id = p_org), 30),
    'staff', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'phone', s.phone, 'start_kind', coalesce(t.start_kind, 'none'),
        'start_name', case when t.start_kind = 'place' then p.name end,
        'start_address', case when t.start_kind = 'place' then p.address when t.start_kind = 'home' then t.home_address end,
        'start_lat', case when t.start_kind = 'place' then p.lat when t.start_kind = 'home' then t.home_lat end,
        'start_lng', case when t.start_kind = 'place' then p.lng when t.start_kind = 'home' then t.home_lng end))
      from staff s left join staff_touren t on t.staff_id = s.id left join touren_places p on p.id = t.place_id
      where s.org_id = p_org and s.id in (select x.staff_id from job_staff x join jobs j on j.id = x.job_id
                                          where x.org_id = p_org and j.work_date between p_from and p_to and j.status <> 'cancelled')), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', j.id, 'work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'), 'duration_min', j.duration_min,
        'address', j.address_text, 'lat', j.lat, 'lng', j.lng, 'customer', case when c.kind = 'company' and c.company is not null then c.company || ' – ' || c.name else c.name end,
        'staff', coalesce((select jsonb_agg(x.staff_id) from job_staff x where x.job_id = j.id), '[]'::jsonb),
        'absent', coalesce((select jsonb_agg(x.staff_id) from job_staff x where x.job_id = j.id and touren_is_absent(p_org, x.staff_id, j.work_date)), '[]'::jsonb))
        order by j.work_date, j.start_time)
      from jobs j join customers c on c.id = j.customer_id
      where j.org_id = p_org and j.work_date between p_from and p_to and j.status <> 'cancelled'), '[]'::jsonb),
    'drivers', coalesce((select jsonb_agg(jsonb_build_object('id', d.staff_id, 'name', s.name, 'phone', s.phone) order by s.name)
      from touren_drivers d join staff s on s.id = d.staff_id where d.org_id = p_org and s.active), '[]'::jsonb),
    'driver_of', coalesce((select jsonb_agg(jsonb_build_object('work_date', q.d, 'staff_id', q.s, 'driver_id', touren_driver_for(p_org, q.s, q.d),
        'manual', exists (select 1 from touren_trip_driver m where m.org_id = p_org and m.work_date = q.d and m.staff_id = q.s)))
      from (select distinct j.work_date d, x.staff_id s from job_staff x join jobs j on j.id = x.job_id
            where x.org_id = p_org and j.work_date between p_from and p_to and j.status <> 'cancelled') q), '[]'::jsonb)
  );
end $$;
revoke all on function public.touren_transport(uuid, date, date) from public, anon;
grant execute on function public.touren_transport(uuid, date, date) to authenticated;

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
    where x.org_id = p_org and j.work_date between d0 and d0 + 1 and j.status <> 'cancelled'
      and not touren_is_absent(p_org, x.staff_id, j.work_date) and touren_driver_for(p_org, x.staff_id, j.work_date) = me) q;
  return jsonb_build_object(
    'is_driver', true, 'today', d0,
    -- eigene Aufträge der Fahrer:in (für die Warnung „arbeitet zu dieser Zeit selbst“)
    'busy', coalesce((select jsonb_agg(jsonb_build_object('work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'), 'duration_min', j.duration_min))
      from job_staff x join jobs j on j.id = x.job_id where x.staff_id = me and j.work_date between d0 and d0 + 1 and j.status <> 'cancelled'), '[]'::jsonb),
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
      where j.org_id = p_org and j.status <> 'cancelled' and exists (select 1 from job_staff x where x.job_id = j.id and (j.work_date, x.staff_id) in (select (e->>'d')::date, (e->>'s')::uuid from jsonb_array_elements(vis) e))), '[]'::jsonb)
  );
end $$;
revoke all on function public.my_trips(uuid) from public, anon;
grant execute on function public.my_trips(uuid) to authenticated;
