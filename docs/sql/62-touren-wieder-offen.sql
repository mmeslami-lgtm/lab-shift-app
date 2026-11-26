-- 62 – Touren: Auftrag wieder geöffnet → Ergebnis zurücksetzen (26.11.2026, Fehler aus Test: Auftrag 3 war „nicht fertig“,
--      wurde von Hand wieder auf „Angenommen“ gesetzt, behielt aber outcome und bekam später „fertig (mit Fortsetzung)“).
-- * BEFORE-Trigger: status done → new/accepted: outcome, finished_at und arrived_at leeren (Nachtrag 62b: auch die Ankunft,
--   sonst zeigt der Auftrag „vor Ort“), damit Büro/App neu abschließen können.
-- * jobs_followup_done (Script 61): Vorgänger nur dann auf 'completed', wenn er selbst erledigt ist.
-- * Einmalige Bereinigung: offene Aufträge mit altem Ergebnis.
create or replace function public.jobs_reopen_reset()
returns trigger language plpgsql as $$
begin
  if old.status = 'done' and new.status in ('new', 'accepted') then
    new.outcome := null; new.finished_at := null; new.arrived_at := null;
  end if;
  return new;
end $$;
drop trigger if exists jobs_reopen_reset on public.jobs;
create trigger jobs_reopen_reset before update of status on public.jobs
  for each row execute function public.jobs_reopen_reset();

create or replace function public.jobs_followup_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_job_id is null then return new; end if;
  if new.status = 'done' and coalesce(new.outcome, 'done') in ('done', 'completed') then
    if old.status is distinct from new.status or old.outcome is distinct from new.outcome then
      update jobs set outcome = 'completed' where id = new.parent_job_id and outcome = 'partial' and status = 'done';
    end if;
  elsif old.status = 'done' and coalesce(old.outcome, 'done') in ('done', 'completed') then
    update jobs set outcome = 'partial' where id = new.parent_job_id and outcome = 'completed' and status = 'done';
  end if;
  return new;
end $$;
revoke all on function public.jobs_followup_done() from public, anon, authenticated;

update public.jobs set outcome = null, finished_at = null where status in ('new', 'accepted') and outcome is not null;
-- 62b (26.11.2026): Auftrag 3 (UAE Test) wurde vor 62 wieder geöffnet und zeigte „vor Ort“ – Ankunft leeren
update public.jobs set arrived_at = null where status in ('new', 'accepted') and arrived_at is not null and work_date < (now() at time zone org_tz(org_id))::date;
