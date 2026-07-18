begin;

create extension if not exists pgtap with schema extensions;
select plan(47);

insert into public.organizations (id, name)
values
  ('7a000000-0000-4000-8000-000000000010', 'Access Transactions A'),
  ('7b000000-0000-4000-8000-000000000010', 'Access Transactions B');

insert into public.profiles (
  id, organization_id, name, description, is_system_default
)
values
  ('7a000000-0000-4000-8000-000000000030', '7a000000-0000-4000-8000-000000000010', 'Manager A', null, false),
  ('7a000000-0000-4000-8000-000000000031', '7a000000-0000-4000-8000-000000000010', 'Ordinary A', null, false),
  ('7a000000-0000-4000-8000-000000000032', '7a000000-0000-4000-8000-000000000010', 'Custom A', 'Before', false),
  ('7a000000-0000-4000-8000-000000000033', '7a000000-0000-4000-8000-000000000010', 'Unused A', null, false),
  ('7b000000-0000-4000-8000-000000000030', '7b000000-0000-4000-8000-000000000010', 'Manager B', null, false);

insert into public.profile_permissions (profile_id, permission_id)
select profile_id, permissions.id
from (
  values
    ('7a000000-0000-4000-8000-000000000030'::uuid),
    ('7b000000-0000-4000-8000-000000000030'::uuid)
) as manager_profiles(profile_id)
cross join public.permissions
where permissions.code = 'config.usuarios';

insert into public.app_users (
  id, organization_id, name, email, status, is_super_admin
)
values
  ('7a000000-0000-4000-8000-000000000020', '7a000000-0000-4000-8000-000000000010', 'Manager A', 'tx-manager-a@example.com', 'active', false),
  ('7a000000-0000-4000-8000-000000000021', '7a000000-0000-4000-8000-000000000010', 'User A', 'tx-user-a@example.com', 'active', false),
  ('7b000000-0000-4000-8000-000000000020', '7b000000-0000-4000-8000-000000000010', 'Manager B', 'tx-manager-b@example.com', 'active', false),
  ('7c000000-0000-4000-8000-000000000020', null, 'Support', 'tx-support@example.com', 'active', true);

insert into public.user_profiles (user_id, profile_id)
values
  ('7a000000-0000-4000-8000-000000000020', '7a000000-0000-4000-8000-000000000030'),
  ('7a000000-0000-4000-8000-000000000021', '7a000000-0000-4000-8000-000000000031'),
  ('7b000000-0000-4000-8000-000000000020', '7b000000-0000-4000-8000-000000000030');

insert into public.professionals (id, organization_id, name, active)
values
  ('7a000000-0000-4000-8000-000000000060', '7a000000-0000-4000-8000-000000000010', 'Professional A', true),
  ('7b000000-0000-4000-8000-000000000060', '7b000000-0000-4000-8000-000000000010', 'Professional B', true);

insert into public.impersonation_sessions (
  id, super_admin_user_id, organization_id, target_user_id, reason, started_at
)
values
  ('7c000000-0000-4000-8000-000000000030', '7c000000-0000-4000-8000-000000000020', '7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000020', 'Expired test support session', statement_timestamp() - interval '5 hours'),
  ('7c000000-0000-4000-8000-000000000031', '7c000000-0000-4000-8000-000000000020', '7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000020', 'Active test support session', statement_timestamp());

