-- Vinculo por numero completo: preserva DDD e aceita a variacao brasileira
-- de nono digito apenas em celulares. Nunca escolhe entre dois pacientes.
create or replace function app_private.phone_match_key(p_phone text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
begin
  if left(v_digits, 2) = '55' and length(v_digits) in (12, 13) then
    v_digits := substr(v_digits, 3);
  elsif left(ltrim(coalesce(p_phone, '')), 1) = '+' then
    return case when length(v_digits) between 10 and 15 then 'intl:' || v_digits end;
  end if;

  if length(v_digits) = 11 and substr(v_digits, 3, 1) = '9'
    and substr(v_digits, 4, 1) in ('6', '7', '8', '9') then
    v_digits := left(v_digits, 2) || substr(v_digits, 4);
  end if;
  if length(v_digits) in (10, 11) then
    return 'br:' || v_digits;
  end if;
  return case when length(v_digits) between 12 and 15 then 'intl:' || v_digits end;
end;
$$;

comment on function app_private.phone_match_key(text) is
  'Chave de telefone com DDD; normaliza DDI 55 e nono digito de celulares. Numeros incompletos nao geram vinculo.';
grant execute on function app_private.phone_match_key(text) to authenticated, service_role;

-- Os indices de expressao existentes precisam refletir a nova funcao.
reindex index public.patients_phone_match_idx;
reindex index public.patients_whatsapp_match_idx;
reindex index public.whatsapp_contacts_phone_match_idx;

alter table public.whatsapp_contacts
  add column if not exists patient_auto_link_disabled boolean not null default false;

create or replace function app_private.link_whatsapp_contact_to_patient()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.patient_id is not null or new.patient_auto_link_disabled then
    return new;
  end if;
  -- Tambem tenta novamente no upsert da proxima mensagem, mesmo telefone.
  new.patient_id := app_private.match_patient_by_phone(new.organization_id, new.phone);
  return new;
end;
$$;

create or replace function app_private.link_patient_to_whatsapp_contacts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.deleted_at is not null then return new; end if;
  update public.whatsapp_contacts contacts
  set patient_id = new.id, updated_at = statement_timestamp()
  where contacts.organization_id = new.organization_id
    and contacts.patient_id is null
    and not contacts.patient_auto_link_disabled
    and app_private.phone_match_key(contacts.phone) is not null
    and app_private.phone_match_key(contacts.phone) in (
      app_private.phone_match_key(new.phone), app_private.phone_match_key(new.whatsapp)
    )
    and app_private.match_patient_by_phone(contacts.organization_id, contacts.phone) = new.id;
  return new;
end;
$$;

-- Reavalia apenas contatos sem vinculo. Vinculos ja escolhidos sao preservados.
update public.whatsapp_contacts
set phone = phone
where patient_id is null and not patient_auto_link_disabled;

-- Cadastro e vinculo atomicos: duas submissoes nao criam dois pacientes.
create or replace function public.create_patient_from_whatsapp_contact(
  p_organization_id uuid, p_contact_id uuid, p_full_name text, p_email text default null
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
declare
  v_contact public.whatsapp_contacts%rowtype;
  v_patient_id uuid;
  v_key text;
begin
  if auth.uid() is null or (not app_private.current_is_super_admin() and (
    p_organization_id is distinct from app_private.current_organization_id()
    or not app_private.current_user_has_permission('atendimento.atender')
    or not app_private.current_user_has_permission('paciente.criar')
    or not app_private.current_user_has_permission('paciente.ver')
  )) then
    raise exception 'Insufficient contact patient permission' using errcode = '42501';
  end if;
  if p_full_name is null or length(trim(p_full_name)) not between 3 and 160 then
    raise exception 'Invalid patient name' using errcode = '22023';
  end if;
  if p_email is not null and (length(p_email) > 254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Invalid patient email' using errcode = '22023';
  end if;

  select * into v_contact from public.whatsapp_contacts
  where organization_id = p_organization_id and id = p_contact_id;
  if not found then raise exception 'Contact not found' using errcode = 'P0002'; end if;
  if v_contact.patient_id is not null then return v_contact.patient_id; end if;
  v_key := app_private.phone_match_key(v_contact.phone);
  if v_key is null then raise exception 'Invalid contact phone' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || v_key, 0));
  -- Serializa por numero antes de bloquear o contato: o trigger do paciente
  -- pode atualizar outros contatos com a mesma chave sem inverter os locks.
  select * into v_contact from public.whatsapp_contacts
  where organization_id = p_organization_id and id = p_contact_id for update;
  if not found then raise exception 'Contact not found' using errcode = 'P0002'; end if;
  if v_contact.patient_id is not null then return v_contact.patient_id; end if;
  if app_private.phone_match_key(v_contact.phone) is distinct from v_key then
    raise exception 'Contact phone changed; retry' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.patients p where p.organization_id = p_organization_id
      and p.deleted_at is null
      and v_key in (app_private.phone_match_key(p.phone), app_private.phone_match_key(p.whatsapp))
  ) then
    raise exception 'Patient phone already registered' using errcode = '23505';
  end if;

  insert into public.patients (organization_id, full_name, phone, whatsapp, email, source, preferred_contact)
  values (p_organization_id, trim(p_full_name), v_contact.phone, v_contact.phone,
    nullif(trim(p_email), ''), 'whatsapp', 'whatsapp')
  returning id into v_patient_id;
  update public.whatsapp_contacts
  set patient_id = v_patient_id, patient_auto_link_disabled = false
  where organization_id = p_organization_id and id = p_contact_id;
  return v_patient_id;
end;
$$;

revoke all on function public.create_patient_from_whatsapp_contact(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_patient_from_whatsapp_contact(uuid, uuid, text, text) to authenticated;
