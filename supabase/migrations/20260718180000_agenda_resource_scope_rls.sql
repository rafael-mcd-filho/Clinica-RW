-- Enforce agenda data scopes in the database, independently from UI filters.
--
-- Effective scope rules:
--   * Super Admin keeps the existing unrestricted support access.
--   * An active professional link provides a baseline scope over that
--     professional's own resources. An inactive link provides no implicit
--     access and never falls back to whole-organization access.
--   * Unlinked users always need an explicit scope. Legacy team operators are
--     backfilled below so removing a professional link can never turn an own-
--     agenda account into an organization-wide account.
--   * A NULL resource_id means every resource of that resource_type.
--   * read allows reads; write allows reads and writes; full allows both and is
--     reserved for future resource-administration distinctions.

-- Remove rows that could never be valid tenant assignments before adding the
-- composite tenant foreign key. These rows cannot legitimately grant access.
delete from public.resource_scopes as scopes
where not exists (
  select 1
  from public.app_users as users
  where users.organization_id = scopes.organization_id
    and users.id = scopes.user_id
);

-- Remove stale or cross-tenant polymorphic references. NULL remains the
-- documented "all resources of this type" representation.
delete from public.resource_scopes as scopes
where scopes.resource_id is not null
  and not (
    (scopes.resource_type = 'agenda' and exists (
      select 1
      from public.schedules
      where schedules.organization_id = scopes.organization_id
        and schedules.id = scopes.resource_id
    ))
    or (scopes.resource_type = 'profissional' and exists (
      select 1
      from public.professionals
      where professionals.organization_id = scopes.organization_id
        and professionals.id = scopes.resource_id
    ))
    or (scopes.resource_type = 'unidade' and exists (
      select 1
      from public.units
      where units.organization_id = scopes.organization_id
        and units.id = scopes.resource_id
    ))
    or (scopes.resource_type = 'especialidade' and exists (
      select 1
      from public.specialties
      where specialties.organization_id = scopes.organization_id
        and specialties.id = scopes.resource_id
    ))
  );

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.resource_scopes'::regclass
      and conname = 'resource_scopes_organization_user_fk'
  ) then
    alter table public.resource_scopes
      add constraint resource_scopes_organization_user_fk
      foreign key (organization_id, user_id)
      references public.app_users(organization_id, id)
      on update cascade
      on delete cascade;
  end if;
end;
$$;

-- A resource has one effective level per user. Collapse legacy duplicates to
-- the strongest level before enforcing that representation, including broad
-- (NULL resource_id) rows.
delete from public.resource_scopes as duplicate_scope
using public.resource_scopes as retained_scope
where duplicate_scope.user_id = retained_scope.user_id
  and duplicate_scope.resource_type = retained_scope.resource_type
  and duplicate_scope.resource_id is not distinct from retained_scope.resource_id
  and (
    case duplicate_scope.access_level
      when 'full' then 3
      when 'write' then 2
      else 1
    end < case retained_scope.access_level
      when 'full' then 3
      when 'write' then 2
      else 1
    end
    or (
      duplicate_scope.access_level = retained_scope.access_level
      and duplicate_scope.id > retained_scope.id
    )
  );

drop index if exists public.resource_scopes_null_resource_key;
create unique index if not exists resource_scopes_resource_key
  on public.resource_scopes(user_id, resource_type, resource_id)
  nulls not distinct;

create index if not exists resource_scopes_user_access_idx
  on public.resource_scopes(organization_id, user_id, access_level, resource_type);

create or replace function app_private.validate_resource_scope_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not exists (
    select 1
    from public.app_users as users
    where users.organization_id = new.organization_id
      and users.id = new.user_id
      and not users.is_super_admin
  ) then
    raise exception 'Scope user must belong to the selected organization.'
      using errcode = '23503';
  end if;

  if new.resource_id is null then
    return new;
  end if;

  if not (
    (new.resource_type = 'agenda' and exists (
      select 1 from public.schedules
      where schedules.organization_id = new.organization_id
        and schedules.id = new.resource_id
    ))
    or (new.resource_type = 'profissional' and exists (
      select 1 from public.professionals
      where professionals.organization_id = new.organization_id
        and professionals.id = new.resource_id
    ))
    or (new.resource_type = 'unidade' and exists (
      select 1 from public.units
      where units.organization_id = new.organization_id
        and units.id = new.resource_id
    ))
    or (new.resource_type = 'especialidade' and exists (
      select 1 from public.specialties
      where specialties.organization_id = new.organization_id
        and specialties.id = new.resource_id
    ))
  ) then
    raise exception 'Scope resource must belong to the selected organization and type.'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_resource_scope_tenant
  on public.resource_scopes;
