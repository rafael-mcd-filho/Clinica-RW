-- Generic patient automations backed by the existing Phase 11 automation engine.
--
-- `automation_rules` is the canonical source for new rules. The older
-- `patient_tag_rules` table is retained as a write-compatible adapter so
-- already deployed clients keep working while the UI migrates to the generic
-- trigger/action contract.

-- ---------------------------------------------------------------------------
-- Canonical schema and compatibility metadata
-- ---------------------------------------------------------------------------

alter table public.automation_rules
  drop constraint if exists automation_rules_action_type_check;

alter table public.automation_rules
  add constraint automation_rules_action_type_check
  check (action_type in (
    'send_notification',
    'enqueue_job',
    'add_tag',
    'remove_tag'
  ));

alter table public.patient_tag_rules
  drop constraint if exists patient_tag_rules_trigger_type_check;

alter table public.patient_tag_rules
  add constraint patient_tag_rules_trigger_type_check
  check (trigger_type in (
    'new_patient',
    'appointment_scheduled',
    'first_visit',
    'revenue_threshold',
    'birthday',
    'appointment_before',
    'appointment_day',
    'appointment_completed'
  ));

alter table public.patient_tags
  add column if not exists automation_source_rule_id uuid
    references public.automation_rules(id) on delete set null,
  add column if not exists automation_event_key text;

alter table public.patient_tags
  drop constraint if exists patient_tags_source_check;

alter table public.patient_tags
  add constraint patient_tags_source_check
  check (source in (
    'manual',
    'automation',
    'new_patient',
    'appointment_scheduled',
    'first_visit',
    'revenue_threshold',
    'birthday',
    'appointment_before',
    'appointment_day',
    'appointment_completed'
  ));

create index if not exists patient_tags_automation_source_rule_idx
  on public.patient_tags(organization_id, automation_source_rule_id)
  where automation_source_rule_id is not null;

create table if not exists public.automation_rule_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  automation_rule_id uuid not null,
  patient_id uuid not null,
  event_key text not null check (char_length(event_key) between 1 and 500),
  trigger_type text not null,
  action_type text not null,
  event_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  executed_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, automation_rule_id, event_key),
  foreign key (organization_id, automation_rule_id)
    references public.automation_rules(organization_id, id) on delete cascade,
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade
);

create index if not exists automation_rule_executions_patient_idx
  on public.automation_rule_executions(
    organization_id,
    patient_id,
    executed_at desc
  );

alter table public.automation_rule_executions enable row level security;

drop policy if exists automation_rule_executions_select_tenant
  on public.automation_rule_executions;
create policy automation_rule_executions_select_tenant
on public.automation_rule_executions for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('automacao.ver')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

grant select on public.automation_rule_executions to authenticated;
grant all on public.automation_rule_executions to service_role;

-- ---------------------------------------------------------------------------
-- Supported trigger/action contract validation
-- ---------------------------------------------------------------------------

create or replace function app_private.is_supported_patient_automation_trigger(
  p_trigger_type text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_trigger_type, '') in (
    'new_patient',
    'appointment_scheduled',
    'first_visit',
    'revenue_threshold',
    'birthday',
    'appointment_before',
    'appointment_day',
    'appointment_completed'
  )
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

revoke all on function
  app_private.is_supported_patient_automation_trigger(text)
from public;
revoke all on function
  app_private.is_valid_patient_automation_contract(text, jsonb, text, jsonb)
from public;

-- ---------------------------------------------------------------------------
-- Migrate legacy tag rules and keep legacy writes synchronized
-- ---------------------------------------------------------------------------

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
  is_system_default,
  created_at,
  updated_at
)
select
  rules.id,
  rules.organization_id,
  'legacy_patient_tag_rule_' || rules.id::text,
  rules.name,
  rules.trigger_type,
  coalesce(rules.config, '{}'::jsonb),
  'add_tag',
  jsonb_strip_nulls(jsonb_build_object(
    'tag_id', rules.tag_id,
    'duration_days', rules.duration_days,
    'legacy_patient_tag_rule_id', rules.id
  )),
  0,
  coalesce(settings.timezone, 'America/Fortaleza'),
  false,
  rules.active,
  false,
  rules.created_at,
  rules.updated_at
from public.patient_tag_rules rules
left join public.organization_settings settings
  on settings.organization_id = rules.organization_id
on conflict (organization_id, rule_key) do update
set name = excluded.name,
    event_type = excluded.event_type,
    conditions = excluded.conditions,
    action_type = excluded.action_type,
    action_config = excluded.action_config,
    timezone = excluded.timezone,
    active = excluded.active,
    updated_at = excluded.updated_at;

