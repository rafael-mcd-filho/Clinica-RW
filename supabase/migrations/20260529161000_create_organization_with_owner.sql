create or replace function public.create_organization_with_owner(
  p_actor_user_id uuid,
  p_owner_auth_user_id uuid,
  p_owner_name text,
  p_owner_email text,
  p_organization_name text,
  p_legal_name text default null,
  p_document text default null,
  p_plan_key text default 'starter',
  p_mode text default 'solo',
  p_status text default 'trial'
)
returns table (
  organization_id uuid,
  owner_user_id uuid
)
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid;
  v_organization_id uuid;
  v_owner_user_id uuid;
  v_admin_profile_id uuid;
begin
  select app_users.id
    into v_actor_id
  from public.app_users
  where app_users.id = p_actor_user_id
    and app_users.is_super_admin
    and app_users.status = 'active';

  if v_actor_id is null then
    raise exception 'Only an active Super Admin can create organizations.'
      using errcode = '42501';
  end if;

  insert into public.organizations (
    name,
    legal_name,
    document,
    plan_key,
    mode,
    status
  )
  values (
    p_organization_name,
    nullif(p_legal_name, ''),
    nullif(p_document, ''),
    p_plan_key,
    p_mode,
    p_status
  )
  returning id into v_organization_id;

  insert into public.profiles (
    organization_id,
    name,
    description,
    is_system_default
  )
  select
    v_organization_id,
    profiles.name,
    profiles.description,
    true
  from public.profiles
  where profiles.organization_id is null
    and profiles.is_system_default;

  insert into public.profile_permissions (profile_id, permission_id)
  select target_profiles.id, source_permissions.permission_id
  from public.profiles source_profiles
  join public.profile_permissions source_permissions
    on source_permissions.profile_id = source_profiles.id
  join public.profiles target_profiles
    on target_profiles.organization_id = v_organization_id
   and target_profiles.name = source_profiles.name
  where source_profiles.organization_id is null
    and source_profiles.is_system_default
  on conflict do nothing;

  insert into public.app_users (
    organization_id,
    auth_user_id,
    name,
    email,
    status,
    is_super_admin
  )
  values (
    v_organization_id,
    p_owner_auth_user_id,
    p_owner_name,
    p_owner_email,
    'active',
    false
  )
  returning id into v_owner_user_id;

  select profiles.id
    into v_admin_profile_id
  from public.profiles
  where profiles.organization_id = v_organization_id
    and profiles.name = 'Administrador';

  if v_admin_profile_id is null then
    raise exception 'Administrador profile was not created.'
      using errcode = '23514';
  end if;

  insert into public.user_profiles (user_id, profile_id)
  values (v_owner_user_id, v_admin_profile_id)
  on conflict do nothing;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    v_organization_id,
    v_actor_id,
    'organization.created',
    'organization',
    v_organization_id,
    jsonb_build_object(
      'name', p_organization_name,
      'status', p_status,
      'mode', p_mode,
      'plan_key', p_plan_key,
      'owner_user_id', v_owner_user_id,
      'owner_email', p_owner_email
    )
  );

  return query select v_organization_id, v_owner_user_id;
end;
$$;

revoke all on function public.create_organization_with_owner(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public;

grant execute on function public.create_organization_with_owner(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;

comment on function public.create_organization_with_owner(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is 'Creates a company, copies default profiles and links the first company admin in one database transaction.';
