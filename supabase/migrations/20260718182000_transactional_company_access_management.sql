-- Make company access-management mutations atomic and protect the last active
-- config.usuarios holder even when callers bypass the application actions.

create or replace function app_private.lock_company_access_graph(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if p_organization_id is null then
    raise exception 'Organization is required.' using errcode = '22004';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('company-access:' || p_organization_id::text, 0)
  );
end;
$$;

create or replace function app_private.organization_has_access_manager(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.app_users as users
    where users.organization_id = p_organization_id
      and users.status = 'active'
      and not users.is_super_admin
      and (
        exists (
          select 1
          from public.user_permission_overrides as overrides
          join public.permissions as permissions
            on permissions.id = overrides.permission_id
           and permissions.code = 'config.usuarios'
          where overrides.user_id = users.id
            and overrides.granted
        )
        or (
          not exists (
            select 1
            from public.user_permission_overrides as overrides
            join public.permissions as permissions
              on permissions.id = overrides.permission_id
             and permissions.code = 'config.usuarios'
            where overrides.user_id = users.id
              and not overrides.granted
          )
          and exists (
            select 1
            from public.user_profiles as assignments
            join public.profiles as profiles
              on profiles.id = assignments.profile_id
             and profiles.organization_id = users.organization_id
            join public.profile_permissions as grants
              on grants.profile_id = assignments.profile_id
            join public.permissions as permissions
              on permissions.id = grants.permission_id
             and permissions.code = 'config.usuarios'
            where assignments.user_id = users.id
          )
        )
      )
  );
$$;

