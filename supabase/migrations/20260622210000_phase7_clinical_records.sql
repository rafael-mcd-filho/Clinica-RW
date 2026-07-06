-- Phase 7: clinical templates, encounters, immutable finalization and addenda.

create table public.clinical_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  specialty_id uuid,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name),
  foreign key (organization_id, specialty_id)
    references public.specialties(organization_id, id) on delete set null (specialty_id),
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id) on delete set null (created_by_user_id)
);

create table public.clinical_template_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null,
  version_number integer not null check (version_number > 0),
  schema jsonb not null check (jsonb_typeof(schema) = 'object'),
  published_at timestamptz not null default now(),
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, template_id, version_number),
  foreign key (organization_id, template_id)
    references public.clinical_templates(organization_id, id) on delete cascade,
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id) on delete set null (created_by_user_id)
);

create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  professional_id uuid not null,
  appointment_id uuid,
  template_version_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  started_at timestamptz not null default now(),
  finalized_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'draft' and finalized_at is null)
    or (status = 'finalized' and finalized_at is not null)
  ),
  unique (organization_id, id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  foreign key (organization_id, professional_id)
    references public.professionals(organization_id, id),
  foreign key (organization_id, appointment_id)
    references public.appointments(organization_id, id) on delete set null (appointment_id),
  foreign key (organization_id, template_version_id)
    references public.clinical_template_versions(organization_id, id),
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id) on delete set null (created_by_user_id)
);

create unique index encounters_organization_appointment_key
  on public.encounters(organization_id, appointment_id)
  where appointment_id is not null;

create table public.encounter_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  encounter_id uuid not null,
  template_snapshot jsonb not null check (jsonb_typeof(template_snapshot) = 'object'),
  structured_data jsonb not null default '{}'::jsonb check (jsonb_typeof(structured_data) = 'object'),
  free_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, encounter_id),
  foreign key (organization_id, encounter_id)
    references public.encounters(organization_id, id) on delete cascade
);

create table public.encounter_diagnoses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  encounter_id uuid not null,
  cid_code text not null,
  description text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, encounter_id, cid_code),
  foreign key (organization_id, encounter_id)
    references public.encounters(organization_id, id) on delete cascade
);

create table public.encounter_addenda (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  encounter_id uuid not null,
  author_user_id uuid not null,
  content text not null check (nullif(trim(content), '') is not null),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, encounter_id)
    references public.encounters(organization_id, id) on delete cascade,
  foreign key (organization_id, author_user_id)
    references public.app_users(organization_id, id)
);

create index encounters_patient_started_idx
  on public.encounters(organization_id, patient_id, started_at desc);
create index encounters_professional_started_idx
  on public.encounters(organization_id, professional_id, started_at desc);
create index encounter_addenda_encounter_idx
  on public.encounter_addenda(encounter_id, created_at);

create trigger set_clinical_templates_updated_at
before update on public.clinical_templates
for each row execute function app_private.set_updated_at();

create trigger set_encounters_updated_at
before update on public.encounters
for each row execute function app_private.set_updated_at();

create trigger set_encounter_entries_updated_at
before update on public.encounter_entries
for each row execute function app_private.set_updated_at();

