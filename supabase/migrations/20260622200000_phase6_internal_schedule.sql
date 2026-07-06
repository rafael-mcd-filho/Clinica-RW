-- Phase 6: internal schedules, appointments, blocks and reception workflow.

create extension if not exists btree_gist;

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null,
  unit_id uuid not null,
  name text not null,
  color text not null default '#2563eb' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, professional_id, unit_id),
  foreign key (organization_id, professional_id)
    references public.professionals(organization_id, id) on delete cascade,
  foreign key (organization_id, unit_id)
    references public.units(organization_id, id) on delete cascade
);

create table if not exists public.schedule_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  schedule_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_minutes integer not null default 30 check (slot_minutes between 5 and 480),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time),
  unique (organization_id, id),
  unique (organization_id, schedule_id, weekday, start_time),
  foreign key (organization_id, schedule_id)
    references public.schedules(organization_id, id) on delete cascade
);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  schedule_id uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_at < end_at),
  unique (organization_id, id),
  foreign key (organization_id, schedule_id)
    references public.schedules(organization_id, id) on delete cascade,
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id) on delete set null (created_by_user_id)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  professional_id uuid not null,
  procedure_id uuid not null,
  schedule_id uuid not null,
  unit_id uuid not null,
  room_id uuid,
  health_insurance_id uuid,
  status text not null default 'scheduled'
    check (status in (
      'scheduled', 'confirmed', 'waiting', 'in_progress',
      'attended', 'no_show', 'cancelled'
    )),
  start_at timestamptz not null,
  end_at timestamptz not null,
  notes text,
  is_extra boolean not null default false,
  created_by_user_id uuid,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_at < end_at),
  unique (organization_id, id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  foreign key (organization_id, professional_id)
    references public.professionals(organization_id, id),
  foreign key (organization_id, procedure_id)
    references public.procedures(organization_id, id),
  foreign key (organization_id, schedule_id)
    references public.schedules(organization_id, id),
  foreign key (organization_id, unit_id)
    references public.units(organization_id, id),
  foreign key (organization_id, room_id)
    references public.rooms(organization_id, id),
  foreign key (organization_id, health_insurance_id)
    references public.health_insurances(organization_id, id),
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id) on delete set null (created_by_user_id),
  exclude using gist (
    organization_id with =,
    professional_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('scheduled', 'confirmed', 'waiting', 'in_progress')),
  exclude using gist (
    organization_id with =,
    room_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (
    room_id is not null
    and status in ('scheduled', 'confirmed', 'waiting', 'in_progress')
  )
);

create table if not exists public.appointment_status_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid,
  reason text,
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  foreign key (organization_id, appointment_id)
    references public.appointments(organization_id, id) on delete cascade,
  foreign key (organization_id, actor_user_id)
    references public.app_users(organization_id, id) on delete set null (actor_user_id)
);

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  procedure_id uuid,
  professional_id uuid,
  preferred_period text check (preferred_period in ('morning', 'afternoon', 'evening', 'any')),
  notes text,
  status text not null default 'waiting' check (status in ('waiting', 'contacted', 'scheduled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade,
  foreign key (organization_id, procedure_id)
    references public.procedures(organization_id, id) on delete set null (procedure_id),
  foreign key (organization_id, professional_id)
    references public.professionals(organization_id, id) on delete set null (professional_id)
);

create index if not exists appointments_organization_start_idx on public.appointments(organization_id, start_at);
create index if not exists appointments_patient_idx on public.appointments(patient_id, start_at desc);
create index if not exists appointment_status_events_appointment_idx on public.appointment_status_events(appointment_id, created_at);
create unique index if not exists appointment_status_events_sequence_key on public.appointment_status_events(event_sequence);
create index if not exists schedule_blocks_schedule_idx on public.schedule_blocks(schedule_id, start_at);

create or replace function app_private.validate_appointment_schedule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_schedule public.schedules%rowtype;
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  select *
    into v_schedule
  from public.schedules
  where organization_id = new.organization_id
    and id = new.schedule_id
    and active;

  if v_schedule.id is null then
    raise exception 'Active schedule not found.' using errcode = '23503';
  end if;

  if new.professional_id <> v_schedule.professional_id
    or new.unit_id <> v_schedule.unit_id then
    raise exception 'Professional and unit must match the selected schedule.'
      using errcode = '23514';
  end if;

  if new.room_id is not null and not exists (
    select 1
    from public.rooms
    where organization_id = new.organization_id
      and id = new.room_id
      and unit_id = new.unit_id
      and active
  ) then
    raise exception 'Room must belong to the appointment unit.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.schedule_blocks
    where organization_id = new.organization_id
      and schedule_id = new.schedule_id
      and tstzrange(start_at, end_at, '[)')
        && tstzrange(new.start_at, new.end_at, '[)')
  ) then
    raise exception 'Appointment overlaps a schedule block.'
      using errcode = '23P01';
  end if;

  if not new.is_extra and exists (
    select 1
    from public.schedule_availability
    where organization_id = new.organization_id
      and schedule_id = new.schedule_id
  ) then
    select coalesce(settings.timezone, 'America/Fortaleza')
      into v_timezone
    from public.organization_settings as settings
    where settings.organization_id = new.organization_id;

    v_timezone := coalesce(v_timezone, 'America/Fortaleza');
    v_local_start := new.start_at at time zone v_timezone;
    v_local_end := new.end_at at time zone v_timezone;

    if v_local_start::date <> v_local_end::date or not exists (
      select 1
      from public.schedule_availability
      where organization_id = new.organization_id
        and schedule_id = new.schedule_id
        and weekday = extract(dow from v_local_start)::smallint
        and v_local_start::time >= start_time
        and v_local_end::time <= end_time
    ) then
      raise exception 'Appointment is outside schedule availability.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_appointment_schedule_insert on public.appointments;