create trigger validate_resource_scope_tenant
before insert or update of organization_id, user_id, resource_type, resource_id
on public.resource_scopes
for each row execute function app_private.validate_resource_scope_tenant();

revoke all on function app_private.validate_resource_scope_tenant() from public;

-- Preserve access for existing unlinked reception/operations/report accounts
-- by making their previous organization-wide behavior explicit. This runs only
-- for users without any existing scope; a partially scoped account is left
-- untouched. Linked professionals (including inactive links) are never
-- broadened by this compatibility backfill.
insert into public.resource_scopes (
  organization_id,
  user_id,
  resource_type,
  resource_id,
  access_level
)
select users.organization_id,
       users.id,
       resource_types.resource_type,
       null,
       'full'
from public.app_users as users
cross join (
  values ('agenda'), ('profissional'), ('unidade'), ('especialidade')
) as resource_types(resource_type)
where users.organization_id is not null
  and not users.is_super_admin
  and not exists (
    select 1
    from public.professionals as professionals
    where professionals.organization_id = users.organization_id
      and professionals.user_id = users.id
  )
  and not exists (
    select 1
    from public.resource_scopes as existing_scopes
    where existing_scopes.organization_id = users.organization_id
      and existing_scopes.user_id = users.id
  )
  and exists (
    select 1
    from app_private.user_permission_codes(users.id) as permission_codes(code)
    where permission_codes.code in (
      'agenda.ver',
      'agenda.criar_agendamento',
      'agenda.editar_agendamento',
      'agenda.cancelar_agendamento',
      'agenda.encaixar',
      'agenda.bloquear_horario',
      'agenda.configurar',
      'relatorio.operacional',
      'relatorio.financeiro',
      'relatorio.clinico'
    )
  )
on conflict do nothing;

-- Users may only receive profiles cloned/created inside their organization.
-- Global system profiles are templates and must never be assigned directly.
delete from public.user_profiles as assignments
using public.app_users as users, public.profiles as profiles
where users.id = assignments.user_id
  and profiles.id = assignments.profile_id
  and (
    users.organization_id is null
    or profiles.organization_id is null
    or profiles.organization_id <> users.organization_id
  );

create or replace function app_private.validate_user_profile_tenant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_user_organization_id uuid;
  v_profile_organization_id uuid;
begin
  select organization_id
    into v_user_organization_id
  from public.app_users
  where id = new.user_id;

  select organization_id
    into v_profile_organization_id
  from public.profiles
  where id = new.profile_id;

  if v_user_organization_id is null
    or v_profile_organization_id is null
    or v_profile_organization_id <> v_user_organization_id then
    raise exception 'User and profile must belong to the same organization.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_user_profile_tenant on public.user_profiles;
create trigger validate_user_profile_tenant
before insert or update of user_id, profile_id on public.user_profiles
for each row execute function app_private.validate_user_profile_tenant();

revoke all on function app_private.validate_user_profile_tenant() from public;

-- Protect the identity boundary that backs every tenant/profile/scope check.
-- Direct self-service is limited to display fields. Access managers can manage
-- ordinary tenant-user details and status, but only a trusted backend or Super
-- Admin may change authentication linkage, tenant membership, or SaaS role.
create or replace function app_private.enforce_app_user_sensitive_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
declare
  v_is_trusted_backend boolean;
