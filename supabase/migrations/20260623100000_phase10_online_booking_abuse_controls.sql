-- Phase 10 extension: anti-abuse controls for public online booking.

alter table public.online_booking_settings
  add column max_requests_per_contact_day integer not null default 3
    check (max_requests_per_contact_day between 1 and 20),
  add column max_no_shows_180_days integer not null default 2
    check (max_no_shows_180_days between 0 and 20);

create index online_booking_requests_contact_window_idx
  on public.online_booking_requests(organization_id, created_at, patient_email, patient_phone);

create or replace function public.submit_online_booking_request(
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
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_settings public.online_booking_settings%rowtype;
  v_schedule public.schedules%rowtype;
  v_procedure public.procedures%rowtype;
  v_end_at timestamptz;
  v_request_id uuid;
  v_email citext;
  v_phone text;
  v_phone_digits text;
  v_cpf text;
  v_recent_requests integer;
  v_no_shows integer;
begin
  select *
    into v_settings
  from public.online_booking_settings
  where public_slug = lower(trim(p_public_slug))
    and enabled;

  if v_settings.id is null then
    raise exception 'Online booking is not available.' using errcode = '42501';
  end if;

  if not coalesce(p_lgpd_consent, false) then
    raise exception 'LGPD consent is required.' using errcode = '23514';
  end if;

  if char_length(trim(coalesce(p_patient_name, ''))) < 2 then
    raise exception 'Patient name is required.' using errcode = '23514';
  end if;

  v_email := nullif(trim(coalesce(p_patient_email, '')), '')::citext;
  v_phone := nullif(trim(coalesce(p_patient_phone, '')), '');
  v_phone_digits := nullif(regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g'), '');
  v_cpf := nullif(regexp_replace(coalesce(p_patient_cpf, ''), '[^0-9]', '', 'g'), '');

  if v_email is null and v_phone is null then
    raise exception 'Patient contact is required.' using errcode = '23514';
  end if;

  select count(*)
    into v_recent_requests
  from public.online_booking_requests
  where organization_id = v_settings.organization_id
    and created_at >= statement_timestamp() - interval '24 hours'
    and status in ('requested', 'confirmed')
    and (
      (v_email is not null and patient_email = v_email)
      or (
        v_phone_digits is not null
        and regexp_replace(coalesce(patient_phone, ''), '[^0-9]', '', 'g') = v_phone_digits
      )
    );

  if v_recent_requests >= v_settings.max_requests_per_contact_day then
    raise exception 'Online booking request limit reached for this contact.'
      using errcode = '23514';
  end if;

  select count(*)
    into v_no_shows
  from public.appointments
  join public.patients
    on patients.organization_id = appointments.organization_id
   and patients.id = appointments.patient_id
  where appointments.organization_id = v_settings.organization_id
    and appointments.status = 'no_show'
    and appointments.start_at >= statement_timestamp() - interval '180 days'
    and (
      (v_cpf is not null and regexp_replace(coalesce(patients.cpf, ''), '[^0-9]', '', 'g') = v_cpf)
      or (v_email is not null and patients.email = v_email)
      or (
        v_phone_digits is not null
        and (
          regexp_replace(coalesce(patients.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
          or regexp_replace(coalesce(patients.whatsapp, ''), '[^0-9]', '', 'g') = v_phone_digits
        )
      )
    );

  if v_no_shows >= v_settings.max_no_shows_180_days then
    raise exception 'Online booking is blocked by recent no-show history.'
      using errcode = '23514';
  end if;

  if p_start_at < statement_timestamp() + make_interval(hours => v_settings.min_notice_hours)
    or p_start_at > statement_timestamp() + make_interval(days => v_settings.max_days_ahead) then
    raise exception 'Requested time is outside booking window.' using errcode = '23514';
  end if;

  select *
    into v_schedule
  from public.schedules
  where organization_id = v_settings.organization_id
    and id = p_schedule_id
    and active;

  if v_schedule.id is null then
    raise exception 'Schedule not found.' using errcode = 'P0002';
  end if;

  select *
    into v_procedure
  from public.procedures
  where organization_id = v_settings.organization_id
    and id = p_procedure_id
    and active;

  if v_procedure.id is null then
    raise exception 'Procedure not found.' using errcode = 'P0002';
  end if;

  if p_health_insurance_id is not null and not exists (
    select 1
    from public.health_insurances
    where organization_id = v_settings.organization_id
      and id = p_health_insurance_id
      and active
  ) then
    raise exception 'Health insurance not found.' using errcode = 'P0002';
  end if;

  v_end_at := p_start_at + make_interval(mins => v_procedure.duration_minutes);

  if not app_private.online_booking_slot_is_available(
    v_settings.organization_id,
    v_schedule.id,
    p_start_at,
    v_end_at
  ) then
    raise exception 'Requested slot is not available.' using errcode = '23P01';
  end if;

  insert into public.online_booking_requests (
    organization_id,
    schedule_id,
    procedure_id,
    professional_id,
    unit_id,
    health_insurance_id,
    requested_start_at,
    requested_end_at,
    patient_name,
    patient_email,
    patient_phone,
    patient_cpf,
    patient_notes,
    lgpd_consent_at
  ) values (
    v_settings.organization_id,
    v_schedule.id,
    v_procedure.id,
    v_schedule.professional_id,
    v_schedule.unit_id,
    p_health_insurance_id,
    p_start_at,
    v_end_at,
    trim(p_patient_name),
    v_email,
    v_phone,
    v_cpf,
    nullif(trim(p_patient_notes), ''),
    statement_timestamp()
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

comment on column public.online_booking_settings.max_requests_per_contact_day is
  'Maximum requested/confirmed public booking requests per contact within 24 hours.';
comment on column public.online_booking_settings.max_no_shows_180_days is
  'Maximum patient no-shows in the last 180 days before public booking is blocked.';
