-- 42-startsaldo-passwort.sql  (9 Nov 2026) – Run ONCE. Safe to run again. Already run (migration startsaldo_passwort_42).
-- 1) staff_start_balance: the Zeitkonto of each person when the company starts with Dienstigo (e.g. from the old
--    system). Entered ONCE per person by Inhaber/Leitung (pop-up "Zeitkonto zum Start"), then fixed: later changes
--    only with a reason in "Überstunden: Zeitkonto – ändern". Counted in the employee app, the Stundenzettel and the
--    planners ("Saldo Vormonat"). minutes: + = Überstunden, − = Minusstunden.
-- 2) password_reset_log: "Passwort vergessen?" (temporary password by e-mail) – only for the rate limit; server only.
create table if not exists public.staff_start_balance (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  org_id   uuid not null references public.organizations(id) on delete cascade,
  minutes  integer not null check (abs(minutes) <= 120000),
  set_by   uuid,
  set_at   timestamptz not null default now()
);
create index if not exists staff_start_balance_org_idx on public.staff_start_balance (org_id);
alter table public.staff_start_balance enable row level security;
drop policy if exists "Startsaldo lesen" on public.staff_start_balance;
create policy "Startsaldo lesen" on public.staff_start_balance for select to authenticated
  using (is_org_leader(org_id) or staff_id = my_staff_id(org_id));
revoke all on public.staff_start_balance from anon, authenticated;
grant select on public.staff_start_balance to authenticated;

create or replace function public.set_start_balances(p_org uuid, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare e jsonb; n int := 0; v_staff uuid; v_min int;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Keine Angaben'; end if;
  for e in select value from jsonb_array_elements(p_rows) loop
    v_staff := (e->>'staff_id')::uuid; v_min := round((e->>'minutes')::numeric)::int;
    if not exists (select 1 from staff where id = v_staff and org_id = p_org) then raise exception 'Person nicht gefunden'; end if;
    if abs(v_min) > 120000 then raise exception 'Unrealistischer Wert (höchstens ±2000 Stunden)'; end if;
    if v_staff = my_staff_id(p_org) and coalesce(my_role(p_org), '') <> 'owner' then
      raise exception 'Das eigene Zeitkonto trägt der Inhaber oder eine andere Leitung ein'; end if;
    insert into staff_start_balance (staff_id, org_id, minutes, set_by) values (v_staff, p_org, v_min, auth.uid())
      on conflict (staff_id) do nothing;   -- ONCE per person
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.set_start_balances(uuid, jsonb) from public, anon;
grant execute on function public.set_start_balances(uuid, jsonb) to authenticated;

create table if not exists public.password_reset_log (
  id bigserial primary key,
  email_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_log_idx on public.password_reset_log (email_hash, created_at);
alter table public.password_reset_log enable row level security;  -- no policy: server (service role) only
revoke all on public.password_reset_log from anon, authenticated;
