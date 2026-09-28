-- Editar uma automação de tags. Antes só era possível criar, ativar/desativar
-- e apagar: qualquer ajuste (trocar a tag, o gatilho, o nome) exigia apagar a
-- regra e criar outra. As validações são as mesmas de
-- create_patient_automation_rule (20260718183000).

create or replace function public.update_patient_automation_rule(
  p_rule_id uuid,
  p_name text,
  p_trigger_type text,
  p_trigger_config jsonb,
  p_action_type text,
  p_action_config jsonb,
  p_impersonation_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_rule public.automation_rules%rowtype;
  v_tag_id uuid;
  v_duration_days integer;
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

  select rules.*
    into v_rule
  from public.automation_rules rules
  where rules.id = p_rule_id
    and rules.organization_id = v_context.organization_id
    and rules.action_type in ('add_tag', 'remove_tag')
  for update;

  if v_rule.id is null then
    raise exception 'Automation rule not found.' using errcode = '23503';
  end if;

  -- Quem edita precisa alcançar o escopo antigo e o novo.
  if not app_private.user_can_access_patient_automation_conditions(
    v_context.effective_user_id,
    v_context.organization_id,
    v_rule.conditions,
    'write'
  ) then
    raise exception 'Not allowed to access this automation scope.'
      using errcode = '42501';
  end if;

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
      and rules.id <> v_rule.id
      and lower(rules.name) = lower(trim(p_name))
  ) then
    raise exception 'An automation with this name already exists.'
      using errcode = '23505';
  end if;

  if v_action_config ? 'duration_days' then
    v_duration_days := (v_action_config ->> 'duration_days')::integer;
  end if;

  v_stored_action_config := v_action_config;
  if p_action_type = 'add_tag' then
    v_stored_action_config := v_stored_action_config || jsonb_build_object(
      'legacy_patient_tag_rule_id',
      v_rule.id
    );
  end if;

  update public.automation_rules rules
  set name = trim(p_name),
      event_type = p_trigger_type,
      conditions = v_trigger_config,
      action_type = p_action_type,
      action_config = v_stored_action_config
  where rules.id = v_rule.id;

  -- Espelho legado usado pela tela e pelos relatórios de tags.
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
      v_rule.id,
      v_context.organization_id,
      v_tag_id,
      trim(p_name),
      p_trigger_type,
      v_rule.active,
      v_duration_days,
      v_trigger_config
    )
    on conflict (id) do update
    set tag_id = excluded.tag_id,
        name = excluded.name,
        trigger_type = excluded.trigger_type,
        duration_days = excluded.duration_days,
        config = excluded.config;
  else
    delete from public.patient_tag_rules legacy_rules
    where legacy_rules.id = v_rule.id
      and legacy_rules.organization_id = v_context.organization_id;
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
    'automation_rules.updated',
    'automation_rule',
    v_rule.id,
    jsonb_strip_nulls(jsonb_build_object(
      'name', trim(p_name),
      'previous_name', v_rule.name,
      'trigger_type', p_trigger_type,
      'previous_trigger_type', v_rule.event_type,
      'trigger_config', v_trigger_config,
      'action_type', p_action_type,
      'action_config', v_stored_action_config,
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id
    ))
  );

  if v_rule.active then
    perform app_private.refresh_patient_automation_rule_internal(
      v_rule.id,
      statement_timestamp()
    );
  end if;

  return v_rule.id;
end;
$$;

revoke all on function public.update_patient_automation_rule(
  uuid, text, text, jsonb, text, jsonb, uuid
) from public, anon;

grant execute on function public.update_patient_automation_rule(
  uuid, text, text, jsonb, text, jsonb, uuid
) to authenticated;
