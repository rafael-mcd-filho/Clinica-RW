-- Move operational online-booking rules from the organization to each schedule.
-- The organization-level online_booking_settings row remains the public portal
-- master switch and keeps shared profile, security and abuse-control settings.

create table public.schedule_online_booking_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  schedule_id uuid not null,
  enabled boolean not null default false,
  min_notice_hours integer not null default 24
    check (min_notice_hours between 0 and 720),
  max_days_ahead integer not null default 30
    check (max_days_ahead between 1 and 365),
  cancellation_notice_hours integer not null default 24
    check (cancellation_notice_hours between 0 and 720),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, schedule_id),
  foreign key (organization_id, schedule_id)
    references public.schedules(organization_id, id) on delete cascade
);

create table public.schedule_online_booking_procedures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  schedule_id uuid not null,
  procedure_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, schedule_id, procedure_id),
  foreign key (organization_id, schedule_id)
    references public.schedules(organization_id, id) on delete cascade,
  foreign key (organization_id, procedure_id)
    references public.procedures(organization_id, id) on delete cascade
);

create index schedule_online_booking_settings_enabled_idx
  on public.schedule_online_booking_settings(organization_id, enabled, schedule_id);

create index schedule_online_booking_procedures_procedure_idx
  on public.schedule_online_booking_procedures(
    organization_id,
    procedure_id,
    schedule_id
  );

create trigger set_schedule_online_booking_settings_updated_at
before update on public.schedule_online_booking_settings
for each row execute function app_private.set_updated_at();

create trigger set_schedule_online_booking_procedures_updated_at
before update on public.schedule_online_booking_procedures
for each row execute function app_private.set_updated_at();

-- Preserve the portal's current behavior: every existing schedule inherits the
-- organization booking window and is exposed when the organization portal was
-- already enabled.
insert into public.schedule_online_booking_settings (
  organization_id,
  schedule_id,
  enabled,
  min_notice_hours,
  max_days_ahead,
  cancellation_notice_hours
)
select
  schedules.organization_id,
  schedules.id,
  coalesce(online_settings.enabled, false),
  coalesce(online_settings.min_notice_hours, 24),
  coalesce(online_settings.max_days_ahead, 30),
  coalesce(online_settings.cancellation_notice_hours, 24)
from public.schedules
left join public.online_booking_settings as online_settings
  on online_settings.organization_id = schedules.organization_id
on conflict (organization_id, schedule_id) do nothing;

-- Before this migration every active procedure was implicitly available on
-- every schedule in the public portal.
insert into public.schedule_online_booking_procedures (
  organization_id,
  schedule_id,
  procedure_id
)
select
  schedules.organization_id,
  schedules.id,
  procedures.id
from public.schedules
join public.procedures
  on procedures.organization_id = schedules.organization_id
 and procedures.active
on conflict (organization_id, schedule_id, procedure_id) do nothing;

create or replace function app_private.seed_online_booking_on_schedule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into public.schedule_online_booking_settings (
    organization_id,
    schedule_id,
    enabled,
    min_notice_hours,
    max_days_ahead,
    cancellation_notice_hours
  )
  select
    new.organization_id,
    new.id,
    false,
    coalesce(online_settings.min_notice_hours, 24),
    coalesce(online_settings.max_days_ahead, 30),
    coalesce(online_settings.cancellation_notice_hours, 24)
  from (values (true)) as seed(value)
  left join public.online_booking_settings as online_settings
    on online_settings.organization_id = new.organization_id
  on conflict (organization_id, schedule_id) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_online_booking_on_schedule on public.schedules;
create trigger seed_online_booking_on_schedule
after insert on public.schedules
for each row execute function app_private.seed_online_booking_on_schedule();