create trigger validate_appointment_schedule_insert
before insert on public.appointments
for each row execute function app_private.validate_appointment_schedule();

drop trigger if exists validate_appointment_schedule_update on public.appointments;
create trigger validate_appointment_schedule_update
before update of schedule_id, professional_id, unit_id, room_id, start_at, end_at, is_extra
on public.appointments
for each row execute function app_private.validate_appointment_schedule();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'schedules', 'schedule_availability', 'schedule_blocks', 'appointments',
    'waitlist_entries'
  ] loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'set_' || table_name || '_updated_at', table_name
    );
    execute format(
      'create trigger %I before update on public.%I for each row '
      'execute function app_private.set_updated_at()',
      'set_' || table_name || '_updated_at', table_name
    );
  end loop;
end;
$$;

create or replace function app_private.register_initial_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into public.appointment_status_events (
    organization_id, appointment_id, from_status, to_status, actor_user_id
  ) values (
    new.organization_id, new.id, null, new.status, new.created_by_user_id
  );
  return new;
end;
$$;

drop trigger if exists register_initial_appointment_status on public.appointments;
create trigger register_initial_appointment_status
after insert on public.appointments
for each row execute function app_private.register_initial_appointment_status();

create or replace function app_private.register_appointment_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
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

    insert into public.appointment_status_events (
      organization_id, appointment_id, from_status, to_status,
      actor_user_id, reason
    ) values (
      new.organization_id, new.id, old.status, new.status,
      app_private.current_app_user_id(),
      nullif(current_setting('app.appointment_status_reason', true), '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists register_appointment_status_change on public.appointments;
create trigger register_appointment_status_change
after update of status on public.appointments
for each row execute function app_private.register_appointment_status_change();

create or replace function public.transition_appointment_status(
  p_appointment_id uuid,
  p_to_status text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_appointment public.appointments%rowtype;
begin
  select * into v_appointment from public.appointments where id = p_appointment_id for update;

  if v_appointment.id is null then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;
  if not (
    app_private.current_is_super_admin()
    or (
      v_appointment.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('agenda.editar_agendamento')
    )
  ) then
    raise exception 'Not allowed to change appointment status.' using errcode = '42501';
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
  if not (
    (v_appointment.status = 'scheduled' and p_to_status in ('confirmed', 'waiting', 'no_show', 'cancelled'))
    or (v_appointment.status = 'confirmed' and p_to_status in ('waiting', 'no_show', 'cancelled'))
    or (v_appointment.status = 'waiting' and p_to_status in ('in_progress', 'no_show', 'cancelled'))
    or (v_appointment.status = 'in_progress' and p_to_status in ('attended', 'cancelled'))
  ) then
    raise exception 'Invalid appointment status transition.' using errcode = '23514';
  end if;

  perform set_config(
    'app.appointment_status_reason',
    coalesce(nullif(trim(p_reason), ''), ''),
    true
  );

  update public.appointments
  set status = p_to_status,
      cancelled_at = case when p_to_status = 'cancelled' then now() else cancelled_at end,
      cancellation_reason = case when p_to_status = 'cancelled' then nullif(trim(p_reason), '') else cancellation_reason end
  where id = p_appointment_id;
  perform set_config('app.appointment_status_reason', '', true);
  return p_to_status;
end;
$$;

revoke all on function public.transition_appointment_status(uuid, text, text) from public;
grant execute on function public.transition_appointment_status(uuid, text, text)
  to authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'schedules', 'schedule_availability', 'schedule_blocks', 'appointments',
    'appointment_status_events', 'waitlist_entries'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_select_tenant', table_name
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using ('
      'app_private.current_is_super_admin() or ('
      'organization_id = app_private.current_organization_id() and '
      'app_private.current_user_has_permission(''agenda.ver'')))',
      table_name || '_select_tenant', table_name
    );
  end loop;
end;
$$;

drop policy if exists schedules_manage_tenant on public.schedules;
drop policy if exists schedule_availability_manage_tenant on public.schedule_availability;
drop policy if exists schedule_blocks_manage_tenant on public.schedule_blocks;
drop policy if exists appointments_insert_tenant on public.appointments;
drop policy if exists appointments_update_tenant on public.appointments;
drop policy if exists appointment_status_events_insert_actor on public.appointment_status_events;
drop policy if exists waitlist_manage_tenant on public.waitlist_entries;

create policy schedules_manage_tenant on public.schedules for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('agenda.configurar')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('agenda.configurar')
  )
);

create policy schedule_availability_manage_tenant on public.schedule_availability for all to authenticated
using (app_private.current_is_super_admin() or (organization_id = app_private.current_organization_id() and app_private.current_user_has_permission('agenda.configurar')))
with check (app_private.current_is_super_admin() or (organization_id = app_private.current_organization_id() and app_private.current_user_has_permission('agenda.configurar')));

create policy schedule_blocks_manage_tenant on public.schedule_blocks for all to authenticated
using (app_private.current_is_super_admin() or (organization_id = app_private.current_organization_id() and app_private.current_user_has_permission('agenda.bloquear_horario')))
with check (app_private.current_is_super_admin() or (organization_id = app_private.current_organization_id() and app_private.current_user_has_permission('agenda.bloquear_horario')));

create policy appointments_insert_tenant on public.appointments for insert to authenticated
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('agenda.criar_agendamento')
    and (not is_extra or app_private.current_user_has_permission('agenda.encaixar'))
  )
);