begin
  v_is_trusted_backend := auth.uid() is null
    or coalesce(auth.role(), '') = 'service_role';

  if v_is_trusted_backend or app_private.current_is_super_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_super_admin or new.auth_user_id is not null then
      raise exception 'Tenant clients cannot create privileged or authentication-linked users directly.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if app_private.current_user_has_permission('config.usuarios') then
    if new.id is distinct from old.id
      or new.organization_id is distinct from old.organization_id
      or new.auth_user_id is distinct from old.auth_user_id
      or new.is_super_admin is distinct from old.is_super_admin
      or new.email is distinct from old.email
      or new.created_at is distinct from old.created_at then
      raise exception 'Tenant access managers cannot change protected user identity fields.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.id = app_private.current_app_user_id() then
    if new.id is distinct from old.id
      or new.organization_id is distinct from old.organization_id
      or new.auth_user_id is distinct from old.auth_user_id
      or new.status is distinct from old.status
      or new.is_super_admin is distinct from old.is_super_admin
      or new.email is distinct from old.email
      or new.created_at is distinct from old.created_at then
      raise exception 'Self-service cannot change protected user identity or access fields.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Not allowed to change this user.' using errcode = '42501';
end;
$$;

drop trigger if exists enforce_app_user_sensitive_changes
  on public.app_users;
create trigger enforce_app_user_sensitive_changes
before insert or update on public.app_users
for each row execute function app_private.enforce_app_user_sensitive_changes();

revoke all on function app_private.enforce_app_user_sensitive_changes()
  from public;

-- Linking a professional to a login changes that login's implicit agenda and
-- clinical ownership. config.geral alone may edit professional demographics,
-- but config.usuarios is required to set, replace, or remove this link.
create or replace function app_private.enforce_professional_user_link_manager()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
declare
  v_link_is_changing boolean;
  v_is_trusted_backend boolean;
begin
  v_link_is_changing :=
    (tg_op = 'INSERT' and new.user_id is not null)
    or (tg_op = 'UPDATE' and new.user_id is distinct from old.user_id);

  if not v_link_is_changing then
    return new;
  end if;

  v_is_trusted_backend := auth.uid() is null
    or coalesce(auth.role(), '') = 'service_role';

  if v_is_trusted_backend
    or app_private.current_is_super_admin()
    or app_private.current_user_has_permission('config.usuarios') then
    return new;
  end if;

  raise exception 'Only access managers can change a professional user link.'
    using errcode = '42501';
end;
$$;

drop trigger if exists enforce_professional_user_link_manager
  on public.professionals;
create trigger enforce_professional_user_link_manager
before insert or update of user_id on public.professionals
for each row execute function app_private.enforce_professional_user_link_manager();

revoke all on function app_private.enforce_professional_user_link_manager()
  from public;

-- Scope assignments are access-control metadata, not a tenant-wide directory.
drop policy if exists "resource_scopes_select_same_org"
  on public.resource_scopes;
create policy "resource_scopes_select_same_org"
on public.resource_scopes for select
to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      user_id = app_private.current_app_user_id()
      or app_private.current_user_has_permission('config.usuarios')
    )
  )
);

-- A tenant manager can customize only non-default profiles. Tenant default
-- profiles are protected; Super Admin semantics remain unchanged.
drop policy if exists "profiles_update_access_managers" on public.profiles;
create policy "profiles_update_access_managers"
on public.profiles for update
to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and not is_system_default
    and app_private.current_user_has_permission('config.usuarios')
  )
)
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and not is_system_default
    and app_private.current_user_has_permission('config.usuarios')
  )
);

drop policy if exists "profile_permissions_manage_access_managers"
  on public.profile_permissions;
