-- 50 – Touren: Krank / abwesend (Wunsch Nutzer 23.11.2026)
-- Ablauf: Mitarbeiter meldet sich in der App krank (gibt es schon: Anträge → Krank) ODER Inhaber/Leitung
-- trägt es in Touren ein („Abwesend melden“). Touren zeigt sofort: betroffene Aufträge + „Ersatz finden“.
--   * Abwesend = genehmigter Antrag (jede Art) ODER offene Krankmeldung (krank / krank_ohne – braucht keine
--     Genehmigung, nur Meldung) ODER Eintrag in attendance_absences.
--   * Büro sieht nur „abwesend“, nie den Grund (Gesundheitsdaten).
--   * Rotes Abzeichen zählt Personal, das abwesend ist, nicht mehr als eingeteilt.

-- 1) Hilfsfunktion (nur intern)
create or replace function public.touren_is_absent(p_org uuid, p_staff uuid, p_day date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from requests r where r.org_id = p_org and r.staff_id = p_staff and p_day between r.date_from and r.date_to
                   and (r.status = 'approved' or (r.status = 'open' and r.type_key in ('krank', 'krank_ohne'))))
      or exists (select 1 from attendance_absences a where a.org_id = p_org and a.staff_id = p_staff and a.work_date = p_day and a.voided_at is null)
$$;
revoke all on function public.touren_is_absent(uuid, uuid, date) from public, anon, authenticated;

-- 2) Tageskontext: Abwesenheit über die Hilfsfunktion (sonst unverändert gegenüber 48)
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
    select x.staff_id, sum(j.duration_min) / 60.0 as h
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

-- 3) Rotes Abzeichen: Aufträge, bei denen (eingeteilt – abwesend) < benötigt
create or replace function public.touren_open_count(p_org uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when not is_touren_staff(p_org) then 0 else (
    select count(*)::int from jobs j
    where j.org_id = p_org and j.status in ('new', 'accepted')
      and j.work_date between (now() at time zone org_tz(p_org))::date and (now() at time zone org_tz(p_org))::date + 30
      and (select count(*) from job_staff x where x.job_id = j.id and not touren_is_absent(p_org, x.staff_id, j.work_date)) < j.staff_needed
  ) end
$$;
revoke all on function public.touren_open_count(uuid) from public, anon;
grant execute on function public.touren_open_count(uuid) to authenticated;

-- 4) Betroffene Aufträge: eingeteilte Person ist an dem Tag abwesend (ohne Grund)
create or replace function public.touren_absence_conflicts(p_org uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_touren_staff(p_org) then raise exception 'Keine Berechtigung'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'Zeitraum zu lang'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'job_id', j.id, 'job_no', j.job_no, 'work_date', j.work_date, 'start_time', to_char(j.start_time, 'HH24:MI'),
      'customer', c.name, 'staff_id', s.id, 'staff_name', s.name) order by j.work_date, j.start_time, s.name)
    from job_staff x join jobs j on j.id = x.job_id join staff s on s.id = x.staff_id join customers c on c.id = j.customer_id
    where x.org_id = p_org and j.status in ('new', 'accepted') and j.work_date between p_from and p_to
      and touren_is_absent(p_org, x.staff_id, j.work_date)), '[]'::jsonb);
end $$;
revoke all on function public.touren_absence_conflicts(uuid, date, date) from public, anon;
grant execute on function public.touren_absence_conflicts(uuid, date, date) to authenticated;

-- 5) Inhaber/Leitung trägt Abwesenheit ein (z. B. Anruf „bin krank“): genehmigter Antrag – erscheint auch
--    in der Mitarbeiter-App unter „Anträge“, stornierbar über „Anträge“.
create or replace function public.touren_report_absence(p_org uuid, p_staff uuid, p_type text, p_from date, p_to date, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not (is_org_leader(p_org) and is_touren_staff(p_org)) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if not exists (select 1 from staff where id = p_staff and org_id = p_org) then raise exception 'Person gehört nicht zu dieser Firma'; end if;
  if not exists (select 1 from request_types where org_id = p_org and key = p_type) then raise exception 'Ungültiger Grund'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'Bitte den Zeitraum prüfen.'; end if;
  insert into requests (org_id, staff_id, type_key, date_from, date_to, days, note, status, decided_by, decided_at)
  values (p_org, p_staff, p_type, p_from, p_to, 0, nullif(left(trim(coalesce(p_note, '')), 500), ''), 'approved', my_staff_id(p_org), now())
  returning id into rid;
  return rid;
end $$;
revoke all on function public.touren_report_absence(uuid, uuid, text, date, date, text) from public, anon;
grant execute on function public.touren_report_absence(uuid, uuid, text, date, date, text) to authenticated;
