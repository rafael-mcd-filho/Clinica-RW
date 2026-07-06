-- Phase 4: tenant onboarding, facilities, professionals and service catalog.

-- This migration may have been partially executed through the SQL editor before
-- being applied by the CLI. Keep object creation idempotent so db push can
-- safely finish and register it in the migration history.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'app_users_organization_id_id_key'
      and conrelid = 'public.app_users'::regclass
  ) then
    alter table public.app_users
      add constraint app_users_organization_id_id_key
      unique (organization_id, id);
  end if;
end;
$$;

create table if not exists public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  timezone text not null default 'America/Fortaleza',
  locale text not null default 'pt-BR',
  automatic_mode boolean not null default true,
  retention_policy_key text not null default 'standard',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  trade_name text not null,
  legal_name text,
  document text,
  phone text,
  email citext,
  postal_code text,
  address_line text,
  address_number text,
  address_complement text,
  district text,
  city text,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  phone text,
  email citext,
  postal_code text,
  address_line text,
  address_number text,
  address_complement text,
  district text,
  city text,
  state text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, unit_id, name),
  foreign key (organization_id, unit_id)
    references public.units(organization_id, id) on delete cascade
);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, unit_id)
    references public.units(organization_id, id) on delete set null (unit_id)
);

create table if not exists public.specialties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  cbo_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid,
  specialty_id uuid,
  name text not null,
  council_type text,
  council_number text,
  council_state text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, user_id),
  foreign key (organization_id, user_id)
    references public.app_users(organization_id, id) on delete set null (user_id),
  foreign key (organization_id, specialty_id)
    references public.specialties(organization_id, id) on delete set null (specialty_id)
);

create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  duration_minutes integer not null default 30
    check (duration_minutes between 5 and 1440),
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table if not exists public.health_insurances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  document text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table if not exists public.price_tables (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  health_insurance_id uuid,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name),
  foreign key (organization_id, health_insurance_id)
    references public.health_insurances(organization_id, id)
      on delete set null (health_insurance_id)
);

create table if not exists public.price_table_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  price_table_id uuid not null,
  procedure_id uuid not null,
  price numeric(12,2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, price_table_id, procedure_id),
  foreign key (organization_id, price_table_id)
    references public.price_tables(organization_id, id) on delete cascade,
  foreign key (organization_id, procedure_id)
    references public.procedures(organization_id, id) on delete cascade
);

create table if not exists public.business_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid,
  professional_id uuid,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (start_time < end_time),
  check (num_nonnulls(unit_id, professional_id) <= 1),
  foreign key (organization_id, unit_id)
    references public.units(organization_id, id) on delete cascade,
  foreign key (organization_id, professional_id)
    references public.professionals(organization_id, id) on delete cascade
);

create unique index if not exists business_hours_clinic_weekday_key
  on public.business_hours (organization_id, weekday)
  where unit_id is null and professional_id is null;

create unique index if not exists business_hours_unit_weekday_key
  on public.business_hours (organization_id, unit_id, weekday)
  where unit_id is not null and professional_id is null;

create unique index if not exists business_hours_professional_weekday_key
  on public.business_hours (organization_id, professional_id, weekday)
  where professional_id is not null and unit_id is null;