create policy "profile_permissions_manage_access_managers"
on public.profile_permissions for all
to authenticated
using (
  exists (
    select 1
    from public.profiles as profiles
    where profiles.id = profile_id
      and (
        app_private.current_is_super_admin()
        or (
          profiles.organization_id = app_private.current_organization_id()
          and not profiles.is_system_default
          and app_private.current_user_has_permission('config.usuarios')
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles as profiles
    where profiles.id = profile_id
      and (
        app_private.current_is_super_admin()
        or (
          profiles.organization_id = app_private.current_organization_id()
          and not profiles.is_system_default
          and app_private.current_user_has_permission('config.usuarios')
        )
      )
  )
);

drop policy if exists "user_profiles_manage_access_managers"
  on public.user_profiles;
create policy "user_profiles_manage_access_managers"
on public.user_profiles for all
to authenticated
using (
  app_private.current_is_super_admin()
  or exists (
    select 1
    from public.app_users as users
    join public.profiles as profiles
      on profiles.id = profile_id
     and profiles.organization_id = users.organization_id
    where users.id = user_id
      and users.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('config.usuarios')
  )
)
with check (
  app_private.current_is_super_admin()
  or exists (
    select 1
    from public.app_users as users
    join public.profiles as profiles
      on profiles.id = profile_id
     and profiles.organization_id = users.organization_id
    where users.id = user_id
      and users.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('config.usuarios')
  )
);

create or replace function app_private.current_user_can_access_agenda_resource(
  p_organization_id uuid,
  p_schedule_id uuid,
  p_professional_id uuid,
  p_unit_id uuid,
  p_required_access text default 'read'
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_user_id uuid;
  v_linked_professional_id uuid;
  v_linked_professional_active boolean;
  v_specialty_id uuid;
  v_has_explicit_scopes boolean;
  v_matches_explicit_scope boolean;
begin
  if app_private.current_is_super_admin() then
    return true;
  end if;

  if p_required_access is null
    or p_required_access not in ('read', 'write', 'full')
    or p_organization_id is null
    or p_organization_id <> app_private.current_organization_id() then
    return false;
  end if;

  v_user_id := app_private.current_app_user_id();
  if v_user_id is null then
    return false;
  end if;

  -- Organization access administrators intentionally remain organization-wide,
  -- even when the owner also happens to be a linked professional.
  if app_private.current_user_has_permission('config.geral')
    or app_private.current_user_has_permission('config.usuarios') then
    return true;
  end if;

  select professionals.id, professionals.active
    into v_linked_professional_id, v_linked_professional_active
  from public.professionals
  where professionals.organization_id = p_organization_id
    and professionals.user_id = v_user_id
  limit 1;

  if p_professional_id is not null then
    select professionals.specialty_id
      into v_specialty_id
    from public.professionals
    where professionals.organization_id = p_organization_id
      and professionals.id = p_professional_id;
  end if;

  -- The own-professional baseline applies to reads and writes. The action's
  -- ordinary permission policy still decides whether the operation is legal.
  if coalesce(v_linked_professional_active, false)
    and p_professional_id = v_linked_professional_id then
    return true;
  end if;

  select exists (
    select 1
    from public.resource_scopes as scopes
    where scopes.organization_id = p_organization_id
      and scopes.user_id = v_user_id
  ) into v_has_explicit_scopes;

  if v_has_explicit_scopes then
    select exists (
      select 1
      from public.resource_scopes as scopes
      where scopes.organization_id = p_organization_id
        and scopes.user_id = v_user_id
        and (
          (p_required_access = 'read'
            and scopes.access_level in ('read', 'write', 'full'))
          or (p_required_access = 'write'
            and scopes.access_level in ('write', 'full'))
          or (p_required_access = 'full'
            and scopes.access_level = 'full')
        )
        and case scopes.resource_type
          when 'agenda' then
            scopes.resource_id is null
            or (p_schedule_id is not null and scopes.resource_id = p_schedule_id)
          when 'profissional' then
            p_professional_id is not null
            and (scopes.resource_id is null or scopes.resource_id = p_professional_id)
          when 'unidade' then
            p_unit_id is not null
            and (scopes.resource_id is null or scopes.resource_id = p_unit_id)
          when 'especialidade' then
            v_specialty_id is not null
            and (scopes.resource_id is null or scopes.resource_id = v_specialty_id)
          else false
        end
    ) into v_matches_explicit_scope;

    return v_matches_explicit_scope;
  end if;

  -- A link is remembered even while inactive. This prevents deactivation (or
  -- a temporarily inactive professional record) from escalating to all data.
  if v_linked_professional_id is not null then
    return false;
  end if;

  -- Existing team operators received explicit broad scopes above. Requiring an
  -- explicit scope here prevents unlinking a professional from escalating an
  -- own-agenda account to the entire organization.
  return false;
end;
$$;

create or replace function app_private.current_user_can_access_schedule(
  p_organization_id uuid,
  p_schedule_id uuid,
  p_required_access text default 'read'
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_professional_id uuid;
  v_unit_id uuid;
begin
  select schedules.professional_id, schedules.unit_id
    into v_professional_id, v_unit_id
  from public.schedules
  where schedules.organization_id = p_organization_id
    and schedules.id = p_schedule_id;

  if not found then
    return false;
  end if;

  return app_private.current_user_can_access_agenda_resource(
    p_organization_id,
    p_schedule_id,
    v_professional_id,
    v_unit_id,
    p_required_access
  );
end;
$$;

create or replace function app_private.current_user_can_access_appointment(
  p_organization_id uuid,
  p_appointment_id uuid,
  p_required_access text default 'read'
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_schedule_id uuid;
  v_professional_id uuid;
  v_unit_id uuid;
begin
  select appointments.schedule_id,
         appointments.professional_id,
         appointments.unit_id
    into v_schedule_id, v_professional_id, v_unit_id
  from public.appointments
  where appointments.organization_id = p_organization_id
    and appointments.id = p_appointment_id;

  if not found then
    return false;
  end if;

  return app_private.current_user_can_access_agenda_resource(
    p_organization_id,
    v_schedule_id,
    v_professional_id,
    v_unit_id,
    p_required_access
  );
end;
$$;

revoke all on function app_private.current_user_can_access_agenda_resource(
  uuid, uuid, uuid, uuid, text
) from public;
revoke all on function app_private.current_user_can_access_schedule(
  uuid, uuid, text
) from public;
revoke all on function app_private.current_user_can_access_appointment(
  uuid, uuid, text
) from public;

grant execute on function app_private.current_user_can_access_agenda_resource(
  uuid, uuid, uuid, uuid, text
) to authenticated, service_role;
grant execute on function app_private.current_user_can_access_schedule(
  uuid, uuid, text
) to authenticated, service_role;
grant execute on function app_private.current_user_can_access_appointment(
  uuid, uuid, text
) to authenticated, service_role;

comment on function app_private.current_user_can_access_agenda_resource(
  uuid, uuid, uuid, uuid, text
) is 'Enforces own-professional defaults and explicit schedule, professional, unit, and specialty scopes.';

-- A schedule-specific grant authorizes edits to that schedule, but it must not
-- be reusable to move the schedule under an out-of-scope professional or unit.
-- The public configuration RPC performs the same destination check; this
-- trigger closes the equivalent direct-table path available to authenticated
-- clients.
create or replace function app_private.enforce_schedule_resource_reassignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, auth
as $$
begin
  if new.organization_id is not distinct from old.organization_id
    and new.professional_id is not distinct from old.professional_id
    and new.unit_id is not distinct from old.unit_id then
    return new;
  end if;

  if auth.uid() is null
    or coalesce(auth.role(), '') = 'service_role'
    or app_private.current_is_super_admin() then
    return new;
  end if;

  if not app_private.current_user_can_access_agenda_resource(
    new.organization_id,
    null,
    new.professional_id,
    new.unit_id,
    'write'
  ) then
    raise exception 'Not allowed to reassign schedule outside the destination resource scope.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_schedule_resource_reassignment
  on public.schedules;
create trigger enforce_schedule_resource_reassignment
before update of organization_id, professional_id, unit_id
on public.schedules
for each row execute function app_private.enforce_schedule_resource_reassignment();

revoke all on function app_private.enforce_schedule_resource_reassignment()
  from public;

-- Restrictive policies are intentional. PostgreSQL ORs permissive policies,
-- including the report policies added later in the original migration chain;
-- these restrictive policies AND the resource scope with every such path.

-- schedules
-- Access managers need schedule identifiers to configure resource scopes even
-- when their custom profile does not include agenda.ver. This policy exposes
-- schedule metadata only; appointment access still needs agenda/report rights.
drop policy if exists schedules_select_access_managers on public.schedules;
create policy schedules_select_access_managers on public.schedules
for select to authenticated
using (
  organization_id = app_private.current_organization_id()
  and app_private.current_user_has_permission('config.usuarios')
);

drop policy if exists schedules_enforce_scope_select on public.schedules;
create policy schedules_enforce_scope_select on public.schedules
as restrictive for select to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id, id, professional_id, unit_id, 'read'
));

drop policy if exists schedules_enforce_scope_insert on public.schedules;
create policy schedules_enforce_scope_insert on public.schedules
as restrictive for insert to authenticated
with check (app_private.current_user_can_access_agenda_resource(
  organization_id, id, professional_id, unit_id, 'write'
));

drop policy if exists schedules_enforce_scope_update on public.schedules;
create policy schedules_enforce_scope_update on public.schedules
as restrictive for update to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id, id, professional_id, unit_id, 'write'
))
with check (app_private.current_user_can_access_agenda_resource(
  organization_id, id, professional_id, unit_id, 'write'
));

drop policy if exists schedules_enforce_scope_delete on public.schedules;
create policy schedules_enforce_scope_delete on public.schedules
as restrictive for delete to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id, id, professional_id, unit_id, 'write'
));

