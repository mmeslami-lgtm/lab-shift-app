-- 25-urlaubsanspruch-schema.sql  (Urlaubsanspruch pro Person und Jahr – für den Stundenzettel)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-24. Safe to run again.
-- entitlement = Urlaubstage im Jahr, carryover = Resturlaub aus dem Vorjahr. Genommen = Urlaub (Abwesenheit oder
-- genehmigter Antrag) an Werktagen Mo–Fr ohne Feiertage. Leitung/Inhaber schreiben, die Person sieht nur sich.
create table if not exists staff_vacation (
  org_id      uuid not null references organizations(id) on delete cascade,
  staff_id    uuid not null,
  year        int not null check (year between 2000 and 2100),
  entitlement numeric(5,1) not null default 0 check (entitlement between 0 and 400),
  carryover   numeric(5,1) not null default 0 check (carryover between -400 and 400),
  updated_at  timestamptz not null default now(),
  primary key (staff_id, year),
  foreign key (staff_id, org_id) references staff(id, org_id) on delete cascade
);
alter table staff_vacation enable row level security;
drop policy if exists sv_select on staff_vacation;
create policy sv_select on staff_vacation for select using (is_org_leader(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));
drop policy if exists sv_write on staff_vacation;
create policy sv_write on staff_vacation for all using (is_org_leader(org_id)) with check (is_org_leader(org_id));