-- A slot must be fully contained in an explicitly configured availability
-- interval. A schedule with no availability can therefore never receive a
-- public request, including through a direct RPC call.
create or replace function app_private.online_booking_slot_is_available(
  p_organization_id uuid,
  p_schedule_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_ignore_request_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  if p_start_at is null or p_end_at is null or p_start_at >= p_end_at then
    return false;
  end if;

  if not exists (
    select 1
    from public.schedules
    where organization_id = p_organization_id
      and id = p_schedule_id
      and active
  ) then
    return false;
  end if;

  select coalesce(settings.timezone, 'America/Fortaleza')
    into v_timezone
  from public.organization_settings as settings
  where settings.organization_id = p_organization_id;

  v_timezone := coalesce(v_timezone, 'America/Fortaleza');
  v_local_start := p_start_at at time zone v_timezone;
  v_local_end := p_end_at at time zone v_timezone;

  if v_local_start::date <> v_local_end::date then
    return false;
  end if;

  if not exists (
    select 1
    from public.schedule_availability as availability
    where availability.organization_id = p_organization_id
      and availability.schedule_id = p_schedule_id
      and availability.weekday = extract(dow from v_local_start)::smallint
      and v_local_start::time >= availability.start_time
      and v_local_end::time <= availability.end_time
      and mod(
        extract(epoch from (v_local_start::time - availability.start_time))::numeric,
        (availability.slot_minutes * 60)::numeric
      ) = 0
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.schedule_blocks
    where organization_id = p_organization_id
      and schedule_id = p_schedule_id
      and tstzrange(start_at, end_at, '[)')
        && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.appointments
    where organization_id = p_organization_id
      and schedule_id = p_schedule_id
      and status in ('scheduled', 'confirmed', 'waiting', 'in_progress')
      and tstzrange(start_at, end_at, '[)')
        && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.online_booking_requests
    where organization_id = p_organization_id
      and schedule_id = p_schedule_id
      and status = 'requested'
      and (p_ignore_request_id is null or id <> p_ignore_request_id)
      and tstzrange(requested_start_at, requested_end_at, '[)')
        && tstzrange(p_start_at, p_end_at, '[)')
  ) then
    return false;
  end if;

  return true;
end;
$$;

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
  v_schedule_settings public.schedule_online_booking_settings%rowtype;
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
  v_verification_id uuid;
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
  v_phone_digits := nullif(
    regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g'),
    ''
  );
  v_cpf := nullif(
    regexp_replace(coalesce(p_patient_cpf, ''), '[^0-9]', '', 'g'),
    ''
  );

  if v_email is null and v_phone is null then
    raise exception 'Patient contact is required.' using errcode = '23514';
  end if;

  if v_settings.require_contact_verification then
    select id
      into v_verification_id
    from public.online_booking_contact_verifications
    where organization_id = v_settings.organization_id
      and verified_at is not null
      and consumed_at is null
      and expires_at >= statement_timestamp()
      and (
        (
          v_email is not null
          and contact_type = 'email'
          and destination_normalized = lower(v_email::text)
        )
        or (
          v_phone_digits is not null
          and contact_type = 'phone'
          and destination_normalized = v_phone_digits
        )
      )
    order by verified_at desc
    limit 1
    for update skip locked;

    if v_verification_id is null then
      raise exception 'Contact verification is required.' using errcode = '42501';
    end if;
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
      (
        v_cpf is not null
        and regexp_replace(coalesce(patients.cpf, ''), '[^0-9]', '', 'g') = v_cpf
      )
      or (v_email is not null and patients.email = v_email)
      or (
        v_phone_digits is not null
        and (
          regexp_replace(coalesce(patients.phone, ''), '[^0-9]', '', 'g') = v_phone_digits
          or regexp_replace(coalesce(patients.whatsapp, ''), '[^0-9]', '', 'g') = v_phone_digits
        )
      )
    );

  -- Zero explicitly disables this protection instead of blocking everybody.
  if v_settings.max_no_shows_180_days > 0
    and v_no_shows >= v_settings.max_no_shows_180_days then
    raise exception 'Online booking is blocked by recent no-show history.'
      using errcode = '23514';
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
    into v_schedule_settings
  from public.schedule_online_booking_settings
  where organization_id = v_settings.organization_id
    and schedule_id = v_schedule.id
    and enabled;

  if v_schedule_settings.id is null then
    raise exception 'This schedule does not accept online booking.' using errcode = '42501';
  end if;

  if p_start_at < statement_timestamp()
      + make_interval(hours => v_schedule_settings.min_notice_hours)
    or p_start_at > statement_timestamp()
      + make_interval(days => v_schedule_settings.max_days_ahead) then
    raise exception 'Requested time is outside booking window.' using errcode = '23514';
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

  if not exists (
    select 1
    from public.schedule_online_booking_procedures
    where organization_id = v_settings.organization_id
      and schedule_id = v_schedule.id
      and procedure_id = v_procedure.id
  ) then
    raise exception 'Procedure is not available on this schedule.' using errcode = '23514';
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

  -- Serialize public mutations for the same schedule before checking and
  -- inserting, preventing concurrent requests from accepting overlapping time.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_settings.organization_id::text || ':' || v_schedule.id::text,
      0
    )
  );

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

  if v_verification_id is not null then
    update public.online_booking_contact_verifications
    set consumed_at = statement_timestamp()
    where id = v_verification_id;
  end if;

  return v_request_id;
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
  v_schedule_settings public.schedule_online_booking_settings%rowtype;
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

  select *
    into v_schedule_settings
  from public.schedule_online_booking_settings
  where organization_id = v_request.organization_id
    and schedule_id = v_request.schedule_id
    and enabled;

  if v_schedule_settings.id is null then
    raise exception 'This schedule does not accept online booking.' using errcode = '42501';
  end if;

  if p_start_at < statement_timestamp()
      + make_interval(hours => v_schedule_settings.min_notice_hours)
    or p_start_at > statement_timestamp()
      + make_interval(days => v_schedule_settings.max_days_ahead) then
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

  if not exists (
    select 1
    from public.schedule_online_booking_procedures
    where organization_id = v_request.organization_id
      and schedule_id = v_request.schedule_id
      and procedure_id = v_request.procedure_id
  ) then
    raise exception 'Procedure is not available on this schedule.' using errcode = '23514';
  end if;

  v_end_at := p_start_at + make_interval(mins => v_procedure.duration_minutes);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_request.organization_id::text || ':' || v_request.schedule_id::text,
      0
    )
  );

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
  v_schedule_settings public.schedule_online_booking_settings%rowtype;
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
    into v_schedule_settings
  from public.schedule_online_booking_settings
  where organization_id = v_request.organization_id
    and schedule_id = v_request.schedule_id;

  if v_schedule_settings.id is null then
    raise exception 'Online booking schedule settings not found.' using errcode = 'P0002';
  end if;

  if statement_timestamp() > (
    v_request.requested_start_at
    - make_interval(hours => v_schedule_settings.cancellation_notice_hours)
  ) then
    raise exception 'Cancellation window is closed.' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_request.organization_id::text || ':' || v_request.schedule_id::text,
      0
    )
  );

  v_reason := coalesce(
    nullif(trim(p_reason), ''),
    'Cancelado pelo paciente no portal'
  );

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

