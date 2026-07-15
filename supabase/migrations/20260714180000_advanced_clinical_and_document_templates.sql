-- Advanced clinical and document templates.
--
-- This migration keeps published legacy schemas readable, but all templates
-- created or updated through the new RPCs use the typed schemaVersion 2
-- contract. Template mutations are deliberately RPC-only so an authenticated
-- Super Admin cannot bypass the effective impersonated user's permissions.

-- ---------------------------------------------------------------------------
-- Effective actor / impersonation context
-- ---------------------------------------------------------------------------

create or replace function app_private.user_has_permission(
  p_user_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from app_private.user_permission_codes(p_user_id) as permission_codes(code)
    where permission_codes.code = p_permission_code
  )
$$;

create or replace function app_private.resolve_effective_request_context(
  p_impersonation_session_id uuid default null
)
returns table (
  actor_user_id uuid,
  effective_user_id uuid,
  organization_id uuid,
  impersonation_session_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_actor public.app_users%rowtype;
  v_session public.impersonation_sessions%rowtype;
  v_target public.app_users%rowtype;
begin
  select app_users.*
    into v_actor
  from public.app_users
  where app_users.auth_user_id = auth.uid()
    and app_users.status = 'active'
  limit 1;

  if v_actor.id is null then
    raise exception 'Authenticated application user not found.'
      using errcode = '42501';
  end if;

  if not v_actor.is_super_admin then
    if p_impersonation_session_id is not null then
      raise exception 'Only a Super Admin can use an impersonation session.'
        using errcode = '42501';
    end if;
    if v_actor.organization_id is null then
      raise exception 'Application user has no organization.'
        using errcode = '42501';
    end if;

    actor_user_id := v_actor.id;
    effective_user_id := v_actor.id;
    organization_id := v_actor.organization_id;
    impersonation_session_id := null;
    return next;
    return;
  end if;

  if p_impersonation_session_id is null then
    raise exception 'An active support session is required.'
      using errcode = '42501';
  end if;

  select impersonation_sessions.*
    into v_session
  from public.impersonation_sessions
  where impersonation_sessions.id = p_impersonation_session_id
    and impersonation_sessions.super_admin_user_id = v_actor.id
    and impersonation_sessions.ended_at is null
    and impersonation_sessions.started_at <= statement_timestamp()
    and impersonation_sessions.started_at
      >= statement_timestamp() - interval '4 hours';

  if v_session.id is null or v_session.target_user_id is null then
    raise exception 'Active support session not found or expired.'
      using errcode = '42501';
  end if;

  select app_users.*
    into v_target
  from public.app_users
  where app_users.id = v_session.target_user_id
    and app_users.organization_id = v_session.organization_id
    and app_users.status = 'active'
    and not app_users.is_super_admin;

  if v_target.id is null then
    raise exception 'The support target user is not active in this organization.'
      using errcode = '42501';
  end if;

  actor_user_id := v_actor.id;
  effective_user_id := v_target.id;
  organization_id := v_session.organization_id;
  impersonation_session_id := v_session.id;
  return next;
end;
$$;

create or replace function app_private.resolve_template_management_context(
  p_impersonation_session_id uuid default null
)
returns table (
  actor_user_id uuid,
  effective_user_id uuid,
  organization_id uuid,
  impersonation_session_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  select context.actor_user_id,
         context.effective_user_id,
         context.organization_id,
         context.impersonation_session_id
    into actor_user_id,
         effective_user_id,
         organization_id,
         impersonation_session_id
  from app_private.resolve_effective_request_context(
    p_impersonation_session_id
  ) as context;

  if effective_user_id is null
    or not app_private.user_has_permission(
      effective_user_id,
      'clinico.criar_template'
    ) then
    raise exception 'Not allowed to manage clinical templates.'
      using errcode = '42501';
  end if;

  return next;
end;
$$;

revoke all on function app_private.user_has_permission(uuid, text) from public;
revoke all on function app_private.resolve_effective_request_context(uuid) from public;
revoke all on function app_private.resolve_template_management_context(uuid) from public;

-- ---------------------------------------------------------------------------
-- Typed clinical schema validation
-- ---------------------------------------------------------------------------

create or replace function app_private.is_valid_clinical_template_schema_v2(
  p_schema jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_section jsonb;
  v_field jsonb;
  v_option jsonb;
  v_section_id text;
  v_field_id text;
  v_field_type text;
  v_option_id text;
  v_section_ids text[] := array[]::text[];
  v_field_ids text[] := array[]::text[];
  v_option_ids text[];
  v_total_fields integer := 0;
begin
  if p_schema is null
    or jsonb_typeof(p_schema) <> 'object'
    or p_schema -> 'schemaVersion' <> '2'::jsonb
    or jsonb_typeof(p_schema -> 'sections') <> 'array'
    or jsonb_array_length(p_schema -> 'sections') = 0
    or jsonb_array_length(p_schema -> 'sections') > 30 then
    return false;
  end if;

  for v_section in
    select section_item.value
    from jsonb_array_elements(p_schema -> 'sections') as section_item(value)
  loop
    if jsonb_typeof(v_section) <> 'object' then
      return false;
    end if;

    v_section_id := nullif(trim(v_section ->> 'id'), '');
    if v_section_id is null
      or v_section_id !~ '^[a-z][a-z0-9_]{0,63}$'
      or v_section_id = any(v_section_ids)
      or nullif(trim(v_section ->> 'title'), '') is null
      or length(v_section ->> 'title') > 160
      or (
        v_section ? 'description'
        and jsonb_typeof(v_section -> 'description') <> 'string'
      )
      or jsonb_typeof(v_section -> 'fields') <> 'array'
      or jsonb_array_length(v_section -> 'fields') = 0 then
      return false;
    end if;
    v_section_ids := array_append(v_section_ids, v_section_id);

    for v_field in
      select field_item.value
      from jsonb_array_elements(v_section -> 'fields') as field_item(value)
    loop
      v_total_fields := v_total_fields + 1;
      if v_total_fields > 200 or jsonb_typeof(v_field) <> 'object' then
        return false;
      end if;

      v_field_id := nullif(trim(v_field ->> 'id'), '');
      v_field_type := v_field ->> 'type';
      if v_field_id is null
        or v_field_id !~ '^[a-z][a-z0-9_]{0,63}$'
        or v_field_id = any(v_field_ids)
        or nullif(trim(v_field ->> 'label'), '') is null
        or length(v_field ->> 'label') > 160
        or v_field_type not in (
          'text', 'textarea', 'number', 'date', 'time', 'boolean',
          'select', 'multiselect'
        )
        or (
          v_field ? 'required'
          and jsonb_typeof(v_field -> 'required') <> 'boolean'
        )
        or (
          v_field ? 'placeholder'
          and jsonb_typeof(v_field -> 'placeholder') <> 'string'
        )
        or (
          v_field ? 'helpText'
          and jsonb_typeof(v_field -> 'helpText') <> 'string'
        )
        or (
          v_field ? 'unit'
          and jsonb_typeof(v_field -> 'unit') <> 'string'
        ) then
        return false;
      end if;
      v_field_ids := array_append(v_field_ids, v_field_id);

      if v_field ? 'minLength' and (
        jsonb_typeof(v_field -> 'minLength') <> 'number'
        or (v_field ->> 'minLength')::numeric < 0
        or trunc((v_field ->> 'minLength')::numeric)
          <> (v_field ->> 'minLength')::numeric
      ) then
        return false;
      end if;
      if v_field ? 'maxLength' and (
        jsonb_typeof(v_field -> 'maxLength') <> 'number'
        or (v_field ->> 'maxLength')::numeric < 1
        or trunc((v_field ->> 'maxLength')::numeric)
          <> (v_field ->> 'maxLength')::numeric
      ) then
        return false;
      end if;
      if v_field ? 'minLength' and v_field ? 'maxLength'
        and (v_field ->> 'minLength')::numeric
          > (v_field ->> 'maxLength')::numeric then
        return false;
      end if;

      if v_field_type = 'number' then
        if v_field ? 'min'
          and jsonb_typeof(v_field -> 'min') <> 'number' then
          return false;
        end if;
        if v_field ? 'max'
          and jsonb_typeof(v_field -> 'max') <> 'number' then
          return false;
        end if;
        if v_field ? 'step' and (
          jsonb_typeof(v_field -> 'step') <> 'number'
          or (v_field ->> 'step')::numeric <= 0
        ) then
          return false;
        end if;
        if v_field ? 'decimalPlaces' and (
          jsonb_typeof(v_field -> 'decimalPlaces') <> 'number'
          or (v_field ->> 'decimalPlaces')::numeric < 0
          or (v_field ->> 'decimalPlaces')::numeric > 6
          or trunc((v_field ->> 'decimalPlaces')::numeric)
            <> (v_field ->> 'decimalPlaces')::numeric
        ) then
          return false;
        end if;
        if v_field ? 'min' and v_field ? 'max'
          and (v_field ->> 'min')::numeric > (v_field ->> 'max')::numeric then
          return false;
        end if;
      end if;

      if v_field_type in ('select', 'multiselect') then
        if jsonb_typeof(v_field -> 'options') <> 'array'
          or jsonb_array_length(v_field -> 'options') = 0
          or jsonb_array_length(v_field -> 'options') > 100 then
          return false;
        end if;

        v_option_ids := array[]::text[];
        for v_option in
          select option_item.value
          from jsonb_array_elements(v_field -> 'options') as option_item(value)
        loop
          if jsonb_typeof(v_option) = 'string' then
            v_option_id := nullif(trim(v_option #>> '{}'), '');
          elsif jsonb_typeof(v_option) = 'object' then
            v_option_id := nullif(
              trim(coalesce(v_option ->> 'id', v_option ->> 'value')),
              ''
            );
            if nullif(trim(v_option ->> 'label'), '') is null then
              return false;
            end if;
          else
            return false;
          end if;

          if v_option_id is null
            or length(v_option_id) > 120
            or v_option_id = any(v_option_ids) then
            return false;
          end if;
          v_option_ids := array_append(v_option_ids, v_option_id);
        end loop;
      end if;
    end loop;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.is_iso_date(p_value text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_date date;
begin
  if p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  v_date := p_value::date;
  return to_char(v_date, 'YYYY-MM-DD') = p_value;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.is_iso_time(p_value text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_time time;
begin
  if p_value !~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' then
    return false;
  end if;
  v_time := p_value::time;
  return v_time is not null;
exception
  when others then
    return false;
end;
$$;

create or replace function app_private.validate_clinical_structured_data(
  p_schema jsonb,
  p_data jsonb
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_section jsonb;
  v_field jsonb;
  v_option jsonb;
  v_array_item jsonb;
  v_field_id text;
  v_label text;
  v_field_type text;
  v_text text;
  v_value jsonb;
  v_value_type text;
  v_number numeric;
  v_missing boolean;
  v_option_matches boolean;
begin
  if jsonb_typeof(coalesce(p_data, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid clinical payload.' using errcode = '22023';
  end if;

  for v_section in
    select section_item.value
    from jsonb_array_elements(
      coalesce(p_schema -> 'sections', '[]'::jsonb)
    ) as section_item(value)
  loop
    for v_field in
      select field_item.value
      from jsonb_array_elements(
        coalesce(v_section -> 'fields', '[]'::jsonb)
      ) as field_item(value)
    loop
      v_field_id := v_field ->> 'id';
      v_label := coalesce(nullif(trim(v_field ->> 'label'), ''), v_field_id);
      v_value := p_data -> v_field_id;
      v_value_type := jsonb_typeof(v_value);
      v_missing := not (p_data ? v_field_id)
        or v_value_type is null
        or v_value_type = 'null'
        or (v_value_type = 'string' and nullif(trim(v_value #>> '{}'), '') is null)
        or (v_value_type = 'array' and jsonb_array_length(v_value) = 0);

      if coalesce((v_field ->> 'required')::boolean, false) and v_missing then
        raise exception 'Required clinical fields are missing.'
          using errcode = '23514';
      end if;
      if v_missing then
        continue;
      end if;

      -- Legacy versions had no schemaVersion and only need the corrected
      -- required-value semantics. Typed validation applies to v2 snapshots.
      if p_schema -> 'schemaVersion' is distinct from '2'::jsonb then
        continue;
      end if;

      v_field_type := v_field ->> 'type';
      if v_field_type in ('text', 'textarea') then
        if v_value_type <> 'string' then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        v_text := v_value #>> '{}';
        if v_field ? 'minLength'
          and char_length(v_text) < (v_field ->> 'minLength')::integer then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        if v_field ? 'maxLength'
          and char_length(v_text) > (v_field ->> 'maxLength')::integer then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'number' then
        if v_value_type <> 'number' then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        v_number := (v_value #>> '{}')::numeric;
        if v_field ? 'min' and v_number < (v_field ->> 'min')::numeric then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        if v_field ? 'max' and v_number > (v_field ->> 'max')::numeric then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        if v_field ? 'step' and mod(
          v_number - coalesce((v_field ->> 'min')::numeric, 0),
          (v_field ->> 'step')::numeric
        ) <> 0 then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'date' then
        if v_value_type <> 'string'
          or not app_private.is_iso_date(v_value #>> '{}') then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'time' then
        if v_value_type <> 'string'
          or not app_private.is_iso_time(v_value #>> '{}') then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'boolean' then
        if v_value_type <> 'boolean' then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'select' then
        if v_value_type <> 'string' then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        v_text := v_value #>> '{}';
        select exists (
          select 1
          from jsonb_array_elements(v_field -> 'options') as option_item(value)
          where case jsonb_typeof(option_item.value)
            when 'string' then option_item.value #>> '{}'
            when 'object' then coalesce(
              option_item.value ->> 'id',
              option_item.value ->> 'value'
            )
            else null
          end = v_text
        ) into v_option_matches;
        if not v_option_matches then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
      elsif v_field_type = 'multiselect' then
        if v_value_type <> 'array' then
          raise exception 'Invalid clinical field value: %.', v_label
            using errcode = '23514';
        end if;
        for v_array_item in
          select array_item.value
          from jsonb_array_elements(v_value) as array_item(value)
        loop
          if jsonb_typeof(v_array_item) <> 'string' then
            raise exception 'Invalid clinical field value: %.', v_label
              using errcode = '23514';
          end if;
          v_text := v_array_item #>> '{}';
          select exists (
            select 1
            from jsonb_array_elements(v_field -> 'options') as option_item(value)
            where case jsonb_typeof(option_item.value)
              when 'string' then option_item.value #>> '{}'
              when 'object' then coalesce(
                option_item.value ->> 'id',
                option_item.value ->> 'value'
              )
              else null
            end = v_text
          ) into v_option_matches;
          if not v_option_matches then
            raise exception 'Invalid clinical field value: %.', v_label
              using errcode = '23514';
          end if;
        end loop;
      else
        raise exception 'Invalid clinical field value: %.', v_label
          using errcode = '23514';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function app_private.is_valid_clinical_template_schema_v2(jsonb) from public;
revoke all on function app_private.is_iso_date(text) from public;
revoke all on function app_private.is_iso_time(text) from public;
revoke all on function app_private.validate_clinical_structured_data(jsonb, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Clinical template metadata and immutable version history
-- ---------------------------------------------------------------------------

alter table public.clinical_templates
  add column if not exists is_default boolean not null default false;

alter table public.clinical_template_versions
  add column if not exists change_summary text;

with active_templates as (
  select clinical_templates.id,
         clinical_templates.organization_id,
         row_number() over (
           partition by clinical_templates.organization_id
           order by clinical_templates.created_at, clinical_templates.id
         ) as position
  from public.clinical_templates
  where clinical_templates.status = 'active'
), organizations_without_default as (
  select active_templates.organization_id
  from active_templates
  group by active_templates.organization_id
  having not exists (
    select 1
    from public.clinical_templates as existing_default
    where existing_default.organization_id = active_templates.organization_id
      and existing_default.is_default
  )
)
update public.clinical_templates
set is_default = true
from active_templates
join organizations_without_default
  on organizations_without_default.organization_id = active_templates.organization_id
where clinical_templates.id = active_templates.id
  and active_templates.position = 1;

create unique index if not exists clinical_templates_one_default_per_org_idx
  on public.clinical_templates (organization_id)
  where is_default;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinical_templates_default_active_check'
      and conrelid = 'public.clinical_templates'::regclass
  ) then
    alter table public.clinical_templates
      add constraint clinical_templates_default_active_check
      check (not is_default or status = 'active');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinical_template_versions_schema_v2_check'
      and conrelid = 'public.clinical_template_versions'::regclass
  ) then
    alter table public.clinical_template_versions
      add constraint clinical_template_versions_schema_v2_check
      check (
        not (schema ? 'schemaVersion')
        or app_private.is_valid_clinical_template_schema_v2(schema)
      ) not valid;
  end if;
end;
$$;

create index if not exists clinical_template_versions_latest_idx
  on public.clinical_template_versions (
    organization_id,
    template_id,
    version_number desc
  );

create or replace function app_private.prevent_template_version_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception 'Clinical history is immutable.'
    using errcode = '55000';
end;
$$;

drop trigger if exists prevent_template_version_update_delete
  on public.clinical_template_versions;
create trigger prevent_template_version_update_delete
before update or delete on public.clinical_template_versions
for each row execute function app_private.prevent_template_version_change();

create or replace function public.create_clinical_template(
  p_name text,
  p_schema jsonb,
  p_description text default null,
  p_specialty_id uuid default null,
  p_impersonation_session_id uuid default null
)
returns table (
  template_id uuid,
  version_id uuid,
  version_number integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_template_id uuid;
  v_version_id uuid;
  v_is_default boolean;
begin
  select * into v_context
  from app_private.resolve_template_management_context(
    p_impersonation_session_id
  );

  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 160 then
    raise exception 'Clinical template name is required.' using errcode = '23514';
  end if;
  if p_description is not null and length(p_description) > 2000 then
    raise exception 'Clinical template description is too long.' using errcode = '23514';
  end if;
  if not app_private.is_valid_clinical_template_schema_v2(p_schema) then
    raise exception 'Invalid clinical template schemaVersion 2.' using errcode = '22023';
  end if;
  if p_specialty_id is not null and not exists (
    select 1
    from public.specialties
    where specialties.organization_id = v_context.organization_id
      and specialties.id = p_specialty_id
  ) then
    raise exception 'Clinical template specialty not found.' using errcode = '23503';
  end if;

  v_is_default := not exists (
    select 1
    from public.clinical_templates
    where clinical_templates.organization_id = v_context.organization_id
      and clinical_templates.is_default
  );

  insert into public.clinical_templates (
    organization_id,
    specialty_id,
    name,
    description,
    status,
    is_default,
    created_by_user_id
  ) values (
    v_context.organization_id,
    p_specialty_id,
    trim(p_name),
    nullif(trim(p_description), ''),
    'active',
    v_is_default,
    v_context.effective_user_id
  )
  returning id into v_template_id;

  insert into public.clinical_template_versions (
    organization_id,
    template_id,
    version_number,
    schema,
    change_summary,
    created_by_user_id
  ) values (
    v_context.organization_id,
    v_template_id,
    1,
    p_schema,
    'Versão inicial',
    v_context.effective_user_id
  )
  returning id into v_version_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'clinical_templates.created',
    'clinical_template',
    v_template_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'version_id', v_version_id,
      'version_number', 1,
      'is_default', v_is_default
    ))
  );

  return query select v_template_id, v_version_id, 1;
end;
$$;

create or replace function public.update_clinical_template(
  p_template_id uuid,
  p_expected_version_number integer,
  p_name text,
  p_schema jsonb,
  p_description text default null,
  p_specialty_id uuid default null,
  p_change_summary text default null,
  p_impersonation_session_id uuid default null
)
returns table (
  template_id uuid,
  version_id uuid,
  version_number integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_template public.clinical_templates%rowtype;
  v_current_version integer;
  v_next_version integer;
  v_version_id uuid;
begin
  select * into v_context
  from app_private.resolve_template_management_context(
    p_impersonation_session_id
  );

  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 160 then
    raise exception 'Clinical template name is required.' using errcode = '23514';
  end if;
  if p_description is not null and length(p_description) > 2000 then
    raise exception 'Clinical template description is too long.' using errcode = '23514';
  end if;
  if not app_private.is_valid_clinical_template_schema_v2(p_schema) then
    raise exception 'Invalid clinical template schemaVersion 2.' using errcode = '22023';
  end if;

  select clinical_templates.*
    into v_template
  from public.clinical_templates
  where clinical_templates.id = p_template_id
    and clinical_templates.organization_id = v_context.organization_id
  for update;

  if v_template.id is null then
    raise exception 'Clinical template not found.' using errcode = 'P0002';
  end if;
  if v_template.status <> 'active' then
    raise exception 'Archived clinical templates cannot be edited.' using errcode = '55000';
  end if;
  if p_specialty_id is not null and not exists (
    select 1
    from public.specialties
    where specialties.organization_id = v_context.organization_id
      and specialties.id = p_specialty_id
  ) then
    raise exception 'Clinical template specialty not found.' using errcode = '23503';
  end if;

  select max(clinical_template_versions.version_number)
    into v_current_version
  from public.clinical_template_versions
  where clinical_template_versions.organization_id = v_context.organization_id
    and clinical_template_versions.template_id = p_template_id;

  if v_current_version is null then
    raise exception 'Clinical template has no published version.' using errcode = '55000';
  end if;
  if p_expected_version_number is distinct from v_current_version then
    raise exception 'Clinical template version conflict.' using errcode = '40001';
  end if;

  v_next_version := v_current_version + 1;
  update public.clinical_templates
  set name = trim(p_name),
      description = nullif(trim(p_description), ''),
      specialty_id = p_specialty_id
  where id = p_template_id;

  insert into public.clinical_template_versions (
    organization_id,
    template_id,
    version_number,
    schema,
    change_summary,
    created_by_user_id
  ) values (
    v_context.organization_id,
    p_template_id,
    v_next_version,
    p_schema,
    nullif(trim(p_change_summary), ''),
    v_context.effective_user_id
  )
  returning id into v_version_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'clinical_templates.version_published',
    'clinical_template',
    p_template_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'version_id', v_version_id,
      'version_number', v_next_version,
      'previous_version_number', v_current_version,
      'change_summary', nullif(trim(p_change_summary), '')
    ))
  );

  return query select p_template_id, v_version_id, v_next_version;
end;
$$;

create or replace function public.duplicate_clinical_template(
  p_source_template_id uuid,
  p_name text,
  p_source_version_id uuid default null,
  p_impersonation_session_id uuid default null
)
returns table (
  template_id uuid,
  version_id uuid,
  version_number integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_source public.clinical_templates%rowtype;
  v_source_version public.clinical_template_versions%rowtype;
  v_template_id uuid;
  v_version_id uuid;
  v_is_default boolean;
begin
  select * into v_context
  from app_private.resolve_template_management_context(
    p_impersonation_session_id
  );

  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 160 then
    raise exception 'Clinical template name is required.' using errcode = '23514';
  end if;

  select clinical_templates.*
    into v_source
  from public.clinical_templates
  where clinical_templates.id = p_source_template_id
    and clinical_templates.organization_id = v_context.organization_id;

  if v_source.id is null then
    raise exception 'Source clinical template not found.' using errcode = 'P0002';
  end if;

  select clinical_template_versions.*
    into v_source_version
  from public.clinical_template_versions
  where clinical_template_versions.organization_id = v_context.organization_id
    and clinical_template_versions.template_id = p_source_template_id
    and (
      p_source_version_id is null
      or clinical_template_versions.id = p_source_version_id
    )
  order by clinical_template_versions.version_number desc
  limit 1;

  if v_source_version.id is null then
    raise exception 'Source clinical template version not found.' using errcode = 'P0002';
  end if;

  v_is_default := not exists (
    select 1
    from public.clinical_templates
    where clinical_templates.organization_id = v_context.organization_id
      and clinical_templates.is_default
  );

  insert into public.clinical_templates (
    organization_id,
    specialty_id,
    name,
    description,
    status,
    is_default,
    created_by_user_id
  ) values (
    v_context.organization_id,
    v_source.specialty_id,
    trim(p_name),
    v_source.description,
    'active',
    v_is_default,
    v_context.effective_user_id
  )
  returning id into v_template_id;

  insert into public.clinical_template_versions (
    organization_id,
    template_id,
    version_number,
    schema,
    change_summary,
    created_by_user_id
  ) values (
    v_context.organization_id,
    v_template_id,
    1,
    v_source_version.schema,
    'Duplicado de outro modelo',
    v_context.effective_user_id
  )
  returning id into v_version_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'clinical_templates.duplicated',
    'clinical_template',
    v_template_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'source_template_id', p_source_template_id,
      'source_version_id', v_source_version.id,
      'source_version_number', v_source_version.version_number,
      'version_id', v_version_id,
      'version_number', 1,
      'is_default', v_is_default
    ))
  );

  return query select v_template_id, v_version_id, 1;
end;
$$;

create or replace function public.set_clinical_template_status(
  p_template_id uuid,
  p_status text,
  p_impersonation_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_template public.clinical_templates%rowtype;
  v_replacement_id uuid;
begin
  select * into v_context
  from app_private.resolve_template_management_context(
    p_impersonation_session_id
  );

  if p_status is null or p_status not in ('active', 'archived') then
    raise exception 'Invalid clinical template status.' using errcode = '23514';
  end if;

  select clinical_templates.*
    into v_template
  from public.clinical_templates
  where clinical_templates.id = p_template_id
    and clinical_templates.organization_id = v_context.organization_id
  for update;

  if v_template.id is null then
    raise exception 'Clinical template not found.' using errcode = 'P0002';
  end if;
  if v_template.status = p_status then
    return p_template_id;
  end if;

  if p_status = 'archived' then
    update public.clinical_templates
    set status = 'archived', is_default = false
    where id = p_template_id;

    if v_template.is_default then
      select clinical_templates.id
        into v_replacement_id
      from public.clinical_templates
      where clinical_templates.organization_id = v_context.organization_id
        and clinical_templates.id <> p_template_id
        and clinical_templates.status = 'active'
      order by clinical_templates.updated_at desc, clinical_templates.id
      limit 1
      for update;

      if v_replacement_id is not null then
        update public.clinical_templates
        set is_default = true
        where id = v_replacement_id;
      end if;
    end if;
  else
    update public.clinical_templates
    set status = 'active'
    where id = p_template_id;

    if not exists (
      select 1
      from public.clinical_templates
      where clinical_templates.organization_id = v_context.organization_id
        and clinical_templates.is_default
    ) then
      update public.clinical_templates
      set is_default = true
      where id = p_template_id;
    end if;
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    case p_status
      when 'archived' then 'clinical_templates.archived'
      else 'clinical_templates.restored'
    end,
    'clinical_template',
    p_template_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'previous_status', v_template.status,
      'status', p_status,
      'replacement_default_template_id', v_replacement_id
    ))
  );

  return p_template_id;
end;
$$;

create or replace function public.set_default_clinical_template(
  p_template_id uuid,
  p_impersonation_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_template public.clinical_templates%rowtype;
  v_previous_default_id uuid;
begin
  select * into v_context
  from app_private.resolve_template_management_context(
    p_impersonation_session_id
  );

  select clinical_templates.*
    into v_template
  from public.clinical_templates
  where clinical_templates.id = p_template_id
    and clinical_templates.organization_id = v_context.organization_id
  for update;

  if v_template.id is null then
    raise exception 'Clinical template not found.' using errcode = 'P0002';
  end if;
  if v_template.status <> 'active' then
    raise exception 'Only active clinical templates can be the default.'
      using errcode = '23514';
  end if;
  if v_template.is_default then
    return p_template_id;
  end if;

  select clinical_templates.id
    into v_previous_default_id
  from public.clinical_templates
  where clinical_templates.organization_id = v_context.organization_id
    and clinical_templates.is_default
  for update;

  update public.clinical_templates
  set is_default = false
  where organization_id = v_context.organization_id
    and is_default;

  update public.clinical_templates
  set is_default = true
  where id = p_template_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'clinical_templates.default_changed',
    'clinical_template',
    p_template_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'previous_default_template_id', v_previous_default_id
    ))
  );

  return p_template_id;
end;
$$;

-- Future organizations must also receive a default clinical template.
create or replace function app_private.seed_default_clinical_template(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_template_id uuid;
  v_make_default boolean;
begin
  v_make_default := not exists (
    select 1
    from public.clinical_templates
    where clinical_templates.organization_id = p_organization_id
      and clinical_templates.is_default
  );

  insert into public.clinical_templates (
    organization_id,
    name,
    description,
    is_default
  ) values (
    p_organization_id,
    'Atendimento clínico geral',
    'Template inicial livre para anamnese e evolução.',
    v_make_default
  )
  on conflict (organization_id, name) do update
    set description = excluded.description
  returning id into v_template_id;

  insert into public.clinical_template_versions (
    organization_id,
    template_id,
    version_number,
    schema
  ) values (
    p_organization_id,
    v_template_id,
    1,
    '{
      "schemaVersion": 2,
      "sections": [
        {
          "id": "anamnese",
          "title": "Anamnese",
          "fields": [
            {"id": "queixa_principal", "label": "Queixa principal", "type": "textarea", "required": true},
            {"id": "historia_doenca_atual", "label": "História da doença atual", "type": "textarea"}
          ]
        },
        {
          "id": "avaliacao",
          "title": "Avaliação",
          "fields": [
            {"id": "exame_fisico", "label": "Exame físico", "type": "textarea"},
            {"id": "conduta", "label": "Conduta", "type": "textarea", "required": true}
          ]
        }
      ]
    }'::jsonb
  ) on conflict (organization_id, template_id, version_number) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Centralized finalization validation (existing public contracts preserved)
-- ---------------------------------------------------------------------------

create or replace function public.finalize_clinical_encounter(
  p_encounter_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_encounter public.encounters%rowtype;
  v_entry record;
  v_finalized_at timestamptz;
begin
  select encounters.*
    into v_encounter
  from public.encounters
  where encounters.id = p_encounter_id
  for update;

  if v_encounter.id is null then
    raise exception 'Encounter not found.' using errcode = 'P0002';
  end if;
  if v_encounter.status <> 'draft' then
    raise exception 'Encounter is already finalized.' using errcode = '55000';
  end if;
  if not app_private.current_user_has_permission('clinico.finalizar_prontuario')
    or not app_private.can_access_clinical_record(
      v_encounter.organization_id,
      v_encounter.professional_id
    ) then
    raise exception 'Not allowed to finalize encounter.' using errcode = '42501';
  end if;

  select encounter_entries.template_snapshot,
         encounter_entries.structured_data,
         encounter_entries.free_notes
    into v_entry
  from public.encounter_entries
  where encounter_entries.organization_id = v_encounter.organization_id
    and encounter_entries.encounter_id = p_encounter_id;

  if v_entry.template_snapshot is null
    or (
      coalesce(v_entry.structured_data, '{}'::jsonb) = '{}'::jsonb
      and nullif(trim(v_entry.free_notes), '') is null
    ) then
    raise exception 'Clinical encounter is empty.' using errcode = '23514';
  end if;

  perform app_private.validate_clinical_structured_data(
    coalesce(v_entry.template_snapshot -> 'schema', '{}'::jsonb),
    coalesce(v_entry.structured_data, '{}'::jsonb)
  );

  update public.encounters
  set status = 'finalized', finalized_at = statement_timestamp()
  where id = p_encounter_id
  returning finalized_at into v_finalized_at;

  return v_finalized_at;
end;
$$;

create or replace function public.save_and_finalize_clinical_encounter(
  p_encounter_id uuid,
  p_structured_data jsonb,
  p_free_notes text,
  p_diagnoses jsonb default '[]'::jsonb
)
returns timestamptz
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
begin
  perform public.save_clinical_encounter_draft(
    p_encounter_id,
    p_structured_data,
    p_free_notes,
    p_diagnoses
  );

  return public.finalize_clinical_encounter(p_encounter_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Versioned document templates and configurable print layout
-- ---------------------------------------------------------------------------

alter table public.clinical_document_templates
  add column if not exists description text,
  add column if not exists layout_schema jsonb not null default
    '{
      "paperSize": "A4",
      "header": {
        "enabled": true,
        "showLogo": true,
        "logoPosition": "left",
        "showClinicDetails": true,
        "fontSize": "medium"
      },
      "body": {
        "fontSize": "medium",
        "showPatientSummary": true
      },
      "signature": {
        "enabled": true,
        "showCouncil": true
      },
      "footer": {
        "enabled": true,
        "showPatientName": true,
        "showPageNumber": true,
        "fontSize": "small"
      }
    }'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinical_document_templates_layout_object_check'
      and conrelid = 'public.clinical_document_templates'::regclass
  ) then
    alter table public.clinical_document_templates
      add constraint clinical_document_templates_layout_object_check
      check (jsonb_typeof(layout_schema) = 'object');
  end if;
end;
$$;

-- Only replace the original seeded declaration. Tenant-customized text is
-- deliberately left untouched.
update public.clinical_document_templates
set body_template = 'Declaro, para os devidos fins, que {{paciente.nome}}, documento {{paciente.documento}}, compareceu a atendimento nesta clínica em {{atendimento.data}}, das {{atendimento.hora_inicio}} às {{atendimento.hora_fim}}.'
  || chr(10) || chr(10)
  || '{{clinica.cidade}}, {{documento.data_emissao}}.'
where document_type = 'attendance_declaration'
  and body_template = 'Declaro, para os devidos fins, que o(a) paciente compareceu a atendimento nesta clínica na data informada.';

create table if not exists public.clinical_document_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null,
  version_number integer not null check (version_number > 0),
  title_template text not null
    check (nullif(trim(title_template), '') is not null),
  body_template text not null
    check (nullif(trim(body_template), '') is not null),
  layout_schema jsonb not null
    check (jsonb_typeof(layout_schema) = 'object'),
  custom_variables_schema jsonb not null default '[]'::jsonb
    check (jsonb_typeof(custom_variables_schema) = 'array'),
  change_summary text,
  created_by_user_id uuid,
  published_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, template_id, version_number),
  foreign key (organization_id, template_id)
    references public.clinical_document_templates(organization_id, id)
      on delete cascade,
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id)
      on delete set null (created_by_user_id)
);

create index if not exists clinical_document_template_versions_latest_idx
  on public.clinical_document_template_versions (
    organization_id,
    template_id,
    version_number desc
  );

drop trigger if exists prevent_clinical_document_template_version_change
  on public.clinical_document_template_versions;
create trigger prevent_clinical_document_template_version_change
before update or delete on public.clinical_document_template_versions
for each row execute function app_private.prevent_template_version_change();

insert into public.clinical_document_template_versions (
  organization_id,
  template_id,
  version_number,
  title_template,
  body_template,
  layout_schema,
  custom_variables_schema,
  change_summary,
  created_by_user_id,
  published_at,
  created_at
)
select clinical_document_templates.organization_id,
       clinical_document_templates.id,
       1,
       clinical_document_templates.title_template,
       clinical_document_templates.body_template,
       clinical_document_templates.layout_schema,
       '[]'::jsonb,
       'Versão inicial migrada',
       clinical_document_templates.created_by_user_id,
       clinical_document_templates.created_at,
       clinical_document_templates.created_at
from public.clinical_document_templates
where not exists (
  select 1
  from public.clinical_document_template_versions
  where clinical_document_template_versions.organization_id
      = clinical_document_templates.organization_id
    and clinical_document_template_versions.template_id
      = clinical_document_templates.id
);

alter table public.clinical_documents
  add column if not exists template_version_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clinical_documents_template_version_fkey'
      and conrelid = 'public.clinical_documents'::regclass
  ) then
    alter table public.clinical_documents
      add constraint clinical_documents_template_version_fkey
      foreign key (organization_id, template_version_id)
      references public.clinical_document_template_versions(organization_id, id)
      on delete restrict;
  end if;
end;
$$;

create or replace function app_private.is_valid_document_custom_variables(
  p_schema jsonb
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_item jsonb;
  v_id text;
  v_ids text[] := array[]::text[];
begin
  if p_schema is null
    or jsonb_typeof(p_schema) <> 'array'
    or jsonb_array_length(p_schema) > 50 then
    return false;
  end if;

  for v_item in
    select item.value
    from jsonb_array_elements(p_schema) as item(value)
  loop
    v_id := nullif(trim(v_item ->> 'id'), '');
    if jsonb_typeof(v_item) <> 'object'
      or v_id is null
      or v_id !~ '^[a-z][a-z0-9_]{0,63}$'
      or v_id = any(v_ids)
      or nullif(trim(v_item ->> 'label'), '') is null
      or coalesce(v_item ->> 'type', 'text') not in (
        'text', 'textarea', 'number', 'date', 'time', 'boolean',
        'select', 'multiselect'
      )
      or (
        v_item ? 'required'
        and jsonb_typeof(v_item -> 'required') <> 'boolean'
      ) then
      return false;
    end if;
    v_ids := array_append(v_ids, v_id);
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function app_private.is_valid_document_custom_variables(jsonb) from public;

create or replace function public.create_clinical_document_template(
  p_document_type text,
  p_name text,
  p_description text,
  p_title_template text,
  p_body_template text,
  p_layout_schema jsonb default null,
  p_custom_variables_schema jsonb default '[]'::jsonb,
  p_impersonation_session_id uuid default null
)
returns table (
  template_id uuid,
  version_id uuid,
  version_number integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_template_id uuid;
  v_version_id uuid;
  v_layout jsonb;
begin
  select * into v_context
  from app_private.resolve_template_management_context(
    p_impersonation_session_id
  );

  if app_private.clinical_document_permission(p_document_type) is null then
    raise exception 'Invalid clinical document type.' using errcode = '23514';
  end if;
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 160 then
    raise exception 'Document template name is required.' using errcode = '23514';
  end if;
  if p_description is not null and length(p_description) > 2000 then
    raise exception 'Document template description is too long.' using errcode = '23514';
  end if;
  if nullif(trim(p_title_template), '') is null
    or nullif(trim(p_body_template), '') is null then
    raise exception 'Document template title and body are required.'
      using errcode = '23514';
  end if;

  v_layout := coalesce(
    p_layout_schema,
    '{
      "paperSize":"A4",
      "header":{"enabled":true,"showLogo":true,"logoPosition":"left","showClinicDetails":true,"fontSize":"medium"},
      "body":{"fontSize":"medium","showPatientSummary":true},
      "signature":{"enabled":true,"showCouncil":true},
      "footer":{"enabled":true,"showPatientName":true,"showPageNumber":true,"fontSize":"small"}
    }'::jsonb
  );
  if jsonb_typeof(v_layout) <> 'object' then
    raise exception 'Invalid document template layout.' using errcode = '22023';
  end if;
  if not app_private.is_valid_document_custom_variables(
    coalesce(p_custom_variables_schema, '[]'::jsonb)
  ) then
    raise exception 'Invalid document custom variables schema.' using errcode = '22023';
  end if;

  insert into public.clinical_document_templates (
    organization_id,
    document_type,
    name,
    description,
    title_template,
    body_template,
    layout_schema,
    active,
    created_by_user_id
  ) values (
    v_context.organization_id,
    p_document_type,
    trim(p_name),
    nullif(trim(p_description), ''),
    trim(p_title_template),
    trim(p_body_template),
    v_layout,
    true,
    v_context.effective_user_id
  )
  returning id into v_template_id;

  insert into public.clinical_document_template_versions (
    organization_id,
    template_id,
    version_number,
    title_template,
    body_template,
    layout_schema,
    custom_variables_schema,
    change_summary,
    created_by_user_id
  ) values (
    v_context.organization_id,
    v_template_id,
    1,
    trim(p_title_template),
    trim(p_body_template),
    v_layout,
    coalesce(p_custom_variables_schema, '[]'::jsonb),
    'Versão inicial',
    v_context.effective_user_id
  )
  returning id into v_version_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'clinical_document_templates.created',
    'clinical_document_template',
    v_template_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'document_type', p_document_type,
      'version_id', v_version_id,
      'version_number', 1
    ))
  );

  return query select v_template_id, v_version_id, 1;
