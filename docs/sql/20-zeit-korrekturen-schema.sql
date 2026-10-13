-- 20-zeit-korrekturen-schema.sql  (Zeiterfassung Stufe 2: Korrekturen – vergessenes Kommen/Gehen)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-19. Safe to run again.
--  * attendance_correction_requests: the employee asks in the app ("Korrektur beantragen")
--  * decide_correction_request(...): Leitung / Inhaber approve (applies it) or deny (with reason)
--  * add_attendance_session(...): Leitung / Inhaber add a whole missing day directly (reason required)
-- Stamps themselves never change; every correction is logged in attendance_corrections (who, when, why, old -> new).

create table if not exists attendance_correction_requests (
  id            bigserial primary key,
  org_id        uuid not null references organizations(id) on delete cascade,
  staff_id      uuid not null,
  session_id    bigint references attendance_sessions(id) on delete set null,
  work_date     date not null,
  check_in      timestamptz,
  check_out     timestamptz,
  reason        text not null check (length(trim(reason)) between 3 and 500),
  status        text not null default 'open' check (status in ('open', 'approved', 'denied')),
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  created_at    timestamptz not null default now(),
  decided_by    uuid,
  decided_at    timestamptz,
  foreign key (staff_id, org_id) references staff(id, org_id) on delete cascade,
  check (check_in is not null or check_out is not null),
  check (check_in is null or check_out is null or check_out > check_in)
);
alter table attendance_correction_requests enable row level security;
drop policy if exists acr_select on attendance_correction_requests;
create policy acr_select on attendance_correction_requests for select
  using (is_org_leader(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists acr_insert on attendance_correction_requests;
create policy acr_insert on attendance_correction_requests for insert
  with check (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app') and status = 'open'
              and decided_by is null and decision_note is null
              and (session_id is null or exists (select 1 from attendance_sessions s where s.id = attendance_correction_requests.session_id
                                                 and s.staff_id = attendance_correction_requests.staff_id and s.org_id = attendance_correction_requests.org_id)));
drop policy if exists acr_delete on attendance_correction_requests;
create policy acr_delete on attendance_correction_requests for delete
  using (staff_id = my_staff_id(org_id) and status = 'open');

create or replace function add_attendance_session(p_org uuid, p_staff uuid, p_in timestamptz, p_out timestamptz, p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare sid bigint;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber dürfen Arbeitszeiten nachtragen'; end if;
  if not exists (select 1 from staff where id = p_staff and org_id = p_org) then raise exception 'Person gehört nicht zu dieser Firma'; end if;
  if p_in is null or p_out is null or p_out <= p_in then raise exception 'Bitte Kommen und Gehen angeben (Gehen nach Kommen)'; end if;
  if p_out - p_in > interval '16 hours' then raise exception 'Mehr als 16 Stunden – bitte prüfen'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Bitte einen Grund angeben'; end if;
  insert into attendance_sessions (org_id, staff_id, check_in, check_out) values (p_org, p_staff, p_in, p_out) returning id into sid;
  insert into attendance_corrections (session_id, staff_id, field, old_value, new_value, reason, corrected_by, corrected_at, org_id) values
    (sid, p_staff, 'check_in', null, p_in, trim(p_reason), auth.uid()::text, now(), p_org),
    (sid, p_staff, 'check_out', null, p_out, trim(p_reason), auth.uid()::text, now(), p_org);
  return sid;
end $$;

create or replace function decide_correction_request(p_id bigint, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r attendance_correction_requests;
begin
  select * into r from attendance_correction_requests where id = p_id;
  if r.id is null or not is_org_leader(r.org_id) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if r.status <> 'open' then raise exception 'Dieser Antrag ist schon entschieden'; end if;
  if p_approve then
    if r.session_id is not null then
      if r.check_in is not null then perform correct_attendance(r.session_id, 'check_in', r.check_in, 'Antrag: ' || r.reason); end if;
      if r.check_out is not null then perform correct_attendance(r.session_id, 'check_out', r.check_out, 'Antrag: ' || r.reason); end if;
    else
      perform add_attendance_session(r.org_id, r.staff_id, r.check_in, r.check_out, 'Antrag: ' || r.reason);
    end if;
  end if;
  update attendance_correction_requests set status = case when p_approve then 'approved' else 'denied' end,
         decision_note = nullif(trim(coalesce(p_note, '')), ''), decided_by = auth.uid(), decided_at = now()
   where id = p_id;
end $$;

revoke all on function add_attendance_session(uuid, uuid, timestamptz, timestamptz, text) from public, anon;
revoke all on function decide_correction_request(bigint, boolean, text) from public, anon;
grant execute on function add_attendance_session(uuid, uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function decide_correction_request(bigint, boolean, text) to authenticated;