select ok(
  has_function_privilege(
    'service_role',
    'public.manage_company_user_status(uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  'Service role can execute the transactional access RPCs'
);

select isnt(
  has_function_privilege(
    'authenticated',
    'public.manage_company_user_status(uuid,uuid,uuid,uuid,text)',
    'EXECUTE'
  ),
  true,
  'Authenticated clients cannot call the service-only mutation RPC directly'
);

select ok(
  app_private.organization_has_access_manager('7a000000-0000-4000-8000-000000000010'),
  'The active manager is resolved from profile permissions'
);

select throws_ok(
  $$
    select public.manage_company_user_status(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      'suspended'
    )
  $$,
  '42501',
  'Voce nao pode suspender o proprio acesso.',
  'The effective actor cannot suspend itself'
);

select is(
  (select status from public.app_users where id = '7a000000-0000-4000-8000-000000000020'),
  'active',
  'A rejected self-suspension leaves status unchanged'
);

select throws_ok(
  $$
    select public.manage_company_user_profile(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000031'
    )
  $$,
  '23514',
  'A empresa precisa manter ao menos um usuario ativo com permissao para gerenciar acessos.',
  'Replacing the last manager profile is rejected atomically'
);

select is(
  (
    select profile_id
    from public.user_profiles
    where user_id = '7a000000-0000-4000-8000-000000000020'
  ),
  '7a000000-0000-4000-8000-000000000030'::uuid,
  'Rejected profile replacement restores the original assignment'
);

select throws_ok(
  $$
    select public.manage_company_user_permission_overrides(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      jsonb_build_array(jsonb_build_object(
        'permission_id', (select id from public.permissions where code = 'config.usuarios'),
        'granted', false
      ))
    )
  $$,
  '23514',
  'A empresa precisa manter ao menos um usuario ativo com permissao para gerenciar acessos.',
  'Denying config.usuarios to the last manager is rejected atomically'
);

select is(
  (
    select count(*)
    from public.user_permission_overrides
    where user_id = '7a000000-0000-4000-8000-000000000020'
  ),
  0::bigint,
  'Rejected override replacement leaves no partial rows'
);

select throws_ok(
  $$
    select public.manage_company_profile_update(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000030',
      'Manager A', null, '{}'::uuid[]
    )
  $$,
  '23514',
  'A empresa precisa manter ao menos um usuario ativo com permissao para gerenciar acessos.',
  'Removing config.usuarios from the final manager profile is rejected atomically'
);

select ok(
  exists (
    select 1
    from public.profile_permissions as grants
    join public.permissions on permissions.id = grants.permission_id
    where grants.profile_id = '7a000000-0000-4000-8000-000000000030'
      and permissions.code = 'config.usuarios'
  ),
  'Rejected profile update restores the manager permission'
);

select throws_ok(
  $$
    select public.manage_company_user_status(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000021',
      '7a000000-0000-4000-8000-000000000021',
      '7a000000-0000-4000-8000-000000000020',
      'active'
    )
  $$,
  '42501',
  'Responsavel efetivo nao possui permissao para gerenciar acessos.',
  'A non-manager cannot use a service-role RPC payload to mutate access'
);

select throws_ok(
  $$
    select public.manage_company_user_status(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7b000000-0000-4000-8000-000000000020',
      'active'
    )
  $$,
  'P0002',
  'Usuario nao encontrado nesta empresa.',
  'A manager cannot mutate a target from another tenant'
);

update public.impersonation_sessions
set ended_at = statement_timestamp()
where id = '7c000000-0000-4000-8000-000000000031';

select throws_ok(
  $$
    select public.manage_company_user_status(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7c000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000021',
      'active'
    )
  $$,
  '42501',
  'Responsavel de auditoria nao corresponde a uma sessao ativa de suporte.',
  'An expired or ended support session cannot authorize an audit actor'
);

update public.impersonation_sessions
set ended_at = null
where id = '7c000000-0000-4000-8000-000000000031';

select lives_ok(
  $$
    select public.manage_company_user_status(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7c000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000021',
      'active'
    )
  $$,
  'An active support impersonation can audit a tenant mutation'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action = 'user.access_reactivated'
      and actor_user_id = '7c000000-0000-4000-8000-000000000020'
      and metadata->>'effective_user_id' = '7a000000-0000-4000-8000-000000000020'
  ),
  'Support audit stores the real actor and effective tenant user'
);

select lives_ok(
  $$
    select public.manage_company_user_profile(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000021',
      '7a000000-0000-4000-8000-000000000032'
    )
  $$,
  'Profile assignment and its audit commit together'
);

select is(
  (
    select profile_id
    from public.user_profiles
    where user_id = '7a000000-0000-4000-8000-000000000021'
  ),
  '7a000000-0000-4000-8000-000000000032'::uuid,
  'Transactional profile assignment replaces the previous row'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'user.profile_changed'
      and resource_id = '7a000000-0000-4000-8000-000000000021'
  ),
  'Profile assignment writes an audit entry in the same transaction'
);

select lives_ok(
  format(
    $sql$
      select public.manage_company_user_permission_overrides(
        '7a000000-0000-4000-8000-000000000010',
        '7a000000-0000-4000-8000-000000000020',
        '7a000000-0000-4000-8000-000000000020',
        '7a000000-0000-4000-8000-000000000021',
        '[{"permission_id":"%s","granted":true}]'::jsonb
      )
    $sql$,
    (select id from public.permissions where code = 'agenda.ver')
  ),
  'Permission overrides and their audit commit together'
);

