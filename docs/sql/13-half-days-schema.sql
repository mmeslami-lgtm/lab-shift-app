-- 13-half-days-schema.sql  (Dienstplaner allgemein: halbe Tage – nur vormittags / nur nachmittags geöffnet)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-12. Safe to run again.
--
--   * organizations.half_day_config  {"weekdays": {"3": "am"}, "shifts": {"M": "pm"}}
--         weekdays: day of the week (0 = Sonntag … 6 = Samstag) -> "am" (nur vormittags) / "pm" (nur nachmittags)
--         shifts:   manual choice whether a shift belongs to the morning or the afternoon
--                   (without a choice: start before 12:00 = morning, otherwise afternoon)
--   * month_closures.am_days / pm_days   single days of one month open only in the morning / afternoon
--   * set_opening_days(...) and set_month_closed_days(...) get one more optional parameter each;
--     old calls with fewer parameters keep working.

alter table organizations add column if not exists half_day_config jsonb not null default '{}'::jsonb;
alter table month_closures add column if not exists am_days int[] not null default '{}';
alter table month_closures add column if not exists pm_days int[] not null default '{}';

drop function if exists set_opening_days(uuid, smallint[], boolean);
create or replace function set_opening_days(p_org uuid, p_open_weekdays smallint[], p_closed_on_holidays boolean, p_half_day_config jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare clean smallint[]; cfg jsonb; wd jsonb := '{}'::jsonb; sh jsonb := '{}'::jsonb; k text; v text;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber dürfen die Öffnungstage ändern'; end if;
  select coalesce(array_agg(distinct d order by d), '{}') into clean
    from unnest(coalesce(p_open_weekdays, '{}')) d where d between 0 and 6;
  if array_length(clean, 1) is null then raise exception 'Mindestens ein Tag muss geöffnet sein'; end if;
  if p_half_day_config is not null then
    for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_half_day_config->'weekdays', '{}'::jsonb)) loop
      if k ~ '^[0-6]$' and v in ('am', 'pm') then wd := wd || jsonb_build_object(k, v); end if;
    end loop;
    for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_half_day_config->'shifts', '{}'::jsonb)) loop
      if length(k) between 1 and 40 and v in ('am', 'pm') then sh := sh || jsonb_build_object(k, v); end if;
    end loop;
    cfg := jsonb_build_object('weekdays', wd, 'shifts', sh);
  end if;
  update organizations set open_weekdays = clean, closed_on_holidays = coalesce(p_closed_on_holidays, false),
         half_day_config = coalesce(cfg, half_day_config)
   where id = p_org;
end $$;

drop function if exists set_month_closed_days(uuid, int, int, int[]);
create or replace function set_month_closed_days(p_org uuid, p_year int, p_month int, p_days int[], p_am_days int[] default null, p_pm_days int[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare clean int[]; am int[]; pm int[]; last_day int;
begin
  if not is_org_supervisor(p_org) then raise exception 'Keine Berechtigung'; end if;
  if p_month < 1 or p_month > 12 or p_year < 2000 or p_year > 2100 then raise exception 'Ungültiger Monat'; end if;
  last_day := extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'));
  select coalesce(array_agg(distinct d order by d), '{}') into clean from unnest(coalesce(p_days, '{}')) d where d between 1 and last_day;
  select coalesce(array_agg(distinct d order by d), '{}') into am from unnest(coalesce(p_am_days, '{}')) d where d between 1 and last_day and not d = any(clean);
  select coalesce(array_agg(distinct d order by d), '{}') into pm from unnest(coalesce(p_pm_days, '{}')) d where d between 1 and last_day and not d = any(clean) and not d = any(am);
  insert into month_closures (org_id, year, month, days, am_days, pm_days, updated_at, updated_by)
  values (p_org, p_year, p_month, clean, am, pm, now(), auth.uid())
  on conflict (org_id, year, month) do update set days = excluded.days,
    am_days = case when p_am_days is null then month_closures.am_days else excluded.am_days end,
    pm_days = case when p_pm_days is null then month_closures.pm_days else excluded.pm_days end,
    updated_at = now(), updated_by = auth.uid();
end $$;

revoke all on function set_opening_days(uuid, smallint[], boolean, jsonb) from public, anon;
revoke all on function set_month_closed_days(uuid, int, int, int[], int[], int[]) from public, anon;
grant execute on function set_opening_days(uuid, smallint[], boolean, jsonb) to authenticated;
grant execute on function set_month_closed_days(uuid, int, int, int[], int[], int[]) to authenticated;
