-- 66 – Arbeitszeiten der Firma für Touren (27.11.2026)
-- Wunsch: „Die Arbeitszeit der Firma in die Einstellungen jeder Firma.“ Genutzt von „Personal verfügbar?“ und
-- „Frühesten Termin finden“ im Auftrag: Vorschläge nur an Arbeitstagen und zwischen Beginn und Ende.
-- touren_day_context gibt die Einstellungen schon komplett zurück (to_jsonb(ts)) – keine Änderung nötig.

alter table touren_settings add column if not exists work_from time not null default '07:00';
alter table touren_settings add column if not exists work_to   time not null default '20:00';
alter table touren_settings add column if not exists work_days smallint[] not null default '{0,1,2,3,4,5,6}';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'touren_settings_work_hours_check') then
    alter table touren_settings add constraint touren_settings_work_hours_check check (work_to > work_from);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'touren_settings_work_days_check') then
    alter table touren_settings add constraint touren_settings_work_days_check
      check (cardinality(work_days) between 1 and 7 and work_days <@ '{0,1,2,3,4,5,6}'::smallint[]);
  end if;
end $$;
