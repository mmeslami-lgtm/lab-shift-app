-- 19-org-features-schema.sql  (Funktionen pro Firma / Feature-Schalter)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-18. Safe to run again.
-- Special wishes of ONE customer are built behind a switch; only that company gets it.
-- Members of a company may read their company's switches; only the server (platform admin) writes.
create table if not exists org_features (
  org_id     uuid not null references organizations(id) on delete cascade,
  feature    text not null check (feature ~ '^[a-z0-9_]{2,60}$'),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (org_id, feature)
);
alter table org_features enable row level security;
drop policy if exists org_features_select on org_features;
create policy org_features_select on org_features for select using (is_org_member(org_id) or is_platform_admin());
revoke insert, update, delete, truncate on org_features from authenticated, anon;