create or replace function app_private.assert_company_keeps_access_manager(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if p_organization_id is null
    or not exists (
      select 1
      from public.organizations
      where id = p_organization_id
    ) then
    return;
  end if;

  if not app_private.organization_has_access_manager(p_organization_id) then
    raise exception 'A empresa precisa manter ao menos um usuario ativo com permissao para gerenciar acessos.'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function app_private.assert_company_access_actor(
  p_organization_id uuid,
  p_effective_actor_user_id uuid,
  p_audit_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not exists (
    select 1
    from public.app_users as actors
    where actors.id = p_effective_actor_user_id
      and actors.organization_id = p_organization_id
      and actors.status = 'active'
      and not actors.is_super_admin
  ) then
    raise exception 'Responsavel efetivo nao pertence a empresa ou esta inativo.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from app_private.user_permission_codes(p_effective_actor_user_id) as codes(code)
    where codes.code = 'config.usuarios'
  ) then
    raise exception 'Responsavel efetivo nao possui permissao para gerenciar acessos.'
      using errcode = '42501';
  end if;

  if p_audit_actor_user_id = p_effective_actor_user_id then
    return;
  end if;

  if not exists (
    select 1
    from public.app_users as support_users
    join public.impersonation_sessions as sessions
      on sessions.super_admin_user_id = support_users.id
     and sessions.organization_id = p_organization_id
     and sessions.target_user_id = p_effective_actor_user_id
     and sessions.ended_at is null
     and sessions.started_at <= statement_timestamp()
     and sessions.started_at >= statement_timestamp() - interval '4 hours'
    where support_users.id = p_audit_actor_user_id
      and support_users.status = 'active'
      and support_users.is_super_admin
  ) then
    raise exception 'Responsavel de auditoria nao corresponde a uma sessao ativa de suporte.'
      using errcode = '42501';
  end if;
end;
$$;

-- Constraint triggers run against the final transaction state. They cover
-- direct table writes as well as RPCs, and serialize commit-time checks by
-- organization so two concurrent removals cannot both pass.
create or replace function app_private.enforce_company_access_manager_invariant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_organization_ids uuid[] := '{}'::uuid[];
  v_organization_id uuid;
  v_checked_ids uuid[] := '{}'::uuid[];
begin
  if tg_table_name = 'app_users' then
    if tg_op <> 'INSERT' then
      v_organization_ids := array_append(v_organization_ids, old.organization_id);
    end if;
    if tg_op <> 'DELETE' then
      v_organization_ids := array_append(v_organization_ids, new.organization_id);
    end if;
  elsif tg_table_name = 'profiles' then
    if tg_op <> 'INSERT' then
      v_organization_ids := array_append(v_organization_ids, old.organization_id);
    end if;
    if tg_op <> 'DELETE' then
      v_organization_ids := array_append(v_organization_ids, new.organization_id);
    end if;
  elsif tg_table_name = 'user_profiles' then
    if tg_op <> 'INSERT' then
      select organization_id
        into v_organization_id
      from public.app_users
      where id = old.user_id;

      if v_organization_id is null then
        select organization_id
          into v_organization_id
        from public.profiles
        where id = old.profile_id;
      end if;
      v_organization_ids := array_append(v_organization_ids, v_organization_id);
    end if;

    if tg_op <> 'DELETE' then
      select organization_id
        into v_organization_id
      from public.app_users
      where id = new.user_id;

      if v_organization_id is null then
        select organization_id
          into v_organization_id
        from public.profiles
        where id = new.profile_id;
      end if;
      v_organization_ids := array_append(v_organization_ids, v_organization_id);
    end if;
  elsif tg_table_name = 'user_permission_overrides' then
    if tg_op <> 'INSERT' then
      select organization_id
        into v_organization_id
      from public.app_users
      where id = old.user_id;
      v_organization_ids := array_append(v_organization_ids, v_organization_id);
    end if;

    if tg_op <> 'DELETE' then
      select organization_id
        into v_organization_id
      from public.app_users
      where id = new.user_id;
      v_organization_ids := array_append(v_organization_ids, v_organization_id);
    end if;
  elsif tg_table_name = 'profile_permissions' then
    if tg_op <> 'INSERT' then
      select organization_id
        into v_organization_id
      from public.profiles
      where id = old.profile_id;
      v_organization_ids := array_append(v_organization_ids, v_organization_id);
    end if;

    if tg_op <> 'DELETE' then
      select organization_id
        into v_organization_id
      from public.profiles
      where id = new.profile_id;
      v_organization_ids := array_append(v_organization_ids, v_organization_id);
    end if;
  end if;

  foreach v_organization_id in array v_organization_ids loop
    continue when v_organization_id is null;
    continue when v_organization_id = any(v_checked_ids);
    v_checked_ids := array_append(v_checked_ids, v_organization_id);

    perform app_private.lock_company_access_graph(v_organization_id);
    perform app_private.assert_company_keeps_access_manager(v_organization_id);
  end loop;

  return null;
end;
$$;

drop trigger if exists app_users_access_manager_invariant on public.app_users;
create constraint trigger app_users_access_manager_invariant
after insert or update or delete on public.app_users
deferrable initially deferred
for each row execute function app_private.enforce_company_access_manager_invariant();

drop trigger if exists profiles_access_manager_invariant on public.profiles;
create constraint trigger profiles_access_manager_invariant
after insert or update or delete on public.profiles
deferrable initially deferred
for each row execute function app_private.enforce_company_access_manager_invariant();

drop trigger if exists user_profiles_access_manager_invariant on public.user_profiles;
create constraint trigger user_profiles_access_manager_invariant
after insert or update or delete on public.user_profiles
deferrable initially deferred
for each row execute function app_private.enforce_company_access_manager_invariant();

drop trigger if exists user_overrides_access_manager_invariant
  on public.user_permission_overrides;
create constraint trigger user_overrides_access_manager_invariant
after insert or update or delete on public.user_permission_overrides
deferrable initially deferred
for each row execute function app_private.enforce_company_access_manager_invariant();

drop trigger if exists profile_permissions_access_manager_invariant
  on public.profile_permissions;
create constraint trigger profile_permissions_access_manager_invariant
after insert or update or delete on public.profile_permissions
deferrable initially deferred
for each row execute function app_private.enforce_company_access_manager_invariant();

revoke all on function app_private.lock_company_access_graph(uuid) from public;
revoke all on function app_private.organization_has_access_manager(uuid) from public;
revoke all on function app_private.assert_company_keeps_access_manager(uuid) from public;
revoke all on function app_private.assert_company_access_actor(uuid, uuid, uuid) from public;
revoke all on function app_private.enforce_company_access_manager_invariant() from public;

-- The identity fields and professional link are one database mutation. Auth is
-- external to PostgreSQL and is compensated by the server action if this RPC
-- rejects the database portion.
create or replace function public.manage_company_user_identity(
  p_organization_id uuid,
  p_effective_actor_user_id uuid,
  p_audit_actor_user_id uuid,
  p_target_user_id uuid,
  p_name text,
  p_email text,
  p_phone text default null,
  p_professional_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_target public.app_users%rowtype;
  v_current_professional_id uuid;
  v_next_professional_user_id uuid;
  v_next_professional_active boolean;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_name, ''));
