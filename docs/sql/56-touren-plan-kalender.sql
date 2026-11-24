-- 56 – Mitarbeiter-App „Plan“ zeigt auch Touren-Einsätze (Wunsch Nutzer 24.11.2026: „wenn sie für mehrere Wochen Arbeit haben?“)
-- Eigene Einsätze in einem Zeitraum (höchstens 62 Tage): Tag, Uhrzeit, Kunde, Adresse, Leistung.
-- Keine Hinweise, keine Zusatzfelder, kein Telefon (die gibt es nur am Tag selbst unter „Einsätze“).
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
    where x.staff_id = me and j.org_id = p_org and j.status <> 'cancelled' and j.work_date between p_from and p_to), '[]'::jsonb);
end $$;
revoke all on function public.my_jobs_range(uuid, date, date) from public, anon;
grant execute on function public.my_jobs_range(uuid, date, date) to authenticated;
