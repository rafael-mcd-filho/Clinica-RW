begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

create temporary table phase4_test_results (
  result text not null
) on commit drop;

grant select, insert on phase4_test_results to authenticated;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'phase4-a@example.com',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '42000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'phase4-b@example.com',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.organizations (id, name)
values
  ('41000000-0000-0000-0000-000000000010', 'Phase 4 Tenant A'),
  ('42000000-0000-0000-0000-000000000010', 'Phase 4 Tenant B');

insert into public.app_users (
  id,
  organization_id,
  auth_user_id,
  name,
  email,
  status,
  is_super_admin
)
values
  (
    '41000000-0000-0000-0000-000000000020',
    '41000000-0000-0000-0000-000000000010',
    '41000000-0000-0000-0000-000000000001',
    'Phase 4 Admin A',
    'phase4-a@example.com',
    'active',
    false
  ),
  (
    '42000000-0000-0000-0000-000000000020',
    '42000000-0000-0000-0000-000000000010',
    '42000000-0000-0000-0000-000000000001',
    'Phase 4 Admin B',
    'phase4-b@example.com',
    'active',
    false
  );

insert into public.profiles (id, organization_id, name)
values (
  '41000000-0000-0000-0000-000000000030',
  '41000000-0000-0000-0000-000000000010',
  'Phase 4 Config Admin'
);

insert into public.user_profiles (user_id, profile_id)
values (
  '41000000-0000-0000-0000-000000000020',
  '41000000-0000-0000-0000-000000000030'
);

insert into public.profile_permissions (profile_id, permission_id)
select
  '41000000-0000-0000-0000-000000000030',
  permissions.id
from public.permissions
where permissions.code = 'config.geral';

insert into public.units (id, organization_id, name)
values (
  '42000000-0000-0000-0000-000000000040',
  '42000000-0000-0000-0000-000000000010',
  'Tenant B Unit'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '41000000-0000-0000-0000-000000000001',
  true
);

insert into phase4_test_results (result)
select lives_ok(
  $$
    insert into public.units (id, organization_id, name)
    values (
      '41000000-0000-0000-0000-000000000040',
      '41000000-0000-0000-0000-000000000010',
      'Tenant A Unit'
    )
  $$,
  'Config admin can create a unit in the own tenant'
);

insert into phase4_test_results (result)
select results_eq(
  $$ select name from public.units order by name $$,
  $$ values ('Tenant A Unit'::text) $$,
  'Tenant only sees own base registrations'
);

insert into phase4_test_results (result)
select results_eq(
  $$
    with updated as (
      update public.units
      set name = 'Cross tenant update'
      where id = '42000000-0000-0000-0000-000000000040'
      returning id
    )
    select count(*) from updated
  $$,
  $$ values (0::bigint) $$,
  'Tenant cannot update another tenant unit'
);

insert into phase4_test_results (result)
select throws_like(
  $$
    insert into public.rooms (organization_id, unit_id, name)
    values (
      '41000000-0000-0000-0000-000000000010',
      '42000000-0000-0000-0000-000000000040',
      'Invalid room'
    )
  $$,
  '%foreign key constraint%',
  'Composite tenant foreign keys reject cross-tenant relations'
);

insert into public.specialties (id, organization_id, name)
values (
  '41000000-0000-0000-0000-000000000050',
  '41000000-0000-0000-0000-000000000010',
  'General practice'
);

insert into public.professionals (
  id,
  organization_id,
  specialty_id,
  name
)
values (
  '41000000-0000-0000-0000-000000000060',
  '41000000-0000-0000-0000-000000000010',
  '41000000-0000-0000-0000-000000000050',
  'Professional One'
);

insert into phase4_test_results (result)
select is(
  (select mode from public.organizations where id = '41000000-0000-0000-0000-000000000010'),
  'solo',
  'One active professional keeps solo mode'
);

insert into public.professionals (organization_id, name)
values (
  '41000000-0000-0000-0000-000000000010',
  'Professional Two'
);

insert into phase4_test_results (result)
select is(
  (select mode from public.organizations where id = '41000000-0000-0000-0000-000000000010'),
  'clinic',
  'Second active professional changes the organization to clinic mode'
);

insert into phase4_test_results (result)
select throws_ok(
  $$
    select public.complete_organization_onboarding(
      '41000000-0000-0000-0000-000000000010'
    )
  $$,
  '23514',
  'Complete clinic, unit, professional, procedure and business hours first.',
  'Incomplete tenant cannot finish onboarding'
);

insert into public.procedures (
  organization_id,
  name,
  duration_minutes,
  base_price
)
values (
  '41000000-0000-0000-0000-000000000010',
  'Initial consultation',
  30,
  150
);

insert into public.business_hours (
  organization_id,
  weekday,
  start_time,
  end_time
)
values (
  '41000000-0000-0000-0000-000000000010',
  1,
  '08:00',
  '18:00'
);

insert into phase4_test_results (result)
select lives_ok(
  $$
    select public.complete_organization_onboarding(
      '41000000-0000-0000-0000-000000000010'
    )
  $$,
  'Complete tenant can finish onboarding'
);

insert into phase4_test_results (result)
select ok(
  (
    select onboarding_completed_at
    from public.organization_settings
    where organization_id = '41000000-0000-0000-0000-000000000010'
  ) is not null,
  'Onboarding completion is persisted'
);

insert into phase4_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from phase4_test_results
order by ctid;

rollback;