end;
$$;

create or replace function public.update_clinical_document_template(
  p_template_id uuid,
  p_expected_version_number integer,
  p_name text,
  p_description text,
  p_title_template text,
  p_body_template text,
  p_layout_schema jsonb,
  p_custom_variables_schema jsonb default '[]'::jsonb,
  p_change_summary text default null,
  p_impersonation_session_id uuid default null
)
returns table (
  template_id uuid,
  version_id uuid,
  version_number integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_template public.clinical_document_templates%rowtype;
  v_current_version integer;
  v_next_version integer;
  v_version_id uuid;
begin
  select * into v_context
  from app_private.resolve_template_management_context(
    p_impersonation_session_id
  );

  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 160 then
    raise exception 'Document template name is required.' using errcode = '23514';
  end if;
  if p_description is not null and length(p_description) > 2000 then
    raise exception 'Document template description is too long.' using errcode = '23514';
  end if;
  if nullif(trim(p_title_template), '') is null
    or nullif(trim(p_body_template), '') is null then
    raise exception 'Document template title and body are required.'
      using errcode = '23514';
  end if;
  if p_layout_schema is null
    or jsonb_typeof(p_layout_schema) <> 'object' then
    raise exception 'Invalid document template layout.' using errcode = '22023';
  end if;
  if not app_private.is_valid_document_custom_variables(
    coalesce(p_custom_variables_schema, '[]'::jsonb)
  ) then
    raise exception 'Invalid document custom variables schema.' using errcode = '22023';
  end if;

  select clinical_document_templates.*
    into v_template
  from public.clinical_document_templates
  where clinical_document_templates.id = p_template_id
    and clinical_document_templates.organization_id = v_context.organization_id
  for update;

  if v_template.id is null then
    raise exception 'Document template not found.' using errcode = 'P0002';
  end if;
  if not v_template.active then
    raise exception 'Inactive document templates cannot be edited.' using errcode = '55000';
  end if;

  select max(clinical_document_template_versions.version_number)
    into v_current_version
  from public.clinical_document_template_versions
  where clinical_document_template_versions.organization_id
      = v_context.organization_id
    and clinical_document_template_versions.template_id = p_template_id;

  if p_expected_version_number is distinct from v_current_version then
    raise exception 'Document template version conflict.' using errcode = '40001';
  end if;
  v_next_version := v_current_version + 1;

  update public.clinical_document_templates
  set name = trim(p_name),
      description = nullif(trim(p_description), ''),
      title_template = trim(p_title_template),
      body_template = trim(p_body_template),
      layout_schema = p_layout_schema
  where id = p_template_id;

  insert into public.clinical_document_template_versions (
    organization_id,
    template_id,
    version_number,
    title_template,
    body_template,
    layout_schema,
    custom_variables_schema,
    change_summary,
    created_by_user_id
  ) values (
    v_context.organization_id,
    p_template_id,
    v_next_version,
    trim(p_title_template),
    trim(p_body_template),
    p_layout_schema,
    coalesce(p_custom_variables_schema, '[]'::jsonb),
    nullif(trim(p_change_summary), ''),
    v_context.effective_user_id
  )
  returning id into v_version_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'clinical_document_templates.version_published',
    'clinical_document_template',
    p_template_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'document_type', v_template.document_type,
      'version_id', v_version_id,
      'version_number', v_next_version,
      'previous_version_number', v_current_version,
      'change_summary', nullif(trim(p_change_summary), '')
    ))
  );

  return query select p_template_id, v_version_id, v_next_version;