select ok(
  exists (
    select 1
    from public.user_permission_overrides as overrides
    join public.permissions on permissions.id = overrides.permission_id
    where overrides.user_id = '7a000000-0000-4000-8000-000000000021'
      and permissions.code = 'agenda.ver'
      and overrides.granted
  ),
  'Transactional overrides persist the normalized grant'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'user.permission_overrides_changed'
      and resource_id = '7a000000-0000-4000-8000-000000000021'
  ),
  'Permission override replacement writes its audit entry'
);

select lives_ok(
  $$
    select public.manage_company_user_resource_scopes(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000021',
      'custom', '[]'::jsonb
    )
  $$,
  'An unlinked user may explicitly have no agenda resource scope'
);

select is(
  (
    select count(*) from public.resource_scopes
    where user_id = '7a000000-0000-4000-8000-000000000021'
  ),
  0::bigint,
  'Empty custom mode persists no explicit resource grants'
);

select lives_ok(
  $$
    select public.manage_company_user_resource_scopes(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000021',
      'all', '[]'::jsonb
    )
  $$,
  'All-resource scope and its audit commit together'
);

select is(
  (
    select count(*) from public.resource_scopes
    where user_id = '7a000000-0000-4000-8000-000000000021'
      and resource_id is null
      and access_level = 'full'
  ),
  4::bigint,
  'All mode creates one broad full grant for every resource type'
);

select throws_ok(
  $$
    select public.manage_company_user_resource_scopes(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000021',
      'custom',
      '[{"resource_type":"profissional","resource_id":"7b000000-0000-4000-8000-000000000060","access_level":"read"}]'::jsonb
    )
  $$,
  '23503',
  'Ha recursos selecionados que nao pertencem a empresa.',
  'A cross-tenant custom scope is rejected before replacing existing scopes'
);

select is(
  (
    select count(*) from public.resource_scopes
    where user_id = '7a000000-0000-4000-8000-000000000021'
  ),
  4::bigint,
  'Rejected custom scope leaves the previous all-resource grants intact'
);

select lives_ok(
  $$
    select public.manage_company_user_identity(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000021',
      'Updated User A', 'tx-user-a-updated@example.com', '+55 85 99999-0000',
      '7a000000-0000-4000-8000-000000000060'
    )
  $$,
  'User identity, professional link, and audit commit together'
);

select ok(
  exists (
    select 1
    from public.app_users as users
    join public.professionals as professionals on professionals.user_id = users.id
    where users.id = '7a000000-0000-4000-8000-000000000021'
      and users.name = 'Updated User A'
      and users.email = 'tx-user-a-updated@example.com'
      and professionals.id = '7a000000-0000-4000-8000-000000000060'
  ),
  'Transactional identity update persists both user and professional link'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'user.updated'
      and resource_id = '7a000000-0000-4000-8000-000000000021'
      and metadata->>'professional_id' = '7a000000-0000-4000-8000-000000000060'
  ),
  'Identity update records the final professional link in audit metadata'
);

select lives_ok(
  format(
    $sql$
      select public.manage_company_profile_update(
        '7a000000-0000-4000-8000-000000000010',
        '7a000000-0000-4000-8000-000000000020',
        '7a000000-0000-4000-8000-000000000020',
        '7a000000-0000-4000-8000-000000000032',
        'Custom A Updated', 'After', array['%s'::uuid]
      )
    $sql$,
    (select id from public.permissions where code = 'agenda.ver')
  ),
  'Custom profile fields, permissions, and audit commit together'
);

select ok(
  exists (
    select 1
    from public.profiles
    where id = '7a000000-0000-4000-8000-000000000032'
      and name = 'Custom A Updated'
      and description = 'After'
  ) and exists (
    select 1
    from public.profile_permissions as grants
    join public.permissions on permissions.id = grants.permission_id
    where grants.profile_id = '7a000000-0000-4000-8000-000000000032'
      and permissions.code = 'agenda.ver'
  ),
  'Transactional custom-profile update persists fields and grants'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'profile.updated'
      and resource_id = '7a000000-0000-4000-8000-000000000032'
  ),
  'Custom profile update writes its audit entry'
);

