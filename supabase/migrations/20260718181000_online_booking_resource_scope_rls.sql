-- Extend agenda resource scopes to the internal online-booking workflow.
-- Public patient RPCs continue to use their token/slug authorization. This
-- migration only constrains authenticated back-office reads and review/config
-- operations.

-- Parameterized scope helpers are needed by SECURITY DEFINER RPCs: while a
-- Super Admin is impersonating a tenant user, auth.uid() still belongs to the
-- support actor and must not be used as the data-scope principal.
create or replace function app_private.user_can_access_agenda_resource(
  p_user_id uuid,
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
  v_user_organization_id uuid;
  v_user_is_super_admin boolean;
  v_linked_professional_id uuid;
  v_linked_professional_active boolean;
  v_specialty_id uuid;
  v_has_explicit_scopes boolean;
  v_matches_explicit_scope boolean;
begin
  if p_user_id is null
    or p_required_access is null
    or p_required_access not in ('read', 'write', 'full')
    or p_organization_id is null then
    return false;
  end if;

  select app_users.organization_id, app_users.is_super_admin
    into v_user_organization_id, v_user_is_super_admin
  from public.app_users
  where app_users.id = p_user_id
    and app_users.status = 'active';

  if not found then
    return false;
  end if;

  if v_user_is_super_admin then
    return true;
  end if;

  if v_user_organization_id is null
    or v_user_organization_id <> p_organization_id then
    return false;
  end if;

  -- Organization access administrators intentionally remain organization-wide,
  -- even when the account is also linked to a professional.
  if app_private.user_has_permission(p_user_id, 'config.geral')
    or app_private.user_has_permission(p_user_id, 'config.usuarios') then
    return true;
  end if;

  select professionals.id, professionals.active
    into v_linked_professional_id, v_linked_professional_active
  from public.professionals
  where professionals.organization_id = p_organization_id
    and professionals.user_id = p_user_id
  limit 1;

  if p_professional_id is not null then
    select professionals.specialty_id
      into v_specialty_id
    from public.professionals
    where professionals.organization_id = p_organization_id
      and professionals.id = p_professional_id;
  end if;

  if coalesce(v_linked_professional_active, false)
    and p_professional_id = v_linked_professional_id then
    return true;
  end if;

  select exists (
    select 1
    from public.resource_scopes as scopes
    where scopes.organization_id = p_organization_id
      and scopes.user_id = p_user_id
  ) into v_has_explicit_scopes;

  if v_has_explicit_scopes then
    select exists (
      select 1
      from public.resource_scopes as scopes
      where scopes.organization_id = p_organization_id
        and scopes.user_id = p_user_id
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

  if v_linked_professional_id is not null then
    return false;
  end if;

  -- Permissions decide which operation is legal; they are not a data scope.
  -- Unlinking a professional or removing the last explicit scope must never
  -- elevate an operator to every agenda in the tenant.
  return false;
end;
$$;

create or replace function app_private.user_can_access_schedule(
  p_user_id uuid,
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

  return app_private.user_can_access_agenda_resource(
    p_user_id,
    p_organization_id,
    p_schedule_id,
    v_professional_id,
    v_unit_id,
    p_required_access
  );
end;
$$;

create or replace function app_private.current_user_can_access_agenda_resource(
  p_organization_id uuid,
  p_schedule_id uuid,
  p_professional_id uuid,
  p_unit_id uuid,
  p_required_access text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_can_access_agenda_resource(
    app_private.current_app_user_id(),
    p_organization_id,
    p_schedule_id,
    p_professional_id,
    p_unit_id,
    p_required_access
  )
$$;

create or replace function app_private.current_user_can_access_schedule(
  p_organization_id uuid,
  p_schedule_id uuid,
  p_required_access text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.user_can_access_schedule(
    app_private.current_app_user_id(),
    p_organization_id,
    p_schedule_id,
    p_required_access
  )
$$;

revoke all on function app_private.user_can_access_agenda_resource(
  uuid, uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function app_private.user_can_access_schedule(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function app_private.user_can_access_agenda_resource(
  uuid, uuid, uuid, uuid, uuid, text
) to service_role;
grant execute on function app_private.user_can_access_schedule(
  uuid, uuid, uuid, text
) to service_role;

-- PostgreSQL combines permissive policies with OR. Restrictive policies ensure
-- every existing permission/report path is also constrained by the schedule or
-- professional resource scope.

drop policy if exists online_booking_requests_enforce_scope_select
  on public.online_booking_requests;
create policy online_booking_requests_enforce_scope_select
on public.online_booking_requests
as restrictive for select to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id,
  schedule_id,
  professional_id,
  unit_id,
  'read'
));

-- Organization portal settings are global. A schedule/professional-scoped
-- account may not read or change them unless its scope is broad enough to match
-- a resource-less agenda check (or config.geral grants organization-wide
-- administration through the helper).
drop policy if exists online_booking_settings_enforce_broad_scope_select
  on public.online_booking_settings;
create policy online_booking_settings_enforce_broad_scope_select
on public.online_booking_settings
as restrictive for select to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id,
  null,
  null,
  null,
  'write'
));

drop policy if exists online_booking_settings_enforce_broad_scope_update
  on public.online_booking_settings;
create policy online_booking_settings_enforce_broad_scope_update
on public.online_booking_settings
as restrictive for update to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id,
  null,
  null,
  null,
  'write'
))
with check (app_private.current_user_can_access_agenda_resource(
  organization_id,
  null,
  null,
  null,
  'write'
));

drop policy if exists schedule_online_booking_settings_enforce_scope_select
  on public.schedule_online_booking_settings;
create policy schedule_online_booking_settings_enforce_scope_select
on public.schedule_online_booking_settings
as restrictive for select to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id,
  schedule_id,
  'read'
));