end;
$$;

create or replace function public.duplicate_clinical_document_template(
  p_source_template_id uuid,
  p_name text,
  p_source_version_id uuid default null,
  p_impersonation_session_id uuid default null
)
returns table (
  template_id uuid,
  version_id uuid,
  version_number integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_source public.clinical_document_templates%rowtype;
  v_source_version public.clinical_document_template_versions%rowtype;
  v_template_id uuid;
  v_version_id uuid;
begin
  select * into v_context
  from app_private.resolve_template_management_context(
    p_impersonation_session_id
  );

  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 160 then
    raise exception 'Document template name is required.' using errcode = '23514';
  end if;

  select clinical_document_templates.*
    into v_source
  from public.clinical_document_templates
  where clinical_document_templates.id = p_source_template_id
    and clinical_document_templates.organization_id = v_context.organization_id;

  if v_source.id is null then
    raise exception 'Source document template not found.' using errcode = 'P0002';
  end if;

  select clinical_document_template_versions.*
    into v_source_version
  from public.clinical_document_template_versions
  where clinical_document_template_versions.organization_id
      = v_context.organization_id
    and clinical_document_template_versions.template_id = p_source_template_id
    and (
      p_source_version_id is null
      or clinical_document_template_versions.id = p_source_version_id
    )
  order by clinical_document_template_versions.version_number desc
  limit 1;

  if v_source_version.id is null then
    raise exception 'Source document template version not found.' using errcode = 'P0002';
  end if;

  insert into public.clinical_document_templates (
    organization_id,
    document_type,
    name,
    description,
    title_template,
    body_template,
    layout_schema,
    active,
    created_by_user_id
  ) values (
    v_context.organization_id,
    v_source.document_type,
    trim(p_name),
    v_source.description,
    v_source_version.title_template,
    v_source_version.body_template,
    v_source_version.layout_schema,
    true,
    v_context.effective_user_id
  )
  returning id into v_template_id;

  insert into public.clinical_document_template_versions (
    organization_id,
    template_id,
    version_number,
    title_template,
    body_template,
    layout_schema,
    custom_variables_schema,
    change_summary,
    created_by_user_id
  ) values (
    v_context.organization_id,
    v_template_id,
    1,
    v_source_version.title_template,
    v_source_version.body_template,
    v_source_version.layout_schema,
    v_source_version.custom_variables_schema,
    'Duplicado de outro modelo',
    v_context.effective_user_id
  )
  returning id into v_version_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'clinical_document_templates.duplicated',
    'clinical_document_template',
    v_template_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'document_type', v_source.document_type,
      'source_template_id', p_source_template_id,
      'source_version_id', v_source_version.id,
      'source_version_number', v_source_version.version_number,
      'version_id', v_version_id,
      'version_number', 1
    ))
  );

  return query select v_template_id, v_version_id, 1;
