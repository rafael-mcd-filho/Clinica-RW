-- Auto-vinculo contato do WhatsApp <-> paciente pelo telefone.
--
-- O vinculo existia so no ingest da mensagem (lib/whatsapp/ingest.ts) e so na
-- entrada: contato que chegava antes do paciente ser cadastrado ficava solto
-- para sempre, e contato criado por outro caminho nunca era testado. Aqui a
-- regra passa a viver no banco, valendo para todo insert, e nas duas direcoes.
--
-- A comparacao usa os ultimos 8 digitos, que e o trecho estavel do numero
-- brasileiro: absorve o DDI, e sobretudo o nono digito -- cadastro com
-- "(84) 99646-3570" e disparo do WhatsApp como "558496463570" caem na mesma
-- chave. Menos de 8 digitos nao gera chave: numero curto casaria com meio
-- mundo.

create or replace function app_private.phone_match_key(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when length(regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g')) >= 8
      then right(regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g'), 8)
    else null
  end
$$;

comment on function app_private.phone_match_key(text) is
  'Ultimos 8 digitos de um telefone, para casar cadastro e WhatsApp mesmo com DDI/nono digito diferentes. Null abaixo de 8 digitos.';

create index if not exists patients_phone_match_idx
  on public.patients (organization_id, app_private.phone_match_key(phone))
  where deleted_at is null;

create index if not exists patients_whatsapp_match_idx
  on public.patients (organization_id, app_private.phone_match_key(whatsapp))
  where deleted_at is null;

create index if not exists whatsapp_contacts_phone_match_idx
  on public.whatsapp_contacts (organization_id, app_private.phone_match_key(phone))
  where patient_id is null;

-- Devolve o paciente so quando ele e o unico candidato: com dois cadastros no
-- mesmo numero (familia dividindo celular, duplicidade) o vinculo continua
-- manual, porque errar aqui joga historico clinico na conversa errada.
create or replace function app_private.match_patient_by_phone(
  p_organization_id uuid,
  p_phone text
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select case when count(*) = 1 then (array_agg(candidate.id))[1] end
  from (
    select patients.id
    from public.patients patients
    where patients.organization_id = p_organization_id
      and patients.deleted_at is null
      and app_private.phone_match_key(p_phone) is not null
      and app_private.phone_match_key(p_phone) in (
        app_private.phone_match_key(patients.phone),
        app_private.phone_match_key(patients.whatsapp)
      )
    limit 2
  ) candidate
$$;

-- Contato novo (ou com telefone corrigido) procura o paciente. Um update que
-- apenas mexe em patient_id nao dispara o gatilho: desvincular na mao tem de
-- continuar valendo.
create or replace function app_private.link_whatsapp_contact_to_patient()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.patient_id is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.phone is not distinct from old.phone then
    return new;
  end if;

  new.patient_id := app_private.match_patient_by_phone(
    new.organization_id,
    new.phone
  );

  return new;
end;
$$;

drop trigger if exists link_whatsapp_contact_to_patient
  on public.whatsapp_contacts;
create trigger link_whatsapp_contact_to_patient
before insert or update of phone on public.whatsapp_contacts
for each row execute function app_private.link_whatsapp_contact_to_patient();

-- Mao inversa: paciente cadastrado (ou telefone corrigido) depois do contato
-- adota as conversas que ainda estao soltas naquele numero.
create or replace function app_private.link_patient_to_whatsapp_contacts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;

  update public.whatsapp_contacts contacts
  set patient_id = new.id,
      updated_at = statement_timestamp()
  where contacts.organization_id = new.organization_id
    and contacts.patient_id is null
    and app_private.phone_match_key(contacts.phone) is not null
    and app_private.phone_match_key(contacts.phone) in (
      app_private.phone_match_key(new.phone),
      app_private.phone_match_key(new.whatsapp)
    )
    and app_private.match_patient_by_phone(
      contacts.organization_id,
      contacts.phone
    ) = new.id;

  return new;
end;
$$;

drop trigger if exists link_patient_to_whatsapp_contacts on public.patients;
create trigger link_patient_to_whatsapp_contacts
after insert or update of phone, whatsapp, deleted_at on public.patients
for each row execute function app_private.link_patient_to_whatsapp_contacts();

-- Contatos que ficaram soltos antes da regra existir.
update public.whatsapp_contacts contacts
set patient_id = app_private.match_patient_by_phone(
      contacts.organization_id,
      contacts.phone
    ),
    updated_at = statement_timestamp()
where contacts.patient_id is null
  and app_private.match_patient_by_phone(
    contacts.organization_id,
    contacts.phone
  ) is not null;

revoke all on function app_private.phone_match_key(text) from public;
revoke all on function app_private.match_patient_by_phone(uuid, text) from public;
revoke all on function app_private.link_whatsapp_contact_to_patient() from public;
revoke all on function app_private.link_patient_to_whatsapp_contacts() from public;
