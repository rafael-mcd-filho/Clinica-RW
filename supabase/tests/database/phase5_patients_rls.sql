begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

create temporary table phase5_test_results (result text not null) on commit drop;
grant select, insert on phase5_test_results to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '51000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase5-a@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '52000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase5-b@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.organizations (id, name)
values
  ('51000000-0000-0000-0000-000000000010', 'Phase 5 Tenant A'),
  ('52000000-0000-0000-0000-000000000010', 'Phase 5 Tenant B');

insert into public.app_users (
  id, organization_id, auth_user_id, name, email, status, is_super_admin
)
values
  (
    '51000000-0000-0000-0000-000000000020',
    '51000000-0000-0000-0000-000000000010',
    '51000000-0000-0000-0000-000000000001',
    'Phase 5 User A', 'phase5-a@example.com', 'active', false
  ),
  (
    '52000000-0000-0000-0000-000000000020',
    '52000000-0000-0000-0000-000000000010',
    '52000000-0000-0000-0000-000000000001',
    'Phase 5 User B', 'phase5-b@example.com', 'active', false
  );

insert into public.profiles (id, organization_id, name)
values (
  '51000000-0000-0000-0000-000000000030',
  '51000000-0000-0000-0000-000000000010',
  'Phase 5 Patient Manager'
);

insert into public.user_profiles (user_id, profile_id)
values (
  '51000000-0000-0000-0000-000000000020',
  '51000000-0000-0000-0000-000000000030'
);

insert into public.profile_permissions (profile_id, permission_id)
select '51000000-0000-0000-0000-000000000030', id
from public.permissions
where code in (
  'paciente.ver', 'paciente.criar', 'paciente.editar',
  'paciente.excluir', 'paciente.ver_dados_sensiveis'
);

insert into public.patients (id, organization_id, full_name, cpf)
values (
  '52000000-0000-0000-0000-000000000040',
  '52000000-0000-0000-0000-000000000010',
  'Tenant B Patient',
  '11144477735'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '51000000-0000-0000-0000-000000000001',
  true
);

insert into phase5_test_results (result)
select lives_ok(
  $$
    insert into public.patients (id, organization_id, full_name, cpf)
    values (
      '51000000-0000-0000-0000-000000000040',
      '51000000-0000-0000-0000-000000000010',
      'Tenant A Patient',
      '52998224725'
    )
  $$,
  'Patient manager can create a patient in the own tenant'
);

insert into phase5_test_results (result)
select results_eq(
  $$ select full_name from public.patients order by full_name $$,
  $$ values ('Tenant A Patient'::text) $$,
  'Tenant only sees own patients'
);

insert into phase5_test_results (result)
select results_eq(
  $$
    with updated as (
      update public.patients
      set full_name = 'Cross tenant update'
      where id = '52000000-0000-0000-0000-000000000040'
      returning id
    )
    select count(*) from updated
  $$,
  $$ values (0::bigint) $$,
  'Tenant cannot update another tenant patient'
);

insert into phase5_test_results (result)
select throws_like(
  $$
    insert into public.patient_addresses (
      organization_id, patient_id, city
    )
    values (
      '51000000-0000-0000-0000-000000000010',
      '52000000-0000-0000-0000-000000000040',
      'Invalid city'
    )
  $$,
  '%foreign key constraint%',
  'Composite tenant key rejects a cross-tenant patient address'
);

insert into public.patient_clinical_summaries (
  organization_id, patient_id, allergies
)
values (
  '51000000-0000-0000-0000-000000000010',
  '51000000-0000-0000-0000-000000000040',
  'Protected allergy'
);

insert into phase5_test_results (result)
select results_eq(
  $$ select allergies from public.patient_clinical_summaries $$,
  $$ values ('Protected allergy'::text) $$,
  'Authorized user sees protected clinical summary'
);

reset role;
insert into public.user_permission_overrides (user_id, permission_id, granted)
select
  '51000000-0000-0000-0000-000000000020',
  id,
  false
from public.permissions
where code = 'paciente.ver_dados_sensiveis';
set local role authenticated;

insert into phase5_test_results (result)
select is(
  (select count(*) from public.patient_clinical_summaries),
  0::bigint,
  'User without sensitive permission cannot see clinical summary'
);

insert into public.patient_consents (
  organization_id, patient_id, consent_type, version, accepted_at,
  recorded_by_user_id
)
values (
  '51000000-0000-0000-0000-000000000010',
  '51000000-0000-0000-0000-000000000040',
  'privacy_notice', '1.0', now(),
  '51000000-0000-0000-0000-000000000020'
);

insert into phase5_test_results (result)
select is(
  (select count(*) from public.patient_consents),
  1::bigint,
  'Patient consent remains visible without clinical permission'
);

insert into phase5_test_results (result)
select ok(
  exists (
    select 1 from public.audit_logs
    where actor_user_id = '51000000-0000-0000-0000-000000000020'
      and resource_type = 'patients'
  ),
  'Patient changes generate an audit event'
);

insert into phase5_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from phase5_test_results
order by ctid;

rollback;