end;
$$;

create or replace function public.set_clinical_document_template_active(
  p_template_id uuid,
  p_active boolean,
  p_impersonation_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_template public.clinical_document_templates%rowtype;
begin
  select * into v_context
  from app_private.resolve_template_management_context(
    p_impersonation_session_id
  );

  if p_active is null then
    raise exception 'Document template active state is required.'
      using errcode = '23514';
  end if;

  select clinical_document_templates.*
    into v_template
  from public.clinical_document_templates
  where clinical_document_templates.id = p_template_id
    and clinical_document_templates.organization_id = v_context.organization_id
  for update;

  if v_template.id is null then
    raise exception 'Document template not found.' using errcode = 'P0002';
  end if;
  if v_template.active = p_active then
    return p_template_id;
  end if;

  update public.clinical_document_templates
  set active = p_active
  where id = p_template_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    case p_active
      when true then 'clinical_document_templates.restored'
      else 'clinical_document_templates.archived'
    end,
    'clinical_document_template',
    p_template_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'document_type', v_template.document_type,
      'active', p_active
    ))
  );

  return p_template_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Immutable issued documents with a server-owned template/render snapshot
-- ---------------------------------------------------------------------------

create or replace function public.issue_clinical_document_v2(
  p_encounter_id uuid,
  p_document_type text,
  p_title text,
  p_body text,
  p_template_id uuid default null,
  p_template_version_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_impersonation_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_encounter public.encounters%rowtype;
  v_template public.clinical_document_templates%rowtype;
  v_version public.clinical_document_template_versions%rowtype;
  v_permission text;
  v_document_id uuid;
  v_timezone text;
  v_default_layout jsonb := '{
    "paperSize":"A4",
    "header":{"enabled":true,"showLogo":true,"logoPosition":"left","showClinicDetails":true,"fontSize":"medium"},
    "body":{"fontSize":"medium","showPatientSummary":true},
    "signature":{"enabled":true,"showCouncil":true},
    "footer":{"enabled":true,"showPatientName":true,"showPageNumber":true,"fontSize":"small"}
  }'::jsonb;
  v_layout jsonb;
  v_clinic jsonb;
  v_unit jsonb;
  v_patient jsonb;
  v_professional jsonb;
  v_appointment jsonb;
  v_snapshot jsonb;
  v_safe_metadata jsonb;
