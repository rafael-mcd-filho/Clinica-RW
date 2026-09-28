-- Unifica o ciclo do atendimento clinico e torna as operacoes compativeis
-- com sessoes de suporte. O agendamento representa o compromisso planejado;
-- o encounter representa o atendimento efetivamente iniciado.

create or replace function app_private.user_can_access_clinical_record(
  p_user_id uuid,
  p_organization_id uuid,
  p_professional_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select p_user_id is not null
    and p_organization_id is not null
    and p_professional_id is not null
    and (
      app_private.user_has_permission(p_user_id, 'clinico.ver_prontuario')
      or (
        app_private.user_has_permission(
          p_user_id,
          'clinico.ver_prontuario_proprios'
        )
        and exists (
          select 1
          from public.professionals
          where professionals.organization_id = p_organization_id
            and professionals.id = p_professional_id
            and professionals.user_id = p_user_id
            and professionals.active
        )
      )
    )
$$;

revoke all on function app_private.user_can_access_clinical_record(
  uuid, uuid, uuid
) from public, anon, authenticated;

-- Os eventos de status pertencem ao tenant e, por isso, precisam apontar
-- para o usuario efetivo da sessao de suporte. O ator real fica preservado
-- pelo gatilho de auditoria abaixo.
create or replace function app_private.register_appointment_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_effective_user_id uuid;
begin
  if old.status is distinct from new.status then
    if not (
      (old.status = 'scheduled' and new.status in ('confirmed', 'waiting', 'no_show', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('waiting', 'no_show', 'cancelled'))
      or (old.status = 'waiting' and new.status in ('in_progress', 'no_show', 'cancelled'))
      or (old.status = 'in_progress' and new.status in ('attended', 'cancelled'))
    ) then
      raise exception 'Invalid appointment status transition.'
        using errcode = '23514';
    end if;

    v_effective_user_id := nullif(
      current_setting('app.effective_user_id', true),
      ''
    )::uuid;

    insert into public.appointment_status_events (
      organization_id, appointment_id, from_status, to_status,
      actor_user_id, reason
    ) values (
      new.organization_id, new.id, old.status, new.status,
      coalesce(v_effective_user_id, app_private.current_app_user_id()),
      nullif(current_setting('app.appointment_status_reason', true), '')
    );
  end if;
  return new;
end;
$$;

create or replace function app_private.audit_appointment_status_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor_user_id uuid;
  v_effective_user_id uuid;
  v_impersonation_session_id uuid;
begin
  v_actor_user_id := nullif(
    current_setting('app.actor_user_id', true),
    ''
  )::uuid;
  v_effective_user_id := nullif(
    current_setting('app.effective_user_id', true),
    ''
  )::uuid;
  v_impersonation_session_id := nullif(
    current_setting('app.impersonation_session_id', true),
    ''
  )::uuid;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    new.organization_id,
    coalesce(v_actor_user_id, new.actor_user_id),
    case
      when new.from_status is null then 'appointments.status_initialized'
      else 'appointments.status_changed'
    end,
    'appointments',
    new.appointment_id,
    jsonb_strip_nulls(jsonb_build_object(
      'appointment_id', new.appointment_id,
      'status_event_id', new.id,
      'from_status', new.from_status,
      'to_status', new.to_status,
      'reason', new.reason,
      'effective_user_id', coalesce(v_effective_user_id, new.actor_user_id),
      'impersonation_session_id', v_impersonation_session_id,
      'previous', case
        when new.from_status is null then null
        else jsonb_build_object('status', new.from_status)
      end,
      'current', jsonb_build_object('status', new.to_status)
    ))
  );

  return new;
end;
$$;

revoke all on function app_private.register_appointment_status_change()
  from public, anon, authenticated;
revoke all on function app_private.audit_appointment_status_event()
  from public, anon, authenticated;

create or replace function public.transition_appointment_status_v2(
  p_appointment_id uuid,
  p_to_status text,
  p_reason text default null,
  p_impersonation_session_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_appointment public.appointments%rowtype;
begin
  select * into v_context
  from app_private.resolve_effective_request_context(
    p_impersonation_session_id
  );

  select appointments.*
    into v_appointment
  from public.appointments
  where appointments.id = p_appointment_id
    and appointments.organization_id = v_context.organization_id
  for update;

  if v_appointment.id is null then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;
  if not app_private.user_has_permission(
    v_context.effective_user_id,
    'agenda.editar_agendamento'
  ) or not app_private.user_can_access_agenda_resource(
    v_context.effective_user_id,
    v_context.organization_id,
    v_appointment.schedule_id,
    v_appointment.professional_id,
    v_appointment.unit_id,
    'write'
  ) then
    raise exception 'Not allowed to change appointment status.'
      using errcode = '42501';
  end if;
  if p_to_status not in (
    'scheduled', 'confirmed', 'waiting', 'in_progress',
    'attended', 'no_show', 'cancelled'
  ) then
    raise exception 'Invalid appointment status.' using errcode = '23514';
  end if;
  if p_to_status = v_appointment.status then
    return p_to_status;
  end if;

  perform set_config('app.actor_user_id', v_context.actor_user_id::text, true);
  perform set_config(
    'app.effective_user_id',
    v_context.effective_user_id::text,
    true
  );
  perform set_config(
    'app.impersonation_session_id',
    coalesce(v_context.impersonation_session_id::text, ''),
    true
  );
  perform set_config(
    'app.appointment_status_reason',
    coalesce(p_reason, ''),
    true
  );

  update public.appointments
  set status = p_to_status,
      cancelled_at = case
        when p_to_status = 'cancelled' then statement_timestamp()
        else cancelled_at
      end,
      cancellation_reason = case
        when p_to_status = 'cancelled' then nullif(trim(p_reason), '')
        else cancellation_reason
      end
  where id = p_appointment_id;

  return p_to_status;
end;
$$;

create or replace function app_private.advance_appointment_to_in_progress(
  p_appointment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_status text;
begin
  select appointments.status
    into v_status
  from public.appointments
  where appointments.id = p_appointment_id
  for update;

  if v_status = 'scheduled' or v_status = 'confirmed' then
    update public.appointments set status = 'waiting' where id = p_appointment_id;
    v_status := 'waiting';
  end if;
  if v_status = 'waiting' then
    update public.appointments set status = 'in_progress' where id = p_appointment_id;
  elsif v_status not in ('in_progress', 'attended') then
    raise exception 'Appointment cannot start a clinical encounter.'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function app_private.advance_appointment_to_attended(
  p_appointment_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_status text;
begin
  select appointments.status
    into v_status
  from public.appointments
  where appointments.id = p_appointment_id
  for update;

  if v_status = 'scheduled' or v_status = 'confirmed' then
    update public.appointments set status = 'waiting' where id = p_appointment_id;
    v_status := 'waiting';
  end if;
  if v_status = 'waiting' then
    update public.appointments set status = 'in_progress' where id = p_appointment_id;
    v_status := 'in_progress';
  end if;
  if v_status = 'in_progress' then
    update public.appointments set status = 'attended' where id = p_appointment_id;
  end if;
end;
$$;

revoke all on function app_private.advance_appointment_to_in_progress(
  uuid, text
) from public, anon, authenticated;
revoke all on function app_private.advance_appointment_to_attended(
  uuid
) from public, anon, authenticated;

create or replace function public.start_clinical_encounter_v2(
  p_patient_id uuid,
  p_professional_id uuid,
  p_template_version_id uuid,
  p_appointment_id uuid default null,
  p_impersonation_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_appointment public.appointments%rowtype;
  v_existing_encounter_id uuid;
  v_existing_encounter_status text;
  v_encounter_id uuid;
  v_template record;
begin
  select * into v_context
  from app_private.resolve_effective_request_context(
    p_impersonation_session_id
  );

  if not app_private.user_has_permission(
    v_context.effective_user_id,
    'clinico.preencher_prontuario'
  ) or not app_private.user_can_access_clinical_record(
    v_context.effective_user_id,
    v_context.organization_id,
    p_professional_id
  ) then
    raise exception 'Not allowed to create clinical encounter.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.patients
    where patients.organization_id = v_context.organization_id
      and patients.id = p_patient_id
      and patients.status = 'active'
      and patients.deleted_at is null
      and patients.deceased_at is null
  ) or not exists (
    select 1
    from public.professionals
    where professionals.organization_id = v_context.organization_id
      and professionals.id = p_professional_id
      and professionals.active
  ) then
    raise exception 'Active patient or professional not found.'
      using errcode = '23503';
  end if;

  perform set_config('app.actor_user_id', v_context.actor_user_id::text, true);
  perform set_config(
    'app.effective_user_id',
    v_context.effective_user_id::text,
    true
  );
  perform set_config(
    'app.impersonation_session_id',
    coalesce(v_context.impersonation_session_id::text, ''),
    true
  );
  perform set_config(
    'app.appointment_status_reason',
    'Atendimento clinico iniciado',
    true
  );

  if p_appointment_id is not null then
    select appointments.*
      into v_appointment
    from public.appointments
    where appointments.organization_id = v_context.organization_id
      and appointments.id = p_appointment_id
    for update;

    if v_appointment.id is null
      or v_appointment.patient_id <> p_patient_id
      or v_appointment.professional_id <> p_professional_id then
      raise exception 'Appointment does not match encounter.'
        using errcode = '23514';
    end if;
    if v_appointment.status in ('cancelled', 'no_show') then
      raise exception 'Appointment cannot start a clinical encounter.'
        using errcode = '23514';
    end if;

    select encounters.id, encounters.status
      into v_existing_encounter_id, v_existing_encounter_status
    from public.encounters
    where encounters.organization_id = v_context.organization_id
      and encounters.appointment_id = p_appointment_id;

    if v_appointment.status = 'attended'
      and v_existing_encounter_id is null then
      raise exception 'Appointment cannot start a clinical encounter.'
        using errcode = '23514';
    end if;

    -- Retomar uma ficha existente nao depende de o modelo continuar ativo.
    -- A versao usada ja esta preservada no snapshot do atendimento.
    if v_existing_encounter_id is not null then
      if v_existing_encounter_status = 'finalized' then
        perform app_private.advance_appointment_to_attended(p_appointment_id);
      elsif v_appointment.status <> 'attended' then
        perform app_private.advance_appointment_to_in_progress(
          p_appointment_id,
          'Atendimento clinico retomado'
        );
      end if;
      return v_existing_encounter_id;
    end if;
  end if;

  select templates.id as template_id,
         templates.name,
         versions.version_number,
         versions.schema
    into v_template
  from public.clinical_template_versions as versions
  join public.clinical_templates as templates
    on templates.organization_id = versions.organization_id
   and templates.id = versions.template_id
  where versions.organization_id = v_context.organization_id
    and versions.id = p_template_version_id
    and templates.status = 'active';

  if v_template.template_id is null then
    raise exception 'Clinical template version not found.'
      using errcode = '23503';
  end if;

  begin
    insert into public.encounters (
      organization_id, patient_id, professional_id, appointment_id,
      template_version_id, created_by_user_id
    ) values (
      v_context.organization_id,
      p_patient_id,
      p_professional_id,
      p_appointment_id,
      p_template_version_id,
      v_context.effective_user_id
    ) returning id into v_encounter_id;
  exception
    when unique_violation then
      select encounters.id, encounters.status
        into v_existing_encounter_id, v_existing_encounter_status
      from public.encounters
      where encounters.organization_id = v_context.organization_id
        and encounters.appointment_id = p_appointment_id;

      if v_existing_encounter_id is null then
        raise;
      end if;
      if v_existing_encounter_status = 'finalized' then
        perform app_private.advance_appointment_to_attended(p_appointment_id);
      else
        perform app_private.advance_appointment_to_in_progress(
          p_appointment_id,
          'Atendimento clinico retomado'
        );
      end if;
      return v_existing_encounter_id;
  end;

  insert into public.encounter_entries (
    organization_id, encounter_id, template_snapshot
  ) values (
    v_context.organization_id,
    v_encounter_id,
    jsonb_build_object(
      'template_id', v_template.template_id,
      'template_version_id', p_template_version_id,
      'name', v_template.name,
      'version_number', v_template.version_number,
      'schema', v_template.schema
    )
  );

  if p_appointment_id is not null then
    perform app_private.advance_appointment_to_in_progress(
      p_appointment_id,
      'Atendimento clinico iniciado'
    );
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'clinical_encounters.started',
    'encounters',
    v_encounter_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'patient_id', p_patient_id,
      'professional_id', p_professional_id,
      'appointment_id', p_appointment_id,
      'template_version_id', p_template_version_id
    ))
  );

  return v_encounter_id;
end;
$$;

create or replace function public.save_clinical_encounter_draft_v2(
  p_encounter_id uuid,
  p_structured_data jsonb,
  p_free_notes text,
  p_diagnoses jsonb default '[]'::jsonb,
  p_expected_updated_at timestamptz default null,
  p_impersonation_session_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_encounter public.encounters%rowtype;
  v_entry public.encounter_entries%rowtype;
  v_updated_at timestamptz;
begin
  select * into v_context
  from app_private.resolve_effective_request_context(
    p_impersonation_session_id
  );

  select encounters.*
    into v_encounter
  from public.encounters
  where encounters.id = p_encounter_id
    and encounters.organization_id = v_context.organization_id
  for update;

  if v_encounter.id is null then
    raise exception 'Encounter not found.' using errcode = 'P0002';
  end if;
  if v_encounter.status <> 'draft' then
    raise exception 'Only draft encounter can be edited.' using errcode = '55000';
  end if;
  if not app_private.user_has_permission(
    v_context.effective_user_id,
    'clinico.preencher_prontuario'
  ) or not app_private.user_can_access_clinical_record(
    v_context.effective_user_id,
    v_context.organization_id,
    v_encounter.professional_id
  ) then
    raise exception 'Not allowed to edit encounter.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_structured_data, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_diagnoses, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid clinical payload.' using errcode = '22023';
  end if;

  select encounter_entries.*
    into v_entry
  from public.encounter_entries
  where encounter_entries.organization_id = v_context.organization_id
    and encounter_entries.encounter_id = p_encounter_id
  for update;

  if v_entry.id is null then
    raise exception 'Encounter entry not found.' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null
    and v_entry.updated_at is distinct from p_expected_updated_at then
    raise exception 'Clinical encounter was updated by another user.'
      using errcode = '40001';
  end if;

  update public.encounter_entries
  set structured_data = coalesce(p_structured_data, '{}'::jsonb),
      free_notes = nullif(trim(p_free_notes), '')
  where id = v_entry.id
  returning updated_at into v_updated_at;

  delete from public.encounter_diagnoses
  where organization_id = v_context.organization_id
    and encounter_id = p_encounter_id;

  insert into public.encounter_diagnoses (
    organization_id, encounter_id, cid_code, description, is_primary
  )
  select
    v_context.organization_id,
    p_encounter_id,
    trim(item ->> 'cid_code'),
    nullif(trim(item ->> 'description'), ''),
    coalesce((item ->> 'is_primary')::boolean, false)
  from jsonb_array_elements(coalesce(p_diagnoses, '[]'::jsonb)) as item
  where nullif(trim(item ->> 'cid_code'), '') is not null;

  return v_updated_at;
end;
$$;

create or replace function public.finalize_clinical_encounter_v2(
  p_encounter_id uuid,
  p_expected_updated_at timestamptz default null,
  p_impersonation_session_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_encounter public.encounters%rowtype;
  v_entry public.encounter_entries%rowtype;
  v_finalized_at timestamptz;
begin
  select * into v_context
  from app_private.resolve_effective_request_context(
    p_impersonation_session_id
  );

  select encounters.*
    into v_encounter
  from public.encounters
  where encounters.id = p_encounter_id
    and encounters.organization_id = v_context.organization_id
  for update;

  if v_encounter.id is null then
    raise exception 'Encounter not found.' using errcode = 'P0002';
  end if;
  if v_encounter.status <> 'draft' then
    raise exception 'Encounter is already finalized.' using errcode = '55000';
  end if;
  if not app_private.user_has_permission(
    v_context.effective_user_id,
    'clinico.finalizar_prontuario'
  ) or not app_private.user_can_access_clinical_record(
    v_context.effective_user_id,
    v_context.organization_id,
    v_encounter.professional_id
  ) then
    raise exception 'Not allowed to finalize encounter.' using errcode = '42501';
  end if;

  select encounter_entries.*
    into v_entry
  from public.encounter_entries
  where encounter_entries.organization_id = v_context.organization_id
    and encounter_entries.encounter_id = p_encounter_id
  for update;

  if v_entry.id is null
    or (
      coalesce(v_entry.structured_data, '{}'::jsonb) = '{}'::jsonb
      and nullif(trim(v_entry.free_notes), '') is null
    ) then
    raise exception 'Clinical encounter is empty.' using errcode = '23514';
  end if;
  if p_expected_updated_at is not null
    and v_entry.updated_at is distinct from p_expected_updated_at then
    raise exception 'Clinical encounter was updated by another user.'
      using errcode = '40001';
  end if;

  perform app_private.validate_clinical_structured_data(
    coalesce(v_entry.template_snapshot -> 'schema', '{}'::jsonb),
    coalesce(v_entry.structured_data, '{}'::jsonb)
  );

  perform set_config('app.actor_user_id', v_context.actor_user_id::text, true);
  perform set_config(
    'app.effective_user_id',
    v_context.effective_user_id::text,
    true
  );
  perform set_config(
    'app.impersonation_session_id',
    coalesce(v_context.impersonation_session_id::text, ''),
    true
  );
  perform set_config(
    'app.appointment_status_reason',
    'Prontuario clinico finalizado',
    true
  );

  update public.encounters
  set status = 'finalized', finalized_at = statement_timestamp()
  where id = p_encounter_id
  returning finalized_at into v_finalized_at;

  if v_encounter.appointment_id is not null then
    perform app_private.advance_appointment_to_attended(
      v_encounter.appointment_id
    );
  end if;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'clinical_encounters.finalized',
    'encounters',
    p_encounter_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'patient_id', v_encounter.patient_id,
      'professional_id', v_encounter.professional_id,
      'appointment_id', v_encounter.appointment_id,
      'finalized_at', v_finalized_at
    ))
  );

  return v_finalized_at;
