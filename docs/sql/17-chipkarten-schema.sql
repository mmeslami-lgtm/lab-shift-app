-- 17-chipkarten-schema.sql  (Zeiterfassung: Chipkarte am Terminal, optional Karte + PIN)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-16. Safe to run again.
--  * one card number can belong to only ONE active person per company
--  * organizations.card_requires_pin: false = card alone is enough (default); true = card + PIN
--  * set_card_requires_pin(...): Leitung / Inhaber switch it

create unique index if not exists badges_active_code on badges (org_id, badge_code) where revoked_at is null;
alter table organizations add column if not exists card_requires_pin boolean not null default false;

create or replace function set_card_requires_pin(p_org uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  update organizations set card_requires_pin = coalesce(p_on, false) where id = p_org;
end $$;
revoke all on function set_card_requires_pin(uuid, boolean) from public, anon;
grant execute on function set_card_requires_pin(uuid, boolean) to authenticated;

-- QR codes carry the direction chosen on the terminal (Kommen / Gehen); the phone then only confirms
alter table terminal_tokens add column if not exists direction text check (direction in ('in', 'out'));

-- Terminal setup WITHOUT logging in on the tablet: the Leitung creates a one-time code in "Anwesenheit"
-- (from any computer or phone), somebody types it on the tablet at /terminal. Only a hash is stored;
-- a code works once and for 24 hours. No policies: only the server reads this table.
create table if not exists terminal_pair_codes (
  id          bigserial primary key,
  org_id      uuid not null references organizations(id) on delete cascade,
  code_hash   text not null unique,
  name        text not null default 'Terminal',
  expires_at  timestamptz not null,
  used_at     timestamptz,
  device_id   uuid references devices(id) on delete set null,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
alter table terminal_pair_codes enable row level security;