drop policy if exists schedule_online_booking_settings_enforce_scope_insert
  on public.schedule_online_booking_settings;
create policy schedule_online_booking_settings_enforce_scope_insert
on public.schedule_online_booking_settings
as restrictive for insert to authenticated
with check (app_private.current_user_can_access_schedule(
  organization_id,
  schedule_id,
  'write'
));

drop policy if exists schedule_online_booking_settings_enforce_scope_update
  on public.schedule_online_booking_settings;
create policy schedule_online_booking_settings_enforce_scope_update
on public.schedule_online_booking_settings
as restrictive for update to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id,
  schedule_id,
  'write'
))
with check (app_private.current_user_can_access_schedule(
  organization_id,
  schedule_id,
  'write'
));

drop policy if exists schedule_online_booking_settings_enforce_scope_delete
  on public.schedule_online_booking_settings;
create policy schedule_online_booking_settings_enforce_scope_delete
on public.schedule_online_booking_settings
as restrictive for delete to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id,
  schedule_id,
  'write'
));

drop policy if exists schedule_online_booking_procedures_enforce_scope_select
  on public.schedule_online_booking_procedures;
create policy schedule_online_booking_procedures_enforce_scope_select
on public.schedule_online_booking_procedures
as restrictive for select to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id,
  schedule_id,
  'read'
));

drop policy if exists schedule_online_booking_procedures_enforce_scope_insert
  on public.schedule_online_booking_procedures;
create policy schedule_online_booking_procedures_enforce_scope_insert
on public.schedule_online_booking_procedures
as restrictive for insert to authenticated
with check (app_private.current_user_can_access_schedule(
  organization_id,
  schedule_id,
  'write'
));

drop policy if exists schedule_online_booking_procedures_enforce_scope_update
  on public.schedule_online_booking_procedures;
create policy schedule_online_booking_procedures_enforce_scope_update
on public.schedule_online_booking_procedures
as restrictive for update to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id,
  schedule_id,
  'write'
))
with check (app_private.current_user_can_access_schedule(
  organization_id,
  schedule_id,
  'write'
));

drop policy if exists schedule_online_booking_procedures_enforce_scope_delete
  on public.schedule_online_booking_procedures;
