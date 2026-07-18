-- Apply agenda data scopes to patient automation rules and their execution
-- ledger. Automation permissions continue to decide which operation is legal;
-- these restrictive policies decide which schedule/professional data the
-- operator may reach.

-- Resolve the optional schedule/professional filters stored in
-- automation_rules.conditions and delegate the final decision to the
-- parameterized agenda-scope helper. A rule without either filter is an
-- organization-wide automation and therefore requires a broad agenda scope
-- (or an organization administrator accepted by the underlying helper).
create or replace function app_private.user_can_access_patient_automation_conditions(
  p_user_id uuid,
  p_organization_id uuid,
  p_conditions jsonb,
  p_required_access text default 'read'
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_schedule_text text;
  v_professional_text text;
  v_schedule_id uuid;
  v_condition_professional_id uuid;
  v_effective_professional_id uuid;
  v_schedule_professional_id uuid;
  v_unit_id uuid;
begin
  if p_user_id is null
    or p_organization_id is null
    or jsonb_typeof(coalesce(p_conditions, '{}'::jsonb)) <> 'object'
  then
    return false;
  end if;

  v_schedule_text := nullif(trim(p_conditions ->> 'schedule_id'), '');
  v_professional_text := nullif(
    trim(p_conditions ->> 'professional_id'),
    ''
  );

  if v_schedule_text is null and v_professional_text is null then
    return app_private.user_can_access_agenda_resource(
      p_user_id,
      p_organization_id,
      null,
      null,
      null,
      p_required_access
    );
  end if;

  begin
    if v_schedule_text is not null then
      v_schedule_id := v_schedule_text::uuid;
    end if;

    if v_professional_text is not null then
      v_condition_professional_id := v_professional_text::uuid;
    end if;
  exception
    when invalid_text_representation then
      return false;
  end;

  if v_schedule_id is not null then
    select schedules.professional_id, schedules.unit_id
      into v_schedule_professional_id, v_unit_id
    from public.schedules
    where schedules.organization_id = p_organization_id
      and schedules.id = v_schedule_id;

    if not found then
      return false;
    end if;
  end if;

  if v_condition_professional_id is not null then
    if not exists (
      select 1
      from public.professionals
      where professionals.organization_id = p_organization_id
        and professionals.id = v_condition_professional_id
    ) then
      return false;
    end if;

    if v_schedule_professional_id is not null
      and v_schedule_professional_id <> v_condition_professional_id
    then
      return false;
    end if;

    v_effective_professional_id := v_condition_professional_id;
  else
    v_effective_professional_id := v_schedule_professional_id;
  end if;

  return app_private.user_can_access_agenda_resource(
    p_user_id,
    p_organization_id,
    v_schedule_id,
    v_effective_professional_id,
    v_unit_id,
    p_required_access
  );
end;
$$;

-- SECURITY DEFINER management RPCs bypass table RLS by design. The existing
-- rule mutations therefore validate the effective (possibly impersonated)
-- tenant user explicitly before changing state or starting a backfill.
create or replace function public.set_patient_automation_rule_active(
  p_rule_id uuid,
  p_active boolean,
  p_impersonation_session_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_rule public.automation_rules%rowtype;
begin
  select *
    into v_context
  from app_private.resolve_patient_automation_context(
    p_impersonation_session_id,
    'automacao.ativar'
  );

  select rules.*
    into v_rule
  from public.automation_rules rules
  where rules.id = p_rule_id
    and rules.organization_id = v_context.organization_id
    and rules.action_type in ('add_tag', 'remove_tag')
  for update;

  if v_rule.id is null then
    return false;
  end if;

  if not app_private.user_can_access_patient_automation_conditions(
    v_context.effective_user_id,
    v_context.organization_id,
    v_rule.conditions,
    'write'
  ) then
    raise exception 'Not allowed to access this automation scope.'
      using errcode = '42501';
  end if;

  update public.automation_rules rules
  set active = p_active
  where rules.id = v_rule.id;

  update public.patient_tag_rules legacy_rules
  set active = p_active
  where legacy_rules.id = v_rule.id
    and legacy_rules.organization_id = v_rule.organization_id;

  if p_active then
    perform app_private.refresh_patient_automation_rule_internal(
      v_rule.id,
      statement_timestamp()
    );
  elsif v_rule.action_type = 'add_tag' then
    delete from public.patient_tags patient_tags
    where patient_tags.organization_id = v_rule.organization_id
      and patient_tags.automation_source_rule_id = v_rule.id
      and patient_tags.source <> 'manual';
  end if;

  if not p_active then
    delete from public.automation_rule_executions executions
    where executions.organization_id = v_rule.organization_id
      and executions.automation_rule_id = v_rule.id;
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'automation_rules.active_changed',
    'automation_rule',
    v_rule.id,
    jsonb_strip_nulls(jsonb_build_object(
      'previous_active', v_rule.active,
      'active', p_active,
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id
    ))
  );

  return true;
end;
$$;

create or replace function public.delete_patient_automation_rule(
  p_rule_id uuid,
  p_impersonation_session_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_rule public.automation_rules%rowtype;
begin
  select *
    into v_context
  from app_private.resolve_patient_automation_context(
    p_impersonation_session_id,
    'automacao.criar'
  );

  select rules.*
    into v_rule
  from public.automation_rules rules
  where rules.id = p_rule_id
    and rules.organization_id = v_context.organization_id
    and rules.action_type in ('add_tag', 'remove_tag')
  for update;

  if v_rule.id is null then
    return false;
  end if;

  if not app_private.user_can_access_patient_automation_conditions(
    v_context.effective_user_id,
    v_context.organization_id,
    v_rule.conditions,
    'write'
  ) then
    raise exception 'Not allowed to access this automation scope.'
      using errcode = '42501';
  end if;

  if v_rule.action_type = 'add_tag' then
    delete from public.patient_tags patient_tags
    where patient_tags.organization_id = v_rule.organization_id
      and patient_tags.automation_source_rule_id = v_rule.id
      and patient_tags.source <> 'manual';
  end if;

  delete from public.patient_tag_rules legacy_rules
  where legacy_rules.id = v_rule.id
    and legacy_rules.organization_id = v_rule.organization_id;

  delete from public.automation_rules rules
  where rules.id = v_rule.id
    and rules.organization_id = v_rule.organization_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'automation_rules.deleted',
    'automation_rule',
    v_rule.id,
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_rule.name,
      'trigger_type', v_rule.event_type,
      'action_type', v_rule.action_type,
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id
    ))
  );

  return true;
