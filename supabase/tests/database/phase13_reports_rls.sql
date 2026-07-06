begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

create temporary table phase13_test_results (result text not null) on commit drop;
grant select, insert on phase13_test_results to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '13100000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase13-report@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '13100000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'phase13-no-report@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '13200000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase13-tenant-b@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.organizations (id, name)
values
  ('13100000-0000-0000-0000-000000000010', 'Phase 13 Tenant A'),
  ('13200000-0000-0000-0000-000000000010', 'Phase 13 Tenant B');

insert into public.app_users (
  id, organization_id, auth_user_id, name, email, status, is_super_admin
)
values
  (
    '13100000-0000-0000-0000-000000000020',
    '13100000-0000-0000-0000-000000000010',
    '13100000-0000-0000-0000-000000000001',
    'Phase 13 Reporter', 'phase13-report@example.com', 'active', false
  ),
  (
    '13100000-0000-0000-0000-000000000021',
    '13100000-0000-0000-0000-000000000010',
    '13100000-0000-0000-0000-000000000002',
    'Phase 13 No Report', 'phase13-no-report@example.com', 'active', false
  ),
  (
    '13200000-0000-0000-0000-000000000020',
    '13200000-0000-0000-0000-000000000010',
    '13200000-0000-0000-0000-000000000001',
    'Phase 13 Reporter B', 'phase13-tenant-b@example.com', 'active', false
  );

insert into public.profiles (id, organization_id, name)
values
  (
    '13100000-0000-0000-0000-000000000030',
    '13100000-0000-0000-0000-000000000010',
    'Phase 13 Reports'
  ),
  (
    '13100000-0000-0000-0000-000000000031',
    '13100000-0000-0000-0000-000000000010',
    'Phase 13 No Reports'
  ),
  (
    '13200000-0000-0000-0000-000000000030',
    '13200000-0000-0000-0000-000000000010',
    'Phase 13 Reports B'
  );

insert into public.user_profiles (user_id, profile_id)
values
  (
    '13100000-0000-0000-0000-000000000020',
    '13100000-0000-0000-0000-000000000030'
  ),
  (
    '13100000-0000-0000-0000-000000000021',
    '13100000-0000-0000-0000-000000000031'
  ),
  (
    '13200000-0000-0000-0000-000000000020',
    '13200000-0000-0000-0000-000000000030'
  );

insert into public.profile_permissions (profile_id, permission_id)
select profile_id, permissions.id
from (
  values
    ('13100000-0000-0000-0000-000000000030'::uuid),
    ('13200000-0000-0000-0000-000000000030'::uuid)
) as profiles(profile_id)
cross join public.permissions
where permissions.code in (
  'relatorio.operacional',
  'relatorio.financeiro',
  'relatorio.clinico',
  'relatorio.exportar'
);

insert into public.units (id, organization_id, name)
values (
  '13100000-0000-0000-0000-000000000040',
  '13100000-0000-0000-0000-000000000010',
  'Unidade A'
);

insert into public.professionals (id, organization_id, name)
values (
  '13100000-0000-0000-0000-000000000050',
  '13100000-0000-0000-0000-000000000010',
  'Dra Phase 13'
);

insert into public.procedures (
  id, organization_id, name, duration_minutes, base_price
)
values (
  '13100000-0000-0000-0000-000000000060',
  '13100000-0000-0000-0000-000000000010',
  'Consulta Phase 13',
  30,
  100
);

insert into public.schedules (
  id, organization_id, professional_id, unit_id, name
)
values (
  '13100000-0000-0000-0000-000000000065',
  '13100000-0000-0000-0000-000000000010',
  '13100000-0000-0000-0000-000000000050',
  '13100000-0000-0000-0000-000000000040',
  'Agenda Phase 13'
);

insert into public.patients (id, organization_id, full_name)
values (
  '13100000-0000-0000-0000-000000000070',
  '13100000-0000-0000-0000-000000000010',
  'Paciente Phase 13'
);

insert into public.payment_methods (id, organization_id, name, method_type)
values (
  '13100000-0000-0000-0000-000000000075',
  '13100000-0000-0000-0000-000000000010',
  'Pix Phase 13',
  'pix'
);

insert into public.appointments (
  id, organization_id, patient_id, professional_id, procedure_id, schedule_id,
  unit_id, status, start_at, end_at
)
values (
  '13100000-0000-0000-0000-000000000080',
  '13100000-0000-0000-0000-000000000010',
  '13100000-0000-0000-0000-000000000070',
  '13100000-0000-0000-0000-000000000050',
  '13100000-0000-0000-0000-000000000060',
  '13100000-0000-0000-0000-000000000065',
  '13100000-0000-0000-0000-000000000040',
  'attended',
  '2026-07-01 12:00:00+00',
  '2026-07-01 12:30:00+00'
);

