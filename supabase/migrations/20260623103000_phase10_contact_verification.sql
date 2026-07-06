-- Phase 10 extension: optional contact verification before public booking.

create extension if not exists pgcrypto with schema extensions;

alter table public.online_booking_settings
  add column require_contact_verification boolean not null default false,
  add column contact_verification_ttl_minutes integer not null default 15
    check (contact_verification_ttl_minutes between 5 and 120);

create table public.online_booking_contact_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_type text not null check (contact_type in ('email', 'phone')),
  destination text not null,
  destination_normalized text not null,
  code_hash text not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id)
);

create index online_booking_contact_verifications_lookup_idx
  on public.online_booking_contact_verifications(
    organization_id,
    contact_type,
    destination_normalized,
    expires_at desc
  );

create or replace function app_private.normalize_online_booking_contact(
  p_contact_type text,
  p_destination text
)
returns text
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_normalized text;
begin
  if p_contact_type = 'email' then
    v_normalized := lower(trim(coalesce(p_destination, '')));
    if v_normalized !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Invalid verification email.' using errcode = '23514';
    end if;
    return v_normalized;
  end if;

  if p_contact_type = 'phone' then
    v_normalized := regexp_replace(coalesce(p_destination, ''), '[^0-9]', '', 'g');
    if char_length(v_normalized) < 10 then
      raise exception 'Invalid verification phone.' using errcode = '23514';
    end if;
    return v_normalized;
  end if;

  raise exception 'Invalid verification contact type.' using errcode = '23514';
end;
$$;

create or replace function app_private.hash_online_booking_verification_code(
  p_verification_id uuid,
  p_code text
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select encode(extensions.digest(p_verification_id::text || ':' || trim(coalesce(p_code, '')), 'sha256'), 'hex');
$$;

create or replace function public.start_online_booking_contact_verification(
  p_public_slug text,
  p_contact_type text,
  p_destination text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_settings public.online_booking_settings%rowtype;
  v_contact_type text;
  v_destination text;
  v_normalized text;
  v_code text;
  v_id uuid;
  v_expires_at timestamptz;
  v_recent_count integer;
begin
  select *
    into v_settings
  from public.online_booking_settings
  where public_slug = lower(trim(p_public_slug))
    and enabled;

  if v_settings.id is null then
    raise exception 'Online booking is not available.' using errcode = '42501';
  end if;

  v_contact_type := lower(trim(coalesce(p_contact_type, '')));
  v_destination := trim(coalesce(p_destination, ''));
  v_normalized := app_private.normalize_online_booking_contact(
    v_contact_type,
    v_destination
  );

  select count(*)
    into v_recent_count
  from public.online_booking_contact_verifications
  where organization_id = v_settings.organization_id
    and contact_type = v_contact_type
    and destination_normalized = v_normalized
    and created_at >= statement_timestamp() - interval '1 hour';

  if v_recent_count >= 5 then
    raise exception 'Verification request limit reached for this contact.'
      using errcode = '23514';
  end if;

  v_id := gen_random_uuid();
  v_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
  v_expires_at := statement_timestamp()
    + make_interval(mins => v_settings.contact_verification_ttl_minutes);

  insert into public.online_booking_contact_verifications (
    id,
    organization_id,
    contact_type,
    destination,
    destination_normalized,
    code_hash,
    expires_at
  ) values (
    v_id,
    v_settings.organization_id,
    v_contact_type,
    v_destination,
    v_normalized,
    app_private.hash_online_booking_verification_code(v_id, v_code),
    v_expires_at
  );

  return jsonb_build_object(
    'verification_id', v_id,
    'expires_at', v_expires_at,
    'delivery_debug_code', v_code
  );
end;
$$;

create or replace function public.verify_online_booking_contact(
  p_verification_id uuid,
  p_code text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_verification public.online_booking_contact_verifications%rowtype;
begin
  select *
    into v_verification
  from public.online_booking_contact_verifications
  where id = p_verification_id
  for update;

  if v_verification.id is null then
    raise exception 'Verification not found.' using errcode = 'P0002';
  end if;

  if v_verification.consumed_at is not null then
    raise exception 'Verification already consumed.' using errcode = '23514';
  end if;

  if v_verification.expires_at < statement_timestamp() then
    raise exception 'Verification expired.' using errcode = '23514';
  end if;

  if v_verification.attempts >= v_verification.max_attempts then
    raise exception 'Verification attempts exceeded.' using errcode = '23514';
  end if;

  update public.online_booking_contact_verifications
  set attempts = attempts + 1
  where id = v_verification.id;

  if v_verification.code_hash <> app_private.hash_online_booking_verification_code(
    v_verification.id,
    p_code
  ) then
    raise exception 'Invalid verification code.' using errcode = '23514';
  end if;

  update public.online_booking_contact_verifications
  set verified_at = statement_timestamp()
  where id = v_verification.id;

  return 'verified';
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
  v_phone_digits := nullif(regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g'), '');
  v_cpf := nullif(regexp_replace(coalesce(p_patient_cpf, ''), '[^0-9]', '', 'g'), '');

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

  if v_verification_id is not null then
    update public.online_booking_contact_verifications
    set consumed_at = statement_timestamp()
    where id = v_verification_id;
  end if;

  return v_request_id;
end;
$$;

revoke all on function public.start_online_booking_contact_verification(text, text, text)
  from public;
revoke all on function public.verify_online_booking_contact(uuid, text)
  from public;

grant execute on function public.start_online_booking_contact_verification(text, text, text)
  to anon, authenticated, service_role;
grant execute on function public.verify_online_booking_contact(uuid, text)
  to anon, authenticated, service_role;

alter table public.online_booking_contact_verifications enable row level security;

revoke all on public.online_booking_contact_verifications from public;
grant all on public.online_booking_contact_verifications to service_role;

comment on table public.online_booking_contact_verifications is
  'Short-lived contact verification challenges for public online booking.';
comment on column public.online_booking_settings.require_contact_verification is
  'When true, public booking requires a verified email or phone code before submission.';
