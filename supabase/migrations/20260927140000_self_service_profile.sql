-- Meu perfil: a própria pessoa edita nome, telefone e foto (com auditoria), e
-- o e-mail de login confirmado no Supabase Auth passa a valer também na ficha
-- interna (app_users).
--
-- Foto: bucket privado, sem política de Storage para clientes. Envio, remoção
-- e links assinados passam pelo servidor (service role), que confere dono e
-- empresa — o mesmo desenho das fotos de pacientes.

alter table public.app_users
  add column if not exists avatar_path text;

comment on column public.app_users.avatar_path is
  'Caminho da foto de perfil no bucket privado user-avatars: <empresa|platform>/<app_user_id>/<arquivo>.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-avatars',
  'user-avatars',
  false,
  2097152,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Nome e telefone do próprio usuário, com registro na auditoria. A trigger
-- enforce_app_user_sensitive_changes continua barrando empresa, status,
-- e-mail e privilégios.
create or replace function public.update_own_profile(
  p_name text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_user_id uuid := app_private.current_app_user_id();
  v_user public.app_users%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_changed text[] := array[]::text[];
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe um nome entre 2 e 120 caracteres.'
      using errcode = '22023';
  end if;

  if v_phone is not null and char_length(v_phone) not between 10 and 13 then
    raise exception 'Informe um telefone com DDD.' using errcode = '22023';
  end if;

  select * into v_user from public.app_users where id = v_user_id for update;

  if v_user.name is distinct from v_name then
    v_changed := array_append(v_changed, 'name');
  end if;
  if v_user.phone is distinct from v_phone then
    v_changed := array_append(v_changed, 'phone');
  end if;

  if cardinality(v_changed) = 0 then
    return jsonb_build_object('ok', true, 'changed', v_changed);
  end if;

  update public.app_users
  set name = v_name,
      phone = v_phone
  where id = v_user_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    v_user.organization_id,
    v_user_id,
    'user.self_updated',
    'app_user',
    v_user_id,
    jsonb_build_object('changed', to_jsonb(v_changed))
  );

  return jsonb_build_object('ok', true, 'changed', v_changed);
end;
$$;

-- Troca (ou remove, com null) a foto. Devolve o caminho anterior para o
-- servidor apagar o arquivo antigo. O caminho precisa estar na pasta do
-- próprio usuário: ninguém aponta a foto para o arquivo de outra pessoa.
create or replace function public.set_own_avatar(p_avatar_path text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_user_id uuid := app_private.current_app_user_id();
  v_user public.app_users%rowtype;
  v_prefix text;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  select * into v_user from public.app_users where id = v_user_id for update;
  v_prefix := coalesce(v_user.organization_id::text, 'platform')
    || '/' || v_user_id::text || '/';

  if p_avatar_path is not null and (
    left(p_avatar_path, char_length(v_prefix)) <> v_prefix
    or position('..' in p_avatar_path) > 0
    or char_length(p_avatar_path) > 300
  ) then
    raise exception 'Caminho de foto inválido.' using errcode = '22023';
  end if;

  update public.app_users
  set avatar_path = p_avatar_path
  where id = v_user_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    v_user.organization_id,
    v_user_id,
    case when p_avatar_path is null
      then 'user.self_avatar_removed'
      else 'user.self_avatar_changed'
    end,
    'app_user',
    v_user_id,
    '{}'::jsonb
  );

  return jsonb_build_object('ok', true, 'previous_path', v_user.avatar_path);
end;
$$;

-- Eventos de segurança feitos pelo Supabase Auth (senha, e-mail, sessões):
-- o Auth não passa pelas nossas tabelas, então o servidor registra aqui.
create or replace function public.record_own_security_event(
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_user_id uuid := app_private.current_app_user_id();
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sessão inválida.' using errcode = '42501';
  end if;

  if p_action not in (
    'user.self_password_changed',
    'user.self_email_change_requested',
    'user.self_sessions_revoked'
  ) then
    raise exception 'Evento não permitido.' using errcode = '22023';
  end if;

  select organization_id into v_organization_id
  from public.app_users
  where id = v_user_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    v_organization_id,
    v_user_id,
    p_action,
    'app_user',
    v_user_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- E-mail de login confirmado no Auth → ficha interna. Roda na conexão do
-- próprio Auth (sem auth.uid()), que a trigger de campos sensíveis trata
-- como backend confiável.
create or replace function app_private.sync_app_user_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_app_user public.app_users%rowtype;
begin
  if new.email is null or new.email is not distinct from old.email then
    return new;
  end if;

  select * into v_app_user
  from public.app_users
  where auth_user_id = new.id;

  if not found or v_app_user.email = new.email::citext then
    return new;
  end if;

  update public.app_users
  set email = new.email
  where id = v_app_user.id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    v_app_user.organization_id,
    null,
    'user.login_email_changed',
    'app_user',
    v_app_user.id,
    jsonb_build_object('source', 'auth')
  );

  return new;
end;
$$;

drop trigger if exists sync_app_user_email_from_auth on auth.users;
create trigger sync_app_user_email_from_auth
after update of email on auth.users
for each row execute function app_private.sync_app_user_email_from_auth();

revoke all on function public.update_own_profile(text, text) from public, anon;
revoke all on function public.set_own_avatar(text) from public, anon;
revoke all on function public.record_own_security_event(text, jsonb) from public, anon;
revoke all on function app_private.sync_app_user_email_from_auth() from public;

grant execute on function public.update_own_profile(text, text) to authenticated;
grant execute on function public.set_own_avatar(text) to authenticated;
grant execute on function public.record_own_security_event(text, jsonb) to authenticated;