-- Save the schedule, its recurring periods, online window and allowed
-- procedures in one database transaction. For a new schedule the tenant is
-- inferred from the selected professional and unit; this also keeps support
-- impersonation safe without trusting a client-provided organization id.
create or replace function public.save_schedule_configuration(
  p_schedule_id uuid,
  p_professional_id uuid,
  p_unit_id uuid,
  p_name text,
  p_color text,
  p_active boolean,
  p_online_enabled boolean,
  p_min_notice_hours integer,
  p_max_days_ahead integer,
  p_cancellation_notice_hours integer,
  p_slot_minutes integer,
  p_availability jsonb,
  p_procedure_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_schedule public.schedules%rowtype;
  v_organization_id uuid;
  v_schedule_id uuid;
  v_availability jsonb := coalesce(p_availability, '[]'::jsonb);
  v_procedure_ids uuid[] := coalesce(p_procedure_ids, array[]::uuid[]);
begin
  if p_schedule_id is not null then
    select *
      into v_schedule
    from public.schedules
    where id = p_schedule_id
    for update;

    if v_schedule.id is null then
      raise exception 'Schedule not found.' using errcode = 'P0002';
    end if;

    v_organization_id := v_schedule.organization_id;
  else
    select professionals.organization_id
      into v_organization_id
    from public.professionals
    join public.units
      on units.organization_id = professionals.organization_id
     and units.id = p_unit_id
    where professionals.id = p_professional_id
    limit 1;

    if v_organization_id is null then
      raise exception 'Professional and unit must belong to the same organization.'
        using errcode = '23514';
    end if;
  end if;

  if not (
    app_private.current_is_super_admin()
    or (
      v_organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('agenda.configurar')
    )
  ) then
    raise exception 'Not allowed to configure schedules.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.professionals
    join public.units
      on units.organization_id = professionals.organization_id
     and units.id = p_unit_id
    where professionals.organization_id = v_organization_id
      and professionals.id = p_professional_id
  ) then
    raise exception 'Professional and unit must belong to the schedule organization.'
      using errcode = '23514';
  end if;

  if coalesce(p_active, false) and not exists (
    select 1
    from public.professionals
    join public.units
      on units.organization_id = professionals.organization_id
     and units.id = p_unit_id
     and units.active
    where professionals.organization_id = v_organization_id
      and professionals.id = p_professional_id
      and professionals.active
  ) then
    raise exception 'An active schedule requires an active professional and unit.'
      using errcode = '23514';
  end if;

  if char_length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Schedule name is required.' using errcode = '23514';
  end if;

  if coalesce(p_color, '') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid schedule color.' using errcode = '23514';
  end if;

  if p_min_notice_hours is null or p_min_notice_hours not between 0 and 720
    or p_max_days_ahead is null or p_max_days_ahead not between 1 and 365
    or p_cancellation_notice_hours is null
      or p_cancellation_notice_hours not between 0 and 720
    or p_slot_minutes is null or p_slot_minutes not between 5 and 480 then
    raise exception 'Invalid online booking window or slot duration.'
      using errcode = '23514';
  end if;

  if jsonb_typeof(v_availability) <> 'array' then
    raise exception 'Availability must be a JSON array.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_availability) as availability(
      weekday smallint,
      start_time time,
      end_time time
    )
    where availability.weekday is null
      or availability.weekday not between 0 and 6
      or availability.start_time is null
      or availability.end_time is null
      or availability.start_time >= availability.end_time
  ) then
    raise exception 'Every availability period must have a valid weekday and time range.'
      using errcode = '23514';
  end if;

  if exists (
    with availability as (
      select
        row_number() over () as row_id,
        value.weekday,
        value.start_time,
        value.end_time
      from jsonb_to_recordset(v_availability) as value(
        weekday smallint,
        start_time time,
        end_time time
      )
    )
    select 1
    from availability as first_period
    join availability as second_period
      on second_period.weekday = first_period.weekday
     and second_period.row_id > first_period.row_id
     and first_period.start_time < second_period.end_time
     and second_period.start_time < first_period.end_time
  ) then
    raise exception 'Availability periods cannot overlap.' using errcode = '23P01';
  end if;

  if exists (
    select 1
    from unnest(v_procedure_ids) as requested(procedure_id)
    left join public.procedures
      on procedures.organization_id = v_organization_id
     and procedures.id = requested.procedure_id
     and procedures.active
    where requested.procedure_id is null
      or procedures.id is null
  ) then
    raise exception 'Every online procedure must be active and belong to the organization.'
      using errcode = '23514';
  end if;

  if coalesce(p_online_enabled, false)
    and jsonb_array_length(v_availability) = 0 then
    raise exception 'An online schedule requires at least one availability period.'
      using errcode = '23514';
  end if;

  if coalesce(p_online_enabled, false) and not coalesce(p_active, false) then
    raise exception 'An inactive schedule cannot accept online booking.'
      using errcode = '23514';
  end if;

  if coalesce(p_online_enabled, false)
    and cardinality(v_procedure_ids) = 0 then
    raise exception 'An online schedule requires at least one procedure.'
      using errcode = '23514';
  end if;

  if p_schedule_id is not null
    and (
      v_schedule.professional_id is distinct from p_professional_id
      or v_schedule.unit_id is distinct from p_unit_id
    )
    and (
      exists (
        select 1
        from public.appointments
        where organization_id = v_organization_id
          and schedule_id = p_schedule_id
      )
      or exists (
        select 1
        from public.online_booking_requests
        where organization_id = v_organization_id
          and schedule_id = p_schedule_id
      )
    ) then
    raise exception 'Schedule owner cannot change after appointments or online requests exist.'
      using errcode = '23514';
  end if;

  if p_schedule_id is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_organization_id::text || ':' || p_professional_id::text || ':' || p_unit_id::text,
        0
      )
    );

    insert into public.schedules (
      organization_id,
      professional_id,
      unit_id,
      name,
      color,
      active
    ) values (
      v_organization_id,
      p_professional_id,
      p_unit_id,
      trim(p_name),
      p_color,
      coalesce(p_active, false)
    )
    returning id into v_schedule_id;
  else
    v_schedule_id := p_schedule_id;

    update public.schedules
    set professional_id = p_professional_id,
        unit_id = p_unit_id,
        name = trim(p_name),
        color = p_color,
        active = coalesce(p_active, false)
    where organization_id = v_organization_id
      and id = v_schedule_id;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_schedule_id::text,
      0
    )
  );

  insert into public.schedule_online_booking_settings (
    organization_id,
    schedule_id,
    enabled,
    min_notice_hours,
    max_days_ahead,
    cancellation_notice_hours
  ) values (
    v_organization_id,
    v_schedule_id,
    coalesce(p_online_enabled, false),
    p_min_notice_hours,
    p_max_days_ahead,
    p_cancellation_notice_hours
  )
  on conflict (organization_id, schedule_id) do update
  set enabled = excluded.enabled,
      min_notice_hours = excluded.min_notice_hours,
      max_days_ahead = excluded.max_days_ahead,
      cancellation_notice_hours = excluded.cancellation_notice_hours;

  delete from public.schedule_availability
  where organization_id = v_organization_id
    and schedule_id = v_schedule_id;

  insert into public.schedule_availability (
    organization_id,
    schedule_id,
    weekday,
    start_time,
    end_time,
    slot_minutes
  )
  select
    v_organization_id,
    v_schedule_id,
    availability.weekday,
    availability.start_time,
    availability.end_time,
    p_slot_minutes
  from jsonb_to_recordset(v_availability) as availability(
    weekday smallint,
    start_time time,
    end_time time
  );

  delete from public.schedule_online_booking_procedures
  where organization_id = v_organization_id
    and schedule_id = v_schedule_id;

  insert into public.schedule_online_booking_procedures (
    organization_id,
    schedule_id,
    procedure_id
  )
  select
    v_organization_id,
    v_schedule_id,
    requested.procedure_id
  from (
    select distinct procedure_id
    from unnest(v_procedure_ids) as values_table(procedure_id)
  ) as requested;

  return v_schedule_id;
