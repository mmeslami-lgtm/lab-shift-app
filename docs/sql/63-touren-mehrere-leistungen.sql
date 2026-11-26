-- 63 – Touren: mehrere Leistungen pro Auftrag (Wunsch Nutzer 26.11.2026: „ein Kunde will vielleicht mehrere Services –
--      man muss Services hinzufügen können“; „hat eine Person nicht alle Fähigkeiten, geben wir separates Personal“).
-- * jobs / job_series: extra_service_ids uuid[] = weitere Leistungen; die erste bleibt in service_type_id (Haupt-Leistung),
--   damit alles Bisherige (Druck, Verlauf, Vorlagen) weiter funktioniert.
-- * Trigger touren_services_guard: nur Leistungen der eigenen Firma, ohne Doppelte, ohne die Haupt-Leistung;
--   neue Aufträge aus einer Reihe (series_id) oder als Fortsetzung (parent_job_id) übernehmen die weiteren Leistungen,
--   wenn keine angegeben sind (touren_series_gen, job_finish, job_office_close bleiben unverändert).
-- * touren_service_names(main, extra) → „Grundreinigung + Fensterreinigung“; my_jobs / my_jobs_range geben das als 'service'
--   aus – die Mitarbeiter-App selbst bleibt unverändert.
-- * touren_series_change: Schlüssel 'extra_service_ids' (Reihe + offene Termine).
-- 63c (26.11.2026): bis zu 40 weitere Leistungen (Nutzer: „vielleicht wähle ich 20 Services“).
alter table public.jobs add column if not exists extra_service_ids uuid[] not null default '{}';
alter table public.job_series add column if not exists extra_service_ids uuid[] not null default '{}';

create or replace function public.touren_services_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and tg_table_name = 'jobs' and cardinality(coalesce(new.extra_service_ids, '{}')) = 0 then
    if new.series_id is not null then
      select s.extra_service_ids into new.extra_service_ids from job_series s where s.id = new.series_id;
    elsif new.parent_job_id is not null then
      select p.extra_service_ids into new.extra_service_ids from jobs p where p.id = new.parent_job_id;
    end if;
  end if;
  new.extra_service_ids := coalesce(array(
    select x from (select distinct on (x) x, o from unnest(coalesce(new.extra_service_ids, '{}')) with ordinality u(x, o) where x is not null order by x, o) q
    where x is distinct from new.service_type_id order by o), '{}');
  if cardinality(new.extra_service_ids) > 40 then raise exception 'Höchstens 40 weitere Leistungen'; end if;
  if exists (select 1 from unnest(new.extra_service_ids) x where not exists (select 1 from service_types s where s.id = x and s.org_id = new.org_id)) then
    raise exception 'Leistung gehört nicht zu dieser Firma';
  end if;
  return new;
end $$;
drop trigger if exists touren_services_guard on public.jobs;
create trigger touren_services_guard before insert or update of extra_service_ids, service_type_id on public.jobs
  for each row execute function public.touren_services_guard();
drop trigger if exists touren_services_guard on public.job_series;
create trigger touren_services_guard before insert or update of extra_service_ids, service_type_id on public.job_series
  for each row execute function public.touren_services_guard();

create or replace function public.touren_service_names(p_main uuid, p_extra uuid[])
returns text language sql stable security definer set search_path = public as $$
  select nullif(concat_ws(' + ', (select name from service_types where id = p_main),
    (select string_agg(s.name, ' + ' order by u.o) from unnest(coalesce(p_extra, '{}')) with ordinality u(x, o) join service_types s on s.id = u.x)), '')
$$;
revoke all on function public.touren_service_names(uuid, uuid[]) from public, anon;
grant execute on function public.touren_service_names(uuid, uuid[]) to authenticated;

do $$
declare d text; n text;
begin
  foreach n in array array['public.my_jobs(uuid)', 'public.my_jobs_range(uuid, date, date)'] loop
    d := pg_get_functiondef(n::regprocedure);
    if position('''service'', st.name' in d) = 0 then raise exception '% unerwartet', n; end if;
    execute replace(d, '''service'', st.name', '''service'', touren_service_names(j.service_type_id, j.extra_service_ids)');
  end loop;
  d := pg_get_functiondef('public.touren_series_change(uuid, date, jsonb)'::regprocedure);
  if position('service_type_id = case when p ? ''service_type_id'' then nullif(p->>''service_type_id'', '''')::uuid else service_type_id end,' in d) = 0
     or position('service_type_id = t.service_type_id,' in d) = 0 then raise exception 'touren_series_change unerwartet'; end if;
  d := replace(d, 'service_type_id = case when p ? ''service_type_id'' then nullif(p->>''service_type_id'', '''')::uuid else service_type_id end,',
    'service_type_id = case when p ? ''service_type_id'' then nullif(p->>''service_type_id'', '''')::uuid else service_type_id end,
    extra_service_ids = case when p ? ''extra_service_ids'' then array(select jsonb_array_elements_text(p->''extra_service_ids'')::uuid) else extra_service_ids end,');
  d := replace(d, 'service_type_id = t.service_type_id,', 'service_type_id = t.service_type_id, extra_service_ids = t.extra_service_ids,');
  execute d;
end $$;