update public.patient_tags patient_tags
set automation_source_rule_id = patient_tags.automation_rule_id,
    automation_event_key = coalesce(
      patient_tags.automation_event_key,
      'legacy:' || patient_tags.patient_id::text
    )
where patient_tags.automation_rule_id is not null
  and exists (
    select 1
    from public.automation_rules rules
    where rules.id = patient_tags.automation_rule_id
      and rules.organization_id = patient_tags.organization_id
  );

create or replace function app_private.sync_legacy_patient_tag_rule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_timezone text;
begin
  if tg_op = 'DELETE' then
    delete from public.automation_rules rules
    where rules.id = old.id
      and rules.organization_id = old.organization_id
      and rules.action_config ->> 'legacy_patient_tag_rule_id' = old.id::text;
    return old;
  end if;

  select coalesce(settings.timezone, 'America/Fortaleza')
    into v_timezone
  from public.organization_settings settings
  where settings.organization_id = new.organization_id;

  v_timezone := coalesce(v_timezone, 'America/Fortaleza');

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
    is_system_default,
    created_at,
    updated_at
  ) values (
    new.id,
    new.organization_id,
    'legacy_patient_tag_rule_' || new.id::text,
    new.name,
    new.trigger_type,
    coalesce(new.config, '{}'::jsonb),
    'add_tag',
    jsonb_strip_nulls(jsonb_build_object(
      'tag_id', new.tag_id,
      'duration_days', new.duration_days,
      'legacy_patient_tag_rule_id', new.id
    )),
    0,
    v_timezone,
    false,
    new.active,
    false,
    new.created_at,
    new.updated_at
  )
  on conflict (id) do update
  set name = excluded.name,
      event_type = excluded.event_type,
      conditions = excluded.conditions,
      action_type = excluded.action_type,
      action_config = excluded.action_config,
      timezone = excluded.timezone,
      active = excluded.active,
      updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists sync_legacy_patient_tag_rule
  on public.patient_tag_rules;
create trigger sync_legacy_patient_tag_rule
after insert or update or delete on public.patient_tag_rules
for each row execute function app_private.sync_legacy_patient_tag_rule();

revoke all on function app_private.sync_legacy_patient_tag_rule() from public;

-- ---------------------------------------------------------------------------
-- Idempotent execution engine for patient actions
-- ---------------------------------------------------------------------------

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

