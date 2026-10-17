-- 26-ueberstunden-auszahlung-schema.sql  (Überstunden: Zeitkonto / Auszahlung / Gemischt – pro Firma)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-25. Safe to run again.
-- organizations.overtime_settings = { mode: "konto" | "auszahlung" | "gemischt", code: Lohnart-Code }
-- overtime_payouts: hours paid out by the Leitung (mode "gemischt"). Nothing is deleted – mistakes are "storniert".
alter table organizations add column if not exists overtime_settings jsonb;
create or replace function set_overtime_settings(p_org uuid, p_settings jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if p_settings is not null and (jsonb_typeof(p_settings) <> 'object' or coalesce(p_settings->>'mode','konto') not in ('konto','auszahlung','gemischt') or length(p_settings::text) > 1000) then raise exception 'Ungültige Einstellungen'; end if;
  update organizations set overtime_settings = p_settings where id = p_org;
end $$;
revoke all on function set_overtime_settings(uuid, jsonb) from public, anon;
grant execute on function set_overtime_settings(uuid, jsonb) to authenticated;

create table if not exists overtime_payouts (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references organizations(id) on delete cascade,
  staff_id    uuid not null,
  year        int not null check (year between 2000 and 2100),
  month       int not null check (month between 1 and 12),
  hours       numeric(6,2) not null check (hours > 0 and hours <= 300),
  note        text check (note is null or length(note) <= 300),
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  voided_by   uuid,
  void_reason text check (void_reason is null or length(void_reason) <= 300),
  foreign key (staff_id, org_id) references staff(id, org_id) on delete cascade
);
create index if not exists overtime_payouts_org on overtime_payouts (org_id, staff_id, year, month);
alter table overtime_payouts enable row level security;
drop policy if exists op_select on overtime_payouts;
create policy op_select on overtime_payouts for select using (is_org_leader(org_id) or (staff_id = my_staff_id(org_id) and org_has_product(org_id, 'employee_app')));

create or replace function add_overtime_payout(p_org uuid, p_staff uuid, p_year int, p_month int, p_hours numeric, p_note text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if not exists (select 1 from staff where id = p_staff and org_id = p_org) then raise exception 'Person nicht gefunden'; end if;
  if p_hours is null or p_hours <= 0 or p_hours > 300 then raise exception 'Bitte eine Stundenzahl zwischen 0 und 300 eingeben'; end if;
  insert into overtime_payouts (org_id, staff_id, year, month, hours, note) values (p_org, p_staff, p_year, p_month, round(p_hours, 2), nullif(trim(p_note), '')) returning id into v_id;
  return v_id;
end $$;
revoke all on function add_overtime_payout(uuid, uuid, int, int, numeric, text) from public, anon;
grant execute on function add_overtime_payout(uuid, uuid, int, int, numeric, text) to authenticated;

create or replace function void_overtime_payout(p_id bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from overtime_payouts where id = p_id and voided_at is null;
  if v_org is null then raise exception 'Auszahlung nicht gefunden'; end if;
  if not is_org_leader(v_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Bitte einen Grund angeben'; end if;
  update overtime_payouts set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id;
end $$;
revoke all on function void_overtime_payout(bigint, text) from public, anon;
grant execute on function void_overtime_payout(bigint, text) to authenticated;
