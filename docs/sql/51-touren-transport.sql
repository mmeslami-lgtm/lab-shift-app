-- 51 – Touren: Transport-Blatt (Wunsch Nutzer 23.11.2026)
-- Fahrer:in holt das Personal am Startpunkt ab (Unterkunft oder Zuhause) und bringt es zum Kunden, weiter zum
-- nächsten Kunden und am Ende zurück. Die Heimadresse ist sonst nur für Inhaber/Leitung sichtbar (48) –
-- auf Wunsch des Nutzers darf das Büro sie NUR über dieses Blatt sehen (diese Funktion, nur zum Drucken).
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
        'start_address', case when t.start_kind = 'place' then p.address when t.start_kind = 'home' then t.home_address end))
      from staff s left join staff_touren t on t.staff_id = s.id left join touren_places p on p.id = t.place_id
      where s.org_id = p_org and s.id in (select x.staff_id from job_staff x join jobs j on j.id = x.job_id
                                          where x.org_id = p_org and j.work_date between p_from and p_to and j.status <> 'cancelled')), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', j.id, 'work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'), 'duration_min', j.duration_min,
        'address', j.address_text, 'customer', case when c.kind = 'company' and c.company is not null then c.company || ' – ' || c.name else c.name end,
        'staff', coalesce((select jsonb_agg(x.staff_id) from job_staff x where x.job_id = j.id), '[]'::jsonb),
        'absent', coalesce((select jsonb_agg(x.staff_id) from job_staff x where x.job_id = j.id and touren_is_absent(p_org, x.staff_id, j.work_date)), '[]'::jsonb))
        order by j.work_date, j.start_time)
      from jobs j join customers c on c.id = j.customer_id
      where j.org_id = p_org and j.work_date between p_from and p_to and j.status <> 'cancelled'), '[]'::jsonb)
  );
end $$;
revoke all on function public.touren_transport(uuid, date, date) from public, anon;
grant execute on function public.touren_transport(uuid, date, date) to authenticated;
