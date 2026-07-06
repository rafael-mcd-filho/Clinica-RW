begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

create temporary table identity_test_results (result text not null) on commit drop;
grant select, insert on identity_test_results to authenticated;

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
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'tenant-a@example.com',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'tenant-b@example.com',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.organizations (id, name)
values
  ('10000000-0000-0000-0000-000000000010', 'Tenant A'),
  ('20000000-0000-0000-0000-000000000010', 'Tenant B');

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
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000010',
    '10000000-0000-0000-0000-000000000001',
    'User A',
    'tenant-a@example.com',
    'active',
    false
  ),
  (
    '20000000-0000-0000-0000-000000000020',
    '20000000-0000-0000-0000-000000000010',
    '20000000-0000-0000-0000-000000000001',
    'User B',
    'tenant-b@example.com',
    'active',
    false
  );

insert into public.profiles (id, organization_id, name)
values (
  '10000000-0000-0000-0000-000000000030',
  '10000000-0000-0000-0000-000000000010',
  'Tenant A Admin'
);

insert into public.user_profiles (user_id, profile_id)
values (
  '10000000-0000-0000-0000-000000000020',
  '10000000-0000-0000-0000-000000000030'
);

insert into public.profile_permissions (profile_id, permission_id)
select
  '10000000-0000-0000-0000-000000000030',
  permissions.id
from public.permissions
where permissions.code = 'agenda.ver';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

insert into identity_test_results (result)
select results_eq(
  $$ select id from public.organizations order by id $$,
  $$ values ('10000000-0000-0000-0000-000000000010'::uuid) $$,
  'Tenant user only sees the own organization'
);

insert into identity_test_results (result)
select is(
  (
    select count(*)
    from public.app_users
    where organization_id = '20000000-0000-0000-0000-000000000010'
  ),
  0::bigint,
  'Tenant user cannot list users from another organization'
);

insert into identity_test_results (result)
select results_eq(
  $$
    with updated as (
      update public.organizations
      set name = 'Tenant B changed'
      where id = '20000000-0000-0000-0000-000000000010'
      returning id
    )
    select count(*) from updated
  $$,
  $$ values (0::bigint) $$,
  'Tenant user cannot update another organization'
);

reset role;

insert into identity_test_results (result)
select ok(
  app_private.current_user_has_permission('agenda.ver'),
  'Inherited profile permissions are resolved for the current user'
);

insert into identity_test_results (result)
select is(
  app_private.current_organization_id(),
  '10000000-0000-0000-0000-000000000010'::uuid,
  'Current organization helper resolves the authenticated tenant'
);

insert into identity_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from identity_test_results
order by ctid;

rollback;
