-- 60 – Touren: Einsatz im Büro abschließen (Wunsch Nutzer 26.11.2026: „vielleicht kann jemand nicht mit der App
--      arbeiten – dann muss das Büro es selbst im System eintragen können“).
-- job_office_close: wie job_finish (Script 57), aber für Inhaber / Leitung / Büro (is_touren_staff) statt für die
-- eingeteilte Person. Ist-Zeiten (optional) werden als Uhrzeit am Einsatztag in der Zeitzone der Firma eingetragen.
-- „Nicht fertig“: Auftrag = erledigt (teilweise) + Fortsetzung (gleicher Kunde/Adresse/Leistung, Restdauer, nächster Tag,
-- gleiche Uhrzeit, needs_confirm) – erscheint in „Bitte prüfen“ → „Einplanen“, genau wie aus der App.
create or replace function public.job_office_close(p_job uuid, p_outcome text, p_arrived text, p_finished text, p_remaining_min integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare j jobs; nid uuid; rest int; tz text; a timestamptz; f timestamptz;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null then raise exception 'Auftrag nicht gefunden'; end if;
  if not is_touren_staff(j.org_id) then raise exception 'Keine Berechtigung'; end if;
  if j.status = 'cancelled' then raise exception 'Der Auftrag ist storniert.'; end if;
  if p_outcome not in ('done', 'partial') then raise exception 'Ungültig'; end if;
  tz := org_tz(j.org_id);
  if j.work_date > (now() at time zone tz)::date then raise exception 'Dieser Einsatz liegt in der Zukunft.'; end if;
  if coalesce(p_arrived, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and coalesce(p_arrived, '') <> '' then raise exception 'Ungültige Uhrzeit'; end if;
  if coalesce(p_finished, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and coalesce(p_finished, '') <> '' then raise exception 'Ungültige Uhrzeit'; end if;
  a := case when coalesce(p_arrived, '') <> '' then (j.work_date + p_arrived::time) at time zone tz end;
  f := case when coalesce(p_finished, '') <> '' then (j.work_date + p_finished::time) at time zone tz end;
  if a is not null and f is not null and f <= a then raise exception '„Fertig“ muss nach „Angekommen“ liegen.'; end if;
  if p_outcome = 'partial' then
    rest := round(coalesce(p_remaining_min, 0) / 15.0) * 15;
    if rest < 15 or rest > 1440 then raise exception 'Bitte angeben, wie lange es noch dauert.'; end if;
  end if;
  update jobs set arrived_at = coalesce(a, arrived_at), finished_at = coalesce(f, finished_at), outcome = p_outcome, status = 'done',
    overrun_reason = coalesce(nullif(left(trim(coalesce(p_reason, '')), 200), ''), overrun_reason)
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
revoke all on function public.job_office_close(uuid, text, text, text, integer, text) from public, anon;
grant execute on function public.job_office_close(uuid, text, text, text, integer, text) to authenticated;
