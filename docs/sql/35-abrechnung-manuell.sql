-- 35-abrechnung-manuell.sql  (Paket 38b-Zahlung: Zahlungen von Hand in /admin)
-- Run ONCE after script 34. Safe to run again. Only ADDS things.
-- Nur fuer den Plattform-Admin (Server mit service_role). Firmen sehen davon nichts:
-- RLS ist an und es gibt KEINE Policy fuer authenticated/anon.

create table if not exists org_billing (
  org_id      uuid primary key references organizations(id) on delete cascade,
  amount      numeric(10,2) not null default 0 check (amount >= 0 and amount <= 100000), -- netto, zzgl. MwSt.
  cycle       text not null default 'monatlich' check (cycle in ('monatlich', 'jaehrlich')),
  next_due    date,                                        -- naechste Zahlung faellig am (NULL = keine)
  note        text check (note is null or char_length(note) <= 300),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table if not exists org_payments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  amount      numeric(10,2) not null check (amount >= 0 and amount <= 1000000),
  paid_on     date not null,
  for_due     date,                                        -- welche Faelligkeit damit bezahlt wurde
  note        text check (note is null or char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  created_by  uuid
);
create index if not exists org_payments_org on org_payments (org_id, paid_on desc);

alter table org_billing  enable row level security;
alter table org_payments enable row level security;
revoke all on org_billing, org_payments from authenticated, anon;