end;
$$;

create or replace function public.save_and_finalize_clinical_encounter_v2(
  p_encounter_id uuid,
  p_structured_data jsonb,
  p_free_notes text,
  p_diagnoses jsonb default '[]'::jsonb,
  p_expected_updated_at timestamptz default null,
  p_impersonation_session_id uuid default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
declare
  v_saved_at timestamptz;
begin
  v_saved_at := public.save_clinical_encounter_draft_v2(
    p_encounter_id,
    p_structured_data,
    p_free_notes,
    p_diagnoses,
    p_expected_updated_at,
    p_impersonation_session_id
  );

  return public.finalize_clinical_encounter_v2(
    p_encounter_id,
    v_saved_at,
    p_impersonation_session_id
  );
end;
$$;

create or replace function public.add_clinical_encounter_addendum_v2(
  p_encounter_id uuid,
  p_content text,
  p_impersonation_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_encounter public.encounters%rowtype;
  v_addendum_id uuid;
begin
  select * into v_context
  from app_private.resolve_effective_request_context(
    p_impersonation_session_id
  );

  select encounters.*
    into v_encounter
  from public.encounters
  where encounters.id = p_encounter_id
    and encounters.organization_id = v_context.organization_id;

  if v_encounter.id is null then
    raise exception 'Encounter not found.' using errcode = 'P0002';
  end if;
  if v_encounter.status <> 'finalized' then
    raise exception 'Addendum requires finalized encounter.' using errcode = '23514';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'Addendum content is required.' using errcode = '23514';
  end if;
  if not app_private.user_has_permission(
    v_context.effective_user_id,
    'clinico.adicionar_adendo'
  ) or not app_private.user_can_access_clinical_record(
    v_context.effective_user_id,
    v_context.organization_id,
    v_encounter.professional_id
  ) then
    raise exception 'Not allowed to add encounter addendum.'
      using errcode = '42501';
  end if;

  insert into public.encounter_addenda (
    organization_id, encounter_id, author_user_id, content
  ) values (
    v_context.organization_id,
    p_encounter_id,
    v_context.effective_user_id,
    trim(p_content)
  ) returning id into v_addendum_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'clinical_encounters.addendum_added',
    'encounter_addenda',
    v_addendum_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'encounter_id', p_encounter_id
    ))
  );

  return v_addendum_id;
