-- 61 – Touren: Fortsetzung fertig → der erste Tag wird automatisch „fertig“ (Wunsch Nutzer 26.11.2026:
--      „wenn am nächsten Tag die Arbeit fertig wird, muss der Vortag von ‚nicht fertig‘ automatisch auf ‚fertig‘ wechseln“).
-- jobs.outcome bekommt den Wert 'completed' = „am ersten Tag nicht fertig, mit der Fortsetzung abgeschlossen“.
-- Trigger: Wird eine Fortsetzung (parent_job_id) erledigt (status done, outcome done/completed/leer), wird der
-- Vorgänger von 'partial' auf 'completed' gesetzt – über mehrere Fortsetzungen hinweg (der Trigger läuft beim Vorgänger erneut).
-- Wird die Fortsetzung wieder geöffnet oder selbst „nicht fertig“, geht der Vorgänger zurück auf 'partial'.
alter table public.jobs drop constraint if exists jobs_outcome_check;
alter table public.jobs add constraint jobs_outcome_check check (outcome is null or outcome in ('done', 'partial', 'completed'));

create or replace function public.jobs_followup_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_job_id is null then return new; end if;
  if new.status = 'done' and coalesce(new.outcome, 'done') in ('done', 'completed') then
    if old.status is distinct from new.status or old.outcome is distinct from new.outcome then
      update jobs set outcome = 'completed' where id = new.parent_job_id and outcome = 'partial';
    end if;
  elsif old.status = 'done' and coalesce(old.outcome, 'done') in ('done', 'completed') then
    -- wieder geöffnet, storniert oder doch „nicht fertig“: Vorgänger wieder „nicht fertig“
    update jobs set outcome = 'partial' where id = new.parent_job_id and outcome = 'completed';
  end if;
  return new;
end $$;
revoke all on function public.jobs_followup_done() from public, anon, authenticated;

drop trigger if exists jobs_followup_done on public.jobs;
create trigger jobs_followup_done after update of status, outcome on public.jobs
  for each row execute function public.jobs_followup_done();
