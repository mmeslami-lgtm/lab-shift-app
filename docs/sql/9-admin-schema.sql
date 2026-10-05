-- ============================================================================
-- PART 9 — Plattform-Verwaltung (/admin): Protokoll der Admin-Aktionen
-- ============================================================================
-- Already applied to the real project through the Supabase connector. Keep this file for the record
-- (or run it in a new project). Run ONCE in Supabase -> SQL Editor.
--
-- The /admin page (only for rows of platform_admins) does its work in a server route with the service_role
-- key. Every action is written to admin_log, which nobody can read through the normal API (RLS on, no policy).
--
-- To make yourself platform admin (after creating YOUR login with a STRONG password in Authentication -> Users):
--   insert into platform_admins (user_id) select id from auth.users where email = 'DEINE-ECHTE-EMAIL';
-- ============================================================================

create table if not exists admin_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  actor       uuid,
  actor_email text,
  action      text not null,
  org_id      uuid,
  target      text,
  detail      jsonb
);
create index if not exists idx_admin_log_at on admin_log (at desc);
alter table admin_log enable row level security;