-- schedule availability
drop policy if exists schedule_availability_enforce_scope_select
  on public.schedule_availability;
create policy schedule_availability_enforce_scope_select
on public.schedule_availability
as restrictive for select to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id, schedule_id, 'read'
));

drop policy if exists schedule_availability_enforce_scope_insert
  on public.schedule_availability;
create policy schedule_availability_enforce_scope_insert
on public.schedule_availability
as restrictive for insert to authenticated
with check (app_private.current_user_can_access_schedule(
  organization_id, schedule_id, 'write'
));

drop policy if exists schedule_availability_enforce_scope_update
  on public.schedule_availability;
create policy schedule_availability_enforce_scope_update
on public.schedule_availability
as restrictive for update to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id, schedule_id, 'write'
))
with check (app_private.current_user_can_access_schedule(
  organization_id, schedule_id, 'write'
));

drop policy if exists schedule_availability_enforce_scope_delete
  on public.schedule_availability;
create policy schedule_availability_enforce_scope_delete
on public.schedule_availability
as restrictive for delete to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id, schedule_id, 'write'
));

-- schedule blocks
drop policy if exists schedule_blocks_enforce_scope_select
  on public.schedule_blocks;
create policy schedule_blocks_enforce_scope_select on public.schedule_blocks
as restrictive for select to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id, schedule_id, 'read'
));

