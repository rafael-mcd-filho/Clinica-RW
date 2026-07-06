-- Phase 5: patients, protected clinical summary, consent and simple CRM tags.

create extension if not exists pg_trgm;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  social_name text,
  birth_date date,
  sex_at_birth text check (sex_at_birth in ('female', 'male', 'intersex', 'not_informed')),
  cpf text,
  rg text,
  email citext,
  phone text,
  whatsapp text,
  preferred_contact text not null default 'whatsapp'
    check (preferred_contact in ('whatsapp', 'phone', 'email', 'none')),
  allow_whatsapp boolean not null default false,
  allow_email boolean not null default false,
  allow_sms boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  source text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index if not exists patients_organization_cpf_active_key
  on public.patients (organization_id, cpf)
  where cpf is not null and deleted_at is null;

create index if not exists patients_organization_name_idx
  on public.patients (organization_id, lower(full_name));
create index if not exists patients_full_name_trgm_idx
  on public.patients using gin (full_name gin_trgm_ops);
create index if not exists patients_organization_phone_idx
  on public.patients (organization_id, phone);
create index if not exists patients_organization_email_idx
  on public.patients (organization_id, email);

create table if not exists public.patient_addresses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  postal_code text,
  address_line text,
  address_number text,
  address_complement text,
  district text,
  city text,
  state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, patient_id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade
);

create table if not exists public.patient_clinical_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  allergies text,
  comorbidities text,
  medications text,
  medical_history text,
  family_history text,
  habits text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, patient_id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade
);

create table if not exists public.patient_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  consent_type text not null,
  version text not null,
  accepted_at timestamptz not null,
  revoked_at timestamptz,
  recorded_by_user_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  check (revoked_at is null or revoked_at >= accepted_at),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade,
  foreign key (organization_id, recorded_by_user_id)
    references public.app_users(organization_id, id) on delete set null (recorded_by_user_id)
);

create unique index if not exists patient_consents_active_type_version_key
  on public.patient_consents (
    organization_id,
    patient_id,
    consent_type,
    version
  )
  where revoked_at is null;

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default '#64748b'
    check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table if not exists public.patient_tags (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (patient_id, tag_id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete cascade,
  foreign key (organization_id, tag_id)
    references public.tags(organization_id, id) on delete cascade
);

create index if not exists patient_addresses_patient_id_idx on public.patient_addresses(patient_id);
create index if not exists patient_clinical_summaries_patient_id_idx
  on public.patient_clinical_summaries(patient_id);
create index if not exists patient_consents_patient_id_idx on public.patient_consents(patient_id);
create index if not exists patient_tags_organization_id_idx on public.patient_tags(organization_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'patients', 'patient_addresses', 'patient_clinical_summaries', 'tags'
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

create or replace function app_private.audit_patient_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_row jsonb;
  v_actor_id uuid;
  v_resource_id uuid;
  v_patient_id uuid;
  v_organization_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_actor_id := app_private.current_app_user_id();
  v_resource_id := nullif(v_row ->> 'id', '')::uuid;
  v_patient_id := coalesce(
    nullif(v_row ->> 'patient_id', '')::uuid,
    case when tg_table_name = 'patients' then v_resource_id else null end
  );
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
      coalesce(v_patient_id, v_resource_id),
      jsonb_build_object('patient_id', v_patient_id)
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
    'patients', 'patient_addresses', 'patient_clinical_summaries',
    'patient_consents', 'patient_tags'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'audit_' || table_name || '_change',
      table_name
    );
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function app_private.audit_patient_change()',
      'audit_' || table_name || '_change',
      table_name
    );
  end loop;
end;
$$;

alter table public.patients enable row level security;
alter table public.patient_addresses enable row level security;
alter table public.patient_clinical_summaries enable row level security;
alter table public.patient_consents enable row level security;
alter table public.tags enable row level security;
alter table public.patient_tags enable row level security;

