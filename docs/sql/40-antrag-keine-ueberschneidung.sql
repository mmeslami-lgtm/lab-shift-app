-- 40-antrag-keine-ueberschneidung.sql  (8 Nov 2026) – Run ONCE. Safe to run again. Already run (migration antrag_keine_ueberschneidung_40).
-- Bug found in the test: the Leitung entered Anna B's time by hand (06:00–14:00) and then ALSO approved her request
-- "nur Kommen 06:00" -> a second, open stamp at 06:00 ("Gehen fehlt"), which could not be closed (overlap).
-- Now decide_correction_request refuses the approval when the changed / new stamp overlaps another one:
-- "… die Zeit ist schon eingetragen. Antrag bitte „Ablehnen“ …". Same check as in save_attendance_edits (script 36).
create or replace function public.decide_correction_request(p_id bigint, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r attendance_correction_requests; v_open attendance_sessions; v_sid bigint; v_why text; v_touch bigint; v_bad record;
begin
  select * into r from attendance_correction_requests where id = p_id;
  if r.id is null or not is_org_leader(r.org_id) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if r.status <> 'open' then raise exception 'Dieser Antrag ist schon entschieden'; end if;
  if r.staff_id = my_staff_id(r.org_id) and coalesce(my_role(r.org_id), '') <> 'owner' then
    raise exception 'Eigene Anträge entscheidet der Inhaber oder eine andere Leitung'; end if;
  if p_approve then
    v_why := 'Antrag: ' || r.reason;
    if r.session_id is not null then
      if r.check_in is not null then perform correct_attendance(r.session_id, 'check_in', r.check_in, v_why); end if;
      if r.check_out is not null then perform correct_attendance(r.session_id, 'check_out', r.check_out, v_why); end if;
      v_touch := r.session_id;
    elsif r.check_out is null then
      if r.check_in is null or r.check_in > now() then raise exception 'Kommen fehlt oder liegt in der Zukunft'; end if;
      select * into v_open from attendance_sessions
       where org_id = r.org_id and staff_id = r.staff_id and check_out is null
         and check_in > r.check_in and check_in < r.check_in + interval '16 hours'
       order by check_in limit 1;
      if v_open.id is not null then
        perform correct_attendance(v_open.id, 'check_in', r.check_in, v_why);
        perform correct_attendance(v_open.id, 'check_out', v_open.check_in, v_why || ' (Stempel war das Gehen)');
        v_touch := v_open.id;
      else
        if exists (select 1 from attendance_sessions where org_id = r.org_id and staff_id = r.staff_id and check_out is null) then
          raise exception 'Die Person ist schon eingestempelt (offene Stempelung) – bitte in „Zeiten bearbeiten“ prüfen';
        end if;
        insert into attendance_sessions (org_id, staff_id, check_in, check_out) values (r.org_id, r.staff_id, r.check_in, null) returning id into v_sid;
        insert into attendance_corrections (session_id, staff_id, field, old_value, new_value, reason, corrected_by, corrected_at, org_id)
        values (v_sid, r.staff_id, 'check_in', null, r.check_in, trim(v_why), auth.uid()::text, now(), r.org_id);
        v_touch := v_sid;
      end if;
    else
      v_touch := add_attendance_session(r.org_id, r.staff_id, r.check_in, r.check_out, v_why);
    end if;
    -- 40: never two stamps at the same time
    select b.check_in b_in, b.check_out b_out into v_bad
      from attendance_sessions a join attendance_sessions b on b.org_id = a.org_id and b.staff_id = a.staff_id and b.id <> a.id
     where a.id = v_touch
       and a.check_in < coalesce(b.check_out, b.check_in + interval '1 second')
       and b.check_in < coalesce(a.check_out, a.check_in + interval '1 second')
     limit 1;
    if found then
      raise exception 'Überschneidung mit einer bestehenden Stempelung (% – %) – die Zeit ist schon eingetragen. Antrag bitte „Ablehnen“ (z. B. „schon erledigt“).',
        to_char(v_bad.b_in at time zone 'Europe/Berlin', 'DD.MM. HH24:MI'), coalesce(to_char(v_bad.b_out at time zone 'Europe/Berlin', 'HH24:MI'), 'Gehen fehlt');
    end if;
  end if;
  update attendance_correction_requests set status = case when p_approve then 'approved' else 'denied' end,
         decision_note = nullif(trim(coalesce(p_note, '')), ''), decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $function$;