create or replace function app_private.current_professional_id(
  p_organization_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select professionals.id
  from public.professionals
  where professionals.organization_id = p_organization_id
    and professionals.user_id = app_private.current_app_user_id()
    and professionals.active
  limit 1
$$;

create or replace function app_private.can_access_clinical_record(
  p_organization_id uuid,
  p_professional_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.current_is_super_admin()
    or (
      p_organization_id = app_private.current_organization_id()
      and (
        app_private.current_user_has_permission('clinico.ver_prontuario')
        or (
          app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
          and p_professional_id = app_private.current_professional_id(p_organization_id)
        )
      )
    )
$$;

create or replace function app_private.prevent_clinical_immutable_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'DELETE' and app_private.current_is_super_admin() then
    return old;
  end if;
  raise exception 'Clinical history is immutable.' using errcode = '55000';
end;
$$;

create trigger prevent_template_version_update_delete
before update or delete on public.clinical_template_versions
for each row execute function app_private.prevent_clinical_immutable_change();

create or replace function app_private.protect_finalized_encounter()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'DELETE' and app_private.current_is_super_admin() then
    return old;
  end if;
  if old.status = 'finalized' then
    raise exception 'Finalized encounter is immutable.' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger protect_finalized_encounter
before update or delete on public.encounters
for each row execute function app_private.protect_finalized_encounter();

create or replace function app_private.protect_finalized_entry()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op = 'DELETE' and app_private.current_is_super_admin() then
    return old;
  end if;
  if exists (
    select 1 from public.encounters
    where organization_id = old.organization_id
      and id = old.encounter_id
      and status = 'finalized'
  ) then
    raise exception 'Finalized encounter entry is immutable.' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger protect_finalized_entry
before update or delete on public.encounter_entries
for each row execute function app_private.protect_finalized_entry();

create trigger prevent_addendum_update_delete
before update or delete on public.encounter_addenda
for each row execute function app_private.prevent_clinical_immutable_change();

create or replace function public.create_clinical_encounter(
  p_patient_id uuid,
  p_professional_id uuid,
  p_template_version_id uuid,
  p_appointment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_organization_id uuid;
  v_actor_id uuid;
  v_encounter_id uuid;
  v_template record;
begin
  v_organization_id := app_private.current_organization_id();
  v_actor_id := app_private.current_app_user_id();

  if v_organization_id is null
    or not app_private.current_user_has_permission('clinico.preencher_prontuario') then
    raise exception 'Not allowed to create clinical encounter.' using errcode = '42501';
  end if;

  if not (
    app_private.current_user_has_permission('clinico.ver_prontuario')
    or p_professional_id = app_private.current_professional_id(v_organization_id)
  ) then
    raise exception 'Professional scope denied.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients
    where organization_id = v_organization_id and id = p_patient_id
      and deleted_at is null
  ) or not exists (
    select 1 from public.professionals
    where organization_id = v_organization_id and id = p_professional_id and active
  ) then
    raise exception 'Patient or professional not found.' using errcode = '23503';
  end if;

  select templates.id as template_id, templates.name,
         versions.version_number, versions.schema
    into v_template
  from public.clinical_template_versions as versions
  join public.clinical_templates as templates
    on templates.organization_id = versions.organization_id
   and templates.id = versions.template_id
  where versions.organization_id = v_organization_id
    and versions.id = p_template_version_id
    and templates.status = 'active';

  if v_template.template_id is null then
    raise exception 'Clinical template version not found.' using errcode = '23503';
  end if;

  if p_appointment_id is not null and not exists (
    select 1 from public.appointments
    where organization_id = v_organization_id
      and id = p_appointment_id
      and patient_id = p_patient_id
      and professional_id = p_professional_id
  ) then
    raise exception 'Appointment does not match encounter.' using errcode = '23514';
  end if;

  insert into public.encounters (
    organization_id, patient_id, professional_id, appointment_id,
    template_version_id, created_by_user_id
  ) values (
    v_organization_id, p_patient_id, p_professional_id, p_appointment_id,
    p_template_version_id, v_actor_id
  ) returning id into v_encounter_id;

  insert into public.encounter_entries (
    organization_id, encounter_id, template_snapshot
  ) values (
    v_organization_id,
    v_encounter_id,
    jsonb_build_object(
      'template_id', v_template.template_id,
      'template_version_id', p_template_version_id,
      'name', v_template.name,
      'version_number', v_template.version_number,
      'schema', v_template.schema
    )
  );

  return v_encounter_id;
end;
$$;

create or replace function public.save_clinical_encounter_draft(
  p_encounter_id uuid,
  p_structured_data jsonb,
  p_free_notes text,
  p_diagnoses jsonb default '[]'::jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_encounter public.encounters%rowtype;
  v_updated_at timestamptz;
begin
  select * into v_encounter from public.encounters
  where id = p_encounter_id for update;

  if v_encounter.id is null then
    raise exception 'Encounter not found.' using errcode = 'P0002';
  end if;
  if v_encounter.status <> 'draft' then
    raise exception 'Only draft encounter can be edited.' using errcode = '55000';
  end if;
  if not app_private.current_user_has_permission('clinico.preencher_prontuario')
    or not app_private.can_access_clinical_record(
      v_encounter.organization_id, v_encounter.professional_id
    ) then
    raise exception 'Not allowed to edit encounter.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_structured_data, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_diagnoses, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid clinical payload.' using errcode = '22023';
  end if;

  update public.encounter_entries
  set structured_data = coalesce(p_structured_data, '{}'::jsonb),
      free_notes = nullif(trim(p_free_notes), '')
  where organization_id = v_encounter.organization_id
    and encounter_id = p_encounter_id
  returning updated_at into v_updated_at;

  delete from public.encounter_diagnoses
  where organization_id = v_encounter.organization_id
    and encounter_id = p_encounter_id;

  insert into public.encounter_diagnoses (
    organization_id, encounter_id, cid_code, description, is_primary
  )
  select
    v_encounter.organization_id,
    p_encounter_id,
    trim(item ->> 'cid_code'),
    nullif(trim(item ->> 'description'), ''),
    coalesce((item ->> 'is_primary')::boolean, false)
  from jsonb_array_elements(coalesce(p_diagnoses, '[]'::jsonb)) as item
  where nullif(trim(item ->> 'cid_code'), '') is not null;

  return v_updated_at;
end;
$$;

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
  v_finalized_at timestamptz;
begin
  select * into v_encounter from public.encounters
  where id = p_encounter_id for update;

  if v_encounter.id is null then
    raise exception 'Encounter not found.' using errcode = 'P0002';
  end if;
  if v_encounter.status <> 'draft' then
    raise exception 'Encounter is already finalized.' using errcode = '55000';
  end if;
  if not app_private.current_user_has_permission('clinico.finalizar_prontuario')
    or not app_private.can_access_clinical_record(
      v_encounter.organization_id, v_encounter.professional_id
    ) then
    raise exception 'Not allowed to finalize encounter.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.encounter_entries
    where organization_id = v_encounter.organization_id
      and encounter_id = p_encounter_id
      and (structured_data <> '{}'::jsonb or nullif(trim(free_notes), '') is not null)
  ) then
    raise exception 'Clinical encounter is empty.' using errcode = '23514';
  end if;

  update public.encounters
  set status = 'finalized', finalized_at = statement_timestamp()
  where id = p_encounter_id
  returning finalized_at into v_finalized_at;

  return v_finalized_at;
end;
$$;

create or replace function public.add_clinical_encounter_addendum(
  p_encounter_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_encounter public.encounters%rowtype;
  v_addendum_id uuid;
  v_actor_id uuid;
begin
  select * into v_encounter from public.encounters where id = p_encounter_id;
  v_actor_id := app_private.current_app_user_id();

  if v_encounter.id is null then
    raise exception 'Encounter not found.' using errcode = 'P0002';
  end if;
  if v_encounter.status <> 'finalized' then
    raise exception 'Addendum requires finalized encounter.' using errcode = '23514';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'Addendum content is required.' using errcode = '23514';
  end if;
  if not app_private.current_user_has_permission('clinico.adicionar_adendo')
    or not app_private.can_access_clinical_record(
      v_encounter.organization_id, v_encounter.professional_id
    ) then
    raise exception 'Not allowed to add encounter addendum.' using errcode = '42501';
  end if;

  insert into public.encounter_addenda (
    organization_id, encounter_id, author_user_id, content
  ) values (
    v_encounter.organization_id, p_encounter_id, v_actor_id, trim(p_content)
  ) returning id into v_addendum_id;

  return v_addendum_id;
end;
$$;

revoke all on function public.create_clinical_encounter(uuid, uuid, uuid, uuid) from public;
revoke all on function public.save_clinical_encounter_draft(uuid, jsonb, text, jsonb) from public;
revoke all on function public.finalize_clinical_encounter(uuid) from public;
revoke all on function public.add_clinical_encounter_addendum(uuid, text) from public;
grant execute on function public.create_clinical_encounter(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.save_clinical_encounter_draft(uuid, jsonb, text, jsonb) to authenticated, service_role;
grant execute on function public.finalize_clinical_encounter(uuid) to authenticated, service_role;
grant execute on function public.add_clinical_encounter_addendum(uuid, text) to authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'clinical_templates', 'clinical_template_versions', 'encounters',
    'encounter_entries', 'encounter_diagnoses', 'encounter_addenda'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

create policy clinical_templates_select on public.clinical_templates
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('clinico.ver_prontuario')
      or app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
    )
  )
);

create policy clinical_templates_manage on public.clinical_templates
for all to authenticated
using (
  organization_id = app_private.current_organization_id()
  and app_private.current_user_has_permission('clinico.criar_template')
)
with check (
  organization_id = app_private.current_organization_id()
  and app_private.current_user_has_permission('clinico.criar_template')
);

create policy clinical_template_versions_select on public.clinical_template_versions
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('clinico.ver_prontuario')
      or app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
    )
  )
);

