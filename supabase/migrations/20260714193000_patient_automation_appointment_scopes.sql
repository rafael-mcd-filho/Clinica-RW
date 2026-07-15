-- Optional appointment scopes for patient automations.
--
-- `schedule_id` and `professional_id` live in automation_rules.conditions so
-- the canonical automation model remains extensible. They are optional and
-- supported only by appointment-related patient triggers.

-- ---------------------------------------------------------------------------
-- Scope contract and matching helpers
-- ---------------------------------------------------------------------------

create or replace function app_private.patient_automation_supports_appointment_scope(
  p_trigger_type text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_trigger_type, '') in (
    'appointment_scheduled',
    'first_visit',
    'appointment_before',
    'appointment_day',
    'appointment_completed'
  )
$$;

create or replace function app_private.is_valid_patient_automation_scope_contract(
  p_trigger_type text,
  p_conditions jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_conditions jsonb := coalesce(p_conditions, '{}'::jsonb);
  v_schedule_id_text text;
  v_professional_id_text text;
begin
  if jsonb_typeof(v_conditions) <> 'object' then
    return false;
  end if;

  v_schedule_id_text := nullif(trim(coalesce(
    v_conditions ->> 'schedule_id',
    ''
  )), '');
  v_professional_id_text := nullif(trim(coalesce(
    v_conditions ->> 'professional_id',
    ''
  )), '');

  if v_schedule_id_text is null and v_professional_id_text is null then
    return true;
  end if;

  if not app_private.patient_automation_supports_appointment_scope(
    p_trigger_type
  ) then
    return false;
  end if;

  if v_schedule_id_text is not null
    and v_schedule_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  if v_professional_id_text is not null
    and v_professional_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  return true;
end;
$$;

create or replace function app_private.patient_automation_scope_matches(
  p_trigger_type text,
  p_conditions jsonb,
  p_event_metadata jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_conditions jsonb := coalesce(p_conditions, '{}'::jsonb);
  v_metadata jsonb := coalesce(p_event_metadata, '{}'::jsonb);
  v_schedule_id_text text;
  v_professional_id_text text;
begin
  if not app_private.is_valid_patient_automation_scope_contract(
    p_trigger_type,
    v_conditions
  ) then
    return false;
  end if;

  v_schedule_id_text := nullif(trim(coalesce(
    v_conditions ->> 'schedule_id',
    ''
  )), '');
  v_professional_id_text := nullif(trim(coalesce(
    v_conditions ->> 'professional_id',
    ''
  )), '');

  if v_schedule_id_text is not null
    and lower(v_schedule_id_text) <> lower(coalesce(
      v_metadata ->> 'schedule_id',
      ''
    ))
  then
    return false;
  end if;

  if v_professional_id_text is not null
    and lower(v_professional_id_text) <> lower(coalesce(
      v_metadata ->> 'professional_id',
      ''
    ))
  then
    return false;
  end if;

  return true;
end;
$$;

create or replace function app_private.is_valid_patient_automation_contract(
  p_trigger_type text,
  p_trigger_config jsonb,
  p_action_type text,
  p_action_config jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_days_text text;
  v_amount_text text;
  v_duration_text text;
  v_tag_id_text text;
begin
  if not app_private.is_supported_patient_automation_trigger(p_trigger_type)
    or coalesce(p_action_type, '') not in ('add_tag', 'remove_tag')
    or jsonb_typeof(coalesce(p_trigger_config, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_action_config, '{}'::jsonb)) <> 'object'
    or not app_private.is_valid_patient_automation_scope_contract(
      p_trigger_type,
      coalesce(p_trigger_config, '{}'::jsonb)
    )
  then
    return false;
  end if;

  v_tag_id_text := coalesce(p_action_config ->> 'tag_id', '');
  if v_tag_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  if p_action_config ? 'duration_days'
    and jsonb_typeof(p_action_config -> 'duration_days') <> 'null'
  then
    if p_action_type = 'remove_tag' then
      return false;
    end if;

    v_duration_text := p_action_config ->> 'duration_days';
    if v_duration_text !~ '^[0-9]+$'
      or v_duration_text::integer not between 1 and 3650
    then
      return false;
    end if;
  end if;

  if p_trigger_type = 'appointment_before' then
    v_days_text := p_trigger_config ->> 'days_before';
    if coalesce(v_days_text, '') !~ '^[0-9]+$'
      or v_days_text::integer not between 1 and 365
    then
      return false;
    end if;
  end if;

  if p_trigger_type = 'revenue_threshold' then
    v_amount_text := p_trigger_config ->> 'minimum_paid_amount';
    if coalesce(v_amount_text, '') !~ '^[0-9]+([.][0-9]+)?$'
      or v_amount_text::numeric <= 0
    then
      return false;
    end if;
  end if;

  return true;
exception
  when numeric_value_out_of_range or invalid_text_representation then
    return false;
end;
$$;

create or replace function app_private.patient_automation_has_finalized_encounter(
  p_rule public.automation_rules,
  p_patient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.encounters encounters
    left join public.appointments appointments
      on appointments.organization_id = encounters.organization_id
     and appointments.id = encounters.appointment_id
    where encounters.organization_id = p_rule.organization_id
      and encounters.patient_id = p_patient_id
      and encounters.status = 'finalized'
      and app_private.patient_automation_scope_matches(
        'first_visit',
        p_rule.conditions,
        jsonb_strip_nulls(jsonb_build_object(
          'schedule_id', appointments.schedule_id,
          'professional_id', coalesce(
            appointments.professional_id,
            encounters.professional_id
          )
        ))
      )
  )
$$;

revoke all on function
  app_private.patient_automation_supports_appointment_scope(text)
from public;
revoke all on function
  app_private.is_valid_patient_automation_scope_contract(text, jsonb)
from public;
revoke all on function
  app_private.patient_automation_scope_matches(text, jsonb, jsonb)
from public;
revoke all on function
  app_private.patient_automation_has_finalized_encounter(
    public.automation_rules,
    uuid
  )
from public;

-- Scope matching happens before claiming the event, so a non-matching event
-- neither mutates tags nor consumes the rule's idempotency key.
create or replace function app_private.claim_patient_automation_execution(
  p_rule public.automation_rules,
  p_patient_id uuid,
  p_event_key text,
  p_event_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_claimed boolean := false;
begin
  if not app_private.patient_automation_scope_matches(
    p_rule.event_type,
    p_rule.conditions,
    coalesce(p_metadata, '{}'::jsonb)
  ) then
    return false;
  end if;

  if nullif(trim(coalesce(p_event_key, '')), '') is null then
    return true;
  end if;

  insert into public.automation_rule_executions (
    organization_id,
    automation_rule_id,
    patient_id,
    event_key,
    trigger_type,
    action_type,
    event_at,
    metadata
  ) values (
    p_rule.organization_id,
    p_rule.id,
    p_patient_id,
    left(trim(p_event_key), 500),
    p_rule.event_type,
    p_rule.action_type,
    coalesce(p_event_at, statement_timestamp()),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (organization_id, automation_rule_id, event_key) do nothing
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

-- First-visit state is evaluated per rule. An unscoped rule still checks the
-- whole patient history; a scoped rule checks only finalized encounters in
-- its agenda/professional scope.
create or replace function app_private.execute_patient_automation_event(
  p_organization_id uuid,
  p_patient_id uuid,
  p_trigger_type text,
  p_event_key text default null,
  p_event_at timestamptz default statement_timestamp(),
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_applied integer := 0;
  v_minimum_paid numeric;
  v_paid_total numeric;
begin
  if not app_private.is_supported_patient_automation_trigger(p_trigger_type) then
    return 0;
  end if;

  perform app_private.expire_patient_tags(p_organization_id);

  if p_trigger_type = 'revenue_threshold' then
    v_paid_total := app_private.patient_paid_total(
      p_organization_id,
      p_patient_id
    );
  end if;

  for v_rule in
    select rules.*
    from public.automation_rules rules
    where rules.organization_id = p_organization_id
      and rules.event_type = p_trigger_type
      and rules.action_type in ('add_tag', 'remove_tag')
      and rules.active
    order by rules.created_at, rules.id
  loop
    if not app_private.is_valid_patient_automation_contract(
      v_rule.event_type,
      v_rule.conditions,
      v_rule.action_type,
      v_rule.action_config
    ) or not app_private.patient_automation_scope_matches(
      v_rule.event_type,
      v_rule.conditions,
      coalesce(p_metadata, '{}'::jsonb)
    ) then
      continue;
    end if;

    if v_rule.event_type = 'first_visit'
      and app_private.patient_automation_has_finalized_encounter(
        v_rule,
        p_patient_id
      )
    then
      if v_rule.action_type = 'add_tag' then
        delete from public.patient_tags patient_tags
        where patient_tags.organization_id = p_organization_id
          and patient_tags.patient_id = p_patient_id
          and patient_tags.automation_source_rule_id = v_rule.id;
      end if;
      continue;
    end if;

    if v_rule.event_type = 'revenue_threshold' then
      v_minimum_paid := (v_rule.conditions ->> 'minimum_paid_amount')::numeric;

      if v_paid_total < v_minimum_paid then
        if v_rule.action_type = 'add_tag' then
          delete from public.patient_tags patient_tags
          where patient_tags.organization_id = p_organization_id
            and patient_tags.patient_id = p_patient_id
            and patient_tags.automation_source_rule_id = v_rule.id;
        end if;
        continue;
      end if;
    end if;

    if app_private.apply_patient_automation_action(
      v_rule,
      p_patient_id,
      p_event_key,
      p_event_at,
      p_metadata
    ) then
      v_applied := v_applied + 1;
    end if;
  end loop;

  return v_applied;
end;
$$;

revoke all on function app_private.claim_patient_automation_execution(
  public.automation_rules,
  uuid,
  text,
  timestamptz,
  jsonb
) from public;
revoke all on function app_private.execute_patient_automation_event(
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  jsonb
) from public;

-- ---------------------------------------------------------------------------
-- Immediate appointment and encounter events
-- ---------------------------------------------------------------------------

create or replace function app_private.remove_first_visit_patient_tags(
  p_organization_id uuid,
  p_patient_id uuid,
  p_schedule_id uuid,
  p_professional_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_count integer;
  v_metadata jsonb := jsonb_strip_nulls(jsonb_build_object(
    'schedule_id', p_schedule_id,
    'professional_id', p_professional_id
  ));
begin
  delete from public.patient_tags patient_tags
  where patient_tags.organization_id = p_organization_id
    and patient_tags.patient_id = p_patient_id
    and (
      exists (
        select 1
        from public.automation_rules rules
        where rules.id = patient_tags.automation_source_rule_id
          and rules.organization_id = patient_tags.organization_id
          and rules.event_type = 'first_visit'
          and rules.action_type = 'add_tag'
          and app_private.patient_automation_scope_matches(
            rules.event_type,
            rules.conditions,
            v_metadata
          )
      )
      or (
        patient_tags.automation_source_rule_id is null
        and exists (
          select 1
          from public.patient_tag_rules legacy_rules
          where legacy_rules.id = patient_tags.automation_rule_id
            and legacy_rules.organization_id = patient_tags.organization_id
            and legacy_rules.trigger_type = 'first_visit'
            and app_private.patient_automation_scope_matches(
              legacy_rules.trigger_type,
              legacy_rules.config,
              v_metadata
            )
        )
      )
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function app_private.handle_patient_tag_rules_after_appointment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_is_new_active_appointment boolean := false;
  v_metadata jsonb;
begin
  if tg_op = 'INSERT' then
    v_is_new_active_appointment := new.status not in ('cancelled', 'no_show');
  elsif old.patient_id is distinct from new.patient_id
    and new.status not in ('cancelled', 'no_show')
  then
    v_is_new_active_appointment := true;
  elsif old.status in ('cancelled', 'no_show')
    and new.status not in ('cancelled', 'no_show')
  then
    v_is_new_active_appointment := true;
  elsif (
      old.schedule_id is distinct from new.schedule_id
      or old.professional_id is distinct from new.professional_id
    ) and new.status not in ('cancelled', 'no_show')
  then
    v_is_new_active_appointment := true;
  end if;

  v_metadata := jsonb_build_object(
    'appointment_id', new.id,
    'schedule_id', new.schedule_id,
    'professional_id', new.professional_id,
    'start_at', new.start_at,
    'status', new.status
  );

  if v_is_new_active_appointment then
    perform app_private.execute_patient_automation_event(
      new.organization_id,
      new.patient_id,
      'appointment_scheduled',
      concat('appointment_scheduled:', new.id, ':', new.patient_id),
      coalesce(new.created_at, statement_timestamp()),
      v_metadata
    );

    perform app_private.execute_patient_automation_event(
      new.organization_id,
      new.patient_id,
      'first_visit',
      concat('first_visit:', new.id, ':', new.patient_id),
      coalesce(new.created_at, statement_timestamp()),
      v_metadata
    );
  end if;

  if new.status = 'attended'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform app_private.execute_patient_automation_event(
      new.organization_id,
      new.patient_id,
      'appointment_completed',
      concat('appointment_completed:', new.id, ':', new.patient_id),
      statement_timestamp(),
      v_metadata
    );
  end if;

  return new;
end;
$$;

create or replace function app_private.handle_patient_tag_rules_after_encounter()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_schedule_id uuid;
  v_professional_id uuid;
begin
  v_professional_id := new.professional_id;

  if new.status = 'finalized'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    if new.appointment_id is not null then
      select appointments.schedule_id,
             appointments.professional_id
        into v_schedule_id,
             v_professional_id
      from public.appointments appointments
      where appointments.organization_id = new.organization_id
        and appointments.id = new.appointment_id;

      v_professional_id := coalesce(v_professional_id, new.professional_id);
    end if;

    perform app_private.remove_first_visit_patient_tags(
      new.organization_id,
      new.patient_id,
      v_schedule_id,
      v_professional_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists apply_patient_tag_rules_after_appointment
  on public.appointments;
create trigger apply_patient_tag_rules_after_appointment
after insert or update of
  patient_id,
  status,
  start_at,
  schedule_id,
  professional_id
on public.appointments
for each row execute function app_private.handle_patient_tag_rules_after_appointment();

revoke all on function app_private.remove_first_visit_patient_tags(
  uuid,
  uuid,
  uuid,
  uuid
) from public;
revoke all on function app_private.handle_patient_tag_rules_after_appointment()
  from public;
revoke all on function app_private.handle_patient_tag_rules_after_encounter()
  from public;

-- ---------------------------------------------------------------------------
-- Temporal appointment events
-- ---------------------------------------------------------------------------

create or replace function app_private.process_patient_automation_time_triggers(
  p_organization_id uuid default null,
  p_as_of timestamptz default statement_timestamp(),
  p_rule_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_patient record;
  v_appointment record;
  v_local_date date;
  v_days_before integer;
  v_applied integer := 0;
  v_event_key text;
  v_metadata jsonb;
begin
  for v_rule in
    select rules.*
    from public.automation_rules rules
    where rules.active
      and rules.action_type in ('add_tag', 'remove_tag')
      and rules.event_type in (
        'birthday',
        'appointment_before',
        'appointment_day'
      )
      and (p_organization_id is null or rules.organization_id = p_organization_id)
      and (p_rule_id is null or rules.id = p_rule_id)
    order by rules.organization_id, rules.created_at, rules.id
  loop
    if not app_private.is_valid_patient_automation_contract(
      v_rule.event_type,
      v_rule.conditions,
      v_rule.action_type,
      v_rule.action_config
    ) then
      continue;
    end if;

    begin
      v_local_date := coalesce(p_as_of, statement_timestamp())
        at time zone coalesce(nullif(v_rule.timezone, ''), 'America/Fortaleza');
    exception
      when invalid_parameter_value then
        continue;
    end;

    if v_rule.event_type = 'birthday' then
      for v_patient in
        select patients.id
        from public.patients patients
        where patients.organization_id = v_rule.organization_id
          and patients.deleted_at is null
          and patients.status = 'active'
          and patients.birth_date is not null
          and (
            to_char(patients.birth_date, 'MM-DD') = to_char(v_local_date, 'MM-DD')
            or (
              to_char(patients.birth_date, 'MM-DD') = '02-29'
              and to_char(v_local_date, 'MM-DD') = '02-28'
              and extract(day from (make_date(
                extract(year from v_local_date)::integer,
                3,
                1
              ) - interval '1 day')) = 28
            )
          )
      loop
        v_event_key := concat(
          'birthday:',
          v_patient.id,
          ':',
          extract(year from v_local_date)::integer
        );

        if app_private.apply_patient_automation_action(
          v_rule,
          v_patient.id,
          v_event_key,
          p_as_of,
          jsonb_build_object('local_date', v_local_date)
        ) then
          v_applied := v_applied + 1;
        end if;
      end loop;

      continue;
    end if;

    v_days_before := case
      when v_rule.event_type = 'appointment_before'
        then (v_rule.conditions ->> 'days_before')::integer
      else 0
    end;

    for v_appointment in
      select appointments.id,
             appointments.patient_id,
             appointments.schedule_id,
             appointments.professional_id,
             appointments.start_at,
             appointments.status
      from public.appointments appointments
      where appointments.organization_id = v_rule.organization_id
        and appointments.status in (
          'scheduled',
          'confirmed',
          'waiting',
          'in_progress',
          'attended'
        )
        and (
          appointments.start_at at time zone coalesce(
            nullif(v_rule.timezone, ''),
            'America/Fortaleza'
          )
        )::date = v_local_date + v_days_before
        and app_private.patient_automation_scope_matches(
          v_rule.event_type,
          v_rule.conditions,
          jsonb_build_object(
            'schedule_id', appointments.schedule_id,
            'professional_id', appointments.professional_id
          )
        )
    loop
      v_event_key := concat(
        v_rule.event_type,
        ':',
        v_appointment.id,
        ':',
        v_appointment.patient_id,
        ':',
        v_appointment.start_at,
        case
          when v_rule.event_type = 'appointment_before'
            then ':' || v_days_before::text
          else ''
        end
      );

      v_metadata := jsonb_build_object(
        'appointment_id', v_appointment.id,
        'schedule_id', v_appointment.schedule_id,
        'professional_id', v_appointment.professional_id,
        'start_at', v_appointment.start_at,
        'local_date', v_local_date,
        'days_before', v_days_before
      );

      if app_private.apply_patient_automation_action(
        v_rule,
        v_appointment.patient_id,
        v_event_key,
        p_as_of,
        v_metadata
      ) then
        v_applied := v_applied + 1;
      end if;
    end loop;
  end loop;

  return v_applied;
end;
$$;

revoke all on function app_private.process_patient_automation_time_triggers(
  uuid,
  timestamptz,
  uuid
) from public;

-- ---------------------------------------------------------------------------
-- Scoped refresh/backfill
-- ---------------------------------------------------------------------------

create or replace function app_private.refresh_patient_automation_rule_internal(
  p_rule_id uuid,
  p_as_of timestamptz default statement_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_patient record;
  v_appointment record;
  v_count integer := 0;
  v_event_key text;
  v_metadata jsonb;
begin
  select rules.*
    into v_rule
  from public.automation_rules rules
  where rules.id = p_rule_id
    and rules.action_type in ('add_tag', 'remove_tag');

  if v_rule.id is null then
    return 0;
  end if;

  if not v_rule.active then
    if v_rule.action_type = 'add_tag' then
      delete from public.patient_tags patient_tags
      where patient_tags.organization_id = v_rule.organization_id
        and patient_tags.automation_source_rule_id = v_rule.id
        and patient_tags.source <> 'manual';

      get diagnostics v_count = row_count;

      delete from public.automation_rule_executions executions
      where executions.organization_id = v_rule.organization_id
        and executions.automation_rule_id = v_rule.id;
    end if;
    return v_count;
  end if;

  if not app_private.is_valid_patient_automation_contract(
    v_rule.event_type,
    v_rule.conditions,
    v_rule.action_type,
    v_rule.action_config
  ) then
    return 0;
  end if;

  if v_rule.event_type = 'new_patient' then
    for v_patient in
      select patients.id
      from public.patients patients
      where patients.organization_id = v_rule.organization_id
        and patients.deleted_at is null
    loop
      v_event_key := concat('new_patient:', v_patient.id);
      if app_private.apply_patient_automation_action(
        v_rule,
        v_patient.id,
        v_event_key,
        p_as_of,
        jsonb_build_object('refresh', true)
      ) then
        v_count := v_count + 1;
      end if;
    end loop;

  elsif v_rule.event_type in ('appointment_scheduled', 'first_visit') then
    for v_appointment in
      select appointments.id,
             appointments.patient_id,
             appointments.schedule_id,
             appointments.professional_id,
             appointments.created_at
      from public.appointments appointments
      where appointments.organization_id = v_rule.organization_id
        and appointments.status not in ('cancelled', 'no_show')
        and app_private.patient_automation_scope_matches(
          v_rule.event_type,
          v_rule.conditions,
          jsonb_build_object(
            'schedule_id', appointments.schedule_id,
            'professional_id', appointments.professional_id
          )
        )
    loop
      if v_rule.event_type = 'first_visit'
        and app_private.patient_automation_has_finalized_encounter(
          v_rule,
          v_appointment.patient_id
        )
      then
        if v_rule.action_type = 'add_tag' then
          delete from public.patient_tags patient_tags
          where patient_tags.organization_id = v_rule.organization_id
            and patient_tags.patient_id = v_appointment.patient_id
            and patient_tags.automation_source_rule_id = v_rule.id
            and patient_tags.source <> 'manual';
        end if;
        continue;
      end if;

      v_event_key := concat(
        v_rule.event_type,
        ':',
        v_appointment.id,
        ':',
        v_appointment.patient_id
      );
      v_metadata := jsonb_build_object(
        'refresh', true,
        'appointment_id', v_appointment.id,
        'schedule_id', v_appointment.schedule_id,
        'professional_id', v_appointment.professional_id
      );

      if app_private.apply_patient_automation_action(
        v_rule,
        v_appointment.patient_id,
        v_event_key,
        p_as_of,
        v_metadata
      ) then
        v_count := v_count + 1;
      end if;
    end loop;

  elsif v_rule.event_type = 'appointment_completed' then
    for v_appointment in
      select appointments.id,
             appointments.patient_id,
             appointments.schedule_id,
             appointments.professional_id
      from public.appointments appointments
      where appointments.organization_id = v_rule.organization_id
        and appointments.status = 'attended'
        and app_private.patient_automation_scope_matches(
          v_rule.event_type,
          v_rule.conditions,
          jsonb_build_object(
            'schedule_id', appointments.schedule_id,
            'professional_id', appointments.professional_id
          )
        )
    loop
      v_event_key := concat(
        'appointment_completed:',
        v_appointment.id,
        ':',
        v_appointment.patient_id
      );
      v_metadata := jsonb_build_object(
        'refresh', true,
        'appointment_id', v_appointment.id,
        'schedule_id', v_appointment.schedule_id,
        'professional_id', v_appointment.professional_id
      );

      if app_private.apply_patient_automation_action(
        v_rule,
        v_appointment.patient_id,
        v_event_key,
        p_as_of,
        v_metadata
      ) then
        v_count := v_count + 1;
      end if;
    end loop;

  elsif v_rule.event_type = 'revenue_threshold' then
    for v_patient in
      select patients.id
      from public.patients patients
      where patients.organization_id = v_rule.organization_id
        and patients.deleted_at is null
    loop
      v_count := v_count + app_private.execute_patient_automation_event(
        v_rule.organization_id,
        v_patient.id,
        'revenue_threshold',
        null,
        p_as_of,
        jsonb_build_object('refresh', true)
      );
    end loop;

  elsif v_rule.event_type in (
    'birthday',
    'appointment_before',
    'appointment_day'
  ) then
    v_count := app_private.process_patient_automation_time_triggers(
      v_rule.organization_id,
      p_as_of,
      v_rule.id
    );
  end if;

  return v_count;
end;
$$;

revoke all on function app_private.refresh_patient_automation_rule_internal(
  uuid,
  timestamptz
) from public;

-- ---------------------------------------------------------------------------
-- Audited creation with tenant and schedule/professional coherence checks
-- ---------------------------------------------------------------------------

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

revoke all on function public.create_patient_automation_rule(
  text,
  text,
  jsonb,
  text,
  jsonb,
  boolean,
  uuid
) from public, anon;
grant execute on function public.create_patient_automation_rule(
  text,
  text,
  jsonb,
  text,
  jsonb,
  boolean,
  uuid
) to authenticated;

comment on function public.create_patient_automation_rule(
  text,
  text,
  jsonb,
  text,
  jsonb,
  boolean,
  uuid
) is
  'Creates an audited patient automation. Appointment triggers accept optional conditions.schedule_id and conditions.professional_id, validated against the effective organization.';