begin
  perform app_private.lock_company_access_graph(p_organization_id);
  perform app_private.assert_company_access_actor(
    p_organization_id,
    p_effective_actor_user_id,
    p_audit_actor_user_id
  );

  if char_length(v_name) < 2 or char_length(v_name) > 160 then
    raise exception 'Informe um nome de usuario valido.' using errcode = '23514';
  end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Informe um e-mail valido.' using errcode = '23514';
  end if;
  if char_length(coalesce(p_phone, '')) > 32 then
    raise exception 'Telefone invalido.' using errcode = '23514';
  end if;

  select users.*
    into v_target
  from public.app_users as users
  where users.id = p_target_user_id
    and users.organization_id = p_organization_id
    and not users.is_super_admin
  for update;

  if v_target.id is null then
    raise exception 'Usuario nao encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  perform 1
  from public.professionals as professionals
  where professionals.organization_id = p_organization_id
    and (
      professionals.user_id = p_target_user_id
      or professionals.id = p_professional_id
    )
  order by professionals.id
  for update;

  select professionals.id
    into v_current_professional_id
  from public.professionals as professionals
  where professionals.organization_id = p_organization_id
    and professionals.user_id = p_target_user_id
  limit 1;

  if p_professional_id is not null then
    select professionals.user_id, professionals.active
      into v_next_professional_user_id, v_next_professional_active
    from public.professionals as professionals
    where professionals.organization_id = p_organization_id
      and professionals.id = p_professional_id;

    if not found then
      raise exception 'Profissional nao encontrado nesta empresa.' using errcode = 'P0002';
    end if;
    if not v_next_professional_active then
      raise exception 'Reative o profissional antes de vincula-lo ao usuario.'
        using errcode = '23514';
    end if;
    if v_next_professional_user_id is not null
      and v_next_professional_user_id <> p_target_user_id then
      raise exception 'Este profissional ja esta vinculado a outro usuario.'
        using errcode = '23505';
    end if;
  end if;

  update public.app_users
  set name = v_name,
      email = v_email,
      phone = nullif(trim(coalesce(p_phone, '')), '')
  where id = p_target_user_id;

  if v_current_professional_id is distinct from p_professional_id then
    update public.professionals
    set user_id = null
    where organization_id = p_organization_id
      and user_id = p_target_user_id;

    if p_professional_id is not null then
      update public.professionals
      set user_id = p_target_user_id
      where organization_id = p_organization_id
        and id = p_professional_id;
    end if;
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    p_organization_id,
    p_audit_actor_user_id,
    'user.updated',
    'app_user',
    p_target_user_id,
    jsonb_build_object(
      'effective_user_id', p_effective_actor_user_id,
      'changed_email', v_email <> lower(v_target.email::text),
      'previous_professional_id', v_current_professional_id,
      'professional_id', p_professional_id
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.manage_company_user_status(
  p_organization_id uuid,
  p_effective_actor_user_id uuid,
  p_audit_actor_user_id uuid,
  p_target_user_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_target public.app_users%rowtype;
begin
  perform app_private.lock_company_access_graph(p_organization_id);
  perform app_private.assert_company_access_actor(
    p_organization_id,
    p_effective_actor_user_id,
    p_audit_actor_user_id
  );

  if p_status not in ('active', 'suspended') then
    raise exception 'Status invalido.' using errcode = '23514';
  end if;
  if p_status = 'suspended' and p_target_user_id = p_effective_actor_user_id then
    raise exception 'Voce nao pode suspender o proprio acesso.' using errcode = '42501';
  end if;

  select users.*
    into v_target
  from public.app_users as users
  where users.id = p_target_user_id
    and users.organization_id = p_organization_id
    and not users.is_super_admin
  for update;

  if v_target.id is null then
    raise exception 'Usuario nao encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  update public.app_users
  set status = p_status
  where id = p_target_user_id;

  perform app_private.assert_company_keeps_access_manager(p_organization_id);

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    p_organization_id,
    p_audit_actor_user_id,
    case p_status
      when 'suspended' then 'user.access_suspended'
      else 'user.access_reactivated'
    end,
    'app_user',
    p_target_user_id,
    jsonb_build_object(
      'effective_user_id', p_effective_actor_user_id,
      'previous_status', v_target.status,
      'status', p_status
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.manage_company_user_profile(
  p_organization_id uuid,
  p_effective_actor_user_id uuid,
  p_audit_actor_user_id uuid,
  p_target_user_id uuid,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_target public.app_users%rowtype;
  v_profile_name text;
  v_previous_profile_ids jsonb;
begin
  perform app_private.lock_company_access_graph(p_organization_id);
  perform app_private.assert_company_access_actor(
    p_organization_id,
    p_effective_actor_user_id,
    p_audit_actor_user_id
  );

  select users.*
    into v_target
  from public.app_users as users
  where users.id = p_target_user_id
    and users.organization_id = p_organization_id
    and not users.is_super_admin
  for update;

  if v_target.id is null then
    raise exception 'Usuario nao encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  select profiles.name
    into v_profile_name
  from public.profiles as profiles
  where profiles.id = p_profile_id
    and profiles.organization_id = p_organization_id
  for share;

  if v_profile_name is null then
    raise exception 'Perfil nao encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(assignments.profile_id order by assignments.profile_id), '[]'::jsonb)
    into v_previous_profile_ids
  from public.user_profiles as assignments
  where assignments.user_id = p_target_user_id;

  delete from public.user_profiles
  where user_id = p_target_user_id;

  insert into public.user_profiles (user_id, profile_id)
  values (p_target_user_id, p_profile_id);

  perform app_private.assert_company_keeps_access_manager(p_organization_id);

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    p_organization_id,
    p_audit_actor_user_id,
    'user.profile_changed',
    'app_user',
    p_target_user_id,
    jsonb_build_object(
      'effective_user_id', p_effective_actor_user_id,
      'previous_profile_ids', v_previous_profile_ids,
      'profile_id', p_profile_id,
      'profile_name', v_profile_name
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.manage_company_user_permission_overrides(
  p_organization_id uuid,
  p_effective_actor_user_id uuid,
  p_audit_actor_user_id uuid,
  p_target_user_id uuid,
  p_overrides jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_target public.app_users%rowtype;
  v_overrides jsonb := coalesce(p_overrides, '[]'::jsonb);
  v_override_count integer;
  v_normalized_overrides jsonb;
begin
  perform app_private.lock_company_access_graph(p_organization_id);
  perform app_private.assert_company_access_actor(
    p_organization_id,
    p_effective_actor_user_id,
    p_audit_actor_user_id
  );

  select users.*
    into v_target
  from public.app_users as users
  where users.id = p_target_user_id
    and users.organization_id = p_organization_id
    and not users.is_super_admin
  for update;

  if v_target.id is null then
    raise exception 'Usuario nao encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  if jsonb_typeof(v_overrides) <> 'array'
    or jsonb_array_length(v_overrides) > 250 then
    raise exception 'Configuracao de permissoes invalida.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_overrides) as items(item)
    where coalesce(items.item->>'permission_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(items.item->'granted') is distinct from 'boolean'
  ) then
    raise exception 'Configuracao de permissoes invalida.' using errcode = '22023';
  end if;

  select count(*)
    into v_override_count
  from jsonb_array_elements(v_overrides);

  if (
    select count(distinct (items.item->>'permission_id')::uuid)
    from jsonb_array_elements(v_overrides) as items(item)
  ) <> v_override_count then
    raise exception 'Remova permissoes duplicadas antes de salvar.' using errcode = '23505';
  end if;

  if (
    select count(*)
    from public.permissions
    where id in (
      select (items.item->>'permission_id')::uuid
      from jsonb_array_elements(v_overrides) as items(item)
    )
  ) <> v_override_count then
    raise exception 'Ha permissoes invalidas na selecao.' using errcode = '23503';
  end if;

  delete from public.user_permission_overrides
  where user_id = p_target_user_id;

  insert into public.user_permission_overrides (user_id, permission_id, granted)
  select
    p_target_user_id,
    (items.item->>'permission_id')::uuid,
    (items.item->>'granted')::boolean
  from jsonb_array_elements(v_overrides) as items(item);

  perform app_private.assert_company_keeps_access_manager(p_organization_id);

  select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'permission_id', overrides.permission_id,
          'granted', overrides.granted
        )
        order by overrides.permission_id
      ),
      '[]'::jsonb
    )
    into v_normalized_overrides
  from public.user_permission_overrides as overrides
  where overrides.user_id = p_target_user_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    p_organization_id,
    p_audit_actor_user_id,
    'user.permission_overrides_changed',
    'app_user',
    p_target_user_id,
    jsonb_build_object(
      'effective_user_id', p_effective_actor_user_id,
      'overrides', v_normalized_overrides
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.manage_company_user_resource_scopes(
  p_organization_id uuid,
  p_effective_actor_user_id uuid,
  p_audit_actor_user_id uuid,
  p_target_user_id uuid,
  p_mode text,
  p_scopes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_target public.app_users%rowtype;
  v_scopes jsonb := coalesce(p_scopes, '[]'::jsonb);
  v_scope_count integer;
  v_normalized_scopes jsonb;
begin
  perform app_private.lock_company_access_graph(p_organization_id);
  perform app_private.assert_company_access_actor(
    p_organization_id,
    p_effective_actor_user_id,
    p_audit_actor_user_id
  );

  select users.*
    into v_target
  from public.app_users as users
  where users.id = p_target_user_id
    and users.organization_id = p_organization_id
    and not users.is_super_admin
  for update;

  if v_target.id is null then
    raise exception 'Usuario nao encontrado nesta empresa.' using errcode = 'P0002';
  end if;

  if p_mode not in ('own', 'all', 'custom')
    or jsonb_typeof(v_scopes) <> 'array'
    or jsonb_array_length(v_scopes) > 250 then
    raise exception 'Configuracao de escopo invalida.' using errcode = '22023';
  end if;

  if p_mode = 'own' and not exists (
    select 1
    from public.professionals
    where organization_id = p_organization_id
      and user_id = p_target_user_id
  ) then
    raise exception 'Vincule um profissional ao usuario antes de usar o escopo proprio.'
      using errcode = '23514';
  end if;

  if p_mode = 'custom' and exists (
    select 1
    from jsonb_array_elements(v_scopes) as items(item)
    where coalesce(items.item->>'resource_type', '')
        not in ('agenda', 'profissional', 'unidade', 'especialidade')
      or coalesce(items.item->>'access_level', '')
        not in ('read', 'write', 'full')
      or items.item->'resource_id' is null
      or jsonb_typeof(items.item->'resource_id') not in ('null', 'string')
      or (
        jsonb_typeof(items.item->'resource_id') = 'string'
        and coalesce(items.item->>'resource_id', '')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
  ) then
    raise exception 'Configuracao de escopo invalida.' using errcode = '22023';
  end if;

  if p_mode = 'custom' and exists (
    select 1
    from jsonb_array_elements(v_scopes) as items(item)
    group by
      items.item->>'resource_type',
      items.item->>'resource_id'
    having count(*) > 1
  ) then
    raise exception 'Remova os escopos duplicados antes de salvar.' using errcode = '23505';
  end if;

  if p_mode = 'custom' and exists (
    select 1
    from jsonb_array_elements(v_scopes) as items(item)
    where jsonb_typeof(items.item->'resource_id') = 'string'
      and not case items.item->>'resource_type'
        when 'agenda' then exists (
          select 1
          from public.schedules
          where organization_id = p_organization_id
            and id = (items.item->>'resource_id')::uuid
        )
        when 'profissional' then exists (
          select 1
          from public.professionals
          where organization_id = p_organization_id
            and id = (items.item->>'resource_id')::uuid
        )
        when 'unidade' then exists (
          select 1
          from public.units
          where organization_id = p_organization_id
            and id = (items.item->>'resource_id')::uuid
        )
        when 'especialidade' then exists (
          select 1
          from public.specialties
          where organization_id = p_organization_id
            and id = (items.item->>'resource_id')::uuid
        )
        else false
      end
  ) then
    raise exception 'Ha recursos selecionados que nao pertencem a empresa.'
      using errcode = '23503';
  end if;

  delete from public.resource_scopes
  where organization_id = p_organization_id
    and user_id = p_target_user_id;

  if p_mode = 'all' then
    insert into public.resource_scopes (
      organization_id, user_id, resource_type, resource_id, access_level
    )
    values
      (p_organization_id, p_target_user_id, 'agenda', null, 'full'),
      (p_organization_id, p_target_user_id, 'profissional', null, 'full'),
      (p_organization_id, p_target_user_id, 'unidade', null, 'full'),
      (p_organization_id, p_target_user_id, 'especialidade', null, 'full');
  elsif p_mode = 'custom' then
    insert into public.resource_scopes (
      organization_id, user_id, resource_type, resource_id, access_level
    )
    select
      p_organization_id,
      p_target_user_id,
      items.item->>'resource_type',
      case
        when jsonb_typeof(items.item->'resource_id') = 'string'
          then (items.item->>'resource_id')::uuid
        else null
      end,
      items.item->>'access_level'
    from jsonb_array_elements(v_scopes) as items(item);
  end if;

  select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'resource_type', scopes.resource_type,
          'resource_id', scopes.resource_id,
          'access_level', scopes.access_level
        )
        order by scopes.resource_type, scopes.resource_id, scopes.access_level
      ),
      '[]'::jsonb
    )
    into v_normalized_scopes
  from public.resource_scopes as scopes
  where scopes.organization_id = p_organization_id
    and scopes.user_id = p_target_user_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    p_organization_id,
    p_audit_actor_user_id,
    'user.resource_scopes_changed',
    'app_user',
    p_target_user_id,
    jsonb_build_object(
      'effective_user_id', p_effective_actor_user_id,
      'mode', p_mode,
      'scopes', v_normalized_scopes
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.manage_company_profile_update(
  p_organization_id uuid,
  p_effective_actor_user_id uuid,
  p_audit_actor_user_id uuid,
  p_profile_id uuid,
  p_name text,
  p_description text,
  p_permission_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_profile public.profiles%rowtype;
  v_permission_ids uuid[] := coalesce(p_permission_ids, '{}'::uuid[]);
  v_previous_permission_ids jsonb;
  v_name text := trim(coalesce(p_name, ''));
begin
  perform app_private.lock_company_access_graph(p_organization_id);
  perform app_private.assert_company_access_actor(
    p_organization_id,
    p_effective_actor_user_id,
    p_audit_actor_user_id
  );

  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'Informe um nome de perfil valido.' using errcode = '23514';
  end if;
  if char_length(coalesce(p_description, '')) > 400
    or cardinality(v_permission_ids) > 250
    or array_position(v_permission_ids, null) is not null then
    raise exception 'Dados do perfil invalidos.' using errcode = '22023';
  end if;
  if cardinality(v_permission_ids) <> (
    select count(distinct permission_id)
    from unnest(v_permission_ids) as permission_rows(permission_id)
  ) then
    raise exception 'Remova permissoes duplicadas antes de salvar.' using errcode = '23505';
  end if;
  if cardinality(v_permission_ids) <> (
    select count(*)
    from public.permissions
    where id = any(v_permission_ids)
  ) then
    raise exception 'Ha permissoes invalidas na selecao.' using errcode = '23503';
  end if;

  select profiles.*
    into v_profile
  from public.profiles as profiles
  where profiles.id = p_profile_id
    and profiles.organization_id = p_organization_id
  for update;

  if v_profile.id is null then
    raise exception 'Perfil nao encontrado.' using errcode = 'P0002';
  end if;
  if v_profile.is_system_default then
    raise exception 'Perfis padrao sao protegidos; duplique o perfil para personaliza-lo.'
      using errcode = '42501';
  end if;

  select coalesce(
      jsonb_agg(grants.permission_id order by grants.permission_id),
      '[]'::jsonb
    )
    into v_previous_permission_ids
  from public.profile_permissions as grants
  where grants.profile_id = p_profile_id;

  update public.profiles
  set name = v_name,
      description = nullif(trim(coalesce(p_description, '')), '')
  where id = p_profile_id;

  delete from public.profile_permissions
  where profile_id = p_profile_id;

  insert into public.profile_permissions (profile_id, permission_id)
  select p_profile_id, permission_ids.permission_id
  from unnest(v_permission_ids) as permission_ids(permission_id);

  perform app_private.assert_company_keeps_access_manager(p_organization_id);

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    p_organization_id,
    p_audit_actor_user_id,
    'profile.updated',
    'profile',
    p_profile_id,
    jsonb_build_object(
      'effective_user_id', p_effective_actor_user_id,
      'name', v_name,
      'previous_permission_ids', v_previous_permission_ids,
      'permission_ids', to_jsonb(v_permission_ids)
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.manage_company_profile_delete(
  p_organization_id uuid,
  p_effective_actor_user_id uuid,
  p_audit_actor_user_id uuid,
  p_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_profile public.profiles%rowtype;
begin
  perform app_private.lock_company_access_graph(p_organization_id);
  perform app_private.assert_company_access_actor(
    p_organization_id,
    p_effective_actor_user_id,
    p_audit_actor_user_id
  );

  select profiles.*
    into v_profile
  from public.profiles as profiles
  where profiles.id = p_profile_id
    and profiles.organization_id = p_organization_id
  for update;

  if v_profile.id is null then
    raise exception 'Perfil nao encontrado.' using errcode = 'P0002';
  end if;
  if v_profile.is_system_default then
    raise exception 'Perfis padrao da empresa nao podem ser excluidos.'
      using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.user_profiles
    where profile_id = p_profile_id
  ) then
    raise exception 'Este perfil esta em uso. Atribua outro perfil aos usuarios antes de exclui-lo.'
      using errcode = '23503';
  end if;

  delete from public.profiles
  where id = p_profile_id;

  perform app_private.assert_company_keeps_access_manager(p_organization_id);

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    p_organization_id,
    p_audit_actor_user_id,
    'profile.deleted',
    'profile',
    p_profile_id,
    jsonb_build_object(
      'effective_user_id', p_effective_actor_user_id,
      'name', v_profile.name
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.manage_company_profile_create(
  p_organization_id uuid,
  p_effective_actor_user_id uuid,
  p_audit_actor_user_id uuid,
  p_name text,
  p_description text,
  p_permission_ids uuid[],
  p_source_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_source_profile public.profiles%rowtype;
  v_permission_ids uuid[] := coalesce(p_permission_ids, '{}'::uuid[]);
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_name text := trim(coalesce(p_name, ''));
  v_profile_id uuid;
  v_action text;
begin
  perform app_private.lock_company_access_graph(p_organization_id);
  perform app_private.assert_company_access_actor(
    p_organization_id,
    p_effective_actor_user_id,
    p_audit_actor_user_id
  );

  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'Informe um nome de perfil valido.' using errcode = '23514';
  end if;

  if p_source_profile_id is not null then
    select profiles.*
      into v_source_profile
    from public.profiles as profiles
    where profiles.id = p_source_profile_id
      and profiles.organization_id = p_organization_id
    for share;

    if v_source_profile.id is null then
      raise exception 'Perfil de origem nao encontrado.' using errcode = 'P0002';
    end if;

    v_description := v_source_profile.description;
    select coalesce(array_agg(grants.permission_id order by grants.permission_id), '{}'::uuid[])
      into v_permission_ids
    from public.profile_permissions as grants
    where grants.profile_id = p_source_profile_id;
    v_action := 'profile.duplicated';
  else
    if char_length(coalesce(p_description, '')) > 400
      or cardinality(v_permission_ids) > 250
      or array_position(v_permission_ids, null) is not null then
      raise exception 'Dados do perfil invalidos.' using errcode = '22023';
    end if;
    if cardinality(v_permission_ids) <> (
      select count(distinct permission_id)
      from unnest(v_permission_ids) as permission_rows(permission_id)
    ) then
      raise exception 'Remova permissoes duplicadas antes de salvar.' using errcode = '23505';
    end if;
    if cardinality(v_permission_ids) <> (
      select count(*)
      from public.permissions
      where id = any(v_permission_ids)
    ) then
      raise exception 'Ha permissoes invalidas na selecao.' using errcode = '23503';
    end if;
    v_action := 'profile.created';
  end if;

  insert into public.profiles (
    organization_id, name, description, is_system_default
  )
  values (p_organization_id, v_name, v_description, false)
  returning id into v_profile_id;

  insert into public.profile_permissions (profile_id, permission_id)
  select v_profile_id, permission_ids.permission_id
  from unnest(v_permission_ids) as permission_ids(permission_id);

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  )
  values (
    p_organization_id,
    p_audit_actor_user_id,
    v_action,
    'profile',
    v_profile_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', p_effective_actor_user_id,
      'name', v_name,
      'source_profile_id', p_source_profile_id,
      'permission_ids', to_jsonb(v_permission_ids)
    ))
  );

  return jsonb_build_object('ok', true, 'profile_id', v_profile_id);
end;
$$;

revoke all on function public.manage_company_user_identity(
  uuid, uuid, uuid, uuid, text, text, text, uuid
) from public;
revoke all on function public.manage_company_user_status(
  uuid, uuid, uuid, uuid, text
) from public;
revoke all on function public.manage_company_user_profile(
  uuid, uuid, uuid, uuid, uuid
) from public;
revoke all on function public.manage_company_user_permission_overrides(
  uuid, uuid, uuid, uuid, jsonb
) from public;
revoke all on function public.manage_company_user_resource_scopes(
  uuid, uuid, uuid, uuid, text, jsonb
) from public;
revoke all on function public.manage_company_profile_update(
  uuid, uuid, uuid, uuid, text, text, uuid[]
) from public;
revoke all on function public.manage_company_profile_delete(
  uuid, uuid, uuid, uuid
) from public;
revoke all on function public.manage_company_profile_create(
  uuid, uuid, uuid, text, text, uuid[], uuid
) from public;

grant execute on function public.manage_company_user_identity(
  uuid, uuid, uuid, uuid, text, text, text, uuid
) to service_role;
grant execute on function public.manage_company_user_status(
  uuid, uuid, uuid, uuid, text
) to service_role;
grant execute on function public.manage_company_user_profile(
  uuid, uuid, uuid, uuid, uuid
) to service_role;
grant execute on function public.manage_company_user_permission_overrides(
  uuid, uuid, uuid, uuid, jsonb
) to service_role;
grant execute on function public.manage_company_user_resource_scopes(
  uuid, uuid, uuid, uuid, text, jsonb
) to service_role;
grant execute on function public.manage_company_profile_update(
  uuid, uuid, uuid, uuid, text, text, uuid[]
) to service_role;
grant execute on function public.manage_company_profile_delete(
  uuid, uuid, uuid, uuid
) to service_role;
grant execute on function public.manage_company_profile_create(
  uuid, uuid, uuid, text, text, uuid[], uuid
) to service_role;

comment on function public.manage_company_user_identity(
  uuid, uuid, uuid, uuid, text, text, text, uuid
) is 'Atomically updates a tenant user, professional link, and audit entry after access-manager validation.';
comment on function public.manage_company_user_status(
  uuid, uuid, uuid, uuid, text
) is 'Atomically changes tenant-user status and audit while protecting the final active access manager.';
comment on function public.manage_company_user_profile(
  uuid, uuid, uuid, uuid, uuid
) is 'Atomically replaces a tenant-user profile assignment and writes its audit entry.';
comment on function public.manage_company_user_permission_overrides(
  uuid, uuid, uuid, uuid, jsonb
) is 'Atomically replaces tenant-user permission overrides and writes its audit entry.';
comment on function public.manage_company_user_resource_scopes(
  uuid, uuid, uuid, uuid, text, jsonb
) is 'Atomically applies own, all, or custom resource scopes and writes its audit entry.';
comment on function public.manage_company_profile_update(
  uuid, uuid, uuid, uuid, text, text, uuid[]
) is 'Atomically updates a custom profile and grants while protecting the final active access manager.';
comment on function public.manage_company_profile_delete(
  uuid, uuid, uuid, uuid
) is 'Atomically deletes an unused custom profile and writes its audit entry.';
comment on function public.manage_company_profile_create(
  uuid, uuid, uuid, text, text, uuid[], uuid
) is 'Atomically creates or duplicates a custom profile, its grants, and its audit entry.';
