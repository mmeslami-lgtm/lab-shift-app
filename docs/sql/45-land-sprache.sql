-- 45 – Land & Sprache pro Firma (Paket D1, Dubai-Basis)
-- Deutsche Firmen: alles bleibt wie bisher (Standardwerte DE / de / Europe/Berlin / EUR).
-- Nur der Plattform-Admin (/admin, service_role) ändert diese Werte (RLS: organizations nur Admin schreibt).

-- 1) Spalten
alter table organizations add column if not exists country  text not null default 'DE';
alter table organizations add column if not exists language text not null default 'de';
alter table organizations add column if not exists timezone text not null default 'Europe/Berlin';
alter table organizations add column if not exists currency text not null default 'EUR';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_country_chk') then
    alter table organizations add constraint organizations_country_chk  check (country  in ('DE', 'AE'));
    alter table organizations add constraint organizations_language_chk check (language in ('de', 'en'));
    alter table organizations add constraint organizations_timezone_chk check (timezone in ('Europe/Berlin', 'Asia/Dubai'));
    alter table organizations add constraint organizations_currency_chk check (currency in ('EUR', 'AED'));
  end if;
end $$;

-- 2) Zeitzone einer Firma (Fallback Berlin)
create or replace function public.org_tz(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from organizations where id = p_org), 'Europe/Berlin')
$$;
grant execute on function public.org_tz(uuid) to authenticated, service_role;

-- 3) Feiertage pro Land (Deutschland wird weiter im Code berechnet; VAE trägt der Admin ein)
create table if not exists country_holidays (
  country text not null check (country in ('AE')),
  day     date not null,
  name    text not null check (length(trim(name)) between 1 and 80),
  primary key (country, day)
);
alter table country_holidays enable row level security;
drop policy if exists country_holidays_read on country_holidays;
create policy country_holidays_read on country_holidays for select to authenticated using (true);
drop policy if exists country_holidays_admin on country_holidays;
create policy country_holidays_admin on country_holidays for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());
revoke all on country_holidays from anon;
grant select on country_holidays to authenticated;
grant all on country_holidays to service_role;

-- 4) Drei Funktionen hatten 'Europe/Berlin' fest im Text -> jetzt Zeitzone der Firma.
--    (Für deutsche Firmen identisches Ergebnis.)
do $$
declare d text;
begin
  select pg_get_functiondef('public.save_attendance_edits(uuid, jsonb, text)'::regprocedure) into d;
  execute replace(d, '''Europe/Berlin''', 'org_tz(p_org)');
  select pg_get_functiondef('public.decide_correction_request(bigint, boolean, text)'::regprocedure) into d;
  execute replace(d, '''Europe/Berlin''', 'org_tz(r.org_id)');
  select pg_get_functiondef('public.staff_month_balance_only_past()'::regprocedure) into d;
  execute replace(d, '''Europe/Berlin''', 'org_tz(new.org_id)');
end $$;