create policy clinical_template_versions_insert on public.clinical_template_versions
for insert to authenticated
with check (
  organization_id = app_private.current_organization_id()
  and app_private.current_user_has_permission('clinico.criar_template')
);

create policy encounters_select on public.encounters
for select to authenticated
using (app_private.can_access_clinical_record(organization_id, professional_id));

create policy encounter_entries_select on public.encounter_entries
for select to authenticated
using (
  exists (
    select 1 from public.encounters
    where encounters.organization_id = encounter_entries.organization_id
      and encounters.id = encounter_entries.encounter_id
      and app_private.can_access_clinical_record(
        encounters.organization_id, encounters.professional_id
      )
  )
);

create policy encounter_diagnoses_select on public.encounter_diagnoses
for select to authenticated
using (
  exists (
    select 1 from public.encounters
    where encounters.organization_id = encounter_diagnoses.organization_id
      and encounters.id = encounter_diagnoses.encounter_id
      and app_private.can_access_clinical_record(
        encounters.organization_id, encounters.professional_id
      )
  )
);

create policy encounter_addenda_select on public.encounter_addenda
for select to authenticated
using (
  exists (
    select 1 from public.encounters
    where encounters.organization_id = encounter_addenda.organization_id
      and encounters.id = encounter_addenda.encounter_id
      and app_private.can_access_clinical_record(
        encounters.organization_id, encounters.professional_id
      )
  )
);