end;
$$;

create or replace function public.refresh_patient_automation_rule(
  p_rule_id uuid,
  p_impersonation_session_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_rule public.automation_rules%rowtype;
  v_count integer;
begin
  select *
    into v_context
  from app_private.resolve_patient_automation_context(
    p_impersonation_session_id,
    'automacao.ativar'
  );

  select rules.*
    into v_rule
  from public.automation_rules rules
  where rules.id = p_rule_id
    and rules.organization_id = v_context.organization_id
    and rules.action_type in ('add_tag', 'remove_tag');

  if v_rule.id is null then
    return 0;
  end if;

  if not app_private.user_can_access_patient_automation_conditions(
    v_context.effective_user_id,
    v_context.organization_id,
    v_rule.conditions,
    'write'
  ) then
    raise exception 'Not allowed to access this automation scope.'
      using errcode = '42501';
  end if;

  v_count := app_private.refresh_patient_automation_rule_internal(
    v_rule.id,
    statement_timestamp()
  );

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'automation_rules.refreshed',
    'automation_rule',
    v_rule.id,
    jsonb_strip_nulls(jsonb_build_object(
      'processed_count', v_count,
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id
    ))
  );

  return v_count;
end;
$$;

create or replace function app_private.current_user_can_access_patient_automation_conditions(
  p_organization_id uuid,
  p_conditions jsonb,
  p_required_access text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_can_access_patient_automation_conditions(
    app_private.current_app_user_id(),
    p_organization_id,
    p_conditions,
    p_required_access
  )
$$;

create or replace function app_private.current_user_can_access_patient_automation_rule(
  p_organization_id uuid,
  p_rule_id uuid,
  p_required_access text default 'read'
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_conditions jsonb;
begin
  select rules.conditions
    into v_conditions
  from public.automation_rules as rules
  where rules.organization_id = p_organization_id
    and rules.id = p_rule_id;

  if not found then
    return false;
  end if;

  return app_private.user_can_access_patient_automation_conditions(
    app_private.current_app_user_id(),
    p_organization_id,
    v_conditions,
    p_required_access
  );
end;
$$;

revoke all on function app_private.user_can_access_patient_automation_conditions(
  uuid, uuid, jsonb, text
) from public, anon, authenticated;
revoke all on function app_private.current_user_can_access_patient_automation_conditions(
  uuid, jsonb, text
) from public;
revoke all on function app_private.current_user_can_access_patient_automation_rule(
  uuid, uuid, text
) from public;

grant execute on function app_private.user_can_access_patient_automation_conditions(
  uuid, uuid, jsonb, text
) to service_role;
grant execute on function app_private.current_user_can_access_patient_automation_conditions(
  uuid, jsonb, text
) to authenticated, service_role;
grant execute on function app_private.current_user_can_access_patient_automation_rule(
  uuid, uuid, text
) to authenticated, service_role;

-- Existing permission policies are permissive. Restrictive policies are
-- deliberately command-specific so a read-only resource scope can read a rule
-- without accidentally satisfying a write operation.
drop policy if exists automation_rules_enforce_scope_select
  on public.automation_rules;
create policy automation_rules_enforce_scope_select
on public.automation_rules
as restrictive for select to authenticated
using (app_private.current_user_can_access_patient_automation_conditions(
  organization_id,
  conditions,
  'read'
));

drop policy if exists automation_rules_enforce_scope_insert
  on public.automation_rules;
create policy automation_rules_enforce_scope_insert
on public.automation_rules
as restrictive for insert to authenticated
with check (app_private.current_user_can_access_patient_automation_conditions(
  organization_id,
  conditions,
  'write'
));

drop policy if exists automation_rules_enforce_scope_update
  on public.automation_rules;
create policy automation_rules_enforce_scope_update
on public.automation_rules
as restrictive for update to authenticated
using (app_private.current_user_can_access_patient_automation_conditions(
  organization_id,
  conditions,
  'write'
))
with check (app_private.current_user_can_access_patient_automation_conditions(
  organization_id,
  conditions,
  'write'
));

drop policy if exists automation_rules_enforce_scope_delete
  on public.automation_rules;
create policy automation_rules_enforce_scope_delete
on public.automation_rules
as restrictive for delete to authenticated
using (app_private.current_user_can_access_patient_automation_conditions(
  organization_id,
  conditions,
  'write'
));

drop policy if exists automation_rule_executions_enforce_scope_select
  on public.automation_rule_executions;
create policy automation_rule_executions_enforce_scope_select
on public.automation_rule_executions
as restrictive for select to authenticated
using (app_private.current_user_can_access_patient_automation_rule(
  organization_id,
  automation_rule_id,
  'read'
));

-- Keep the final creation signature and appointment-scope validation from
-- 20260714193000, adding the same effective-user resource guard before insert.
create or replace function public.create_patient_automation_rule(
  p_name text,
  p_trigger_type text,
  p_trigger_config jsonb,
  p_action_type text,
  p_action_config jsonb,
  p_active boolean default true,
  p_impersonation_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_rule_id uuid := gen_random_uuid();
  v_tag_id uuid;
  v_duration_days integer;
  v_timezone text;
  v_stored_action_config jsonb;
  v_trigger_config jsonb := jsonb_strip_nulls(coalesce(
    p_trigger_config,
    '{}'::jsonb
  ));
  v_action_config jsonb := jsonb_strip_nulls(coalesce(
    p_action_config,
    '{}'::jsonb
  ));
  v_schedule_id uuid;
  v_professional_id uuid;
  v_schedule_professional_id uuid;
  v_schedule_active boolean;
  v_schedule_professional_active boolean;
  v_professional_active boolean;
begin
  select *
    into v_context
  from app_private.resolve_patient_automation_context(
    p_impersonation_session_id,
    'automacao.criar'
  );

  if nullif(trim(coalesce(p_name, '')), '') is null
    or char_length(trim(p_name)) > 120
  then
    raise exception 'Rule name must have between 1 and 120 characters.'
      using errcode = '23514';
  end if;

  if not app_private.is_valid_patient_automation_contract(
    p_trigger_type,
    v_trigger_config,
    p_action_type,
    v_action_config
  ) then
    raise exception 'Invalid patient automation trigger, scope or action configuration.'
      using errcode = '23514';
  end if;

  if not app_private.user_can_access_patient_automation_conditions(
    v_context.effective_user_id,
    v_context.organization_id,
    v_trigger_config,
    'write'
  ) then
    raise exception 'Not allowed to access this automation scope.'
      using errcode = '42501';
  end if;

  if nullif(v_trigger_config ->> 'schedule_id', '') is not null then
    v_schedule_id := (v_trigger_config ->> 'schedule_id')::uuid;

    select schedules.professional_id,
           schedules.active,
           professionals.active
      into v_schedule_professional_id,
           v_schedule_active,
           v_schedule_professional_active
    from public.schedules schedules
    join public.professionals professionals
      on professionals.organization_id = schedules.organization_id
     and professionals.id = schedules.professional_id
    where schedules.organization_id = v_context.organization_id
      and schedules.id = v_schedule_id;

    if not found then
      raise exception 'The selected schedule does not belong to this organization.'
        using errcode = '23503';
    end if;

    if not v_schedule_active then
      raise exception 'The selected schedule is inactive.'
        using errcode = '23514';
    end if;

    if not v_schedule_professional_active then
      raise exception 'The professional assigned to the selected schedule is inactive.'
        using errcode = '23514';
    end if;
  end if;

  if nullif(v_trigger_config ->> 'professional_id', '') is not null then
    v_professional_id := (v_trigger_config ->> 'professional_id')::uuid;

    select professionals.active
      into v_professional_active
    from public.professionals professionals
    where professionals.organization_id = v_context.organization_id
      and professionals.id = v_professional_id;

    if not found then
      raise exception 'The selected professional does not belong to this organization.'
        using errcode = '23503';
    end if;

    if not v_professional_active then
      raise exception 'The selected professional is inactive.'
        using errcode = '23514';
    end if;
  end if;

  if v_schedule_id is not null
    and v_professional_id is not null
    and v_schedule_professional_id is distinct from v_professional_id
  then
    raise exception 'The selected schedule belongs to a different professional.'
      using errcode = '23514';
  end if;

  v_tag_id := (v_action_config ->> 'tag_id')::uuid;
  if not exists (
    select 1
    from public.tags tags
    where tags.organization_id = v_context.organization_id
      and tags.id = v_tag_id
  ) then
    raise exception 'The selected tag does not belong to this organization.'
      using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.automation_rules rules
    where rules.organization_id = v_context.organization_id
      and rules.action_type in ('add_tag', 'remove_tag')
      and lower(rules.name) = lower(trim(p_name))
  ) then
    raise exception 'An automation with this name already exists.'
      using errcode = '23505';
  end if;

  select coalesce(settings.timezone, 'America/Fortaleza')
    into v_timezone
  from public.organization_settings settings
  where settings.organization_id = v_context.organization_id;
  v_timezone := coalesce(v_timezone, 'America/Fortaleza');

  if v_action_config ? 'duration_days' then
    v_duration_days := (v_action_config ->> 'duration_days')::integer;
  end if;

  v_stored_action_config := v_action_config;
  if p_action_type = 'add_tag' then
    v_stored_action_config := v_stored_action_config || jsonb_build_object(
      'legacy_patient_tag_rule_id',
      v_rule_id
    );
  end if;

  insert into public.automation_rules (
    id,
    organization_id,
    rule_key,
    name,
    event_type,
    conditions,
    action_type,
    action_config,
    schedule_delay_minutes,
    timezone,
    respect_opt_out,
    active,
    is_system_default
  ) values (
    v_rule_id,
    v_context.organization_id,
    'patient_automation_' || v_rule_id::text,
    trim(p_name),
    p_trigger_type,
    v_trigger_config,
    p_action_type,
    v_stored_action_config,
    0,
    v_timezone,
    false,
    coalesce(p_active, true),
    false
  );

  if p_action_type = 'add_tag' then
    insert into public.patient_tag_rules (
      id,
      organization_id,
      tag_id,
      name,
      trigger_type,
      active,
      duration_days,
      config
    ) values (
      v_rule_id,
      v_context.organization_id,
      v_tag_id,
      trim(p_name),
      p_trigger_type,
      coalesce(p_active, true),
      v_duration_days,
      v_trigger_config
    );
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'automation_rules.created',
    'automation_rule',
    v_rule_id,
    jsonb_strip_nulls(jsonb_build_object(
      'name', trim(p_name),
      'trigger_type', p_trigger_type,
      'trigger_config', v_trigger_config,
      'action_type', p_action_type,
      'action_config', v_stored_action_config,
      'active', coalesce(p_active, true),
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id
    ))
  );

  if coalesce(p_active, true) then
    perform app_private.refresh_patient_automation_rule_internal(
      v_rule_id,
      statement_timestamp()
    );
  end if;

  return v_rule_id;
end;
$$;

-- The legacy public refresh name delegates to the scoped RPC above. Worker
-- APIs keep their service-role-only grants and continue to bypass tenant RLS.
revoke all on function public.create_patient_automation_rule(
  text, text, jsonb, text, jsonb, boolean, uuid
) from public, anon;
revoke all on function public.set_patient_automation_rule_active(
  uuid, boolean, uuid
) from public, anon;
revoke all on function public.delete_patient_automation_rule(uuid, uuid)
  from public, anon;
revoke all on function public.refresh_patient_automation_rule(uuid, uuid)
  from public, anon;

grant execute on function public.create_patient_automation_rule(
  text, text, jsonb, text, jsonb, boolean, uuid
) to authenticated;
grant execute on function public.set_patient_automation_rule_active(
  uuid, boolean, uuid
) to authenticated;
grant execute on function public.delete_patient_automation_rule(uuid, uuid)
  to authenticated;
grant execute on function public.refresh_patient_automation_rule(uuid, uuid)
  to authenticated;

comment on function app_private.user_can_access_patient_automation_conditions(
  uuid, uuid, jsonb, text
) is
  'Maps automation condition filters to agenda schedule/professional/unit scopes; rules without filters require broad agenda access.';
comment on function public.create_patient_automation_rule(
  text, text, jsonb, text, jsonb, boolean, uuid
) is
  'Creates an audited patient automation after validating the effective user permission and agenda resource scope.';