create or replace function app_private.apply_patient_automation_action(
  p_rule public.automation_rules,
  p_patient_id uuid,
  p_event_key text default null,
  p_event_at timestamptz default statement_timestamp(),
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_tag_id uuid;
  v_duration_days integer;
  v_legacy_rule_id uuid;
  v_expires_at timestamptz;
begin
  if p_rule.action_type not in ('add_tag', 'remove_tag')
    or not app_private.is_valid_patient_automation_contract(
      p_rule.event_type,
      p_rule.conditions,
      p_rule.action_type,
      p_rule.action_config
    )
  then
    return false;
  end if;

  v_tag_id := (p_rule.action_config ->> 'tag_id')::uuid;

  if not exists (
    select 1
    from public.tags tags
    where tags.organization_id = p_rule.organization_id
      and tags.id = v_tag_id
  ) or not exists (
    select 1
    from public.patients patients
    where patients.organization_id = p_rule.organization_id
      and patients.id = p_patient_id
      and patients.deleted_at is null
  ) then
    return false;
  end if;

  if not app_private.claim_patient_automation_execution(
    p_rule,
    p_patient_id,
    p_event_key,
    p_event_at,
    p_metadata
  ) then
    return false;
  end if;

  if p_rule.action_config ? 'duration_days'
    and jsonb_typeof(p_rule.action_config -> 'duration_days') <> 'null'
  then
    v_duration_days := (p_rule.action_config ->> 'duration_days')::integer;
  end if;

  if p_rule.action_config ? 'legacy_patient_tag_rule_id' then
    v_legacy_rule_id := (
      p_rule.action_config ->> 'legacy_patient_tag_rule_id'
    )::uuid;
  end if;

  if p_rule.action_type = 'remove_tag' then
    delete from public.patient_tags patient_tags
    where patient_tags.organization_id = p_rule.organization_id
      and patient_tags.patient_id = p_patient_id
      and patient_tags.tag_id = v_tag_id;
    return true;
  end if;

  v_expires_at := case
    when v_duration_days is null then null
    else coalesce(p_event_at, statement_timestamp())
      + make_interval(days => v_duration_days)
  end;

  insert into public.patient_tags (
    organization_id,
    patient_id,
    tag_id,
    source,
    automation_rule_id,
    automation_source_rule_id,
    automation_event_key,
    expires_at
  ) values (
    p_rule.organization_id,
    p_patient_id,
    v_tag_id,
    'automation',
    v_legacy_rule_id,
    p_rule.id,
    nullif(trim(coalesce(p_event_key, '')), ''),
    v_expires_at
  )
  on conflict (patient_id, tag_id) do update
  set source = excluded.source,
      automation_rule_id = excluded.automation_rule_id,
      automation_source_rule_id = excluded.automation_source_rule_id,
      automation_event_key = excluded.automation_event_key,
      expires_at = excluded.expires_at,
      updated_at = statement_timestamp()
  where patient_tags.source <> 'manual';

  return true;
end;
$$;

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
  v_has_finalized_encounter boolean;
  v_minimum_paid numeric;
  v_paid_total numeric;
begin
  if not app_private.is_supported_patient_automation_trigger(p_trigger_type) then
    return 0;
  end if;

  perform app_private.expire_patient_tags(p_organization_id);

  if p_trigger_type = 'first_visit' then
    select exists (
      select 1
      from public.encounters encounters
      where encounters.organization_id = p_organization_id
        and encounters.patient_id = p_patient_id
        and encounters.status = 'finalized'
    ) into v_has_finalized_encounter;
  end if;

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
    ) then
      continue;
    end if;

    if v_rule.event_type = 'first_visit'
      and coalesce(v_has_finalized_encounter, false)
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
revoke all on function app_private.apply_patient_automation_action(
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
-- Immediate operational events
-- ---------------------------------------------------------------------------

create or replace function app_private.remove_first_visit_patient_tags(
  p_organization_id uuid,
  p_patient_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_count integer;
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
      )
      or exists (
        select 1
        from public.patient_tag_rules legacy_rules
        where legacy_rules.id = patient_tags.automation_rule_id
          and legacy_rules.organization_id = patient_tags.organization_id
          and legacy_rules.trigger_type = 'first_visit'
      )
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function app_private.handle_patient_tag_rules_after_patient()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  perform app_private.execute_patient_automation_event(
    new.organization_id,
    new.id,
    'new_patient',
    'new_patient:' || new.id::text,
    new.created_at,
    jsonb_build_object('patient_id', new.id)
  );
  return new;
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
  end if;

  if v_is_new_active_appointment then
    perform app_private.execute_patient_automation_event(
      new.organization_id,
      new.patient_id,
      'appointment_scheduled',
      concat('appointment_scheduled:', new.id, ':', new.patient_id),
      coalesce(new.created_at, statement_timestamp()),
      jsonb_build_object(
        'appointment_id', new.id,
        'start_at', new.start_at,
        'status', new.status
      )
    );

    perform app_private.execute_patient_automation_event(
      new.organization_id,
      new.patient_id,
      'first_visit',
      concat('first_visit:', new.id, ':', new.patient_id),
      coalesce(new.created_at, statement_timestamp()),
      jsonb_build_object('appointment_id', new.id)
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
      jsonb_build_object(
        'appointment_id', new.id,
        'start_at', new.start_at,
        'status', new.status
      )
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
begin
  if new.status = 'finalized'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform app_private.remove_first_visit_patient_tags(
      new.organization_id,
      new.patient_id
    );
  end if;

  return new;
end;
$$;

create or replace function app_private.evaluate_revenue_patient_tag_rules(
  p_organization_id uuid,
  p_patient_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  -- Revenue is a state condition rather than a one-shot event. No event key is
  -- supplied so a later payment adjustment can re-evaluate the current state.
  return app_private.execute_patient_automation_event(
    p_organization_id,
    p_patient_id,
    'revenue_threshold',
    null,
    statement_timestamp(),
    '{}'::jsonb
  );
end;
$$;

-- The triggers created by 20260701123000 keep their names and now invoke only
-- the canonical engine through the replaced handlers above. Including
-- start_at ensures temporal rules observe rescheduling on the next worker run.
drop trigger if exists apply_patient_tag_rules_after_appointment
  on public.appointments;
create trigger apply_patient_tag_rules_after_appointment
after insert or update of patient_id, status, start_at on public.appointments
for each row execute function app_private.handle_patient_tag_rules_after_appointment();

-- ---------------------------------------------------------------------------
-- Temporal triggers: birthday, N days before, and appointment day
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

      if app_private.apply_patient_automation_action(
        v_rule,
        v_appointment.patient_id,
        v_event_key,
        p_as_of,
        jsonb_build_object(
          'appointment_id', v_appointment.id,
          'start_at', v_appointment.start_at,
          'local_date', v_local_date,
          'days_before', v_days_before
        )
      ) then
        v_applied := v_applied + 1;
      end if;
    end loop;
  end loop;

  return v_applied;
end;
$$;

create or replace function public.process_patient_automation_time_triggers(
  p_organization_id uuid default null,
  p_as_of timestamptz default statement_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and current_user not in ('postgres', 'supabase_admin')
  then
    raise exception 'Only the automation worker can process temporal rules.'
      using errcode = '42501';
  end if;

  return app_private.process_patient_automation_time_triggers(
    p_organization_id,
    coalesce(p_as_of, statement_timestamp()),
    null
  );
end;
$$;

revoke all on function app_private.process_patient_automation_time_triggers(
  uuid,
  timestamptz,
  uuid
) from public;
revoke all on function public.process_patient_automation_time_triggers(
  uuid,
  timestamptz
) from public, anon, authenticated;
grant execute on function public.process_patient_automation_time_triggers(
  uuid,
  timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- Backfill / refresh helpers
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
             appointments.created_at
      from public.appointments appointments
      where appointments.organization_id = v_rule.organization_id
        and appointments.status not in ('cancelled', 'no_show')
    loop
      if v_rule.event_type = 'first_visit'
        and exists (
          select 1
          from public.encounters encounters
          where encounters.organization_id = v_rule.organization_id
            and encounters.patient_id = v_appointment.patient_id
            and encounters.status = 'finalized'
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
      if app_private.apply_patient_automation_action(
        v_rule,
        v_appointment.patient_id,
        v_event_key,
        p_as_of,
        jsonb_build_object(
          'refresh', true,
          'appointment_id', v_appointment.id
        )
      ) then
        v_count := v_count + 1;
      end if;
    end loop;

  elsif v_rule.event_type = 'appointment_completed' then
    for v_appointment in
      select appointments.id,
             appointments.patient_id
      from public.appointments appointments
      where appointments.organization_id = v_rule.organization_id
        and appointments.status = 'attended'
    loop
      v_event_key := concat(
        'appointment_completed:',
        v_appointment.id,
        ':',
        v_appointment.patient_id
      );
      if app_private.apply_patient_automation_action(
        v_rule,
        v_appointment.patient_id,
        v_event_key,
        p_as_of,
        jsonb_build_object(
          'refresh', true,
          'appointment_id', v_appointment.id
        )
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
-- Effective-user management context and audited RPCs
-- ---------------------------------------------------------------------------

create or replace function app_private.resolve_patient_automation_context(
  p_impersonation_session_id uuid default null,
  p_required_permission text default 'automacao.criar'
)
returns table (
  actor_user_id uuid,
  effective_user_id uuid,
  organization_id uuid,
  impersonation_session_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  select context.actor_user_id,
         context.effective_user_id,
         context.organization_id,
         context.impersonation_session_id
    into actor_user_id,
         effective_user_id,
         organization_id,
         impersonation_session_id
  from app_private.resolve_effective_request_context(
    p_impersonation_session_id
  ) context;

  if effective_user_id is null
    or not (
      app_private.user_has_permission(effective_user_id, 'config.geral')
      or app_private.user_has_permission(
        effective_user_id,
        p_required_permission
      )
    )
  then
    raise exception 'Not allowed to manage patient automations.'
      using errcode = '42501';
  end if;

  return next;
end;
$$;

revoke all on function app_private.resolve_patient_automation_context(
  uuid,
  text
) from public;

create or replace function public.create_patient_tag(
  p_name text,
  p_color text default '#64748b',
  p_impersonation_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_tag_id uuid;
begin
  select *
    into v_context
  from app_private.resolve_patient_automation_context(
    p_impersonation_session_id,
    'automacao.criar'
  );

  if nullif(trim(coalesce(p_name, '')), '') is null
    or char_length(trim(p_name)) > 80
  then
    raise exception 'Tag name must have between 1 and 80 characters.'
      using errcode = '23514';
  end if;

  if coalesce(p_color, '') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Tag color must use the #RRGGBB format.'
      using errcode = '23514';
  end if;

  insert into public.tags (organization_id, name, color)
  values (v_context.organization_id, trim(p_name), p_color)
  returning id into v_tag_id;

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
    'tags.created',
    'tag',
    v_tag_id,
    jsonb_strip_nulls(jsonb_build_object(
      'name', trim(p_name),
      'color', p_color,
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id
    ))
  );

  return v_tag_id;
end;
$$;

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
    coalesce(p_trigger_config, '{}'::jsonb),
    p_action_type,
    coalesce(p_action_config, '{}'::jsonb)
  ) then
    raise exception 'Invalid patient automation trigger or action configuration.'
      using errcode = '23514';
  end if;

  v_tag_id := (p_action_config ->> 'tag_id')::uuid;
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

  if p_action_config ? 'duration_days'
    and jsonb_typeof(p_action_config -> 'duration_days') <> 'null'
  then
    v_duration_days := (p_action_config ->> 'duration_days')::integer;
  end if;

  v_stored_action_config := coalesce(p_action_config, '{}'::jsonb);
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
    coalesce(p_trigger_config, '{}'::jsonb),
    p_action_type,
    v_stored_action_config,
    0,
    v_timezone,
    false,
    coalesce(p_active, true),
    false
  );

  -- Add-tag rules can be represented by the old table. Keeping the same UUID
  -- allows deployed clients to read them and lets legacy writes sync forward.
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
      coalesce(p_trigger_config, '{}'::jsonb)
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
      'trigger_config', coalesce(p_trigger_config, '{}'::jsonb),
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
    -- A later reactivation is a new lifecycle for the rule. Clearing only its
    -- ledger allows the refresh above to apply again without touching any
    -- manual tag association.
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

-- Preserve the legacy RPC name for deployed callers. It now delegates to the
-- canonical rule having the same UUID. Super Admin callers must use the new
-- RPC and provide an active support session.
create or replace function public.refresh_patient_tag_rule(p_rule_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  return public.refresh_patient_automation_rule(p_rule_id, null);
end;
$$;

revoke all on function public.create_patient_tag(text, text, uuid)
  from public, anon;
revoke all on function public.create_patient_automation_rule(
  text,
  text,
  jsonb,
  text,
  jsonb,
  boolean,
  uuid
) from public, anon;
revoke all on function public.set_patient_automation_rule_active(
  uuid,
  boolean,
  uuid
) from public, anon;
revoke all on function public.delete_patient_automation_rule(uuid, uuid)
  from public, anon;
revoke all on function public.refresh_patient_automation_rule(uuid, uuid)
  from public, anon;

grant execute on function public.create_patient_tag(text, text, uuid)
  to authenticated;
grant execute on function public.create_patient_automation_rule(
  text,
  text,
  jsonb,
  text,
  jsonb,
  boolean,
  uuid
) to authenticated;
grant execute on function public.set_patient_automation_rule_active(
  uuid,
  boolean,
  uuid
) to authenticated;
grant execute on function public.delete_patient_automation_rule(uuid, uuid)
  to authenticated;
grant execute on function public.refresh_patient_automation_rule(uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Hourly scheduler when pg_cron is available; the service-role RPC above is
-- the portable fallback for Edge Functions or an external scheduler.
-- ---------------------------------------------------------------------------

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension extensions
    where extensions.extname = 'pg_cron'
  ) and exists (
    select 1
    from pg_catalog.pg_available_extensions available
    where available.name = 'pg_cron'
  ) then
    begin
      execute 'create extension if not exists pg_cron with schema pg_catalog';
    exception
      when insufficient_privilege or feature_not_supported then
        raise notice 'pg_cron is available but could not be enabled; use the service-role temporal processor.';
    end;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_extension extensions
    where extensions.extname = 'pg_cron'
  ) then
    execute $schedule$
      select cron.schedule(
        'patient-automation-temporal-hourly',
        '7 * * * *',
        $job$select app_private.process_patient_automation_time_triggers(
          null,
          statement_timestamp(),
          null
        );$job$
      )
    $schedule$;
  else
    raise notice 'pg_cron is not installed; invoke process_patient_automation_time_triggers with service_role at least hourly.';
  end if;
end;
$migration$;

comment on table public.automation_rule_executions is
  'Idempotency ledger for patient automation actions, keyed by rule and operational event.';
comment on function public.create_patient_automation_rule(
  text,
  text,
  jsonb,
  text,
  jsonb,
  boolean,
  uuid
) is
  'Creates an audited patient automation using the effective support-user context and immediately backfills matching records.';
comment on function public.process_patient_automation_time_triggers(
  uuid,
  timestamptz
) is
  'Service-only idempotent processor for birthday, appointment-before and appointment-day triggers.';
