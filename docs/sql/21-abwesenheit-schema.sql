-- 21-abwesenheit-schema.sql  (Zeiterfassung: Abwesenheit statt "Kommen fehlt")
-- Run ONCE in the Supabase SQL Editor, after scripts 1-20. Safe to run again.
-- Leitung / Inhaber note WHY someone did not come: krank, urlaub, fortbildung (Dienstreise),
-- ueberstunden (Überstundenabbau), unentschuldigt, sonstiges. The warning disappears; the day counts in the
-- time account by its kind. Nothing is deleted: a wrong entry is "aufgehoben" (voided) with a reason.

create table if not exists attendance_absences (
  id          bigserial primary key,
  org_id      uuid not null references organizations(id) on delete cascade,
  staff_id    uuid not null,
  work_date   date not null,
  kind        text not null check (kind in ('krank', 'urlaub', 'fortbildung', 'ueberstunden', 'unentschuldigt', 'sonstiges')),
  note        text check (note is null or length(note) <= 500),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  voided_by   uuid,
  void_reason text,
  foreign key (staff_id, org_id) references staff(id, org_id) on delete cascade
);
create unique index if not exists attendance_absences_one_per_day on attendance_absences (staff_id, work_date) where voided_at is null;
alter table attendance_absences enable row level security;
drop policy if exists aab_select on attendance_absences;
create policy aab_select on attendance_absences for select
  using (is_org_leader(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));
-- no insert/update/delete policies: only through the two functions below

create or replace function set_absence(p_org uuid, p_staff uuid, p_date date, p_kind text, p_note text)
returns bigint language plpgsql security definer set search_path = public as $$
declare aid bigint;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if not exists (select 1 from staff where id = p_staff and org_id = p_org) then raise exception 'Person gehört nicht zu dieser Firma'; end if;
  if p_kind not in ('krank', 'urlaub', 'fortbildung', 'ueberstunden', 'unentschuldigt', 'sonstiges') then raise exception 'Ungültiger Grund'; end if;
  update attendance_absences set voided_at = now(), voided_by = auth.uid(), void_reason = 'ersetzt'
   where staff_id = p_staff and work_date = p_date and voided_at is null;
  insert into attendance_absences (org_id, staff_id, work_date, kind, note, created_by)
  values (p_org, p_staff, p_date, p_kind, nullif(trim(coalesce(p_note, '')), ''), auth.uid()) returning id into aid;
  return aid;
end $$;

create or replace function void_absence(p_id bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare a attendance_absences;
begin
  select * into a from attendance_absences where id = p_id;
  if a.id is null or not is_org_leader(a.org_id) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Bitte einen Grund angeben'; end if;
  update attendance_absences set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id and voided_at is null;
end $$;

revoke all on function set_absence(uuid, uuid, date, text, text) from public, anon;
revoke all on function void_absence(bigint, text) from public, anon;
grant execute on function set_absence(uuid, uuid, date, text, text) to authenticated;
grant execute on function void_absence(bigint, text) to authenticated;