end;
$$;

alter table public.schedule_online_booking_settings enable row level security;
alter table public.schedule_online_booking_procedures enable row level security;

create policy schedule_online_booking_settings_select
on public.schedule_online_booking_settings
for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('agenda.ver')
      or app_private.current_user_has_permission('agenda.configurar')
    )
  )
);

create policy schedule_online_booking_settings_manage
on public.schedule_online_booking_settings
for all to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('agenda.configurar')
  )
)
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('agenda.configurar')
  )
);

create policy schedule_online_booking_procedures_select
on public.schedule_online_booking_procedures
for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('agenda.ver')
      or app_private.current_user_has_permission('agenda.configurar')
    )
  )
);

create policy schedule_online_booking_procedures_manage
on public.schedule_online_booking_procedures
for all to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('agenda.configurar')
  )
)
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('agenda.configurar')
  )
);

revoke all privileges on table public.schedule_online_booking_settings from public, anon;
revoke all privileges on table public.schedule_online_booking_procedures from public, anon;

revoke all on function app_private.seed_online_booking_on_schedule() from public;
revoke all on function app_private.online_booking_slot_is_available(
  uuid, uuid, timestamptz, timestamptz, uuid
) from public;

grant select, insert, update, delete
  on table public.schedule_online_booking_settings
  to authenticated;
