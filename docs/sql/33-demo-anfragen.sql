-- 33-demo-anfragen.sql  (Demo-Anfragen von der Startseite: Fenster „Demo anfragen“, Liste in /admin, E-Mail an info@)
-- Safe to run again. The table demo_requests already existed (simple page /demo-anfrage, without message).
--
-- From now on the browser never writes into this table itself: the form posts to /api/demo-anfrage,
-- the server checks it (spam protection) and saves it with the service key. Only the platform admin reads it.
--
-- STEP 1 (now): new columns. Harmless for the old page.
alter table demo_requests add column if not exists message    text;
alter table demo_requests add column if not exists ip_hash    text;          -- keyed hash, never the address itself
alter table demo_requests add column if not exists mail_sent  boolean not null default false;
alter table demo_requests add column if not exists mail_error text;
alter table demo_requests add column if not exists done_at    timestamptz;
alter table demo_requests add column if not exists done_by    uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'demo_requests_len') then
    alter table demo_requests add constraint demo_requests_len check (
      char_length(company) between 2 and 200 and char_length(email) <= 254
      and (phone is null or char_length(phone) <= 40) and (message is null or char_length(message) <= 2000)
      and status in ('neu', 'erledigt'));
  end if;
end $$;
create index if not exists demo_requests_ip_time on demo_requests (ip_hash, created_at);
alter table demo_requests enable row level security;

-- STEP 2 (ONLY after package 36 is in main): visitors may no longer write directly (the server does it).
-- drop policy if exists "Besucher duerfen Demo-Anfragen senden" on demo_requests;
-- revoke insert, update, delete on demo_requests from anon, authenticated;
