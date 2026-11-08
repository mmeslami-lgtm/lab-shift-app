-- 39-nur-kommen-beantragen.sql  (7 Nov 2026) – Run ONCE. Safe to run again. Already run (migration nur_kommen_beantragen_39).
-- Employee forgot "Kommen" today and the shift is still running: the employee app may now request ONLY "Kommen"
-- (no "Gehen" yet). On approval an OPEN stamp is created; the person stamps "Gehen" normally at the end.
-- If the person already stamped again before the approval (the app/terminal then saw no open stamp and recorded a
-- "Kommen" – which was really the "Gehen"), that open stamp is turned into: Kommen = requested time, Gehen = that stamp.
-- Everything is logged in attendance_corrections with the reason. Only decide_correction_request changes.
create or replace function public.decide_correction_request(p_id bigint, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r attendance_correction_requests; v_open attendance_sessions; v_sid bigint; v_why text;
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
    elsif r.check_out is null then
      -- 39: only "Kommen" requested (forgot to stamp in, still working)
      if r.check_in is null or r.check_in > now() then raise exception 'Kommen fehlt oder liegt in der Zukunft'; end if;
      select * into v_open from attendance_sessions
       where org_id = r.org_id and staff_id = r.staff_id and check_out is null
         and check_in > r.check_in and check_in < r.check_in + interval '16 hours'
       order by check_in limit 1;
      if v_open.id is not null then
        -- the later stamp was really the "Gehen"
        perform correct_attendance(v_open.id, 'check_in', r.check_in, v_why);   -- first the earlier Kommen …
        perform correct_attendance(v_open.id, 'check_out', v_open.check_in, v_why || ' (Stempel war das Gehen)'); -- … then the old stamp as Gehen
      else
        if exists (select 1 from attendance_sessions where org_id = r.org_id and staff_id = r.staff_id and check_out is null) then
          raise exception 'Die Person ist schon eingestempelt (offene Stempelung) – bitte in „Zeiten bearbeiten“ prüfen';
        end if;
        insert into attendance_sessions (org_id, staff_id, check_in, check_out) values (r.org_id, r.staff_id, r.check_in, null) returning id into v_sid;
        insert into attendance_corrections (session_id, staff_id, field, old_value, new_value, reason, corrected_by, corrected_at, org_id)
        values (v_sid, r.staff_id, 'check_in', null, r.check_in, trim(v_why), auth.uid()::text, now(), r.org_id);
      end if;
    else
      perform add_attendance_session(r.org_id, r.staff_id, r.check_in, r.check_out, v_why);
    end if;
  end if;
  update attendance_correction_requests set status = case when p_approve then 'approved' else 'denied' end,
         decision_note = nullif(trim(coalesce(p_note, '')), ''), decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $function$;