begin
  select * into v_context
  from app_private.resolve_effective_request_context(
    p_impersonation_session_id
  );

  v_permission := app_private.clinical_document_permission(p_document_type);
  if v_permission is null then
    raise exception 'Invalid clinical document type.' using errcode = '23514';
  end if;
  if not app_private.user_has_permission(
    v_context.effective_user_id,
    v_permission
  ) then
    raise exception 'Not allowed to issue clinical document.' using errcode = '42501';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_body), '') is null then
    raise exception 'Clinical document title and body are required.'
      using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
    or pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 65536 then
    raise exception 'Invalid clinical document metadata.' using errcode = '22023';
  end if;

  select encounters.*
    into v_encounter
  from public.encounters
  where encounters.id = p_encounter_id
    and encounters.organization_id = v_context.organization_id;

  if v_encounter.id is null then
    raise exception 'Encounter not found.' using errcode = 'P0002';
  end if;

  if not (
    app_private.user_has_permission(
      v_context.effective_user_id,
      'clinico.ver_prontuario'
    )
    or (
      app_private.user_has_permission(
        v_context.effective_user_id,
        'clinico.ver_prontuario_proprios'
      )
      and exists (
        select 1
        from public.professionals
        where professionals.organization_id = v_context.organization_id
          and professionals.id = v_encounter.professional_id
          and professionals.user_id = v_context.effective_user_id
          and professionals.active
      )
    )
  ) then
    raise exception 'Not allowed to issue clinical document.' using errcode = '42501';
  end if;

  if p_template_id is null and p_template_version_id is not null then
    raise exception 'A document template is required for the selected version.'
      using errcode = '23514';
  end if;

  if p_template_id is not null then
    select clinical_document_templates.*
      into v_template
    from public.clinical_document_templates
    where clinical_document_templates.organization_id = v_context.organization_id
      and clinical_document_templates.id = p_template_id
      and clinical_document_templates.document_type = p_document_type
      and clinical_document_templates.active;

    if v_template.id is null then
      raise exception 'Clinical document template not found.' using errcode = '23503';
    end if;

    select clinical_document_template_versions.*
      into v_version
    from public.clinical_document_template_versions
    where clinical_document_template_versions.organization_id
        = v_context.organization_id
      and clinical_document_template_versions.template_id = p_template_id
      and (
        p_template_version_id is null
        or clinical_document_template_versions.id = p_template_version_id
      )
    order by clinical_document_template_versions.version_number desc
    limit 1;

    if v_version.id is null then
      raise exception 'Clinical document template version not found.'
        using errcode = '23503';
    end if;
    v_layout := v_version.layout_schema;
  else
    v_layout := v_default_layout;
  end if;

  select coalesce(organization_settings.timezone, 'America/Fortaleza')
    into v_timezone
  from public.organization_settings
  where organization_settings.organization_id = v_context.organization_id;
  v_timezone := coalesce(v_timezone, 'America/Fortaleza');

  select jsonb_build_object(
           'id', clinics.id,
           'trade_name', clinics.trade_name,
           'legal_name', clinics.legal_name,
           'document', clinics.document,
           'phone', clinics.phone,
           'email', clinics.email,
           'postal_code', clinics.postal_code,
           'address_line', clinics.address_line,
           'address_number', clinics.address_number,
           'address_complement', clinics.address_complement,
           'district', clinics.district,
           'city', clinics.city,
           'state', clinics.state,
           'logo_url', organizations.logo_url
         )
    into v_clinic
  from public.clinics
  join public.organizations
    on organizations.id = clinics.organization_id
  where clinics.organization_id = v_context.organization_id;

  select jsonb_build_object(
           'id', patients.id,
           'full_name', patients.full_name,
           'social_name', patients.social_name,
           'cpf', patients.cpf,
           'rg', patients.rg,
           'birth_date', patients.birth_date,
           'email', patients.email,
           'phone', patients.phone
         )
    into v_patient
  from public.patients
  where patients.organization_id = v_context.organization_id
    and patients.id = v_encounter.patient_id;

  select jsonb_build_object(
           'id', professionals.id,
           'name', professionals.name,
           'council_type', professionals.council_type,
           'council_number', professionals.council_number,
           'council_state', professionals.council_state,
           'specialty_id', professionals.specialty_id,
           'specialty_name', specialties.name
         )
    into v_professional
  from public.professionals
  left join public.specialties
    on specialties.organization_id = professionals.organization_id
   and specialties.id = professionals.specialty_id
  where professionals.organization_id = v_context.organization_id
    and professionals.id = v_encounter.professional_id;

  select jsonb_build_object(
           'id', appointments.id,
           'start_at', appointments.start_at,
           'end_at', appointments.end_at,
           'unit_id', appointments.unit_id,
           'unit_name', units.name,
           'procedure_id', appointments.procedure_id,
           'procedure_name', procedures.name,
           'status', appointments.status
         )
    into v_appointment
  from public.appointments
  left join public.units
    on units.organization_id = appointments.organization_id
   and units.id = appointments.unit_id
  left join public.procedures
    on procedures.organization_id = appointments.organization_id
   and procedures.id = appointments.procedure_id
  where appointments.organization_id = v_context.organization_id
    and appointments.id = v_encounter.appointment_id;

  select jsonb_build_object(
           'id', units.id,
           'name', units.name,
           'phone', units.phone,
           'email', units.email,
           'postal_code', units.postal_code,
           'address_line', units.address_line,
           'address_number', units.address_number,
           'address_complement', units.address_complement,
           'district', units.district,
           'city', units.city,
           'state', units.state
         )
    into v_unit
  from public.units
  where units.organization_id = v_context.organization_id
    and units.id = (
      select appointments.unit_id
      from public.appointments
      where appointments.organization_id = v_context.organization_id
        and appointments.id = v_encounter.appointment_id
    );

  if v_appointment is null then
    v_appointment := jsonb_build_object(
      'id', null,
      'start_at', v_encounter.started_at,
      'end_at', v_encounter.finalized_at,
      'unit_id', null,
      'unit_name', null,
      'status', v_encounter.status
    );
  end if;

  v_snapshot := jsonb_build_object(
    'schema_version', 2,
    'template', jsonb_build_object(
      'id', v_template.id,
      'version_id', v_version.id,
      'version_number', v_version.version_number,
      'layout_schema', v_layout
    ),
    'render', jsonb_build_object(
      'timezone', v_timezone,
      'clinic', coalesce(v_clinic, 'null'::jsonb),
      'unit', coalesce(v_unit, 'null'::jsonb),
      'patient', coalesce(v_patient, 'null'::jsonb),
      'professional', coalesce(v_professional, 'null'::jsonb),
      'appointment', coalesce(v_appointment, 'null'::jsonb)
    )
  );

  -- Callers may add non-reserved metadata, but cannot replace the trusted
  -- rendering snapshot produced above.
  v_safe_metadata := (
    coalesce(p_metadata, '{}'::jsonb)
      - array['schema_version', 'template', 'render']::text[]
  ) || v_snapshot;

  insert into public.clinical_documents (
    organization_id,
    encounter_id,
    patient_id,
    professional_id,
    template_id,
    template_version_id,
    document_type,
    title,
    body,
    metadata,
    issued_by_user_id
  ) values (
    v_context.organization_id,
    v_encounter.id,
    v_encounter.patient_id,
    v_encounter.professional_id,
    v_template.id,
    v_version.id,
    p_document_type,
    trim(p_title),
    trim(p_body),
    v_safe_metadata,
    v_context.effective_user_id
  )
  returning id into v_document_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, resource_type, resource_id, metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'clinical_documents.issue',
    'clinical_documents',
    v_document_id,
    jsonb_strip_nulls(jsonb_build_object(
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id,
      'document_type', p_document_type,
      'encounter_id', v_encounter.id,
      'patient_id', v_encounter.patient_id,
      'professional_id', v_encounter.professional_id,
      'template_id', v_template.id,
      'template_version_id', v_version.id,
      'template_version_number', v_version.version_number
    ))
  );

  return v_document_id;
