create or replace function public.update_organization_as_super_admin(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_name text,
  p_legal_name text default null,
  p_document text default null,
  p_status text default 'trial'
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_id uuid;
  v_previous public.organizations%rowtype;
  v_updated public.organizations%rowtype;
begin
  select app_users.id
    into v_actor_id
  from public.app_users
  where app_users.id = p_actor_user_id
    and app_users.is_super_admin
    and app_users.status = 'active';

  if v_actor_id is null then
    raise exception 'Only an active Super Admin can update organizations.'
      using errcode = '42501';
  end if;

  select organizations.*
    into v_previous
  from public.organizations
  where organizations.id = p_organization_id;

  if v_previous.id is null then
    raise exception 'Organization not found.'
      using errcode = 'P0002';
  end if;

  update public.organizations
  set
    name = trim(p_name),
    legal_name = nullif(trim(p_legal_name), ''),
    document = nullif(trim(p_document), ''),
    status = p_status
  where organizations.id = p_organization_id
  returning organizations.* into v_updated;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    v_updated.id,
    v_actor_id,
    'organization.updated',
    'organization',
    v_updated.id,
    jsonb_build_object(
      'previous', jsonb_build_object(
        'name', v_previous.name,
        'legal_name', v_previous.legal_name,
        'document', v_previous.document,
        'status', v_previous.status
      ),
      'current', jsonb_build_object(
        'name', v_updated.name,
        'legal_name', v_updated.legal_name,
        'document', v_updated.document,
        'status', v_updated.status
      )
    )
  );

  return v_updated.id;
end;
$$;

revoke all on function public.update_organization_as_super_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) from public;

grant execute on function public.update_organization_as_super_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) to service_role;

comment on function public.update_organization_as_super_admin(
  uuid,
  uuid,
  text,
  text,
  text,
  text
) is 'Updates company registration and status while recording the Super Admin audit entry atomically.';