select lives_ok(
  format(
    $sql$
      select public.manage_company_profile_create(
        '7a000000-0000-4000-8000-000000000010',
        '7a000000-0000-4000-8000-000000000020',
        '7a000000-0000-4000-8000-000000000020',
        'Created A', 'Created atomically', array['%s'::uuid], null
      )
    $sql$,
    (select id from public.permissions where code = 'agenda.ver')
  ),
  'Profile, grants, and creation audit commit together'
);

select ok(
  exists (
    select 1
    from public.profiles
    join public.profile_permissions as grants
      on grants.profile_id = profiles.id
    join public.permissions on permissions.id = grants.permission_id
    where profiles.organization_id = '7a000000-0000-4000-8000-000000000010'
      and profiles.name = 'Created A'
      and permissions.code = 'agenda.ver'
  ) and exists (
    select 1
    from public.audit_logs
    where action = 'profile.created'
      and metadata->>'name' = 'Created A'
  ),
  'Created profile exposes both its selected grant and audit entry'
);

select lives_ok(
  $$
    select public.manage_company_profile_create(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      'Copied A', null, '{}'::uuid[],
      '7a000000-0000-4000-8000-000000000032'
    )
  $$,
  'Profile duplication, copied grants, and audit commit together'
);

select ok(
  exists (
    select 1
    from public.profiles
    join public.profile_permissions as grants
      on grants.profile_id = profiles.id
    join public.permissions on permissions.id = grants.permission_id
    where profiles.organization_id = '7a000000-0000-4000-8000-000000000010'
      and profiles.name = 'Copied A'
      and profiles.description = 'After'
      and permissions.code = 'agenda.ver'
  ),
  'Duplicated profile copies source description and grants'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action = 'profile.duplicated'
      and metadata->>'name' = 'Copied A'
      and metadata->>'source_profile_id' = '7a000000-0000-4000-8000-000000000032'
  ),
  'Profile duplication audit identifies its source profile'
);

select lives_ok(
  $$
    select public.manage_company_profile_delete(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000020',
      '7a000000-0000-4000-8000-000000000033'
    )
  $$,
  'Unused custom profile and audit delete atomically'
);

select ok(
  not exists (
    select 1 from public.profiles
    where id = '7a000000-0000-4000-8000-000000000033'
  ) and exists (
    select 1 from public.audit_logs
    where action = 'profile.deleted'
      and resource_id = '7a000000-0000-4000-8000-000000000033'
  ),
  'Profile deletion and audit entry are both visible'
);

-- Force the deferred invariant to statement time to demonstrate that direct
-- writes cannot bypass the RPC protection. The RPCs run with the default
-- deferred mode so replace operations are checked against their final state.
set constraints all immediate;

select throws_ok(
  $$
    update public.app_users
    set status = 'suspended'
    where id = '7a000000-0000-4000-8000-000000000020'
  $$,
  '23514',
  'A empresa precisa manter ao menos um usuario ativo com permissao para gerenciar acessos.',
  'A direct table update cannot remove the final active access manager'
);

select is(
  (select status from public.app_users where id = '7a000000-0000-4000-8000-000000000020'),
  'active',
  'The constraint-trigger rejection rolls back the direct status update'
);

set constraints all deferred;

select lives_ok(
  format(
    $sql$
      select public.manage_company_user_permission_overrides(
        '7a000000-0000-4000-8000-000000000010',
        '7a000000-0000-4000-8000-000000000020',
        '7a000000-0000-4000-8000-000000000020',
        '7a000000-0000-4000-8000-000000000021',
        '[{"permission_id":"%s","granted":true}]'::jsonb
      )
    $sql$,
    (select id from public.permissions where code = 'config.usuarios')
  ),
  'A second user can be promoted transactionally'
);

select lives_ok(
  $$
    select public.manage_company_user_status(
      '7a000000-0000-4000-8000-000000000010',
      '7a000000-0000-4000-8000-000000000021',
      '7a000000-0000-4000-8000-000000000021',
      '7a000000-0000-4000-8000-000000000020',
      'suspended'
    )
  $$,
  'The former sole manager can be suspended after another manager exists'
);

select is(
  (select status from public.app_users where id = '7a000000-0000-4000-8000-000000000020'),
  'suspended',
  'Successful status mutation persists after the invariant check'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'user.access_suspended'
      and resource_id = '7a000000-0000-4000-8000-000000000020'
  ),
  'Successful status mutation writes its audit entry'
);

select * from finish();
rollback;