end;
$$;

-- Preserve the existing six-argument API for normal tenant users. Support
-- impersonation uses issue_clinical_document_v2 so it can pass the session id.
create or replace function public.issue_clinical_document(
  p_encounter_id uuid,
  p_document_type text,
  p_title text,
  p_body text,
  p_template_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
begin
  return public.issue_clinical_document_v2(
    p_encounter_id,
    p_document_type,
    p_title,
    p_body,
    p_template_id,
    null,
    p_metadata,
    null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Default document templates for existing and future tenants
-- ---------------------------------------------------------------------------

create or replace function app_private.seed_default_clinical_document_templates(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into public.clinical_document_templates (
    organization_id,
    document_type,
    name,
    description,
    title_template,
    body_template
  )
  values
    (
      p_organization_id,
      'prescription',
      'Prescrição simples',
      'Modelo básico para prescrição livre.',
      'Prescrição',
      'Uso conforme orientação profissional:' || chr(10) || chr(10) || '1. '
    ),
    (
      p_organization_id,
      'exam_request',
      'Solicitação de exames',
      'Modelo básico para solicitação de exames.',
      'Solicitação de exames',
      'Solicito a realização dos seguintes exames:' || chr(10) || chr(10) || '- '
    ),
    (
      p_organization_id,
      'medical_certificate',
      'Atestado',
      'Modelo básico de atestado médico.',
      'Atestado',
      'Atesto, para os devidos fins, que o(a) paciente necessita de afastamento por __ dias a partir de __/__/____.'
    ),
    (
      p_organization_id,
      'attendance_declaration',
      'Declaração de comparecimento',
      'Declaração preenchida com os dados do atendimento.',
      'Declaração de comparecimento',
      'Declaro, para os devidos fins, que {{paciente.nome}}, documento {{paciente.documento}}, compareceu a atendimento nesta clínica em {{atendimento.data}}, das {{atendimento.hora_inicio}} às {{atendimento.hora_fim}}.'
        || chr(10) || chr(10)
        || '{{clinica.cidade}}, {{documento.data_emissao}}.'
    )
  on conflict (organization_id, document_type, name) do nothing;

  insert into public.clinical_document_template_versions (
    organization_id,
    template_id,
    version_number,
    title_template,
    body_template,
    layout_schema,
    custom_variables_schema,
    change_summary,
    created_by_user_id,
    published_at,
    created_at
  )
  select clinical_document_templates.organization_id,
         clinical_document_templates.id,
         1,
         clinical_document_templates.title_template,
         clinical_document_templates.body_template,
         clinical_document_templates.layout_schema,
         '[]'::jsonb,
         'Versão inicial',
         clinical_document_templates.created_by_user_id,
         clinical_document_templates.created_at,
         clinical_document_templates.created_at
  from public.clinical_document_templates
  where clinical_document_templates.organization_id = p_organization_id
    and not exists (
      select 1
      from public.clinical_document_template_versions
      where clinical_document_template_versions.organization_id
          = clinical_document_templates.organization_id
        and clinical_document_template_versions.template_id
          = clinical_document_templates.id
    );
end;
$$;

-- Ensure any templates missed by earlier partial/manual deployments have a
-- baseline version after the seed function has been upgraded.
do $$
declare
  v_organization record;
begin
  for v_organization in select organizations.id from public.organizations loop
    perform app_private.seed_default_clinical_document_templates(v_organization.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS, direct DML hardening and RPC execution grants
-- ---------------------------------------------------------------------------

alter table public.clinical_document_template_versions enable row level security;

drop policy if exists clinical_templates_select on public.clinical_templates;
create policy clinical_templates_select
on public.clinical_templates for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('clinico.criar_template')
      or app_private.current_user_has_permission('clinico.ver_prontuario')
      or app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
    )
  )
);

drop policy if exists clinical_template_versions_select
  on public.clinical_template_versions;
create policy clinical_template_versions_select
on public.clinical_template_versions for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('clinico.criar_template')
      or app_private.current_user_has_permission('clinico.ver_prontuario')
      or app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
    )
  )
);

