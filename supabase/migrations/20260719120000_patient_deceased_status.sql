-- Patient life status: deceased records are preserved, visibly distinguished
-- and excluded from communication/automation eligibility.

alter table public.patients
  add column if not exists deceased_at date,
  add column if not exists death_notes text,
  add column if not exists deceased_recorded_at timestamptz,
  add column if not exists deceased_recorded_by_user_id uuid,
  add column if not exists status_before_deceased text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_deceased_after_birth_check'
  ) then
    alter table public.patients
      add constraint patients_deceased_after_birth_check
      check (
        deceased_at is null
        or birth_date is null
        or deceased_at >= birth_date
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_deceased_recorded_by_user_fk'
  ) then
    alter table public.patients
      add constraint patients_deceased_recorded_by_user_fk
      foreign key (organization_id, deceased_recorded_by_user_id)
      references public.app_users(organization_id, id)
      on delete set null (deceased_recorded_by_user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_deceased_not_future_check'
  ) then
    alter table public.patients
      add constraint patients_deceased_not_future_check
      check (deceased_at is null or deceased_at <= current_date);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_death_notes_length_check'
  ) then
    alter table public.patients
      add constraint patients_death_notes_length_check
      check (death_notes is null or char_length(death_notes) <= 1000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.patients'::regclass
      and conname = 'patients_status_before_deceased_check'
  ) then
    alter table public.patients
      add constraint patients_status_before_deceased_check
      check (
        status_before_deceased is null
        or status_before_deceased in ('active', 'inactive')
      );
  end if;
end;
$$;

create index if not exists patients_organization_deceased_idx
  on public.patients (organization_id, deceased_at desc)
  where deceased_at is not null;

create or replace function app_private.enforce_deceased_patient_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_trusted_actor boolean := (
    coalesce(auth.role(), '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin')
    or app_private.current_is_super_admin()
  );
  v_organization_actor_id uuid;
begin
  select app_user.id
    into v_organization_actor_id
  from public.app_users app_user
  where app_user.organization_id = new.organization_id
    and app_user.id = app_private.current_app_user_id();

  if tg_op = 'UPDATE'
    and (
      new.cpf is distinct from old.cpf
      or new.rg is distinct from old.rg
    )
    and not v_trusted_actor
    and not app_private.current_user_has_permission(
      'paciente.ver_dados_sensiveis'
    ) then
    raise exception 'Permission denied to change sensitive patient fields.'
      using errcode = '42501';
  end if;

  if (
    (
      tg_op = 'INSERT'
      and (
        new.deceased_at is not null
        or new.death_notes is not null
        or new.deceased_recorded_at is not null
        or new.deceased_recorded_by_user_id is not null
        or new.status_before_deceased is not null
      )
    )
    or (
      tg_op = 'UPDATE'
      and (
        new.deceased_at is distinct from old.deceased_at
        or new.death_notes is distinct from old.death_notes
        or new.deceased_recorded_at
          is distinct from old.deceased_recorded_at
        or new.deceased_recorded_by_user_id
          is distinct from old.deceased_recorded_by_user_id
        or new.status_before_deceased
          is distinct from old.status_before_deceased
      )
    )
  )
  and not v_trusted_actor
  and (
    not app_private.current_user_has_permission('paciente.editar')
    or not app_private.current_user_has_permission(
      'paciente.ver_dados_sensiveis'
    )
  ) then
    raise exception 'Permission denied to change patient life status.'
      using errcode = '42501';
  end if;

  if new.deceased_at is not null then
    if tg_op = 'INSERT' then
      new.status_before_deceased := coalesce(new.status, 'active');
      if v_trusted_actor then
        new.deceased_recorded_at := coalesce(
          new.deceased_recorded_at,
          statement_timestamp()
        );
        new.deceased_recorded_by_user_id := coalesce(
          new.deceased_recorded_by_user_id,
          v_organization_actor_id
        );
      else
        new.deceased_recorded_at := statement_timestamp();
        new.deceased_recorded_by_user_id := v_organization_actor_id;
      end if;
    elsif old.deceased_at is null then
      new.status_before_deceased := old.status;
      if v_trusted_actor then
        new.deceased_recorded_at := coalesce(
          new.deceased_recorded_at,
          statement_timestamp()
        );
        new.deceased_recorded_by_user_id := coalesce(
          new.deceased_recorded_by_user_id,
          v_organization_actor_id
        );
      else
        new.deceased_recorded_at := statement_timestamp();
        new.deceased_recorded_by_user_id := v_organization_actor_id;
      end if;
    else
      new.status_before_deceased := coalesce(
        old.status_before_deceased,
        'active'
      );
      new.deceased_recorded_at := old.deceased_recorded_at;
      new.deceased_recorded_by_user_id :=
        old.deceased_recorded_by_user_id;
    end if;

    new.status := 'inactive';
  elsif tg_op = 'UPDATE' and old.deceased_at is not null then
    new.status := case
      when new.deleted_at is not null then 'inactive'
      else coalesce(old.status_before_deceased, 'active')
    end;
    new.status_before_deceased := null;
    new.deceased_recorded_at := null;
    new.deceased_recorded_by_user_id := null;
    new.death_notes := null;
  else
    new.status_before_deceased := null;
    new.deceased_recorded_at := null;
    new.deceased_recorded_by_user_id := null;
    new.death_notes := null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_deceased_patient_state on public.patients;
