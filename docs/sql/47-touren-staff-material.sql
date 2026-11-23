-- 47 – Touren D3a (Nachtrag 21.11.2026, Wunsch Nutzer):
--   * Mitarbeitende bekommen eine Mobil-/WhatsApp-Nummer (für Touren, später WhatsApp D4). Gleiche Tabelle „staff“ wie im Dienstplaner.
--   * Aufträge bekommen „Material“: vom Kunden oder von uns (Preis kommt später und kann davon abhängen).
-- Rechte bleiben wie sie sind: „staff“ bearbeiten nur Inhaber/Leitung/Schichtplaner (is_org_supervisor) – Büro nicht.

alter table staff add column if not exists phone text;
alter table staff drop constraint if exists staff_phone_check;
alter table staff add constraint staff_phone_check check (phone is null or phone ~ '^\+?[0-9]{5,20}$');

alter table jobs add column if not exists material text;
alter table jobs drop constraint if exists jobs_material_check;
alter table jobs add constraint jobs_material_check check (material is null or material in ('customer', 'ours'));
