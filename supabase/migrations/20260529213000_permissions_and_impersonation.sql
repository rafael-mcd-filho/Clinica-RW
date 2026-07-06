create or replace function app_private.user_permission_codes(p_user_id uuid)
returns setof text
language sql
stable
security definer
set search_path = public, app_private
as $$
  with inherited_permissions as (
    select permissions.code
    from public.user_profiles
    join public.profile_permissions
      on profile_permissions.profile_id = user_profiles.profile_id
    join public.permissions
      on permissions.id = profile_permissions.permission_id
    where user_profiles.user_id = p_user_id
  ),
  granted_overrides as (
    select permissions.code
    from public.user_permission_overrides
    join public.permissions
      on permissions.id = user_permission_overrides.permission_id
    where user_permission_overrides.user_id = p_user_id
      and user_permission_overrides.granted
  ),
  denied_overrides as (
    select permissions.code
    from public.user_permission_overrides
    join public.permissions
      on permissions.id = user_permission_overrides.permission_id
    where user_permission_overrides.user_id = p_user_id
      and not user_permission_overrides.granted
  )
  select code from inherited_permissions
  union
  select code from granted_overrides
  except
  select code from denied_overrides
$$;

create or replace function public.current_user_permission_codes()
returns setof text
language sql
stable
security definer
set search_path = public, app_private
as $$
  select *
  from app_private.user_permission_codes(app_private.current_app_user_id())
$$;

create or replace function public.user_permission_codes(p_user_id uuid)
returns setof text
language sql
stable
security definer
set search_path = public, app_private
as $$
  select *
  from app_private.user_permission_codes(p_user_id)
$$;

create or replace function public.start_impersonation_session(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_target_user_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_session_id uuid;
begin
  if not exists (
    select 1
    from public.app_users
    where id = p_actor_user_id
      and is_super_admin
      and status = 'active'
  ) then
    raise exception 'Only an active Super Admin can start impersonation.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.app_users
    where id = p_target_user_id
      and organization_id = p_organization_id
      and not is_super_admin
      and status = 'active'
  ) then
    raise exception 'Target user is not active in the selected organization.'
      using errcode = '23514';
  end if;

  if length(trim(p_reason)) < 5 then
    raise exception 'Impersonation reason must have at least 5 characters.'
      using errcode = '23514';
  end if;

  update public.impersonation_sessions
  set ended_at = now()
  where super_admin_user_id = p_actor_user_id
    and ended_at is null;

  insert into public.impersonation_sessions (
    super_admin_user_id,
    organization_id,
    target_user_id,
    reason
  )
  values (
    p_actor_user_id,
    p_organization_id,
    p_target_user_id,
    trim(p_reason)
  )
  returning id into v_session_id;

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
    p_actor_user_id,
    'impersonation.started',
    'impersonation_session',
    v_session_id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'reason', trim(p_reason)
    )
  );

  return v_session_id;
end;
$$;

create or replace function public.end_impersonation_session(
  p_actor_user_id uuid,
  p_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_session public.impersonation_sessions%rowtype;
begin
  select impersonation_sessions.*
    into v_session
  from public.impersonation_sessions
  where impersonation_sessions.id = p_session_id
    and impersonation_sessions.super_admin_user_id = p_actor_user_id
    and impersonation_sessions.ended_at is null;

  if v_session.id is null then
    raise exception 'Active impersonation session not found.'
      using errcode = 'P0002';
  end if;

  update public.impersonation_sessions
  set ended_at = now()
  where id = v_session.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    v_session.organization_id,
    p_actor_user_id,
    'impersonation.ended',
    'impersonation_session',
    v_session.id,
    jsonb_build_object(
      'target_user_id', v_session.target_user_id,
      'reason', v_session.reason
    )
  );

  return v_session.organization_id;
end;
$$;

revoke all on function app_private.user_permission_codes(uuid) from public;
revoke all on function public.current_user_permission_codes() from public;
revoke all on function public.user_permission_codes(uuid) from public;
revoke all on function public.start_impersonation_session(uuid, uuid, uuid, text) from public;
revoke all on function public.end_impersonation_session(uuid, uuid) from public;

grant execute on function app_private.user_permission_codes(uuid) to authenticated, service_role;
grant execute on function public.current_user_permission_codes() to authenticated, service_role;
grant execute on function public.user_permission_codes(uuid) to service_role;
grant execute on function public.start_impersonation_session(uuid, uuid, uuid, text) to service_role;
grant execute on function public.end_impersonation_session(uuid, uuid) to service_role;

comment on function public.current_user_permission_codes()
is 'Returns the effective permissions for the current authenticated application user.';

comment on function public.start_impersonation_session(uuid, uuid, uuid, text)
is 'Starts an audited support session for the unique SaaS Super Admin.';

comment on function public.end_impersonation_session(uuid, uuid)
is 'Ends an audited support session for the unique SaaS Super Admin.';