create trigger enforce_deceased_patient_state
before insert or update on public.patients
for each row execute function app_private.enforce_deceased_patient_state();

revoke all on function app_private.enforce_deceased_patient_state()
  from public;

-- Selection filters improve the interface, while this transactional guard also
-- covers online booking RPCs, direct inserts and race conditions.
create or replace function app_private.reject_deceased_patient_operational_entry()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_deceased_at date;
begin
  if new.patient_id is not null and (
    tg_op = 'INSERT'
    or new.patient_id is distinct from old.patient_id
    or (
      tg_table_name = 'appointments'
      and (
        to_jsonb(new) -> 'schedule_id'
          is distinct from to_jsonb(old) -> 'schedule_id'
        or to_jsonb(new) -> 'professional_id'
          is distinct from to_jsonb(old) -> 'professional_id'
        or to_jsonb(new) -> 'procedure_id'
          is distinct from to_jsonb(old) -> 'procedure_id'
        or to_jsonb(new) -> 'unit_id'
          is distinct from to_jsonb(old) -> 'unit_id'
        or to_jsonb(new) -> 'room_id'
          is distinct from to_jsonb(old) -> 'room_id'
        or to_jsonb(new) -> 'start_at'
          is distinct from to_jsonb(old) -> 'start_at'
        or to_jsonb(new) -> 'end_at'
          is distinct from to_jsonb(old) -> 'end_at'
      )
    )
    or (
      tg_table_name = 'waitlist_entries'
      and (
        to_jsonb(new) -> 'professional_id'
          is distinct from to_jsonb(old) -> 'professional_id'
        or to_jsonb(new) -> 'procedure_id'
          is distinct from to_jsonb(old) -> 'procedure_id'
        or to_jsonb(new) -> 'preferred_period'
          is distinct from to_jsonb(old) -> 'preferred_period'
      )
    )
  ) then
    -- Serialize creation against a concurrent life-status transition. A death
    -- update waits for this transaction; if it committed first, this read sees
    -- the deceased date and rejects the operational entry.
    select patient.deceased_at
      into v_deceased_at
    from public.patients patient
    where patient.organization_id = new.organization_id
      and patient.id = new.patient_id
    for share;

    if not found then
      raise exception 'Paciente não encontrado para esta organização.'
        using errcode = '23503';
    elsif v_deceased_at is not null then
      raise exception
        'Paciente com óbito registrado não pode receber novos agendamentos.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reject_deceased_patient_appointment
  on public.appointments;
create trigger reject_deceased_patient_appointment
before insert or update of
  patient_id,
  schedule_id,
  professional_id,
  procedure_id,
  unit_id,
  room_id,
  start_at,
  end_at
on public.appointments
for each row
execute function app_private.reject_deceased_patient_operational_entry();

drop trigger if exists reject_deceased_patient_waitlist_entry
  on public.waitlist_entries;
create trigger reject_deceased_patient_waitlist_entry
before insert or update of
  patient_id,
  professional_id,
  procedure_id,
  preferred_period
on public.waitlist_entries
for each row
execute function app_private.reject_deceased_patient_operational_entry();

revoke all on function app_private.reject_deceased_patient_operational_entry()
  from public;

-- The inactive status already excludes deceased patients. Keep an explicit
-- predicate here so birthday eligibility cannot regress if status semantics
-- evolve independently in the future.
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
          and patients.deceased_at is null
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

-- Keep the generic audit trail useful for life-status transitions without
-- copying the free-text death note into audit metadata.
create or replace function app_private.audit_metadata_summary(
  p_row jsonb
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_key text;
begin
  if p_row is null then
    return '{}'::jsonb;
  end if;

  foreach v_key in array array[
    'id',
    'organization_id',
    'name',
    'code',
    'status',
    'active',
    'mode',
    'timezone',
    'locale',
    'automatic_mode',
    'retention_policy_key',
    'trade_name',
    'unit_id',
    'room_id',
    'equipment_id',
    'specialty_id',
    'professional_id',
    'procedure_id',
    'health_insurance_id',
    'price_table_id',
    'patient_id',
    'appointment_id',
    'encounter_id',
    'document_type',
    'consent_type',
    'tag_id',
    'weekday',
    'start_time',
    'end_time',
    'start_at',
    'end_at',
    'slot_minutes',
    'duration_minutes',
    'base_price',
    'amount',
    'paid_amount',
    'due_date',
    'deleted_at',
    'revoked_at',
    'preferred_contact',
    'allow_email',
    'allow_whatsapp',
    'allow_sms',
    'source',
    'deceased_at',
    'deceased_recorded_at',
    'deceased_recorded_by_user_id',
    'status_before_deceased'
  ] loop
    if p_row ? v_key then
      v_result := v_result || jsonb_build_object(v_key, p_row -> v_key);
    end if;
  end loop;

  return v_result;
end;
$$;

comment on column public.patients.deceased_at is
  'Date of death. A non-null value forces inactive status and blocks operational communication without erasing prior preferences.';
comment on column public.patients.death_notes is
  'Optional internal context for the deceased status; never exposed publicly.';
comment on column public.patients.status_before_deceased is
  'Patient status captured when death is first recorded and restored only when that record is corrected.';
comment on function app_private.enforce_deceased_patient_state() is
  'Keeps deceased patients inactive and ineligible for birthday automations and outbound communication.';
