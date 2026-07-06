begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

create temporary table phase7_test_results (result text not null) on commit drop;
create temporary table phase7_ids (encounter_id uuid not null) on commit drop;
grant select, insert on phase7_test_results to authenticated;
grant select, insert on phase7_ids to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '71000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase7-a@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '71000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'phase7-no-clinical@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '72000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase7-b@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.organizations (id, name)
values
  ('71000000-0000-0000-0000-000000000010', 'Phase 7 Tenant A'),
  ('72000000-0000-0000-0000-000000000010', 'Phase 7 Tenant B');

insert into public.app_users (
  id, organization_id, auth_user_id, name, email, status, is_super_admin
)
values
  (
    '71000000-0000-0000-0000-000000000020',
    '71000000-0000-0000-0000-000000000010',
    '71000000-0000-0000-0000-000000000001',
    'Phase 7 Professional A', 'phase7-a@example.com', 'active', false
  ),
  (
    '71000000-0000-0000-0000-000000000021',
    '71000000-0000-0000-0000-000000000010',
    '71000000-0000-0000-0000-000000000002',
    'Phase 7 No Clinical', 'phase7-no-clinical@example.com', 'active', false
  ),
  (
    '72000000-0000-0000-0000-000000000020',
    '72000000-0000-0000-0000-000000000010',
    '72000000-0000-0000-0000-000000000001',
    'Phase 7 Professional B', 'phase7-b@example.com', 'active', false
  );

insert into public.profiles (id, organization_id, name)
values (
  '71000000-0000-0000-0000-000000000030',
  '71000000-0000-0000-0000-000000000010',
  'Phase 7 Professional Profile'
);

insert into public.user_profiles (user_id, profile_id)
values (
  '71000000-0000-0000-0000-000000000020',
  '71000000-0000-0000-0000-000000000030'
);

insert into public.profile_permissions (profile_id, permission_id)
select '71000000-0000-0000-0000-000000000030', id
from public.permissions
where code in (
  'clinico.ver_prontuario_proprios', 'clinico.preencher_prontuario',
  'clinico.finalizar_prontuario', 'clinico.adicionar_adendo'
);

insert into public.professionals (id, organization_id, user_id, name)
values
  (
    '71000000-0000-0000-0000-000000000040',
    '71000000-0000-0000-0000-000000000010',
    '71000000-0000-0000-0000-000000000020',
    'Tenant A Professional'
  ),
  (
    '72000000-0000-0000-0000-000000000040',
    '72000000-0000-0000-0000-000000000010',
    '72000000-0000-0000-0000-000000000020',
    'Tenant B Professional'
  );

insert into public.patients (id, organization_id, full_name)
values
  (
    '71000000-0000-0000-0000-000000000050',
    '71000000-0000-0000-0000-000000000010', 'Tenant A Patient'
  ),
  (
    '72000000-0000-0000-0000-000000000050',
    '72000000-0000-0000-0000-000000000010', 'Tenant B Patient'
  );

insert into public.encounters (
  id, organization_id, patient_id, professional_id, template_version_id
)
select
  '72000000-0000-0000-0000-000000000060',
  '72000000-0000-0000-0000-000000000010',
  '72000000-0000-0000-0000-000000000050',
  '72000000-0000-0000-0000-000000000040',
  versions.id
from public.clinical_template_versions as versions
where versions.organization_id = '72000000-0000-0000-0000-000000000010'
limit 1;

insert into public.encounter_entries (
  organization_id, encounter_id, template_snapshot, structured_data
)
select
  '72000000-0000-0000-0000-000000000010',
  '72000000-0000-0000-0000-000000000060',
  jsonb_build_object('schema', versions.schema),
  '{"conduta":"Tenant B"}'::jsonb
from public.clinical_template_versions as versions
where versions.organization_id = '72000000-0000-0000-0000-000000000010'
limit 1;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000001',
  true
);

insert into phase7_test_results (result)
select is(
  (select count(*) from public.clinical_template_versions),
  1::bigint,
  'Professional can see the own tenant default clinical template'
);

insert into phase7_ids (encounter_id)
select public.create_clinical_encounter(
  '71000000-0000-0000-0000-000000000050',
  '71000000-0000-0000-0000-000000000040',
  (select id from public.clinical_template_versions limit 1),
  null
);

insert into phase7_test_results (result)
select is(
  (select count(*) from public.encounters),
  1::bigint,
  'Professional can create a draft encounter in own scope'
);

insert into phase7_test_results (result)
select lives_ok(
  $$
    select public.save_clinical_encounter_draft(
      (select encounter_id from phase7_ids),
      '{"queixa_principal":"Dor", "conduta":"Observação"}'::jsonb,
      'Nota livre',
      '[{"cid_code":"R52", "description":"Dor", "is_primary":true}]'::jsonb
    )
  $$,
  'Professional can save draft data and CID'
);

insert into phase7_test_results (result)
select lives_ok(
  $$
    select public.finalize_clinical_encounter(
      (select encounter_id from phase7_ids)
    )
  $$,
  'Professional can finalize a non-empty encounter'
);

insert into phase7_test_results (result)
select throws_ok(
  $$
    select public.save_clinical_encounter_draft(
      (select encounter_id from phase7_ids),
      '{"conduta":"Alterada"}'::jsonb,
      'Tentativa pós-finalização',
      '[]'::jsonb
    )
  $$,
  '55000',
  'Only draft encounter can be edited.',
  'Finalized encounter cannot be changed through the draft RPC'
);

insert into phase7_test_results (result)
select lives_ok(
  $$
    select public.add_clinical_encounter_addendum(
      (select encounter_id from phase7_ids),
      'Adendo após finalização.'
    )
  $$,
  'Professional can append addendum after finalization'
);

reset role;

insert into phase7_test_results (result)
select throws_ok(
  $$
    update public.clinical_template_versions
    set schema = '{}'::jsonb
    where organization_id = '71000000-0000-0000-0000-000000000010'
  $$,
  '55000',
  'Clinical history is immutable.',
  'Template versions are immutable after publication'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000001',
  true
);

insert into phase7_test_results (result)
select results_eq(
  $$ select count(*) from public.encounters $$,
  $$ values (1::bigint) $$,
  'Professional cannot see another tenant clinical encounter'
);

select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-0000-0000-000000000002',
  true
);

insert into phase7_test_results (result)
select results_eq(
  $$ select count(*) from public.encounters $$,
  $$ values (0::bigint) $$,
  'User without clinical permission cannot read clinical records'
);

insert into phase7_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from phase7_test_results
order by ctid;

rollback;