end;
$$;

revoke all on function public.transition_appointment_status_v2(
  uuid, text, text, uuid
) from public;
revoke all on function public.start_clinical_encounter_v2(
  uuid, uuid, uuid, uuid, uuid
) from public;
revoke all on function public.save_clinical_encounter_draft_v2(
  uuid, jsonb, text, jsonb, timestamptz, uuid
) from public;
revoke all on function public.finalize_clinical_encounter_v2(
  uuid, timestamptz, uuid
) from public;
revoke all on function public.save_and_finalize_clinical_encounter_v2(
  uuid, jsonb, text, jsonb, timestamptz, uuid
) from public;
revoke all on function public.add_clinical_encounter_addendum_v2(
  uuid, text, uuid
) from public;

grant execute on function public.transition_appointment_status_v2(
  uuid, text, text, uuid
) to authenticated, service_role;
grant execute on function public.start_clinical_encounter_v2(
  uuid, uuid, uuid, uuid, uuid
) to authenticated, service_role;
grant execute on function public.save_clinical_encounter_draft_v2(
  uuid, jsonb, text, jsonb, timestamptz, uuid
) to authenticated, service_role;
grant execute on function public.finalize_clinical_encounter_v2(
  uuid, timestamptz, uuid
) to authenticated, service_role;
grant execute on function public.save_and_finalize_clinical_encounter_v2(
  uuid, jsonb, text, jsonb, timestamptz, uuid
) to authenticated, service_role;
grant execute on function public.add_clinical_encounter_addendum_v2(
  uuid, text, uuid
) to authenticated, service_role;

comment on function public.start_clinical_encounter_v2(
  uuid, uuid, uuid, uuid, uuid
) is
  'Starts an appointment-linked or standalone encounter atomically and advances a linked appointment to in_progress.';
comment on function public.finalize_clinical_encounter_v2(
  uuid, timestamptz, uuid
) is
  'Finalizes an encounter with optimistic concurrency and advances its linked appointment to attended.';
