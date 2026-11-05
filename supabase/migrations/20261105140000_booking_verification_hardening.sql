-- Raio-X S4: verificação de contato do agendamento online.
--
-- ATENÇÃO: criada no repositório e NÃO aplicada em produção. Teste num
-- branch do Supabase o fluxo de agendamento online com verificação: código
-- certo, código errado cinco vezes (a sexta deve ser recusada por limite) e
-- código expirado.
--
-- 1. O código de 6 dígitos passa a sair de gen_random_bytes (pgcrypto) em vez
--    de random(), que não é criptográfico.
-- 2. Código errado não levanta mais exceção: a exceção desfazia o incremento
--    de tentativas na mesma transação, então o limite de tentativas nunca era
--    atingido e dava para testar códigos sem fim. Agora a função devolve
--    'invalid' e a tentativa fica gravada. O app já trata esse retorno.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.start_online_booking_contact_verification(
  p_public_slug text,
  p_contact_type text,
  p_destination text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_settings public.online_booking_settings%rowtype;
  v_contact_type text;
  v_destination text;
  v_normalized text;
  v_code text;
  v_id uuid;
  v_expires_at timestamptz;
  v_recent_count integer;
begin
  select *
    into v_settings
  from public.online_booking_settings
  where public_slug = lower(trim(p_public_slug))
    and enabled;

  if v_settings.id is null then
    raise exception 'Online booking is not available.' using errcode = '42501';
  end if;

  v_contact_type := lower(trim(coalesce(p_contact_type, '')));
  v_destination := trim(coalesce(p_destination, ''));
  v_normalized := app_private.normalize_online_booking_contact(
    v_contact_type,
    v_destination
  );

  select count(*)
    into v_recent_count
  from public.online_booking_contact_verifications
  where organization_id = v_settings.organization_id
    and contact_type = v_contact_type
    and destination_normalized = v_normalized
    and created_at >= statement_timestamp() - interval '1 hour';

  if v_recent_count >= 5 then
    raise exception 'Verification request limit reached for this contact.'
      using errcode = '23514';
  end if;

  v_id := gen_random_uuid();
  -- Gerador criptográfico (pgcrypto): random() é previsível.
  v_code := lpad(
    (
      ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint
      % 1000000
    )::text,
    6,
    '0'
  );
  v_expires_at := statement_timestamp()
    + make_interval(mins => v_settings.contact_verification_ttl_minutes);

  insert into public.online_booking_contact_verifications (
    id,
    organization_id,
    contact_type,
    destination,
    destination_normalized,
    code_hash,
    expires_at
  ) values (
    v_id,
    v_settings.organization_id,
    v_contact_type,
    v_destination,
    v_normalized,
    app_private.hash_online_booking_verification_code(v_id, v_code),
    v_expires_at
  );

  return jsonb_build_object(
    'verification_id', v_id,
    'expires_at', v_expires_at,
    'delivery_debug_code', v_code
  );
end;
$$;

create or replace function public.verify_online_booking_contact(
  p_verification_id uuid,
  p_code text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_verification public.online_booking_contact_verifications%rowtype;
begin
  select *
    into v_verification
  from public.online_booking_contact_verifications
  where id = p_verification_id
  for update;

  if v_verification.id is null then
    raise exception 'Verification not found.' using errcode = 'P0002';
  end if;

  if v_verification.consumed_at is not null then
    raise exception 'Verification already consumed.' using errcode = '23514';
  end if;

  if v_verification.expires_at < statement_timestamp() then
    raise exception 'Verification expired.' using errcode = '23514';
  end if;

  if v_verification.attempts >= v_verification.max_attempts then
    raise exception 'Verification attempts exceeded.' using errcode = '23514';
  end if;

  update public.online_booking_contact_verifications
  set attempts = attempts + 1
  where id = v_verification.id;

  -- Código errado devolve 'invalid' em vez de erro: o erro desfazia o
  -- incremento de tentativas acima e o limite nunca era atingido.
  if v_verification.code_hash <> app_private.hash_online_booking_verification_code(
    v_verification.id,
    p_code
  ) then
    return 'invalid';
  end if;

  update public.online_booking_contact_verifications
  set verified_at = statement_timestamp()
  where id = v_verification.id;

  return 'verified';
end;
$$;

revoke all on function public.start_online_booking_contact_verification(text, text, text)
  from public, anon, authenticated;
grant execute on function public.start_online_booking_contact_verification(text, text, text)
  to service_role;

revoke all on function public.verify_online_booking_contact(uuid, text) from public;
grant execute on function public.verify_online_booking_contact(uuid, text)
  to anon, authenticated, service_role;
