-- Phase 8: prescriptions and basic clinical documents.

create table if not exists public.clinical_document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null
    check (document_type in (
      'prescription', 'exam_request',
      'medical_certificate', 'attendance_declaration'
    )),
  name text not null,
  title_template text not null,
  body_template text not null,
  active boolean not null default true,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, document_type, name),
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id) on delete set null (created_by_user_id)
);

create table if not exists public.clinical_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  encounter_id uuid not null,
  patient_id uuid not null,
  professional_id uuid not null,
  template_id uuid,
  document_type text not null
    check (document_type in (
      'prescription', 'exam_request',
      'medical_certificate', 'attendance_declaration'
    )),
  title text not null check (nullif(trim(title), '') is not null),
  body text not null check (nullif(trim(body), '') is not null),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  issued_at timestamptz not null default statement_timestamp(),
  issued_by_user_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, encounter_id)
    references public.encounters(organization_id, id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  foreign key (organization_id, professional_id)
    references public.professionals(organization_id, id),
  foreign key (organization_id, template_id)
    references public.clinical_document_templates(organization_id, id) on delete set null (template_id),
  foreign key (organization_id, issued_by_user_id)
    references public.app_users(organization_id, id) on delete set null (issued_by_user_id)
);

create index if not exists clinical_documents_patient_idx
  on public.clinical_documents(organization_id, patient_id, issued_at desc);

create index if not exists clinical_documents_encounter_idx
  on public.clinical_documents(organization_id, encounter_id, issued_at desc);

drop trigger if exists set_clinical_document_templates_updated_at
  on public.clinical_document_templates;
create trigger set_clinical_document_templates_updated_at
before update on public.clinical_document_templates
for each row execute function app_private.set_updated_at();

drop trigger if exists prevent_clinical_document_update_delete
  on public.clinical_documents;
create trigger prevent_clinical_document_update_delete
before update or delete on public.clinical_documents
for each row execute function app_private.prevent_clinical_immutable_change();

create or replace function app_private.clinical_document_permission(
  p_document_type text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  return case p_document_type
    when 'prescription' then 'clinico.prescrever'
    when 'exam_request' then 'clinico.solicitar_exame'
    when 'medical_certificate' then 'clinico.emitir_atestado'
    when 'attendance_declaration' then 'clinico.emitir_atestado'
    else null
  end;
end;
$$;

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
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_encounter public.encounters%rowtype;
  v_permission text;
  v_actor_id uuid;
  v_document_id uuid;
begin
  v_permission := app_private.clinical_document_permission(p_document_type);
  v_actor_id := app_private.current_app_user_id();

  if v_permission is null then
    raise exception 'Invalid clinical document type.' using errcode = '23514';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_body), '') is null then
    raise exception 'Clinical document title and body are required.'
      using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid clinical document metadata.' using errcode = '22023';
  end if;

  select * into v_encounter
  from public.encounters
  where id = p_encounter_id;

  if v_encounter.id is null then
    raise exception 'Encounter not found.' using errcode = 'P0002';
  end if;

  if not (
    app_private.current_is_super_admin()
    or (
      v_encounter.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission(v_permission)
      and app_private.can_access_clinical_record(
        v_encounter.organization_id,
        v_encounter.professional_id
      )
    )
  ) then
    raise exception 'Not allowed to issue clinical document.' using errcode = '42501';
  end if;

  if p_template_id is not null and not exists (
    select 1
    from public.clinical_document_templates
    where organization_id = v_encounter.organization_id
      and id = p_template_id
      and document_type = p_document_type
      and active
  ) then
    raise exception 'Clinical document template not found.' using errcode = '23503';
  end if;

  insert into public.clinical_documents (
    organization_id,
    encounter_id,
    patient_id,
    professional_id,
    template_id,
    document_type,
    title,
    body,
    metadata,
    issued_by_user_id
  ) values (
    v_encounter.organization_id,
    v_encounter.id,
    v_encounter.patient_id,
    v_encounter.professional_id,
    p_template_id,
    p_document_type,
    trim(p_title),
    trim(p_body),
    coalesce(p_metadata, '{}'::jsonb),
    v_actor_id
  ) returning id into v_document_id;

  if v_actor_id is not null then
    insert into public.audit_logs (
      organization_id,
      actor_user_id,
      action,
      resource_type,
      resource_id,
      metadata
    ) values (
      v_encounter.organization_id,
      v_actor_id,
      'clinical_documents.issue',
      'clinical_documents',
      v_document_id,
      jsonb_build_object(
        'document_type', p_document_type,
        'encounter_id', v_encounter.id,
        'patient_id', v_encounter.patient_id,
        'professional_id', v_encounter.professional_id
      )
    );
  end if;

  return v_document_id;