drop policy if exists patients_select_tenant on public.patients;
drop policy if exists patients_insert_tenant on public.patients;
drop policy if exists patients_update_tenant on public.patients;
drop policy if exists patient_addresses_select_sensitive on public.patient_addresses;
drop policy if exists patient_addresses_insert_tenant on public.patient_addresses;
drop policy if exists patient_addresses_update_tenant on public.patient_addresses;
drop policy if exists patient_clinical_summaries_select_sensitive on public.patient_clinical_summaries;
drop policy if exists patient_clinical_summaries_insert_sensitive on public.patient_clinical_summaries;
drop policy if exists patient_clinical_summaries_update_sensitive on public.patient_clinical_summaries;
drop policy if exists patient_consents_select_tenant on public.patient_consents;
drop policy if exists patient_consents_insert_tenant on public.patient_consents;
drop policy if exists patient_consents_update_tenant on public.patient_consents;
drop policy if exists tags_select_tenant on public.tags;
drop policy if exists tags_insert_tenant on public.tags;
drop policy if exists tags_update_tenant on public.tags;
drop policy if exists patient_tags_select_tenant on public.patient_tags;
drop policy if exists patient_tags_insert_tenant on public.patient_tags;
drop policy if exists patient_tags_delete_tenant on public.patient_tags;

create policy patients_select_tenant
on public.patients for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.ver')
  )
);

create policy patients_insert_tenant
on public.patients for insert to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.criar')
  )
);

create policy patients_update_tenant
on public.patients for update to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('paciente.editar')
      or app_private.current_user_has_permission('paciente.excluir')
    )
  )
)
with check (
  app_private.current_is_super_admin()
  or organization_id = app_private.current_organization_id()
);

create policy patient_addresses_select_sensitive
on public.patient_addresses for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.ver_dados_sensiveis')
  )
);

create policy patient_addresses_insert_tenant
on public.patient_addresses for insert to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.criar')
  )
);

create policy patient_addresses_update_tenant
on public.patient_addresses for update to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.editar')
  )
)
with check (
  app_private.current_is_super_admin()
  or organization_id = app_private.current_organization_id()
);

create policy patient_clinical_summaries_select_sensitive
on public.patient_clinical_summaries for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.ver_dados_sensiveis')
  )
);

create policy patient_clinical_summaries_insert_sensitive
on public.patient_clinical_summaries for insert to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.ver_dados_sensiveis')
  )
);

create policy patient_clinical_summaries_update_sensitive
on public.patient_clinical_summaries for update to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.ver_dados_sensiveis')
  )
)
with check (
  app_private.current_is_super_admin()
  or organization_id = app_private.current_organization_id()
);

create policy patient_consents_select_tenant
on public.patient_consents for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.ver')
  )
);

create policy patient_consents_insert_tenant
on public.patient_consents for insert to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('paciente.criar')
      or app_private.current_user_has_permission('paciente.editar')
    )
  )
);

create policy patient_consents_update_tenant
on public.patient_consents for update to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.editar')
  )
)
with check (
  app_private.current_is_super_admin()
  or organization_id = app_private.current_organization_id()
);

create policy tags_select_tenant
on public.tags for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.ver')
  )
);

create policy tags_insert_tenant
on public.tags for insert to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.editar')
  )
);

create policy tags_update_tenant
on public.tags for update to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.editar')
  )
)
with check (
  app_private.current_is_super_admin()
  or organization_id = app_private.current_organization_id()
);

create policy patient_tags_select_tenant
on public.patient_tags for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.ver')
  )
);

create policy patient_tags_insert_tenant
on public.patient_tags for insert to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.editar')
  )
);

create policy patient_tags_delete_tenant
on public.patient_tags for delete to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('paciente.editar')
  )
);

grant select, insert, update on
  public.patients,
  public.patient_addresses,
  public.patient_clinical_summaries,
  public.patient_consents,
  public.tags
to authenticated;

grant select, insert, delete on public.patient_tags to authenticated;

grant all on
  public.patients,
  public.patient_addresses,
  public.patient_clinical_summaries,
  public.patient_consents,
  public.tags,
  public.patient_tags
to service_role;

comment on table public.patients is 'Tenant-scoped patient identity and communication preferences.';
comment on table public.patient_clinical_summaries is 'Protected permanent clinical summary, separate from reception metadata.';
comment on table public.patient_consents is 'Append-oriented LGPD and communication consent history.';