drop policy if exists clinical_document_templates_select
  on public.clinical_document_templates;
create policy clinical_document_templates_select
on public.clinical_document_templates for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('clinico.criar_template')
      or app_private.current_user_has_permission('clinico.prescrever')
      or app_private.current_user_has_permission('clinico.solicitar_exame')
      or app_private.current_user_has_permission('clinico.emitir_atestado')
      or app_private.current_user_has_permission('clinico.ver_prontuario')
      or app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
    )
  )
);

drop policy if exists clinical_document_template_versions_select
  on public.clinical_document_template_versions;
create policy clinical_document_template_versions_select
on public.clinical_document_template_versions for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('clinico.criar_template')
      or app_private.current_user_has_permission('clinico.prescrever')
      or app_private.current_user_has_permission('clinico.solicitar_exame')
      or app_private.current_user_has_permission('clinico.emitir_atestado')
      or app_private.current_user_has_permission('clinico.ver_prontuario')
      or app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
    )
  )
);

drop policy if exists clinical_templates_manage on public.clinical_templates;
drop policy if exists clinical_template_versions_insert
  on public.clinical_template_versions;
drop policy if exists clinical_document_templates_manage
  on public.clinical_document_templates;

revoke insert, update, delete on public.clinical_templates from authenticated;
revoke insert, update, delete on public.clinical_template_versions from authenticated;
revoke insert, update, delete on public.clinical_document_templates from authenticated;
revoke insert, update, delete on public.clinical_document_template_versions
  from authenticated;

