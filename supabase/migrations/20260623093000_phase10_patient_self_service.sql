-- Phase 10 extension: patient self-service token for status, cancellation and pending reschedule.

alter table public.online_booking_requests
  add column public_access_token uuid not null default gen_random_uuid();

create unique index online_booking_requests_access_token_key
  on public.online_booking_requests(public_access_token);

create or replace function public.submit_online_booking_request_with_token(
  p_public_slug text,
  p_schedule_id uuid,
  p_procedure_id uuid,
  p_start_at timestamptz,
  p_patient_name text,
  p_patient_email text default null,
  p_patient_phone text default null,
  p_patient_cpf text default null,
  p_health_insurance_id uuid default null,
  p_patient_notes text default null,
  p_lgpd_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_request_id uuid;
  v_access_token uuid;
begin
  v_request_id := public.submit_online_booking_request(
    p_public_slug,
    p_schedule_id,
    p_procedure_id,
    p_start_at,
    p_patient_name,
    p_patient_email,
    p_patient_phone,
    p_patient_cpf,
    p_health_insurance_id,
    p_patient_notes,
    p_lgpd_consent
  );

  select public_access_token
    into v_access_token
  from public.online_booking_requests
  where id = v_request_id;

  return jsonb_build_object(
    'request_id', v_request_id,
    'access_token', v_access_token
  );
end;
$$;

create or replace function public.reschedule_online_booking_request(
  p_access_token uuid,
  p_start_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_request public.online_booking_requests%rowtype;
  v_settings public.online_booking_settings%rowtype;
  v_procedure public.procedures%rowtype;
  v_end_at timestamptz;
begin
  select *
    into v_request
  from public.online_booking_requests
  where public_access_token = p_access_token
  for update;

  if v_request.id is null then
    raise exception 'Online booking request not found.' using errcode = 'P0002';
  end if;

  if v_request.status <> 'requested' then
    raise exception 'Only pending online booking requests can be rescheduled.'
      using errcode = '23514';
  end if;

  select *
    into v_settings
  from public.online_booking_settings
  where organization_id = v_request.organization_id
    and enabled;

  if v_settings.id is null then
    raise exception 'Online booking is not available.' using errcode = '42501';
  end if;

  if p_start_at < statement_timestamp() + make_interval(hours => v_settings.min_notice_hours)
    or p_start_at > statement_timestamp() + make_interval(days => v_settings.max_days_ahead) then
    raise exception 'Requested time is outside booking window.' using errcode = '23514';
  end if;

  select *
    into v_procedure
  from public.procedures
  where organization_id = v_request.organization_id
    and id = v_request.procedure_id
    and active;

  if v_procedure.id is null then
    raise exception 'Procedure not found.' using errcode = 'P0002';
  end if;

  v_end_at := p_start_at + make_interval(mins => v_procedure.duration_minutes);

  if not app_private.online_booking_slot_is_available(
    v_request.organization_id,
    v_request.schedule_id,
    p_start_at,
    v_end_at,
    v_request.id
  ) then
    raise exception 'Requested slot is not available.' using errcode = '23P01';
  end if;

  update public.online_booking_requests
  set requested_start_at = p_start_at,
      requested_end_at = v_end_at
  where id = v_request.id;

  return 'requested';
end;
$$;

create or replace function public.cancel_online_booking_request(
  p_access_token uuid,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_request public.online_booking_requests%rowtype;
  v_settings public.online_booking_settings%rowtype;
  v_appointment public.appointments%rowtype;
  v_reason text;
begin
  select *
    into v_request
  from public.online_booking_requests
  where public_access_token = p_access_token
  for update;

  if v_request.id is null then
    raise exception 'Online booking request not found.' using errcode = 'P0002';
  end if;

  if v_request.status = 'cancelled' then
    return 'cancelled';
  end if;

  if v_request.status not in ('requested', 'confirmed') then
    raise exception 'Online booking request cannot be cancelled online.'
      using errcode = '23514';
  end if;

  select *
    into v_settings
  from public.online_booking_settings
  where organization_id = v_request.organization_id;

  if statement_timestamp() > (
    v_request.requested_start_at
    - make_interval(hours => coalesce(v_settings.cancellation_notice_hours, 24))
  ) then
    raise exception 'Cancellation window is closed.' using errcode = '23514';
  end if;

  v_reason := coalesce(nullif(trim(p_reason), ''), 'Cancelado pelo paciente no portal');

  if v_request.status = 'confirmed' and v_request.appointment_id is not null then
    select *
      into v_appointment
    from public.appointments
    where organization_id = v_request.organization_id
      and id = v_request.appointment_id
    for update;

    if v_appointment.id is null
      or v_appointment.status not in ('scheduled', 'confirmed') then
      raise exception 'Appointment cannot be cancelled online.' using errcode = '23514';
    end if;

    update public.appointments
    set status = 'cancelled',
        cancelled_at = statement_timestamp(),
        cancellation_reason = v_reason
    where id = v_appointment.id;
  end if;

  update public.online_booking_requests
  set status = 'cancelled',
      reviewed_at = coalesce(reviewed_at, statement_timestamp()),
      review_notes = v_reason
  where id = v_request.id;

  return 'cancelled';
end;
$$;

revoke all on function public.submit_online_booking_request_with_token(
  text, uuid, uuid, timestamptz, text, text, text, text, uuid, text, boolean
) from public;
revoke all on function public.reschedule_online_booking_request(uuid, timestamptz)
  from public;
revoke all on function public.cancel_online_booking_request(uuid, text)
  from public;

grant execute on function public.submit_online_booking_request_with_token(
  text, uuid, uuid, timestamptz, text, text, text, text, uuid, text, boolean
) to anon, authenticated, service_role;
grant execute on function public.reschedule_online_booking_request(uuid, timestamptz)
  to anon, authenticated, service_role;
grant execute on function public.cancel_online_booking_request(uuid, text)
  to anon, authenticated, service_role;

comment on column public.online_booking_requests.public_access_token is
  'Opaque patient self-service token for status, cancellation and pending reschedule.';
