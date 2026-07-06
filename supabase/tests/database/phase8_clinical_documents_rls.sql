begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

create temporary table phase8_test_results (result text not null) on commit drop;
create temporary table phase8_ids (
  label text not null,
  document_id uuid not null
) on commit drop;
grant select, insert on phase8_test_results to authenticated;
grant select, insert on phase8_ids to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase8-a@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'phase8-no-doc@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '82000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase8-b@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.organizations (id, name)
values
  ('81000000-0000-0000-0000-000000000010', 'Phase 8 Tenant A'),
  ('82000000-0000-0000-0000-000000000010', 'Phase 8 Tenant B');

insert into public.app_users (
  id, organization_id, auth_user_id, name, email, status, is_super_admin
)
values
  (
    '81000000-0000-0000-0000-000000000020',
    '81000000-0000-0000-0000-000000000010',
    '81000000-0000-0000-0000-000000000001',
    'Phase 8 Professional A', 'phase8-a@example.com', 'active', false
  ),
  (
    '81000000-0000-0000-0000-000000000021',
    '81000000-0000-0000-0000-000000000010',
    '81000000-0000-0000-0000-000000000002',
    'Phase 8 No Documents', 'phase8-no-doc@example.com', 'active', false
  ),
  (
    '82000000-0000-0000-0000-000000000020',
    '82000000-0000-0000-0000-000000000010',
    '82000000-0000-0000-0000-000000000001',
    'Phase 8 Professional B', 'phase8-b@example.com', 'active', false
  );

insert into public.profiles (id, organization_id, name)
values
  (
    '81000000-0000-0000-0000-000000000030',
    '81000000-0000-0000-0000-000000000010',
    'Phase 8 Document Issuer'
  ),
  (
    '81000000-0000-0000-0000-000000000031',
    '81000000-0000-0000-0000-000000000010',
    'Phase 8 Clinical Viewer'
  );

insert into public.user_profiles (user_id, profile_id)
values
  (
    '81000000-0000-0000-0000-000000000020',
    '81000000-0000-0000-0000-000000000030'
  ),
  (
    '81000000-0000-0000-0000-000000000021',
    '81000000-0000-0000-0000-000000000031'
  );

insert into public.profile_permissions (profile_id, permission_id)
select '81000000-0000-0000-0000-000000000030', id
from public.permissions
where code in (
  'clinico.ver_prontuario_proprios',
  'clinico.prescrever',
  'clinico.solicitar_exame',
  'clinico.emitir_atestado'
);

insert into public.profile_permissions (profile_id, permission_id)
select '81000000-0000-0000-0000-000000000031', id
from public.permissions
where code = 'clinico.ver_prontuario';

insert into public.professionals (id, organization_id, user_id, name)
values
  (
    '81000000-0000-0000-0000-000000000040',
    '81000000-0000-0000-0000-000000000010',
    '81000000-0000-0000-0000-000000000020',
    'Tenant A Professional'
  ),
  (
    '82000000-0000-0000-0000-000000000040',
    '82000000-0000-0000-0000-000000000010',
    '82000000-0000-0000-0000-000000000020',
    'Tenant B Professional'
  );

insert into public.patients (id, organization_id, full_name)
values
  (
    '81000000-0000-0000-0000-000000000050',
    '81000000-0000-0000-0000-000000000010',
    'Tenant A Patient'
  ),
  (
    '82000000-0000-0000-0000-000000000050',
    '82000000-0000-0000-0000-000000000010',
    'Tenant B Patient'
  );

insert into public.encounters (
  id, organization_id, patient_id, professional_id, template_version_id
)
select
  '81000000-0000-0000-0000-000000000060',
  '81000000-0000-0000-0000-000000000010',
  '81000000-0000-0000-0000-000000000050',
  '81000000-0000-0000-0000-000000000040',
  versions.id
from public.clinical_template_versions as versions
where versions.organization_id = '81000000-0000-0000-0000-000000000010'
limit 1;

insert into public.encounters (
  id, organization_id, patient_id, professional_id, template_version_id
)
select
  '82000000-0000-0000-0000-000000000060',
  '82000000-0000-0000-0000-000000000010',
  '82000000-0000-0000-0000-000000000050',
  '82000000-0000-0000-0000-000000000040',
  versions.id