grant select, insert, update, delete
  on table public.schedule_online_booking_procedures
  to authenticated;
grant all on table public.schedule_online_booking_settings to service_role;
grant all on table public.schedule_online_booking_procedures to service_role;

revoke all on function public.submit_online_booking_request(
  text, uuid, uuid, timestamptz, text, text, text, text, uuid, text, boolean
) from public;
revoke all on function public.reschedule_online_booking_request(uuid, timestamptz)
  from public;
revoke all on function public.cancel_online_booking_request(uuid, text)
  from public;
revoke all on function public.save_schedule_configuration(
  uuid, uuid, uuid, text, text, boolean, boolean,
  integer, integer, integer, integer, jsonb, uuid[]
) from public;

grant execute on function public.submit_online_booking_request(
  text, uuid, uuid, timestamptz, text, text, text, text, uuid, text, boolean
) to anon, authenticated, service_role;
grant execute on function public.reschedule_online_booking_request(uuid, timestamptz)
  to anon, authenticated, service_role;
grant execute on function public.cancel_online_booking_request(uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.save_schedule_configuration(
  uuid, uuid, uuid, text, text, boolean, boolean,
  integer, integer, integer, integer, jsonb, uuid[]
) to authenticated, service_role;

-- The operational agenda listens for blocks so a new exception disappears
-- from both the internal board and the public portal without a refresh.
do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'schedule_blocks'
  ) then
    execute 'alter publication supabase_realtime add table public.schedule_blocks';
  end if;
end;
$$;

comment on table public.schedule_online_booking_settings is
  'Per-schedule online booking switch, booking horizon and cancellation window.';
comment on table public.schedule_online_booking_procedures is
  'Procedures explicitly offered by each schedule in the public booking portal.';
comment on column public.schedule_online_booking_settings.enabled is
  'Exposes this schedule online only while the organization portal is also enabled.';
comment on function app_private.online_booking_slot_is_available(
  uuid, uuid, timestamptz, timestamptz, uuid
) is
  'Checks explicit recurring availability, blocks, appointments and pending public requests.';
comment on function public.save_schedule_configuration(
  uuid, uuid, uuid, text, text, boolean, boolean,
  integer, integer, integer, integer, jsonb, uuid[]
) is
  'Atomically creates or updates a schedule, its online rules, recurring periods and procedures.';