insert into public.payments (
  id, organization_id, account_receivable_id, payment_method_id, amount, paid_at
)
values (
  '13100000-0000-0000-0000-000000000085',
  '13100000-0000-0000-0000-000000000010',
  (
    select id from public.accounts_receivable
    where appointment_id = '13100000-0000-0000-0000-000000000080'
  ),
  '13100000-0000-0000-0000-000000000075',
  100,
  '2026-07-01 13:00:00+00'
);

insert into public.clinical_templates (id, organization_id, name)
values (
  '13100000-0000-0000-0000-000000000090',
  '13100000-0000-0000-0000-000000000010',
  'Template Phase 13'
);

insert into public.clinical_template_versions (
  id, organization_id, template_id, version_number, schema
)
values (
  '13100000-0000-0000-0000-000000000091',
  '13100000-0000-0000-0000-000000000010',
  '13100000-0000-0000-0000-000000000090',
  1,
  '{"fields":[]}'::jsonb
);

insert into public.encounters (
  id, organization_id, patient_id, professional_id, appointment_id,
  template_version_id, status, started_at, finalized_at
)
values (
  '13100000-0000-0000-0000-000000000095',
  '13100000-0000-0000-0000-000000000010',
  '13100000-0000-0000-0000-000000000070',
  '13100000-0000-0000-0000-000000000050',
  '13100000-0000-0000-0000-000000000080',
  '13100000-0000-0000-0000-000000000091',
  'finalized',
  '2026-07-01 12:35:00+00',
  '2026-07-01 12:55:00+00'
);

insert into public.encounter_diagnoses (
  id, organization_id, encounter_id, cid_code, description, is_primary
)
values (
  '13100000-0000-0000-0000-000000000096',
  '13100000-0000-0000-0000-000000000010',
  '13100000-0000-0000-0000-000000000095',
  'Z00',
  'Exame geral',
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '13100000-0000-0000-0000-000000000001',
  true
);

insert into phase13_test_results (result)
select results_eq(
  $$ select count(*) from public.appointments $$,
  $$ values (1::bigint) $$,
  'Report user can read appointment rows for operational reports'
);

insert into phase13_test_results (result)
select results_eq(
  $$ select count(*) from public.accounts_receivable $$,
  $$ values (1::bigint) $$,
  'Report user can read receivables for financial reports'
);

insert into phase13_test_results (result)
select results_eq(
  $$ select count(*) from public.payments $$,
  $$ values (1::bigint) $$,
  'Report user can read payments for financial reports'
);

insert into phase13_test_results (result)
select results_eq(
  $$ select count(*) from public.encounters $$,
  $$ values (1::bigint) $$,
  'Report user can read encounters for clinical reports'
);

insert into phase13_test_results (result)
select results_eq(
  $$ select count(*) from public.encounter_diagnoses $$,
  $$ values (1::bigint) $$,
  'Report user can read diagnoses for clinical aggregates'
);

select set_config(
  'request.jwt.claim.sub',
  '13100000-0000-0000-0000-000000000002',
  true
);

insert into phase13_test_results (result)
select results_eq(
  $$ select count(*) from public.appointments $$,
  $$ values (0::bigint) $$,
  'Same-tenant user without report permission cannot read appointments'
);

insert into phase13_test_results (result)
select results_eq(
  $$ select count(*) from public.accounts_receivable $$,
  $$ values (0::bigint) $$,
  'Same-tenant user without report permission cannot read receivables'
);

insert into phase13_test_results (result)
select results_eq(
  $$ select count(*) from public.encounters $$,
  $$ values (0::bigint) $$,
  'Same-tenant user without report permission cannot read encounters'
);

select set_config(
  'request.jwt.claim.sub',
  '13200000-0000-0000-0000-000000000001',
  true
);

insert into phase13_test_results (result)
select results_eq(
  $$ select count(*) from public.appointments $$,
  $$ values (0::bigint) $$,
  'Report user from another tenant cannot read tenant A appointments'
);

insert into phase13_test_results (result)
select results_eq(
  $$ select count(*) from public.accounts_receivable $$,
  $$ values (0::bigint) $$,
  'Report user from another tenant cannot read tenant A receivables'
);

insert into phase13_test_results (result)
select results_eq(
  $$ select count(*) from public.encounters $$,
  $$ values (0::bigint) $$,
  'Report user from another tenant cannot read tenant A encounters'
);

insert into phase13_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from phase13_test_results
order by ctid;

rollback;