create policy patients_select_clinical_record
on public.patients for select to authenticated
using (
  organization_id = app_private.current_organization_id()
  and deleted_at is null
  and (
    app_private.current_user_has_permission('clinico.ver_prontuario')
    or app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
  )
);

grant select, insert, update on public.clinical_templates to authenticated;
grant select, insert on public.clinical_template_versions to authenticated;
grant select on public.encounters, public.encounter_entries,
  public.encounter_diagnoses, public.encounter_addenda to authenticated;
grant all on public.clinical_templates, public.clinical_template_versions,
  public.encounters, public.encounter_entries, public.encounter_diagnoses,
  public.encounter_addenda to service_role;

create or replace function app_private.seed_default_clinical_template(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare v_template_id uuid;
begin
  insert into public.clinical_templates (organization_id, name, description)
  values (
    p_organization_id,
    'Atendimento clínico geral',
    'Template inicial livre para anamnese e evolução.'
  )
  on conflict (organization_id, name) do update
    set description = excluded.description
  returning id into v_template_id;

  insert into public.clinical_template_versions (
    organization_id, template_id, version_number, schema
  ) values (
    p_organization_id,
    v_template_id,
    1,
    '{
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

do $$
declare organization_row record;
begin
  for organization_row in select id from public.organizations loop
    perform app_private.seed_default_clinical_template(organization_row.id);
  end loop;
end;
$$;

create or replace function app_private.seed_clinical_template_on_organization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  perform app_private.seed_default_clinical_template(new.id);
  return new;
end;
$$;

create trigger seed_clinical_template_on_organization
after insert on public.organizations
for each row execute function app_private.seed_clinical_template_on_organization();

insert into public.profile_permissions (profile_id, permission_id)
select profiles.id, permissions.id
from public.profiles
join public.permissions on permissions.code in (
  'clinico.preencher_prontuario', 'clinico.finalizar_prontuario',
  'clinico.adicionar_adendo', 'clinico.criar_template'
)
where profiles.name = 'Administrador'
on conflict (profile_id, permission_id) do nothing;

comment on table public.clinical_template_versions is
  'Immutable published clinical template versions.';
comment on table public.encounters is
  'Clinical encounters that become immutable after finalization.';
comment on table public.encounter_addenda is
  'Append-only clinical notes added after encounter finalization.';
