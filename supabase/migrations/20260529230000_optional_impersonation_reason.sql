-- O motivo do acesso de suporte passa a ser opcional.
alter table public.impersonation_sessions
  alter column reason drop not null;

create or replace function public.start_impersonation_session(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_target_user_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_session_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
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
    v_reason
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
      'reason', v_reason
    )
  );

  return v_session_id;
end;
$$;

revoke all on function public.start_impersonation_session(uuid, uuid, uuid, text)
from public;

grant execute on function public.start_impersonation_session(uuid, uuid, uuid, text)
to service_role;