create policy schedule_online_booking_procedures_enforce_scope_delete
on public.schedule_online_booking_procedures
as restrictive for delete to authenticated
using (app_private.current_user_can_access_schedule(
  organization_id,
  schedule_id,
  'write'
));

-- Curated booking-page reviews are the only other authenticated online-booking
-- table tied directly to a professional. Organization-level portal settings do
-- not identify a schedule/professional; contact-verification rows have no
-- authenticated table grants and remain private to their public RPCs.
drop policy if exists online_booking_reviews_enforce_scope_select
  on public.online_booking_reviews;
create policy online_booking_reviews_enforce_scope_select
on public.online_booking_reviews
as restrictive for select to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id,
  null,
  professional_id,
  null,
  'read'
));

drop policy if exists online_booking_reviews_enforce_scope_insert
  on public.online_booking_reviews;
create policy online_booking_reviews_enforce_scope_insert
on public.online_booking_reviews
as restrictive for insert to authenticated
with check (app_private.current_user_can_access_agenda_resource(
  organization_id,
  null,
  professional_id,
  null,
  'write'
));

drop policy if exists online_booking_reviews_enforce_scope_update
  on public.online_booking_reviews;
create policy online_booking_reviews_enforce_scope_update
on public.online_booking_reviews
as restrictive for update to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id,
  null,
  professional_id,
  null,
  'write'
))
with check (app_private.current_user_can_access_agenda_resource(
  organization_id,
  null,
  professional_id,
  null,
  'write'
));

drop policy if exists online_booking_reviews_enforce_scope_delete
  on public.online_booking_reviews;
create policy online_booking_reviews_enforce_scope_delete
on public.online_booking_reviews
as restrictive for delete to authenticated
using (app_private.current_user_can_access_agenda_resource(
  organization_id,
  null,
  professional_id,
  null,
  'write'
));

-- Keep the mature review implementations byte-for-byte unchanged and put an
-- explicit schedule-scope authorization layer in front of them. Moving the old
-- functions into app_private also makes it impossible for authenticated users
-- to bypass the wrappers through the prior SECURITY DEFINER entrypoints.
alter function public.confirm_online_booking_request(uuid)
  set schema app_private;
alter function app_private.confirm_online_booking_request(uuid)
  rename to confirm_online_booking_request_without_resource_scope;
revoke all on function app_private.confirm_online_booking_request_without_resource_scope(uuid)
  from public, anon, authenticated, service_role;

