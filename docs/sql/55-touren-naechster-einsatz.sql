-- 55 – Mitarbeiter-App „Einsätze“ schöner (Wunsch Nutzer 24.11.2026: „خیلی بی روحه“)
-- Wenn heute und morgen nichts ist, zeigt die App „Nächster Einsatz: Do 27.11. · 08:00“.
-- Nur Datum und Uhrzeit (keine Kundendaten) – bis 60 Tage voraus.
create or replace function public.my_next_job(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid; d0 date; r jsonb;
begin
  me := my_staff_id(p_org);
  if me is null or not org_has_product(p_org, 'touren') or not is_org_member(p_org) then return null; end if;
  d0 := (now() at time zone org_tz(p_org))::date;
  select jsonb_build_object('work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI')) into r
    from job_staff x join jobs j on j.id = x.job_id
    where x.staff_id = me and j.org_id = p_org and j.status <> 'cancelled' and j.work_date between d0 + 2 and d0 + 60
    order by j.work_date, j.start_time limit 1;
  return r;
end $$;
revoke all on function public.my_next_job(uuid) from public, anon;
grant execute on function public.my_next_job(uuid) to authenticated;
