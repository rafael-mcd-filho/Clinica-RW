-- Phase 10: online booking entrypoint and patient-facing request flow.

create table public.online_booking_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  public_slug text not null unique check (public_slug ~ '^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$'),
  enabled boolean not null default false,
  require_manual_confirmation boolean not null default true,
  min_notice_hours integer not null default 24 check (min_notice_hours between 0 and 720),
  max_days_ahead integer not null default 30 check (max_days_ahead between 1 and 365),
  cancellation_notice_hours integer not null default 24
    check (cancellation_notice_hours between 0 and 720),
  public_instructions text,
  cancellation_policy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.online_booking_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  schedule_id uuid not null,
  procedure_id uuid not null,
  professional_id uuid not null,
  unit_id uuid not null,
  health_insurance_id uuid,
  patient_id uuid,
  appointment_id uuid,
  requested_start_at timestamptz not null,
  requested_end_at timestamptz not null,
  patient_name text not null,
  patient_email citext,
  patient_phone text,
  patient_cpf text,
  patient_notes text,
  lgpd_consent_at timestamptz not null,
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'rejected', 'cancelled')),
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requested_start_at < requested_end_at),
  check (char_length(trim(patient_name)) >= 2),
  check (patient_email is not null or patient_phone is not null),
  unique (organization_id, id),
  foreign key (organization_id, schedule_id)
    references public.schedules(organization_id, id),
  foreign key (organization_id, procedure_id)
    references public.procedures(organization_id, id),
  foreign key (organization_id, professional_id)
    references public.professionals(organization_id, id),
  foreign key (organization_id, unit_id)
    references public.units(organization_id, id),
  foreign key (organization_id, health_insurance_id)
    references public.health_insurances(organization_id, id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  foreign key (organization_id, appointment_id)
    references public.appointments(organization_id, id),
  foreign key (organization_id, reviewed_by_user_id)
    references public.app_users(organization_id, id) on delete set null (reviewed_by_user_id)
);

create index online_booking_requests_status_idx
  on public.online_booking_requests(organization_id, status, requested_start_at);
create index online_booking_requests_schedule_idx
  on public.online_booking_requests(organization_id, schedule_id, requested_start_at);

create trigger set_online_booking_settings_updated_at
before update on public.online_booking_settings
for each row execute function app_private.set_updated_at();

create trigger set_online_booking_requests_updated_at
before update on public.online_booking_requests
for each row execute function app_private.set_updated_at();

create or replace function app_private.online_booking_default_slug(
  p_organization_id uuid,
  p_name text
)
returns text
language sql
stable
set search_path = pg_catalog
as $$
  with normalized as (
    select nullif(
      left(
        trim(both '-' from regexp_replace(
          lower(coalesce(nullif(trim(p_name), ''), 'clinica')),
          '[^a-z0-9]+',
          '-',
          'g'
        )),
        55
      ),
      ''
    ) as base_slug
  )
  select coalesce(base_slug, 'clinica') || '-' || substring(p_organization_id::text from 1 for 8)
  from normalized;
$$;