grant select on public.clinical_templates,
  public.clinical_template_versions,
  public.clinical_document_templates,
  public.clinical_document_template_versions
to authenticated;

grant all on public.clinical_document_template_versions to service_role;

revoke all on function public.create_clinical_template(
  text, jsonb, text, uuid, uuid
) from public;
revoke all on function public.update_clinical_template(
  uuid, integer, text, jsonb, text, uuid, text, uuid
) from public;
revoke all on function public.duplicate_clinical_template(
  uuid, text, uuid, uuid
) from public;
revoke all on function public.set_clinical_template_status(
  uuid, text, uuid
) from public;
revoke all on function public.set_default_clinical_template(uuid, uuid)
  from public;
revoke all on function public.create_clinical_document_template(
  text, text, text, text, text, jsonb, jsonb, uuid
) from public;
revoke all on function public.update_clinical_document_template(
  uuid, integer, text, text, text, text, jsonb, jsonb, text, uuid
) from public;
revoke all on function public.duplicate_clinical_document_template(
  uuid, text, uuid, uuid
) from public;
revoke all on function public.set_clinical_document_template_active(
  uuid, boolean, uuid
) from public;
revoke all on function public.issue_clinical_document_v2(
  uuid, text, text, text, uuid, uuid, jsonb, uuid
) from public;

grant execute on function public.create_clinical_template(
  text, jsonb, text, uuid, uuid
) to authenticated, service_role;
grant execute on function public.update_clinical_template(
  uuid, integer, text, jsonb, text, uuid, text, uuid
) to authenticated, service_role;
grant execute on function public.duplicate_clinical_template(
  uuid, text, uuid, uuid
) to authenticated, service_role;
grant execute on function public.set_clinical_template_status(
  uuid, text, uuid
) to authenticated, service_role;
grant execute on function public.set_default_clinical_template(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.create_clinical_document_template(
  text, text, text, text, text, jsonb, jsonb, uuid
) to authenticated, service_role;
grant execute on function public.update_clinical_document_template(
  uuid, integer, text, text, text, text, jsonb, jsonb, text, uuid
) to authenticated, service_role;
grant execute on function public.duplicate_clinical_document_template(
  uuid, text, uuid, uuid
) to authenticated, service_role;
grant execute on function public.set_clinical_document_template_active(
  uuid, boolean, uuid
) to authenticated, service_role;
grant execute on function public.issue_clinical_document_v2(
  uuid, text, text, text, uuid, uuid, jsonb, uuid
) to authenticated, service_role;

-- Reassert grants for the existing signatures replaced above.
revoke all on function public.finalize_clinical_encounter(uuid) from public;
revoke all on function public.save_and_finalize_clinical_encounter(
  uuid, jsonb, text, jsonb
) from public;
revoke all on function public.issue_clinical_document(
  uuid, text, text, text, uuid, jsonb
) from public;
grant execute on function public.finalize_clinical_encounter(uuid)
  to authenticated, service_role;
grant execute on function public.save_and_finalize_clinical_encounter(
  uuid, jsonb, text, jsonb
) to authenticated, service_role;
grant execute on function public.issue_clinical_document(
  uuid, text, text, text, uuid, jsonb
) to authenticated, service_role;

comment on column public.clinical_templates.is_default is
  'The active template preselected when a clinical encounter is created.';
comment on table public.clinical_document_template_versions is
  'Immutable versions of tenant-scoped clinical document templates.';
comment on column public.clinical_documents.template_version_id is
  'Immutable document template version used as the source for this issued document.';
comment on function public.issue_clinical_document_v2(
  uuid, text, text, text, uuid, uuid, jsonb, uuid
) is
  'Issues an immutable document with effective-user authorization and a trusted render snapshot.';
