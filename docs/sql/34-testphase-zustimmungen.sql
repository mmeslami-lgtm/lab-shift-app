-- 34-testphase-zustimmungen.sql  (Paket 38a: Testphase + Zustimmungen)
-- Run ONCE after scripts 1-33. Safe to run again. Only ADDS things, changes nothing that exists.
--
-- 1) organizations.trial_until: NULL = normale Firma (keine Testphase).
--    Gesetzt = Testphase bis zu diesem Zeitpunkt. Nur der Server (Plattform-Admin) setzt es.
-- 2) legal_acceptances: wer hat wann welche Fassung welches Textes angenommen
--    (Nutzungsbedingungen Testphase, AVV, Zusage "nur fiktive Testdaten").
--    Nur lesen fuer Inhaber/Leitung der Firma und Plattform-Admin; schreiben nur ueber accept_legal().

alter table organizations add column if not exists trial_until timestamptz;

create table if not exists legal_acceptances (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null,
  user_email  text,
  doc         text not null check (doc in ('testphase', 'avv', 'fiktive_daten')),
  version     text not null check (version ~ '^[0-9]{1,3}\.[0-9]{1,3}$'),
  accepted_at timestamptz not null default now(),
  unique (org_id, doc, version)
);
create index if not exists legal_acceptances_org on legal_acceptances (org_id);

alter table legal_acceptances enable row level security;
drop policy if exists legal_acceptances_select on legal_acceptances;
create policy legal_acceptances_select on legal_acceptances for select
  using (is_org_supervisor(org_id) or is_platform_admin());
revoke insert, update, delete, truncate on legal_acceptances from authenticated, anon;

-- Nur der Inhaber nimmt an; alle drei Texte auf einmal (alles oder nichts).
-- p_versions z. B. {"testphase":"1.0","avv":"1.0","fiktive_daten":"1.0"}
create or replace function accept_legal(p_org uuid, p_versions jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare d text; v text; mail text;
begin
  if auth.uid() is null or not is_org_owner(p_org) then
    raise exception 'Nur der Inhaber kann zustimmen.';
  end if;
  if p_versions is null or jsonb_typeof(p_versions) <> 'object' then
    raise exception 'Ungueltige Angaben.';
  end if;
  select email into mail from auth.users where id = auth.uid();
  foreach d in array array['testphase', 'avv', 'fiktive_daten'] loop
    v := p_versions ->> d;
    if v is null or v !~ '^[0-9]{1,3}\.[0-9]{1,3}$' then
      raise exception 'Zustimmung fehlt: %', d;
    end if;
    insert into legal_acceptances (org_id, user_id, user_email, doc, version)
    values (p_org, auth.uid(), mail, d, v)
    on conflict (org_id, doc, version) do nothing;
  end loop;
end $$;
revoke all on function accept_legal(uuid, jsonb) from public, anon;
grant execute on function accept_legal(uuid, jsonb) to authenticated;