create or replace function app_private.seed_online_booking_settings(
  p_organization_id uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_slug text;
begin
  v_slug := app_private.online_booking_default_slug(p_organization_id, p_name);

  if char_length(v_slug) < 4 then
    v_slug := 'clinica-' || substring(p_organization_id::text from 1 for 8);
  end if;

  insert into public.online_booking_settings (organization_id, public_slug)
  values (p_organization_id, v_slug)
  on conflict (organization_id) do nothing;
end;
$$;

create or replace function app_private.seed_online_booking_on_organization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  perform app_private.seed_online_booking_settings(new.id, new.name);
  return new;
end;
$$;

create trigger seed_online_booking_on_organization
after insert on public.organizations
for each row execute function app_private.seed_online_booking_on_organization();

insert into public.online_booking_settings (organization_id, public_slug)
select
  organizations.id,
  app_private.online_booking_default_slug(organizations.id, organizations.name)
from public.organizations
on conflict (organization_id) do nothing;

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

  if exists (
    select 1
    from public.schedule_availability
    where organization_id = p_organization_id
      and schedule_id = p_schedule_id
  ) and not exists (
    select 1
    from public.schedule_availability
    where organization_id = p_organization_id
      and schedule_id = p_schedule_id
      and weekday = extract(dow from v_local_start)::smallint
      and v_local_start::time >= start_time
      and v_local_end::time <= end_time
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
  v_schedule public.schedules%rowtype;
  v_procedure public.procedures%rowtype;
  v_end_at timestamptz;
  v_request_id uuid;
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

  if nullif(trim(coalesce(p_patient_email, '')), '') is null
    and nullif(trim(coalesce(p_patient_phone, '')), '') is null then
    raise exception 'Patient contact is required.' using errcode = '23514';
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
    nullif(trim(p_patient_email), ''),
    nullif(trim(p_patient_phone), ''),
    nullif(trim(p_patient_cpf), ''),
    nullif(trim(p_patient_notes), ''),
    statement_timestamp()
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

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
  v_actor_id uuid;
  v_patient_id uuid;
  v_appointment_id uuid;
begin
  v_actor_id := app_private.current_app_user_id();

  select *
    into v_request
  from public.online_booking_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Online booking request not found.' using errcode = 'P0002';
  end if;

  if v_request.organization_id <> app_private.current_organization_id()
    or not app_private.current_user_has_permission('agenda.criar_agendamento')
    or not app_private.current_user_has_permission('paciente.criar') then
    raise exception 'Not allowed to confirm online booking request.' using errcode = '42501';
  end if;

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

  if nullif(trim(coalesce(v_request.patient_cpf, '')), '') is not null then
    select id
      into v_patient_id
    from public.patients
    where organization_id = v_request.organization_id
      and cpf = v_request.patient_cpf
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
      v_request.patient_cpf,
      v_request.patient_email,
      v_request.patient_phone,
      v_request.patient_phone,
      case
        when v_request.patient_phone is not null then 'whatsapp'
        when v_request.patient_email is not null then 'email'
        else 'none'
      end,
      v_request.patient_email is not null,
      v_request.patient_phone is not null,
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
  v_actor_id uuid;
begin
  v_actor_id := app_private.current_app_user_id();

  select *
    into v_request
  from public.online_booking_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Online booking request not found.' using errcode = 'P0002';
  end if;

  if v_request.organization_id <> app_private.current_organization_id()
    or not (
      app_private.current_user_has_permission('agenda.criar_agendamento')
      or app_private.current_user_has_permission('agenda.editar_agendamento')
    ) then
    raise exception 'Not allowed to reject online booking request.' using errcode = '42501';
  end if;

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

revoke all on function public.submit_online_booking_request(
  text, uuid, uuid, timestamptz, text, text, text, text, uuid, text, boolean
) from public;
revoke all on function public.confirm_online_booking_request(uuid) from public;
revoke all on function public.reject_online_booking_request(uuid, text) from public;

grant execute on function public.submit_online_booking_request(
  text, uuid, uuid, timestamptz, text, text, text, text, uuid, text, boolean
) to anon, authenticated, service_role;
grant execute on function public.confirm_online_booking_request(uuid)
  to authenticated, service_role;
grant execute on function public.reject_online_booking_request(uuid, text)
  to authenticated, service_role;

create or replace function app_private.audit_online_booking_request_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_row jsonb;
  v_actor_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_actor_id := app_private.current_app_user_id();

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    nullif(v_row ->> 'organization_id', '')::uuid,
    v_actor_id,
    'online_booking_request.' || lower(tg_op),
    'online_booking_requests',
    nullif(v_row ->> 'id', '')::uuid,
    jsonb_build_object(
      'status', v_row ->> 'status',
      'schedule_id', v_row ->> 'schedule_id',
      'requested_start_at', v_row ->> 'requested_start_at'
    )
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger audit_online_booking_request_change
after insert or update or delete on public.online_booking_requests
for each row execute function app_private.audit_online_booking_request_change();

alter table public.online_booking_settings enable row level security;
alter table public.online_booking_requests enable row level security;

create policy online_booking_settings_select on public.online_booking_settings
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('agenda.ver')
      or app_private.current_user_has_permission('agenda.configurar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

create policy online_booking_settings_manage on public.online_booking_settings
for update to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('agenda.configurar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('agenda.configurar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

create policy online_booking_requests_select on public.online_booking_requests
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('agenda.ver')
  )
);

grant select, update on public.online_booking_settings to authenticated;
grant select on public.online_booking_requests to authenticated;
grant all on public.online_booking_settings, public.online_booking_requests to service_role;

comment on table public.online_booking_settings is
  'Tenant public booking configuration, including public slug and booking window.';
comment on table public.online_booking_requests is
  'Patient-submitted online booking requests awaiting internal confirmation.';
