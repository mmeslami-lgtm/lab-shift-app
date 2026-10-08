-- 11-wishes-schema.sql  (Wünsche: Mitarbeitende -> Leitung)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-10. Safe to run again.
--
-- The table "wishes" already exists (script 2). This adds a simple approval flow:
--   draft      the employee is still collecting wishes (only they see it)
--   submitted  sent to the Leitung with one button ("An die Leitung senden")
--   approved / rejected   decided by Leitung or Inhaber (optional note)
-- Employees: insert their own drafts, delete their own wishes until a decision, send drafts.
-- They can never approve anything. Approved wishes are only TAKEN INTO a plan when the Leitung
-- presses "in den Plan übernehmen" in the planner; nothing changes automatically.

alter table wishes add column if not exists status        text not null default 'draft';
alter table wishes add column if not exists submitted_at  timestamptz;
alter table wishes add column if not exists decided_by    uuid;
alter table wishes add column if not exists decided_at    timestamptz;
alter table wishes add column if not exists decision_note text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'wishes_status_check') then
    alter table wishes add constraint wishes_status_check check (status in ('draft', 'submitted', 'approved', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wishes_work_needs_shift') then
    alter table wishes add constraint wishes_work_needs_shift check (wish_type = 'free' or shift_key is not null);
  end if;
end $$;

create index if not exists wishes_org_status on wishes (org_id, status, date_from);

-- employees: only their own DRAFTS may be created, nothing pre-decided
drop policy if exists mt_wish_insert_own on wishes;
create policy mt_wish_insert_own on wishes for insert
  with check (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')
              and status = 'draft' and decided_by is null and decided_at is null and submitted_at is null);

-- employees: withdraw own wishes only while no decision was made
drop policy if exists mt_wish_delete_own on wishes;
create policy mt_wish_delete_own on wishes for delete
  using (staff_id = my_staff_id(org_id) and status in ('draft', 'submitted'));

-- "An die Leitung senden": all own drafts of this company -> submitted. Returns how many were sent.
create or replace function submit_my_wishes(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare me uuid := my_staff_id(p_org); n int;
begin
  if me is null or not org_has_product(p_org, 'employee_app') then raise exception 'Keine Berechtigung'; end if;
  update wishes set status = 'submitted', submitted_at = now()
   where org_id = p_org and staff_id = me and status = 'draft';
  get diagnostics n = row_count;
  return n;
end $$;

-- Leitung / Inhaber decide (or reopen with 'submitted')
create or replace function decide_wish(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare w wishes;
begin
  select * into w from wishes where id = p_id;
  if w.id is null or not is_org_leader(w.org_id) then raise exception 'Nur Leitung oder Inhaber dürfen Wünsche entscheiden'; end if;
  if p_status not in ('approved', 'rejected', 'submitted') then raise exception 'Ungültiger Status'; end if;
  if w.status = 'draft' then raise exception 'Dieser Wunsch wurde noch nicht gesendet'; end if;
  update wishes set status = p_status,
    decided_by = case when p_status = 'submitted' then null else auth.uid() end,
    decided_at = case when p_status = 'submitted' then null else now() end,
    decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_id;
end $$;

revoke all on function submit_my_wishes(uuid) from public, anon;
revoke all on function decide_wish(uuid, text, text) from public, anon;
grant execute on function submit_my_wishes(uuid) to authenticated;
grant execute on function decide_wish(uuid, text, text) to authenticated;