drop policy if exists schedule_blocks_enforce_scope_insert
  on public.schedule_blocks;
create policy schedule_blocks_enforce_scope_insert on public.schedule_blocks
as restrictive for insert to authenticated
with check (app_private.current_user_can_access_schedule(
  organization_id, schedule_id, 'write'
));

drop policy if exists schedule_blocks_enforce_scope_update
  on public.schedule_blocks;
create policy schedule_blocks_enforce_scope_update on public.schedule_blocks
as restrictive for update to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id, schedule_id, 'write'
))
with check (app_private.current_user_can_access_schedule(
  organization_id, schedule_id, 'write'
));

drop policy if exists schedule_blocks_enforce_scope_delete
  on public.schedule_blocks;
create policy schedule_blocks_enforce_scope_delete on public.schedule_blocks
as restrictive for delete to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id, schedule_id, 'write'
));

-- appointments
drop policy if exists appointments_enforce_scope_select on public.appointments;
create policy appointments_enforce_scope_select on public.appointments
as restrictive for select to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id, schedule_id, professional_id, unit_id, 'read'
));

drop policy if exists appointments_enforce_scope_insert on public.appointments;
create policy appointments_enforce_scope_insert on public.appointments
as restrictive for insert to authenticated
with check (app_private.current_user_can_access_agenda_resource(
  organization_id, schedule_id, professional_id, unit_id, 'write'
));

drop policy if exists appointments_enforce_scope_update on public.appointments;
create policy appointments_enforce_scope_update on public.appointments
as restrictive for update to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id, schedule_id, professional_id, unit_id, 'write'
))
with check (app_private.current_user_can_access_agenda_resource(
  organization_id, schedule_id, professional_id, unit_id, 'write'
));

