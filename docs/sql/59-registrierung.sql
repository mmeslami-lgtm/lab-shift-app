-- 59 – Registrierung von der Startseite (25.11.2026)
-- Neue Firmen füllen „Jetzt registrieren“ aus. Der Server speichert die Anfrage in demo_requests (kind = 'registration'),
-- die Antworten stehen in details (jsonb). Der Plattform-Admin nimmt an (Testfirma + Einladung per E-Mail) oder lehnt ab.
-- Der Browser schreibt nie selbst in diese Tabelle (wie Skript 33).

alter table demo_requests add column if not exists kind    text  not null default 'demo';
alter table demo_requests add column if not exists details jsonb not null default '{}'::jsonb;
alter table demo_requests add column if not exists lang    text  not null default 'de';

alter table demo_requests drop constraint if exists demo_requests_len;
alter table demo_requests add constraint demo_requests_len check (
  char_length(company) between 2 and 200 and char_length(email) <= 254
  and (phone is null or char_length(phone) <= 40) and (message is null or char_length(message) <= 2000)
  and status in ('neu', 'erledigt', 'abgelehnt'));
alter table demo_requests drop constraint if exists demo_requests_kind;
alter table demo_requests add constraint demo_requests_kind check (kind in ('demo', 'registration') and lang in ('de', 'en') and pg_column_size(details) <= 4000);