end;
$$;

revoke all on function public.issue_clinical_document(
  uuid, text, text, text, uuid, jsonb
) from public;
grant execute on function public.issue_clinical_document(
  uuid, text, text, text, uuid, jsonb
) to authenticated, service_role;

alter table public.clinical_document_templates enable row level security;
alter table public.clinical_documents enable row level security;

drop policy if exists clinical_document_templates_select
  on public.clinical_document_templates;
create policy clinical_document_templates_select
on public.clinical_document_templates for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('clinico.prescrever')
      or app_private.current_user_has_permission('clinico.solicitar_exame')
      or app_private.current_user_has_permission('clinico.emitir_atestado')
      or app_private.current_user_has_permission('clinico.ver_prontuario')
      or app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
    )
  )
);

drop policy if exists clinical_document_templates_manage
  on public.clinical_document_templates;
create policy clinical_document_templates_manage
on public.clinical_document_templates for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('clinico.criar_template')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('clinico.criar_template')
  )
);

drop policy if exists clinical_documents_select
  on public.clinical_documents;
create policy clinical_documents_select
on public.clinical_documents for select to authenticated
using (
  app_private.can_access_clinical_record(organization_id, professional_id)
);

grant select, insert, update, delete on public.clinical_document_templates
  to authenticated;
grant select on public.clinical_documents to authenticated;
grant all on public.clinical_document_templates, public.clinical_documents
  to service_role;

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
    organization_id, document_type, name, title_template, body_template
  )
  values
    (
      p_organization_id,
      'prescription',
      'Prescrição simples',
      'Prescrição',
      'Uso conforme orientação profissional:' || chr(10) || chr(10) || '1. '
    ),
    (
      p_organization_id,
      'exam_request',
      'Solicitação de exames',
      'Solicitação de exames',
      'Solicito a realização dos seguintes exames:' || chr(10) || chr(10) || '- '
    ),
    (
      p_organization_id,
      'medical_certificate',
      'Atestado',
      'Atestado',
      'Atesto, para os devidos fins, que o(a) paciente necessita de afastamento por __ dias a partir de __/__/____.'
    ),
    (
      p_organization_id,
      'attendance_declaration',
      'Declaração de comparecimento',
      'Declaração de comparecimento',
      'Declaro, para os devidos fins, que o(a) paciente compareceu a atendimento nesta clínica na data informada.'
    )
  on conflict (organization_id, document_type, name) do nothing;
end;
$$;

do $$
declare organization_row record;
begin
  for organization_row in select id from public.organizations loop
    perform app_private.seed_default_clinical_document_templates(
      organization_row.id
    );
  end loop;
end;
$$;

create or replace function app_private.seed_clinical_document_templates_on_organization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  perform app_private.seed_default_clinical_document_templates(new.id);
  return new;
end;
$$;

drop trigger if exists seed_clinical_document_templates_on_organization
  on public.organizations;
create trigger seed_clinical_document_templates_on_organization
after insert on public.organizations
for each row execute function app_private.seed_clinical_document_templates_on_organization();

insert into public.profile_permissions (profile_id, permission_id)
select profiles.id, permissions.id
from public.profiles
join public.permissions on permissions.code in (
  'clinico.prescrever',
  'clinico.solicitar_exame',
  'clinico.emitir_atestado'
)
where profiles.name in ('Administrador', 'Profissional')
on conflict (profile_id, permission_id) do nothing;

comment on table public.clinical_document_templates is
  'Reusable tenant-scoped templates for prescriptions and basic clinical documents.';
comment on table public.clinical_documents is
  'Immutable prescriptions, exam requests, certificates and attendance declarations linked to encounters.';
comment on function public.issue_clinical_document(uuid, text, text, text, uuid, jsonb) is
  'Issues an immutable clinical document linked to an encounter, patient and professional.';