drop policy if exists appointments_enforce_scope_delete on public.appointments;
create policy appointments_enforce_scope_delete on public.appointments
as restrictive for delete to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id, schedule_id, professional_id, unit_id, 'write'
));

-- Appointment status history follows the parent appointment's read scope.
drop policy if exists appointment_status_events_enforce_scope_select
  on public.appointment_status_events;
create policy appointment_status_events_enforce_scope_select
on public.appointment_status_events
as restrictive for select to authenticated
using (app_private.current_user_can_access_appointment(
  organization_id, appointment_id, 'read'
));

-- Waitlist rows with a professional follow that professional/specialty scope.
-- A generic row requires an explicit broad agenda scope (agenda with NULL
-- resource_id) or an administrative bypass.
drop policy if exists waitlist_entries_enforce_scope_select
  on public.waitlist_entries;
create policy waitlist_entries_enforce_scope_select on public.waitlist_entries
as restrictive for select to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id, null, professional_id, null, 'read'
));

drop policy if exists waitlist_entries_enforce_scope_insert
  on public.waitlist_entries;
create policy waitlist_entries_enforce_scope_insert on public.waitlist_entries
as restrictive for insert to authenticated
with check (app_private.current_user_can_access_agenda_resource(
  organization_id, null, professional_id, null, 'write'
));

drop policy if exists waitlist_entries_enforce_scope_update
  on public.waitlist_entries;
create policy waitlist_entries_enforce_scope_update on public.waitlist_entries
as restrictive for update to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id, null, professional_id, null, 'write'
))
with check (app_private.current_user_can_access_agenda_resource(
  organization_id, null, professional_id, null, 'write'
));

drop policy if exists waitlist_entries_enforce_scope_delete
  on public.waitlist_entries;
create policy waitlist_entries_enforce_scope_delete on public.waitlist_entries
as restrictive for delete to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id, null, professional_id, null, 'write'
));

-- transition_appointment_status is SECURITY DEFINER and therefore needs the
-- same explicit resource check instead of relying on table RLS.
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
  select *
    into v_appointment
  from public.appointments
  where id = p_appointment_id
  for update;

  if v_appointment.id is null then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;

  if not (
    app_private.current_is_super_admin()
    or (
      v_appointment.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('agenda.editar_agendamento')
      and app_private.current_user_can_access_agenda_resource(
        v_appointment.organization_id,
        v_appointment.schedule_id,
        v_appointment.professional_id,
        v_appointment.unit_id,
        'write'
      )
    )
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

  if not (
    (v_appointment.status = 'scheduled' and p_to_status in ('confirmed', 'waiting', 'no_show', 'cancelled'))
    or (v_appointment.status = 'confirmed' and p_to_status in ('waiting', 'no_show', 'cancelled'))
    or (v_appointment.status = 'waiting' and p_to_status in ('in_progress', 'no_show', 'cancelled'))
    or (v_appointment.status = 'in_progress' and p_to_status in ('attended', 'cancelled'))
  ) then
    raise exception 'Invalid appointment status transition.'
      using errcode = '23514';
  end if;

  perform set_config(
    'app.appointment_status_reason',
    coalesce(nullif(trim(p_reason), ''), ''),
    true
  );

  update public.appointments
  set status = p_to_status,
      cancelled_at = case
        when p_to_status = 'cancelled' then now()
        else cancelled_at
      end,
      cancellation_reason = case
        when p_to_status = 'cancelled' then nullif(trim(p_reason), '')
        else cancellation_reason
      end
  where id = p_appointment_id;

  perform set_config('app.appointment_status_reason', '', true);
  return p_to_status;
end;
$$;

revoke all on function public.transition_appointment_status(uuid, text, text)
  from public;
grant execute on function public.transition_appointment_status(uuid, text, text)
  to authenticated, service_role;

comment on function public.transition_appointment_status(uuid, text, text) is
  'Atomically changes appointment status after permission and agenda-resource scope checks.';