create function public.confirm_online_booking_request(
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_request public.online_booking_requests%rowtype;
begin
  select *
    into v_request
  from public.online_booking_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Online booking request not found.' using errcode = 'P0002';
  end if;

  if not app_private.current_user_can_access_schedule(
    v_request.organization_id,
    v_request.schedule_id,
    'write'
  ) then
    raise exception 'Not allowed to confirm online booking request.'
      using errcode = '42501';
  end if;

  return app_private.confirm_online_booking_request_without_resource_scope(
    p_request_id
  );
end;
$$;

alter function public.reject_online_booking_request(uuid, text)
  set schema app_private;
alter function app_private.reject_online_booking_request(uuid, text)
  rename to reject_online_booking_request_without_resource_scope;
revoke all on function app_private.reject_online_booking_request_without_resource_scope(uuid, text)
  from public, anon, authenticated, service_role;

create function public.reject_online_booking_request(
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
begin
  select *
    into v_request
  from public.online_booking_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Online booking request not found.' using errcode = 'P0002';
  end if;

  if not app_private.current_user_can_access_schedule(
    v_request.organization_id,
    v_request.schedule_id,
    'write'
  ) then
    raise exception 'Not allowed to reject online booking request.'
      using errcode = '42501';
  end if;

  return app_private.reject_online_booking_request_without_resource_scope(
    p_request_id,
    p_reason
  );
end;
$$;

-- save_schedule_configuration can change the schedule's resource identity. An
-- update must be writable in its current scope; a reassignment must also be
-- writable through the destination professional/unit independently of the old
-- schedule id. New schedules use that destination-resource check from the
-- outset.
alter function public.save_schedule_configuration(
  uuid, uuid, uuid, text, text, boolean, boolean,
  integer, integer, integer, integer, jsonb, uuid[]
) set schema app_private;
alter function app_private.save_schedule_configuration(
  uuid, uuid, uuid, text, text, boolean, boolean,
  integer, integer, integer, integer, jsonb, uuid[]
) rename to save_schedule_configuration_without_resource_scope;
revoke all on function app_private.save_schedule_configuration_without_resource_scope(
  uuid, uuid, uuid, text, text, boolean, boolean,
  integer, integer, integer, integer, jsonb, uuid[]
) from public, anon, authenticated, service_role;

create function public.save_schedule_configuration(
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

    if not app_private.current_user_can_access_schedule(
      v_organization_id,
      p_schedule_id,
      'write'
    ) then
      raise exception 'Not allowed to configure schedules.' using errcode = '42501';
    end if;

    if (
      v_schedule.professional_id is distinct from p_professional_id
      or v_schedule.unit_id is distinct from p_unit_id
    ) and not app_private.current_user_can_access_agenda_resource(
      v_organization_id,
      null,
      p_professional_id,
      p_unit_id,
      'write'
    ) then
      raise exception 'Not allowed to configure schedules.' using errcode = '42501';
    end if;
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

    if not app_private.current_user_can_access_agenda_resource(
      v_organization_id,
      null,
      p_professional_id,
      p_unit_id,
      'write'
    ) then
      raise exception 'Not allowed to configure schedules.' using errcode = '42501';
    end if;
  end if;

  return app_private.save_schedule_configuration_without_resource_scope(
    p_schedule_id,
    p_professional_id,
    p_unit_id,
    p_name,
    p_color,
    p_active,
    p_online_enabled,
    p_min_notice_hours,
    p_max_days_ahead,
    p_cancellation_notice_hours,
    p_slot_minutes,
    p_availability,
    p_procedure_ids
  );
end;
$$;

-- Impersonation-aware overloads keep the original public signatures available
-- while allowing the application to bind support actions to the effective
-- tenant user. The parameter is deliberately required on these overloads, so
-- legacy calls remain unambiguous in PostgREST.
create function public.confirm_online_booking_request(
  p_request_id uuid,
  p_impersonation_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_request public.online_booking_requests%rowtype;
begin
  select *
    into v_context
  from app_private.resolve_effective_request_context(
    p_impersonation_session_id
  );

  select *
    into v_request
  from public.online_booking_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Online booking request not found.' using errcode = 'P0002';
  end if;

  if v_context.organization_id <> v_request.organization_id
    or not app_private.user_has_permission(
      v_context.effective_user_id,
      'agenda.criar_agendamento'
    )
    or not app_private.user_has_permission(
      v_context.effective_user_id,
      'paciente.criar'
    )
    or not app_private.user_can_access_schedule(
      v_context.effective_user_id,
      v_request.organization_id,
      v_request.schedule_id,
      'write'
    ) then
    raise exception 'Not allowed to confirm online booking request.'
      using errcode = '42501';
  end if;

  return public.confirm_online_booking_request(p_request_id);
end;
$$;

create function public.reject_online_booking_request(
  p_request_id uuid,
  p_reason text,
  p_impersonation_session_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_request public.online_booking_requests%rowtype;
begin
  select *
    into v_context
  from app_private.resolve_effective_request_context(
    p_impersonation_session_id
  );

  select *
    into v_request
  from public.online_booking_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Online booking request not found.' using errcode = 'P0002';
  end if;

  if v_context.organization_id <> v_request.organization_id
    or not (
      app_private.user_has_permission(
        v_context.effective_user_id,
        'agenda.criar_agendamento'
      )
      or app_private.user_has_permission(
        v_context.effective_user_id,
        'agenda.editar_agendamento'
      )
    )
    or not app_private.user_can_access_schedule(
      v_context.effective_user_id,
      v_request.organization_id,
      v_request.schedule_id,
      'write'
    ) then
    raise exception 'Not allowed to reject online booking request.'
      using errcode = '42501';
  end if;

  return public.reject_online_booking_request(p_request_id, p_reason);
end;
$$;

create function public.save_schedule_configuration(
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
  p_procedure_ids uuid[],
  p_impersonation_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_schedule public.schedules%rowtype;
  v_organization_id uuid;
begin
  select *
    into v_context
  from app_private.resolve_effective_request_context(
    p_impersonation_session_id
  );

  if not app_private.user_has_permission(
    v_context.effective_user_id,
    'agenda.configurar'
  ) then
    raise exception 'Not allowed to configure schedules.' using errcode = '42501';
  end if;

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

    if v_context.organization_id <> v_organization_id
      or not app_private.user_can_access_schedule(
        v_context.effective_user_id,
        v_organization_id,
        p_schedule_id,
        'write'
      ) then
      raise exception 'Not allowed to configure schedules.' using errcode = '42501';
    end if;

    if (
      v_schedule.professional_id is distinct from p_professional_id
      or v_schedule.unit_id is distinct from p_unit_id
    ) and not app_private.user_can_access_agenda_resource(
      v_context.effective_user_id,
      v_organization_id,
      null,
      p_professional_id,
      p_unit_id,
      'write'
    ) then
      raise exception 'Not allowed to configure schedules.' using errcode = '42501';
    end if;
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

    if v_context.organization_id <> v_organization_id
      or not app_private.user_can_access_agenda_resource(
        v_context.effective_user_id,
        v_organization_id,
        null,
        p_professional_id,
        p_unit_id,
        'write'
      ) then
      raise exception 'Not allowed to configure schedules.' using errcode = '42501';
    end if;
  end if;

  return public.save_schedule_configuration(
    p_schedule_id,
    p_professional_id,
    p_unit_id,
    p_name,
    p_color,
    p_active,
    p_online_enabled,
    p_min_notice_hours,
    p_max_days_ahead,
    p_cancellation_notice_hours,
    p_slot_minutes,
    p_availability,
    p_procedure_ids
  );
end;
$$;

revoke all on function public.confirm_online_booking_request(uuid) from public;
revoke all on function public.reject_online_booking_request(uuid, text) from public;
revoke all on function public.save_schedule_configuration(
  uuid, uuid, uuid, text, text, boolean, boolean,
  integer, integer, integer, integer, jsonb, uuid[]
) from public;
revoke all on function public.confirm_online_booking_request(uuid, uuid)
  from public;
revoke all on function public.reject_online_booking_request(uuid, text, uuid)
  from public;
revoke all on function public.save_schedule_configuration(
  uuid, uuid, uuid, text, text, boolean, boolean,
  integer, integer, integer, integer, jsonb, uuid[], uuid
) from public;

grant execute on function public.confirm_online_booking_request(uuid)
  to authenticated, service_role;
grant execute on function public.reject_online_booking_request(uuid, text)
  to authenticated, service_role;
grant execute on function public.save_schedule_configuration(
  uuid, uuid, uuid, text, text, boolean, boolean,
  integer, integer, integer, integer, jsonb, uuid[]
) to authenticated, service_role;
grant execute on function public.confirm_online_booking_request(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.reject_online_booking_request(uuid, text, uuid)
  to authenticated, service_role;
grant execute on function public.save_schedule_configuration(
  uuid, uuid, uuid, text, text, boolean, boolean,
  integer, integer, integer, integer, jsonb, uuid[], uuid
) to authenticated, service_role;

comment on function public.confirm_online_booking_request(uuid) is
  'Confirms an online request only when the actor can write its schedule resource.';
comment on function public.reject_online_booking_request(uuid, text) is
  'Rejects an online request only when the actor can write its schedule resource.';
comment on function public.save_schedule_configuration(
  uuid, uuid, uuid, text, text, boolean, boolean,
  integer, integer, integer, integer, jsonb, uuid[]
) is
  'Atomically saves schedule configuration after validating current and destination resource scopes.';
