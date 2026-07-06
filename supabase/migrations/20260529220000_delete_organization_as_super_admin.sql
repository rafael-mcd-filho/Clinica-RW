create or replace function public.delete_organization_as_super_admin(
  p_actor_user_id uuid,
  p_organization_id uuid
)
returns setof uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid;
  v_organization public.organizations%rowtype;
  v_auth_user_ids uuid[];
begin
  select app_users.id
    into v_actor_id
  from public.app_users
  where app_users.id = p_actor_user_id
    and app_users.is_super_admin
    and app_users.status = 'active';

  if v_actor_id is null then
    raise exception 'Only an active Super Admin can delete organizations.'
      using errcode = '42501';
  end if;

  select organizations.*
    into v_organization
  from public.organizations
  where organizations.id = p_organization_id;

  if v_organization.id is null then
    raise exception 'Organization not found.'
      using errcode = 'P0002';
  end if;

  -- Collect linked Supabase Auth users so the caller can remove them too.
  select coalesce(array_agg(app_users.auth_user_id), '{}')
    into v_auth_user_ids
  from public.app_users
  where app_users.organization_id = p_organization_id
    and app_users.auth_user_id is not null;

  -- Record the deletion before the row disappears. The audit log keeps the
  -- snapshot in metadata; its organization_id is set null by the FK on delete.
  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    v_organization.id,
    v_actor_id,
    'organization.deleted',
    'organization',
    v_organization.id,
    jsonb_build_object(
      'name', v_organization.name,
      'legal_name', v_organization.legal_name,
      'document', v_organization.document,
      'status', v_organization.status,
      'deleted_auth_user_count', coalesce(array_length(v_auth_user_ids, 1), 0)
    )
  );

  -- Cascades to app_users, profiles, resource_scopes and impersonation_sessions.
  delete from public.organizations
  where organizations.id = p_organization_id;

  return query select unnest(v_auth_user_ids);
end;
$$;

revoke all on function public.delete_organization_as_super_admin(uuid, uuid)
from public;

grant execute on function public.delete_organization_as_super_admin(uuid, uuid)
to service_role;

comment on function public.delete_organization_as_super_admin(uuid, uuid) is
  'Permanently deletes a company and all cascaded data, recording the Super Admin audit entry and returning the linked Auth user ids for cleanup.';
