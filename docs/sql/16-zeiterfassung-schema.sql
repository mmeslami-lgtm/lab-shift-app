-- 16-zeiterfassung-schema.sql  (Zeiterfassung Stufe 1: Terminal mit QR-Code + PIN, "Zeiten" in der App)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-15. Safe to run again.
--
--  * new product "time_tracking" (Zeiterfassung), switched on per company in /admin
--  * terminal_tokens: the QR code on the terminal changes every ~30 s; a token is valid 60 s
--  * staff_pins: personal stamp PIN (bcrypt), set by the employee in the app; a separate table
--    nobody can read (not even the Leitung), so a short PIN can never be guessed from its hash
--  * pin_failures: wrong PINs on the terminal (5 wrong in 15 min = PIN blocked for 15 min)
--  * every new stamp updates the sessions by itself (trigger): "in" opens a session,
--    "out" closes the open one. Nothing is deleted; corrections (correct_attendance) stay.

alter table org_products drop constraint if exists org_products_product_check;
alter table org_products add constraint org_products_product_check
  check (product in ('lab_planner', 'generic_planner', 'employee_app', 'time_tracking'));

create table if not exists staff_pins (
  staff_id   uuid primary key references staff(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  pin_hash   text not null,
  updated_at timestamptz not null default now()
);
alter table staff_pins enable row level security;        -- no policies: only functions / server

create table if not exists terminal_tokens (
  token      text primary key,
  device_id  uuid not null references devices(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  expires_at timestamptz not null
);
alter table terminal_tokens enable row level security;   -- no policies: only the server (service_role)
create index if not exists terminal_tokens_exp on terminal_tokens (expires_at);

create table if not exists pin_failures (
  id       bigserial primary key,
  staff_id uuid not null references staff(id) on delete cascade,
  at       timestamptz not null default now()
);
alter table pin_failures enable row level security;      -- no policies: only the server
create index if not exists pin_failures_staff on pin_failures (staff_id, at);

-- the employee sets / changes the own PIN (4-6 digits); stored only as bcrypt hash
create or replace function set_my_pin(p_org uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare me uuid := my_staff_id(p_org);
begin
  if me is null then raise exception 'Keine Berechtigung'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'Die PIN muss aus 4 bis 6 Ziffern bestehen'; end if;
  if p_pin in ('0000','1111','1234','12345','123456','4321','9999') then raise exception 'Diese PIN ist zu einfach'; end if;
  insert into staff_pins (staff_id, org_id, pin_hash, updated_at) values (me, p_org, extensions.crypt(p_pin, extensions.gen_salt('bf')), now())
  on conflict (staff_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end $$;

-- Leitung / Inhaber remove a forgotten PIN (the person then sets a new one in the app)
create or replace function reset_staff_pin(p_org uuid, p_staff uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  delete from staff_pins where staff_id = p_staff and org_id = p_org;
end $$;

-- does the person have a PIN? (for the app, without showing anything of the hash)
create or replace function my_pin_is_set(p_org uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from staff_pins where staff_id = my_staff_id(p_org) and org_id = p_org);
$$;

-- for the server only: check a PIN
create or replace function check_staff_pin(p_staff uuid, p_pin text)
returns boolean language sql security definer set search_path = public, extensions stable as $$
  select coalesce((select pin_hash = extensions.crypt(p_pin, pin_hash) from staff_pins where staff_id = p_staff), false);
$$;

-- sessions follow the stamps automatically
create or replace function attendance_apply_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare open_id bigint; dir text := new.direction;
begin
  if new.staff_id is null then return new; end if;
  select id into open_id from attendance_sessions
   where staff_id = new.staff_id and check_out is null and check_in > new.scanned_at - interval '20 hours'
   order by check_in desc limit 1;
  if dir is null then dir := case when open_id is not null then 'out' else 'in' end; end if; -- chip readers send no direction
  if dir = 'out' then
    if open_id is not null then
      update attendance_sessions set check_out = new.scanned_at, out_event_id = new.id where id = open_id;
    else -- "Gehen" without "Kommen": keep it visible as an open entry for the Leitung
      insert into attendance_sessions (org_id, staff_id, check_in, check_out, in_event_id, out_event_id)
      values (new.org_id, new.staff_id, null, new.scanned_at, null, new.id);
    end if;
  else
    insert into attendance_sessions (org_id, staff_id, check_in, check_out, in_event_id, out_event_id)
    values (new.org_id, new.staff_id, new.scanned_at, null, new.id, null);
  end if;
  return new;
end $$;
drop trigger if exists trg_attendance_apply on attendance_events;
create trigger trg_attendance_apply after insert on attendance_events for each row execute function attendance_apply_event();

alter table attendance_sessions alter column check_in drop not null;

revoke all on function set_my_pin(uuid, text) from public, anon;
revoke all on function reset_staff_pin(uuid, uuid) from public, anon;
revoke all on function my_pin_is_set(uuid) from public, anon;
revoke all on function check_staff_pin(uuid, text) from public, anon, authenticated;
grant execute on function set_my_pin(uuid, text) to authenticated;
grant execute on function reset_staff_pin(uuid, uuid) to authenticated;
grant execute on function my_pin_is_set(uuid) to authenticated;
grant execute on function check_staff_pin(uuid, text) to service_role;