create policy appointments_update_tenant on public.appointments for update to authenticated
using (app_private.current_is_super_admin() or (organization_id = app_private.current_organization_id() and app_private.current_user_has_permission('agenda.editar_agendamento')))
with check (app_private.current_is_super_admin() or organization_id = app_private.current_organization_id());

create policy waitlist_manage_tenant on public.waitlist_entries for all to authenticated
using (app_private.current_is_super_admin() or (organization_id = app_private.current_organization_id() and app_private.current_user_has_permission('agenda.criar_agendamento')))
with check (app_private.current_is_super_admin() or (organization_id = app_private.current_organization_id() and app_private.current_user_has_permission('agenda.criar_agendamento')));

grant select, insert, update, delete on
  public.schedules, public.schedule_availability, public.schedule_blocks,
  public.appointments, public.waitlist_entries
to authenticated;
revoke insert, update, delete on public.appointment_status_events from authenticated;
grant select on public.appointment_status_events to authenticated;
grant all on
  public.schedules, public.schedule_availability, public.schedule_blocks,
  public.appointments, public.appointment_status_events, public.waitlist_entries
to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'appointments'
  ) then
    execute 'alter publication supabase_realtime add table public.appointments';
  end if;
end;
$$;

comment on table public.appointments is 'Tenant-scoped internal appointments with conflict prevention.';
comment on function public.transition_appointment_status(uuid, text, text) is
  'Atomically changes appointment status and appends a status event.';
