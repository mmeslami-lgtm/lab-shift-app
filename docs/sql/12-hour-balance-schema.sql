-- 12-hour-balance-schema.sql  (Stundensaldo: Überstunden / Minusstunden von Monat zu Monat)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-11. Safe to run again.
--
-- One row per person and month, written when the Leitung presses "Monat abschließen & archivieren":
--   contract_hours  the person's hours for that month from the contract (weekly hours, open days, leave)
--   planned_hours   the hours in the plan
--   sat_short / sun_short / night_short   weekend days / nights fewer than the fair share
-- Saldo of a person = sum of (planned - contract) of all EARLIER months. Next month's goal is
-- contract - saldo (Überstunden are given back as fewer hours, Minusstunden are caught up).
-- Pressing the button again for the same month overwrites that month (never counted twice).
-- Before this script the saldo lived only in the browser of one computer.

create table if not exists staff_month_balance (
  org_id          uuid not null references organizations(id) on delete cascade,
  staff_id        uuid not null,
  year            int  not null check (year between 2000 and 2100),
  month           int  not null check (month between 1 and 12),
  contract_hours  numeric(7,2) not null default 0,
  planned_hours   numeric(7,2) not null default 0,
  sat_short       numeric(5,2) not null default 0,
  sun_short       numeric(5,2) not null default 0,
  night_short     numeric(5,2) not null default 0,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  primary key (org_id, staff_id, year, month),
  foreign key (staff_id, org_id) references staff(id, org_id) on delete cascade
);
alter table staff_month_balance enable row level security;

drop policy if exists smb_select on staff_month_balance;
create policy smb_select on staff_month_balance for select
  using (is_org_supervisor(org_id) or staff_id = my_staff_id(org_id) or is_platform_admin());

-- p_rows: [{ "staff_id": "...", "contract_hours": 169.4, "planned_hours": 172.5,
--            "sat_short": 0, "sun_short": 1, "night_short": 0.5 }, ...]
create or replace function save_month_balances(p_org uuid, p_year int, p_month int, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  if not is_org_supervisor(p_org) then raise exception 'Keine Berechtigung'; end if;
  if p_month < 1 or p_month > 12 or p_year < 2000 or p_year > 2100 then raise exception 'Ungültiger Monat'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if not exists (select 1 from staff where id = (r->>'staff_id')::uuid and org_id = p_org) then continue; end if; -- only own staff
    insert into staff_month_balance (org_id, staff_id, year, month, contract_hours, planned_hours, sat_short, sun_short, night_short, updated_at, updated_by)
    values (p_org, (r->>'staff_id')::uuid, p_year, p_month,
            greatest(0, coalesce((r->>'contract_hours')::numeric, 0)), greatest(0, coalesce((r->>'planned_hours')::numeric, 0)),
            greatest(0, coalesce((r->>'sat_short')::numeric, 0)), greatest(0, coalesce((r->>'sun_short')::numeric, 0)),
            greatest(0, coalesce((r->>'night_short')::numeric, 0)), now(), auth.uid())
    on conflict (org_id, staff_id, year, month) do update set
      contract_hours = excluded.contract_hours, planned_hours = excluded.planned_hours,
      sat_short = excluded.sat_short, sun_short = excluded.sun_short, night_short = excluded.night_short,
      updated_at = now(), updated_by = auth.uid();
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function save_month_balances(uuid, int, int, jsonb) from public, anon;
grant execute on function save_month_balances(uuid, int, int, jsonb) to authenticated;
