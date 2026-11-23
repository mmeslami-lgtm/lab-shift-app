-- 49 – Touren: Löschen von Fehleingaben (Wunsch Nutzer 23.11.2026)
-- Regeln:
--   * Auftrag: nur wenn noch nicht erledigt/storniert (new, accepted) – Büro, Leitung, Inhaber. Zuteilungen gehen mit.
--   * Kunde: nur ohne Aufträge – Büro, Leitung, Inhaber. Adressen und Präferenzen gehen mit.
--   * Adresse: immer – Aufträge behalten den Adresstext (address_id wird leer).
--   * Leistung: nur wenn kein Auftrag sie benutzt – Inhaber/Leitung.
--   * Fähigkeit: nur wenn niemand sie hat und keine Leistung sie braucht – Inhaber/Leitung.
--   * Ort: nur wenn niemand dort startet – Inhaber/Leitung.
--   * Zusatzfeld: immer – Inhaber/Leitung; die eingetragenen Werte werden mit gelöscht.
--   * Mitarbeitende werden NICHT gelöscht (Arbeitszeit, Gesetz) – nur inaktiv.
-- Wird eine Regel verletzt, löscht die Datenbank einfach nichts; die App sagt dann „bitte inaktiv setzen“.

grant delete on customers, customer_addresses, service_types, custom_fields, jobs, skills, touren_places to authenticated;

drop policy if exists touren_job_delete on jobs;
create policy touren_job_delete on jobs for delete to authenticated
  using (is_touren_staff(org_id) and status in ('new', 'accepted'));

drop policy if exists touren_cust_delete on customers;
create policy touren_cust_delete on customers for delete to authenticated
  using (is_touren_staff(org_id) and not exists (select 1 from jobs j where j.customer_id = customers.id));

drop policy if exists touren_addr_delete on customer_addresses;
create policy touren_addr_delete on customer_addresses for delete to authenticated
  using (is_touren_staff(org_id));

drop policy if exists touren_svc_delete on service_types;
create policy touren_svc_delete on service_types for delete to authenticated
  using (is_org_leader(org_id) and is_touren_staff(org_id) and not exists (select 1 from jobs j where j.service_type_id = service_types.id));

drop policy if exists skills_del on skills;
create policy skills_del on skills for delete to authenticated
  using (is_org_leader(org_id) and is_touren_staff(org_id)
         and not exists (select 1 from staff_skills x where x.skill_id = skills.id)
         and not exists (select 1 from service_skills x where x.skill_id = skills.id));

drop policy if exists touren_places_del on touren_places;
create policy touren_places_del on touren_places for delete to authenticated
  using (is_org_leader(org_id) and is_touren_staff(org_id) and not exists (select 1 from staff_touren t where t.place_id = touren_places.id));

drop policy if exists touren_cf_delete on custom_fields;
create policy touren_cf_delete on custom_fields for delete to authenticated
  using (is_org_leader(org_id) and is_touren_staff(org_id));

-- Werte eines gelöschten Zusatzfeldes aus Kunden und Aufträgen entfernen
create or replace function public.custom_field_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.entity = 'customer' then
    update customers set extra = extra - old.id::text where org_id = old.org_id and extra ? old.id::text;
  else
    update jobs set extra = extra - old.id::text where org_id = old.org_id and extra ? old.id::text;
  end if;
  return old;
end $$;
drop trigger if exists trg_custom_field_cleanup on custom_fields;
create trigger trg_custom_field_cleanup after delete on custom_fields for each row execute function custom_field_cleanup();
