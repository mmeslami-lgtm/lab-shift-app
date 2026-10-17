-- 24-zuschlaege-schema.sql  (Zuschläge für den Stundenzettel – freiwillig, die Leitung trägt sie selbst ein)
-- Run ONCE in the Supabase SQL Editor, after scripts 1-23. Safe to run again.
-- organizations.surcharge_settings = { nacht|samstag|sonntag|feiertag: { mode: "off"|"percent"|"perDay", value, code } }
-- null = never set up (the Stundenzettel then only shows the hours).
alter table organizations add column if not exists surcharge_settings jsonb;
create or replace function set_surcharge_settings(p_org uuid, p_settings jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_org_leader(p_org) then raise exception 'Nur Leitung oder Inhaber'; end if;
  if p_settings is not null and (jsonb_typeof(p_settings) <> 'object' or length(p_settings::text) > 4000) then raise exception 'Ungültige Einstellungen'; end if;
  update organizations set surcharge_settings = p_settings where id = p_org;
end $$;
revoke all on function set_surcharge_settings(uuid, jsonb) from public, anon;
grant execute on function set_surcharge_settings(uuid, jsonb) to authenticated;
