-- 38-monat-erst-nach-ende.sql  (7 Nov 2026) – Run ONCE. Safe to run again. Already run (migration monat_erst_nach_ende_38).
-- User decision: closing a month (staff_month_balance, "Monat abschließen & archivieren") is FORBIDDEN before the month
-- is over – allowed from the 1st of the next month (time zone Europe/Berlin; Dubai later: per country).
-- Trigger, so every way of writing is covered (save_month_balances and direct writes).
-- Clean-up: November 2026 had been closed on 7 Nov during a test (11 rows) – removed.
create or replace function public.staff_month_balance_only_past()
returns trigger language plpgsql set search_path = public as $$
begin
  if make_date(new.year, new.month, 1) + interval '1 month' > (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Der Monat %/% ist noch nicht vorbei – abschließen erst ab dem 1. des Folgemonats', lpad(new.month::text, 2, '0'), new.year;
  end if;
  return new;
end $$;
drop trigger if exists staff_month_balance_only_past on public.staff_month_balance;
create trigger staff_month_balance_only_past before insert or update on public.staff_month_balance
  for each row execute function public.staff_month_balance_only_past();
delete from public.staff_month_balance where make_date(year, month, 1) + interval '1 month' > (now() at time zone 'Europe/Berlin')::date;
