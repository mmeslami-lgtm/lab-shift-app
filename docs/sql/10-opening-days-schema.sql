-- 10-opening-days-schema.sql  (Dienstplaner allgemein: Öffnungstage + Betriebsschließung)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-9. Safe to run again.
--
--   * organizations.open_weekdays       days of the week the company is open (0 = Sonntag ... 6 = Samstag),
--                                        default: all seven days (as before)
--   * organizations.closed_on_holidays  true = closed on public holidays
--   * month_closures                    whole company closed on certain days of one month (z. B. 24-31)
--   * set_opening_days(...)             Leitung/Inhaber change the opening days
--   * set_month_closed_days(...)        Leitung/Inhaber/Schichtplaner set the closed days of a month
-- Nothing else changes. The lab planner ignores these settings (a lab is always open).

alter table organizations add column if not exists open_weekdays smallint[] not null default '{0,1,2,3,4,5,6}';
alter table organizations add column if not exists closed_on_holidays boolean not null default false;

create table if not exists month_closures (
  org_id     uuid not null references organizations(id) on delete cascade,
  year       int  not null check (year between 2000 and 2100),
  month      int  not null check (month between 1 and 12),
  days       int[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (org_id, year, month)
);
alter table month_closures enable row level security;

-- every member of the company may read (employees see "geschlossen"); writing only through the function below
drop policy if exists mc_select on month_closures;
create policy mc_select on month_closures for select using (is_org_member(org_id) or is_platform_admin());

create or replace function set_opening_days(p_org uuid, p_open_weekdays smallint[], p_closed_on_holidays boolean)
returns void language plpgsql security definer set search_path = public as $$
declare clean smallint[];
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber dürfen die Öffnungstage ändern'; end if;
  select coalesce(array_agg(distinct d order by d), '{}') into clean
    from unnest(coalesce(p_open_weekdays, '{}')) d where d between 0 and 6;
  if array_length(clean, 1) is null then raise exception 'Mindestens ein Tag muss geöffnet sein'; end if;
  update organizations set open_weekdays = clean, closed_on_holidays = coalesce(p_closed_on_holidays, false) where id = p_org;
end $$;

create or replace function set_month_closed_days(p_org uuid, p_year int, p_month int, p_days int[])
returns void language plpgsql security definer set search_path = public as $$
declare clean int[]; last_day int;
begin
  if not is_org_supervisor(p_org) then raise exception 'Keine Berechtigung'; end if;
  if p_month < 1 or p_month > 12 or p_year < 2000 or p_year > 2100 then raise exception 'Ungültiger Monat'; end if;
  last_day := extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'));
  select coalesce(array_agg(distinct d order by d), '{}') into clean
    from unnest(coalesce(p_days, '{}')) d where d between 1 and last_day;
  insert into month_closures (org_id, year, month, days, updated_at, updated_by)
  values (p_org, p_year, p_month, clean, now(), auth.uid())
  on conflict (org_id, year, month) do update set days = excluded.days, updated_at = now(), updated_by = auth.uid();
end $$;

revoke all on function set_opening_days(uuid, smallint[], boolean) from public, anon;
revoke all on function set_month_closed_days(uuid, int, int, int[]) from public, anon;
grant execute on function set_opening_days(uuid, smallint[], boolean) to authenticated;
grant execute on function set_month_closed_days(uuid, int, int, int[]) to authenticated;
