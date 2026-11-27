-- 65 – Firmendaten & Logo für Briefkopf und Fußzeile (27.11.2026)
-- Wunsch: „Die Einwilligung braucht Logo, Kopf- und Fußzeile. Im Programm einen Platz zum Hochladen des Firmenlogos –
-- nicht Pflicht, im Profil änderbar.“ Genutzt für: Einwilligung (Privatwohnung), Einsatzplan- und Transport-Blätter.
--  * Logo als kleines Bild direkt in der Tabelle (vom Browser verkleinert, höchstens ~300 KB) – kein Storage nötig
--  * Lesen: alle Mitglieder der Firma (bestehende Regel mt_org_select)
--  * Ändern: nur Inhaber und Leitung, über org_letterhead_save

alter table organizations add column if not exists logo_data text
  check (logo_data is null or (length(logo_data) <= 400000 and logo_data ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'));
alter table organizations add column if not exists company_address text check (company_address is null or length(company_address) <= 300);
alter table organizations add column if not exists company_phone   text check (company_phone   is null or length(company_phone)   <= 40);
alter table organizations add column if not exists company_email   text check (company_email   is null or length(company_email)   <= 120);
alter table organizations add column if not exists company_website text check (company_website is null or length(company_website) <= 200);

create or replace function org_letterhead_save(p_org uuid, p_logo text, p_address text, p_phone text, p_email text, p_website text)
returns void language plpgsql security definer set search_path = public as $$
declare n text := nullif(btrim(coalesce(p_email, '')), '');
begin
  if not is_org_leader(p_org) then raise exception 'not_leader'; end if;
  if n is not null and n !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  update organizations set
    logo_data       = nullif(p_logo, ''),
    company_address = nullif(btrim(coalesce(p_address, '')), ''),
    company_phone   = nullif(btrim(coalesce(p_phone, '')), ''),
    company_email   = n,
    company_website = nullif(btrim(coalesce(p_website, '')), '')
  where id = p_org;
end $$;
revoke all on function org_letterhead_save(uuid, text, text, text, text, text) from public, anon;
grant execute on function org_letterhead_save(uuid, text, text, text, text, text) to authenticated;
