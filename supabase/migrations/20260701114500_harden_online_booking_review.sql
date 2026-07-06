-- Harden online booking review actions for support/super-admin contexts and
-- reuse existing patients by CPF, phone or email before creating a new record.

create or replace function public.confirm_online_booking_request(
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_request public.online_booking_requests%rowtype;
  v_raw_actor_id uuid;
  v_actor_id uuid;
  v_patient_id uuid;
  v_appointment_id uuid;
  v_patient_cpf text;
  v_patient_phone text;
begin
  v_raw_actor_id := app_private.current_app_user_id();

  select *
    into v_request
  from public.online_booking_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Online booking request not found.' using errcode = 'P0002';
  end if;

  if not (
    app_private.current_is_super_admin()
    or (
      v_request.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('agenda.criar_agendamento')
      and app_private.current_user_has_permission('paciente.criar')
    )
  ) then
    raise exception 'Not allowed to confirm online booking request.' using errcode = '42501';
  end if;

  select id
    into v_actor_id
  from public.app_users
  where id = v_raw_actor_id
    and organization_id = v_request.organization_id
    and status = 'active'
  limit 1;

  if v_request.status <> 'requested' then
    raise exception 'Online booking request is not pending.' using errcode = '23514';
  end if;

  if not app_private.online_booking_slot_is_available(
    v_request.organization_id,
    v_request.schedule_id,
    v_request.requested_start_at,
    v_request.requested_end_at,
    v_request.id
  ) then
    raise exception 'Requested slot is not available.' using errcode = '23P01';
  end if;

  v_patient_cpf := nullif(
    regexp_replace(coalesce(v_request.patient_cpf, ''), '\D', '', 'g'),
    ''
  );
  v_patient_phone := nullif(
    regexp_replace(coalesce(v_request.patient_phone, ''), '\D', '', 'g'),
    ''
  );

  if v_patient_cpf is not null then
    select id
      into v_patient_id
    from public.patients
    where organization_id = v_request.organization_id
      and cpf = v_patient_cpf
      and deleted_at is null
    limit 1;
  end if;

  if v_patient_id is null and v_patient_phone is not null then
    select id
      into v_patient_id
    from public.patients
    where organization_id = v_request.organization_id
      and deleted_at is null
      and (
        regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_patient_phone
        or regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') = v_patient_phone
      )
    limit 1;
  end if;

  if v_patient_id is null
    and nullif(trim(coalesce(v_request.patient_email::text, '')), '') is not null then
    select id
      into v_patient_id
    from public.patients
    where organization_id = v_request.organization_id
      and email = v_request.patient_email
      and deleted_at is null
    limit 1;
  end if;

  if v_patient_id is null then
    insert into public.patients (
      organization_id,
      full_name,
      cpf,
      email,
      phone,
      whatsapp,
      preferred_contact,
      allow_email,
      allow_whatsapp,
      source
    ) values (
      v_request.organization_id,
      v_request.patient_name,
      v_patient_cpf,
      v_request.patient_email,
      v_patient_phone,
      v_patient_phone,
      case
        when v_patient_phone is not null then 'whatsapp'
        when v_request.patient_email is not null then 'email'
        else 'none'
      end,
      v_request.patient_email is not null,
      v_patient_phone is not null,
      'online_booking'
    )
    returning id into v_patient_id;
  end if;

  insert into public.patient_consents (
    organization_id,
    patient_id,
    consent_type,
    version,
    accepted_at,
    recorded_by_user_id
  ) values (
    v_request.organization_id,
    v_patient_id,
    'online_booking_lgpd',
    'phase10-v1',
    v_request.lgpd_consent_at,
    v_actor_id
  )
  on conflict do nothing;

  insert into public.appointments (
    organization_id,
    patient_id,
    professional_id,
    procedure_id,
    schedule_id,
    unit_id,
    health_insurance_id,
    status,
    start_at,
    end_at,
    notes,
    created_by_user_id
  ) values (
    v_request.organization_id,
    v_patient_id,
    v_request.professional_id,
    v_request.procedure_id,
    v_request.schedule_id,
    v_request.unit_id,
    v_request.health_insurance_id,
    'scheduled',
    v_request.requested_start_at,
    v_request.requested_end_at,
    concat_ws(chr(10), 'Solicitado pelo agendamento online.', v_request.patient_notes),
    v_actor_id
  )
  returning id into v_appointment_id;

  update public.online_booking_requests
  set status = 'confirmed',
      patient_id = v_patient_id,
      appointment_id = v_appointment_id,
      reviewed_by_user_id = v_actor_id,
      reviewed_at = statement_timestamp()
  where id = v_request.id;

  return v_appointment_id;
end;
$$;

create or replace function public.reject_online_booking_request(
  p_request_id uuid,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_request public.online_booking_requests%rowtype;
  v_raw_actor_id uuid;
  v_actor_id uuid;
begin
  v_raw_actor_id := app_private.current_app_user_id();

  select *
    into v_request
  from public.online_booking_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Online booking request not found.' using errcode = 'P0002';
  end if;

  if not (
    app_private.current_is_super_admin()
    or (
      v_request.organization_id = app_private.current_organization_id()
      and (
        app_private.current_user_has_permission('agenda.criar_agendamento')
        or app_private.current_user_has_permission('agenda.editar_agendamento')
      )
    )
  ) then
    raise exception 'Not allowed to reject online booking request.' using errcode = '42501';
  end if;

  select id
    into v_actor_id
  from public.app_users
  where id = v_raw_actor_id
    and organization_id = v_request.organization_id
    and status = 'active'
  limit 1;

  if v_request.status <> 'requested' then
    return v_request.status;
  end if;

  update public.online_booking_requests
  set status = 'rejected',
      reviewed_by_user_id = v_actor_id,
      reviewed_at = statement_timestamp(),
      review_notes = nullif(trim(p_reason), '')
  where id = v_request.id;

  return 'rejected';
end;
$$;

revoke all on function public.confirm_online_booking_request(uuid) from public;
revoke all on function public.reject_online_booking_request(uuid, text) from public;

grant execute on function public.confirm_online_booking_request(uuid)
  to authenticated, service_role;
grant execute on function public.reject_online_booking_request(uuid, text)
  to authenticated, service_role;