create index if not exists rooms_unit_id_idx on public.rooms(unit_id);
create index if not exists equipment_unit_id_idx on public.equipment(unit_id);
create index if not exists professionals_specialty_id_idx on public.professionals(specialty_id);
create index if not exists price_table_items_price_table_id_idx on public.price_table_items(price_table_id);
create index if not exists business_hours_organization_id_idx on public.business_hours(organization_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organization_settings', 'clinics', 'units', 'rooms', 'equipment',
    'specialties', 'professionals', 'procedures', 'health_insurances',
    'price_tables', 'price_table_items', 'business_hours'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'set_' || table_name || '_updated_at',
      table_name
    );
    execute format(
      'create trigger %I before update on public.%I '
      'for each row execute function app_private.set_updated_at()',
      'set_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end;
$$;

create or replace function app_private.seed_organization_phase4_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  insert into public.organization_settings (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  insert into public.clinics (
    organization_id,
    trade_name,
    legal_name,
    document,
    phone,
    email
  )
  values (
    new.id,
    new.name,
    new.legal_name,
    new.document,
    new.phone,
    new.email
  )
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

insert into public.organization_settings (organization_id)
select organizations.id from public.organizations
on conflict (organization_id) do nothing;

insert into public.clinics (
  organization_id,
  trade_name,
  legal_name,
  document,
  phone,
  email
)
select id, name, legal_name, document, phone, email
from public.organizations
on conflict (organization_id) do nothing;

drop trigger if exists seed_organization_phase4_defaults on public.organizations;

create trigger seed_organization_phase4_defaults
after insert on public.organizations
for each row execute function app_private.seed_organization_phase4_defaults();

create or replace function app_private.sync_organization_mode()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_organization_id uuid;
  v_active_professionals integer;
  v_automatic_mode boolean;
begin
  v_organization_id := coalesce(new.organization_id, old.organization_id);

  select automatic_mode
    into v_automatic_mode
  from public.organization_settings
  where organization_id = v_organization_id;

  if coalesce(v_automatic_mode, true) then
    select count(*)
      into v_active_professionals
    from public.professionals
    where organization_id = v_organization_id
      and active;

    update public.organizations
    set mode = case when v_active_professionals > 1 then 'clinic' else 'solo' end
    where id = v_organization_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_organization_mode_insert_delete on public.professionals;
drop trigger if exists sync_organization_mode_update on public.professionals;

create trigger sync_organization_mode_insert_delete
after insert or delete on public.professionals
for each row execute function app_private.sync_organization_mode();

create trigger sync_organization_mode_update
after update of active on public.professionals
for each row execute function app_private.sync_organization_mode();

create or replace function app_private.audit_phase4_change()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_row jsonb;
  v_actor_id uuid;
  v_resource_id uuid;
  v_organization_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_actor_id := app_private.current_app_user_id();
  v_resource_id := nullif(v_row ->> 'id', '')::uuid;
  v_organization_id := nullif(v_row ->> 'organization_id', '')::uuid;

  if v_actor_id is not null then
    insert into public.audit_logs (
      organization_id,
      actor_user_id,
      action,
      resource_type,
      resource_id,
      metadata
    )
    values (
      v_organization_id,
      v_actor_id,
      lower(tg_table_name) || '.' || lower(tg_op),
      tg_table_name,
      v_resource_id,
      jsonb_build_object('name', v_row ->> 'name')
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organization_settings', 'clinics', 'units', 'rooms', 'equipment',
    'specialties', 'professionals', 'procedures', 'health_insurances',
    'price_tables', 'price_table_items', 'business_hours'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'audit_' || table_name || '_change',
      table_name
    );
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function app_private.audit_phase4_change()',
      'audit_' || table_name || '_change',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organization_settings', 'clinics', 'units', 'rooms', 'equipment',
    'specialties', 'professionals', 'procedures', 'health_insurances',
    'price_tables', 'price_table_items', 'business_hours'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);

    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_select_tenant',
      table_name
    );
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_insert_config_admin',
      table_name
    );
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_update_config_admin',
      table_name
    );
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_delete_config_admin',
      table_name
    );

    execute format(
      'create policy %I on public.%I for select to authenticated '
      'using (app_private.can_access_organization(organization_id))',
      table_name || '_select_tenant',
      table_name
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated '
      'with check (app_private.current_is_super_admin() or '
      '(organization_id = app_private.current_organization_id() and '
      'app_private.current_user_has_permission(''config.geral'')))',
      table_name || '_insert_config_admin',
      table_name
    );

    execute format(
      'create policy %I on public.%I for update to authenticated '
      'using (app_private.current_is_super_admin() or '
      '(organization_id = app_private.current_organization_id() and '
      'app_private.current_user_has_permission(''config.geral''))) '
      'with check (app_private.current_is_super_admin() or '
      '(organization_id = app_private.current_organization_id() and '
      'app_private.current_user_has_permission(''config.geral'')))',
      table_name || '_update_config_admin',
      table_name
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated '
      'using (app_private.current_is_super_admin() or '
      '(organization_id = app_private.current_organization_id() and '
      'app_private.current_user_has_permission(''config.geral'')))',
      table_name || '_delete_config_admin',
      table_name
    );

    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

create or replace function public.complete_organization_onboarding(
  p_organization_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_completed_at timestamptz;
begin
  if not (
    app_private.current_is_super_admin()
    or (
      p_organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('config.geral')
    )
  ) then
    raise exception 'Not allowed to complete onboarding.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.clinics
    where organization_id = p_organization_id
      and nullif(trim(trade_name), '') is not null
  ) or not exists (
    select 1 from public.units
    where organization_id = p_organization_id and active
  ) or not exists (
    select 1 from public.professionals
    where organization_id = p_organization_id and active
  ) or not exists (
    select 1 from public.procedures
    where organization_id = p_organization_id and active
  ) or not exists (
    select 1 from public.business_hours
    where organization_id = p_organization_id and active
  ) then
    raise exception 'Complete clinic, unit, professional, procedure and business hours first.'
      using errcode = '23514';
  end if;

  update public.organization_settings
  set onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where organization_id = p_organization_id
  returning onboarding_completed_at into v_completed_at;

  return v_completed_at;
end;
$$;

revoke all on function public.complete_organization_onboarding(uuid) from public;
grant execute on function public.complete_organization_onboarding(uuid) to authenticated, service_role;

create or replace function public.replace_clinic_business_hours(
  p_organization_id uuid,
  p_hours jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not (
    app_private.current_is_super_admin()
    or (
      p_organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('config.geral')
    )
  ) then
    raise exception 'Not allowed to change business hours.' using errcode = '42501';
  end if;

  delete from public.business_hours
  where organization_id = p_organization_id
    and unit_id is null
    and professional_id is null;

  insert into public.business_hours (
    organization_id,
    weekday,
    start_time,
    end_time,
    active
  )
  select
    p_organization_id,
    value.weekday,
    value.start_time,
    value.end_time,
    true
  from jsonb_to_recordset(p_hours) as value(
    weekday smallint,
    start_time time,
    end_time time
  );
end;
$$;

revoke all on function public.replace_clinic_business_hours(uuid, jsonb) from public;
grant execute on function public.replace_clinic_business_hours(uuid, jsonb)
  to authenticated, service_role;

comment on table public.organization_settings is 'Tenant-wide locale, mode and onboarding settings.';
comment on table public.clinics is 'Institutional and contact data for a tenant clinic.';
comment on table public.business_hours is 'Recurring opening hours for clinic, unit or professional.';
comment on function public.complete_organization_onboarding(uuid) is
  'Marks Phase 4 onboarding complete after required base records exist.';
comment on function public.replace_clinic_business_hours(uuid, jsonb) is
  'Atomically replaces recurring clinic-wide opening hours.';