from public.clinical_template_versions as versions
where versions.organization_id = '82000000-0000-0000-0000-000000000010'
limit 1;

insert into public.clinical_documents (
  id, organization_id, encounter_id, patient_id, professional_id,
  document_type, title, body
)
values (
  '82000000-0000-0000-0000-000000000070',
  '82000000-0000-0000-0000-000000000010',
  '82000000-0000-0000-0000-000000000060',
  '82000000-0000-0000-0000-000000000050',
  '82000000-0000-0000-0000-000000000040',
  'prescription',
  'Tenant B Prescription',
  'Tenant B body'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-0000-0000-000000000001',
  true
);

insert into phase8_test_results (result)
select is(
  (select count(*) from public.clinical_document_templates),
  4::bigint,
  'Professional can see the own tenant default document templates'
);

insert into phase8_ids (label, document_id)
select
  'prescription',
  public.issue_clinical_document(
    '81000000-0000-0000-0000-000000000060',
    'prescription',
    'Prescrição',
    'Dipirona 500mg se dor.',
    (select id from public.clinical_document_templates
     where document_type = 'prescription' limit 1),
    '{"source":"test"}'::jsonb
  );

insert into phase8_test_results (result)
select results_eq(
  $$
    select document_type, patient_id, professional_id, encounter_id
    from public.clinical_documents
    where id = (select document_id from phase8_ids where label = 'prescription')
  $$,
  $$
    values (
      'prescription'::text,
      '81000000-0000-0000-0000-000000000050'::uuid,
      '81000000-0000-0000-0000-000000000040'::uuid,
      '81000000-0000-0000-0000-000000000060'::uuid
    )
  $$,
  'Issued prescription is linked to patient, professional and encounter'
);

insert into phase8_test_results (result)
select lives_ok(
  $$
    select public.issue_clinical_document(
      '81000000-0000-0000-0000-000000000060',
      'exam_request',
      'Solicitação de exames',
      'Hemograma completo.',
      null,
      '{}'::jsonb
    )
  $$,
  'Professional can issue an exam request'
);

insert into phase8_test_results (result)
select lives_ok(
  $$
    select public.issue_clinical_document(
      '81000000-0000-0000-0000-000000000060',
      'attendance_declaration',
      'Declaração de comparecimento',
      'Paciente compareceu ao atendimento.',
      null,
      '{}'::jsonb
    )
  $$,
  'Professional can issue an attendance declaration'
);

select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-0000-0000-000000000002',
  true
);

insert into phase8_test_results (result)
select throws_ok(
  $$
    select public.issue_clinical_document(
      '81000000-0000-0000-0000-000000000060',
      'prescription',
      'Prescrição não autorizada',
      'Conteúdo',
      null,
      '{}'::jsonb
    )
  $$,
  '42501',
  'Not allowed to issue clinical document.',
  'User without document permission cannot issue prescriptions'
);

reset role;

insert into phase8_test_results (result)
select throws_ok(
  $$
    update public.clinical_documents
    set body = 'Changed'
    where id = (select document_id from phase8_ids where label = 'prescription')
  $$,
  '55000',
  'Clinical history is immutable.',
  'Issued clinical documents are immutable'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '81000000-0000-0000-0000-000000000001',
  true
);

insert into phase8_test_results (result)
select results_eq(
  $$ select count(*) from public.clinical_documents $$,
  $$ values (3::bigint) $$,
  'Tenant can see own issued documents but not another tenant documents'
);

insert into phase8_test_results (result)
select ok(
  exists (
    select 1
    from public.audit_logs
    where actor_user_id = '81000000-0000-0000-0000-000000000020'
      and resource_type = 'clinical_documents'
      and action = 'clinical_documents.issue'
  ),
  'Document issuing generates an audit event'
);

insert into phase8_test_results (result)
select lives_ok(
  $$
    select public.issue_clinical_document(
      '81000000-0000-0000-0000-000000000060',
      'medical_certificate',
      'Atestado',
      'Afastamento por 1 dia.',
      null,
      '{}'::jsonb
    )
  $$,
  'Professional can issue a medical certificate'
);

insert into phase8_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from phase8_test_results
order by ctid;

rollback;
