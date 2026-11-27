-- 64 – Einwilligung für die Privatwohnung (27.11.2026)
-- Wunsch: „Für Mitarbeitende, die der Fahrdienst zu Hause abholt und zurückbringt, muss eine Einwilligung vorliegen,
-- dass ihre Wohnadresse im Programm steht. Die Leitung holt sie ein und legt sie in die Personalakte.
-- Ohne Einwilligung kommen sie selbst – kein Fahrdienst.“
-- Gilt NUR für start_kind = 'home' (Privatwohnung). Firmenunterkunft braucht keine Einwilligung.
--  * home_consent_on: Datum der unterschriebenen Einwilligung (Papier in der Personalakte)
--  * home_consent_by: wer sie im Programm eingetragen hat (automatisch)
--  * Neue/geänderte Zeile mit start_kind='home' ohne Datum → Fehler 'consent_missing'
--  * Kein 'home' mehr (Widerruf / anderer Startpunkt) → Adresse und Einwilligung werden geleert
-- Bestehende Zeilen bleiben unverändert (die App zeigt „Einwilligung fehlt“).

alter table staff_touren add column if not exists home_consent_on date;
alter table staff_touren add column if not exists home_consent_by uuid;

create or replace function staff_touren_consent_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.start_kind = 'home' then
    if new.home_consent_on is null then
      raise exception 'consent_missing' using errcode = 'P0001',
        hint = 'Für die Privatwohnung muss das Datum der unterschriebenen Einwilligung eingetragen sein.';
    end if;
    if new.home_consent_on > (now() at time zone 'UTC')::date + 1 or new.home_consent_on < date '2000-01-01' then
      raise exception 'consent_date' using errcode = 'P0001';
    end if;
    if tg_op = 'INSERT' or old.home_consent_on is distinct from new.home_consent_on then
      new.home_consent_by := auth.uid();
    else
      new.home_consent_by := old.home_consent_by;
    end if;
  else
    -- keine Privatwohnung (mehr): nichts Privates aufbewahren
    new.home_address := null; new.home_maps_url := null; new.home_lat := null; new.home_lng := null;
    new.home_consent_on := null; new.home_consent_by := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_staff_touren_consent on staff_touren;
create trigger trg_staff_touren_consent before insert or update on staff_touren
  for each row execute function staff_touren_consent_guard();
