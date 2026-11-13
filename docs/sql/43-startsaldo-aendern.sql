-- 43-startsaldo-aendern.sql  (13 Nov 2026) – Run ONCE. Already run (migration startsaldo_aendern_43).
-- User: "one must always have access" to the Zeitkonto zum Start. set_start_balances now also CHANGES a saved value –
-- only with a reason (p_reason), every entry/change logged in staff_start_balance_log (old, new, reason, who, when).
create table if not exists public.staff_start_balance_log (
  id bigserial primary key,
  staff_id uuid not null, org_id uuid not null,
  old_minutes integer, new_minutes integer not null,
  reason text not null, changed_by uuid, changed_at timestamptz not null default now()
);
alter table public.staff_start_balance_log enable row level security;
drop policy if exists "Startsaldo-Protokoll lesen" on public.staff_start_balance_log;
create policy "Startsaldo-Protokoll lesen" on public.staff_start_balance_log for select to authenticated using (is_org_leader(org_id));
revoke all on public.staff_start_balance_log from anon, authenticated;
grant select on public.staff_start_balance_log to authenticated;

create or replace function public.set_start_balances(p_org uuid, p_rows jsonb, p_reason text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare e jsonb; n int := 0; v_staff uuid; v_min int; v_old int; v_had boolean;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Keine Angaben'; end if;
  for e in select value from jsonb_array_elements(p_rows) loop
    v_staff := (e->>'staff_id')::uuid; v_min := round((e->>'minutes')::numeric)::int;
    if not exists (select 1 from staff where id = v_staff and org_id = p_org) then raise exception 'Person nicht gefunden'; end if;
    if abs(v_min) > 120000 then raise exception 'Unrealistischer Wert (höchstens ±2000 Stunden)'; end if;
    if v_staff = my_staff_id(p_org) and coalesce(my_role(p_org), '') <> 'owner' then
      raise exception 'Das eigene Zeitkonto trägt der Inhaber oder eine andere Leitung ein'; end if;
    select minutes into v_old from staff_start_balance where staff_id = v_staff;
    v_had := found;
    if v_had and v_old = v_min then continue; end if;
    if v_had and length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Für eine Änderung bitte einen Grund angeben'; end if;
    insert into staff_start_balance (staff_id, org_id, minutes, set_by) values (v_staff, p_org, v_min, auth.uid())
      on conflict (staff_id) do update set minutes = excluded.minutes, set_by = excluded.set_by, set_at = now();
    insert into staff_start_balance_log (staff_id, org_id, old_minutes, new_minutes, reason, changed_by)
      values (v_staff, p_org, case when v_had then v_old end, v_min, coalesce(nullif(trim(p_reason), ''), 'erste Eingabe'), auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;
drop function if exists public.set_start_balances(uuid, jsonb);
revoke all on function public.set_start_balances(uuid, jsonb, text) from public, anon;
grant execute on function public.set_start_balances(uuid, jsonb, text) to authenticated;
