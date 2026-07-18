begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

create temporary table automation_scope_test_results (result text not null)
on commit drop;
grant select, insert on automation_scope_test_results to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '66000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'automation-pro-a@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'automation-read-a@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'automation-broad@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'automation-support@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name)
values ('66000000-0000-0000-0000-000000000010', 'Automation Scope Tenant');

insert into public.app_users (
  id, organization_id, auth_user_id, name, email, status, is_super_admin
)
values
  ('66000000-0000-0000-0000-000000000021', '66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-000000000001', 'Automation Professional A', 'automation-pro-a@example.com', 'active', false),
  ('66000000-0000-0000-0000-000000000022', '66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-000000000002', 'Automation Read A', 'automation-read-a@example.com', 'active', false),
  ('66000000-0000-0000-0000-000000000023', '66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-000000000003', 'Automation Broad', 'automation-broad@example.com', 'active', false),
  ('66000000-0000-0000-0000-000000000024', null, '66000000-0000-0000-0000-000000000004', 'Automation Support', 'automation-support@example.com', 'active', true);

insert into public.profiles (id, organization_id, name, is_system_default)
values (
  '66000000-0000-0000-0000-000000000030',
  '66000000-0000-0000-0000-000000000010',
  'Automation Scope Profile',
  false
);

insert into public.profile_permissions (profile_id, permission_id)
select '66000000-0000-0000-0000-000000000030', permissions.id
from public.permissions
where permissions.code in (
  'automacao.ver',
  'automacao.criar',
  'automacao.ativar'
);

insert into public.user_profiles (user_id, profile_id)
values
  ('66000000-0000-0000-0000-000000000021', '66000000-0000-0000-0000-000000000030'),
  ('66000000-0000-0000-0000-000000000022', '66000000-0000-0000-0000-000000000030'),
  ('66000000-0000-0000-0000-000000000023', '66000000-0000-0000-0000-000000000030');

insert into public.units (id, organization_id, name)
values
  ('66000000-0000-0000-0000-000000000040', '66000000-0000-0000-0000-000000000010', 'Automation Unit A'),
  ('66000000-0000-0000-0000-000000000041', '66000000-0000-0000-0000-000000000010', 'Automation Unit B');

insert into public.specialties (id, organization_id, name)
values
  ('66000000-0000-0000-0000-000000000050', '66000000-0000-0000-0000-000000000010', 'Automation Specialty A'),
  ('66000000-0000-0000-0000-000000000051', '66000000-0000-0000-0000-000000000010', 'Automation Specialty B');

insert into public.professionals (
  id, organization_id, user_id, specialty_id, name, active
)
values
  ('66000000-0000-0000-0000-000000000060', '66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-000000000021', '66000000-0000-0000-0000-000000000050', 'Automation Professional A', true),
  ('66000000-0000-0000-0000-000000000061', '66000000-0000-0000-0000-000000000010', null, '66000000-0000-0000-0000-000000000051', 'Automation Professional B', true);

insert into public.schedules (
  id, organization_id, professional_id, unit_id, name
)
values
  ('66000000-0000-0000-0000-000000000070', '66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-000000000060', '66000000-0000-0000-0000-000000000040', 'Automation Schedule A'),
  ('66000000-0000-0000-0000-000000000071', '66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-000000000061', '66000000-0000-0000-0000-000000000041', 'Automation Schedule B');

insert into public.tags (id, organization_id, name, color)
values (
  '66000000-0000-0000-0000-000000000080',
  '66000000-0000-0000-0000-000000000010',
  'Automation Scope Tag',
  '#64748b'
);

insert into public.patients (id, organization_id, full_name)
values (
  '66000000-0000-0000-0000-000000000090',
  '66000000-0000-0000-0000-000000000010',
  'Automation Scope Patient'
);

insert into public.automation_rules (
  id, organization_id, rule_key, name, event_type, conditions,
  action_type, action_config, active, is_system_default
)
values
  (
    '66000000-0000-0000-0000-0000000000a1',
    '66000000-0000-0000-0000-000000000010',
    'automation_scope_schedule_a', 'Schedule A Rule',
    'appointment_scheduled',
    jsonb_build_object('schedule_id', '66000000-0000-0000-0000-000000000070'),
    'add_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
    false, false
  ),
  (
    '66000000-0000-0000-0000-0000000000a2',
    '66000000-0000-0000-0000-000000000010',
    'automation_scope_professional_a', 'Professional A Rule',
    'appointment_completed',
    jsonb_build_object('professional_id', '66000000-0000-0000-0000-000000000060'),
    'add_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
    false, false
  ),
  (
    '66000000-0000-0000-0000-0000000000b1',
    '66000000-0000-0000-0000-000000000010',
    'automation_scope_schedule_b', 'Schedule B Rule',
    'appointment_scheduled',
    jsonb_build_object(
      'schedule_id', '66000000-0000-0000-0000-000000000071',
      'professional_id', '66000000-0000-0000-0000-000000000061'
    ),
    'add_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
    false, false
  ),
  (
    '66000000-0000-0000-0000-0000000000c1',
    '66000000-0000-0000-0000-000000000010',
    'automation_scope_broad', 'Broad Rule',
    'new_patient', '{}'::jsonb,
    'add_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
    false, false
  );

insert into public.automation_rule_executions (
  id, organization_id, automation_rule_id, patient_id, event_key,
  trigger_type, action_type, event_at
)
values
  ('66000000-0000-0000-0000-0000000000e1', '66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-0000000000a1', '66000000-0000-0000-0000-000000000090', 'scope:schedule-a', 'appointment_scheduled', 'add_tag', now()),
  ('66000000-0000-0000-0000-0000000000e2', '66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-0000000000a2', '66000000-0000-0000-0000-000000000090', 'scope:professional-a', 'appointment_completed', 'add_tag', now()),
  ('66000000-0000-0000-0000-0000000000e3', '66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-0000000000b1', '66000000-0000-0000-0000-000000000090', 'scope:schedule-b', 'appointment_scheduled', 'add_tag', now()),
  ('66000000-0000-0000-0000-0000000000e4', '66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-0000000000c1', '66000000-0000-0000-0000-000000000090', 'scope:broad', 'new_patient', 'add_tag', now());

insert into public.resource_scopes (
  organization_id, user_id, resource_type, resource_id, access_level
)
values
  ('66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-000000000022', 'agenda', '66000000-0000-0000-0000-000000000070', 'read'),
  ('66000000-0000-0000-0000-000000000010', '66000000-0000-0000-0000-000000000023', 'agenda', null, 'write');

insert into public.impersonation_sessions (
  id, super_admin_user_id, organization_id, target_user_id, reason
)
values (
  '66000000-0000-0000-0000-0000000000f0',
  '66000000-0000-0000-0000-000000000024',
  '66000000-0000-0000-0000-000000000010',
  '66000000-0000-0000-0000-000000000021',
  'Patient automation resource-scope test'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000002', true);

insert into automation_scope_test_results
select results_eq(
  $$ select name from public.automation_rules order by name $$,
  $$ values ('Schedule A Rule'::text) $$,
  'A schedule read scope sees only rules for that schedule'
);

insert into automation_scope_test_results
select results_eq(
  $$ select event_key from public.automation_rule_executions order by event_key $$,
  $$ values ('scope:schedule-a'::text) $$,
  'Execution visibility follows the conditions of the parent rule'
);

insert into automation_scope_test_results
select throws_like(
  $$
    insert into public.automation_rules (
      organization_id, rule_key, name, event_type, conditions,
      action_type, action_config, active
    ) values (
      '66000000-0000-0000-0000-000000000010',
      'read_scope_cannot_insert', 'Read Scope Cannot Insert',
      'appointment_scheduled',
      jsonb_build_object('schedule_id', '66000000-0000-0000-0000-000000000070'),
      'remove_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
      false
    )
  $$,
  '%row-level security policy%',
  'Read-only schedule scope cannot directly create a rule'
);

insert into automation_scope_test_results
select throws_ok(
  $$
    select public.create_patient_automation_rule(
      'Read Scope RPC Attempt', 'appointment_scheduled',
      jsonb_build_object('schedule_id', '66000000-0000-0000-0000-000000000070'),
      'add_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
      false, null
    )
  $$,
  '42501',
  'Not allowed to access this automation scope.',
  'SECURITY DEFINER creation requires write access to the selected schedule'
);

select set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000001', true);

insert into automation_scope_test_results
select results_eq(
  $$ select name from public.automation_rules order by name $$,
  $$ values ('Professional A Rule'::text), ('Schedule A Rule'::text) $$,
  'Linked professional sees schedule-only and professional-only own rules'
);

insert into automation_scope_test_results
select results_eq(
  $$ select event_key from public.automation_rule_executions order by event_key $$,
  $$ values ('scope:professional-a'::text), ('scope:schedule-a'::text) $$,
  'Linked professional sees executions only for own rules'
);

insert into automation_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.automation_rules set name = 'Forbidden Update'
      where id = '66000000-0000-0000-0000-0000000000b1'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (0::bigint) $$,
  'Restrictive update policy hides another professional rule'
);

insert into automation_scope_test_results
select lives_ok(
  $$
    insert into public.automation_rules (
      organization_id, rule_key, name, event_type, conditions,
      action_type, action_config, active
    ) values (
      '66000000-0000-0000-0000-000000000010',
      'professional_direct_own', 'Professional Direct Own',
      'appointment_scheduled',
      jsonb_build_object('schedule_id', '66000000-0000-0000-0000-000000000070'),
      'remove_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
      false
    )
  $$,
  'Linked professional can directly create a rule for the own schedule'
);

insert into automation_scope_test_results
select throws_like(
  $$
    insert into public.automation_rules (
      organization_id, rule_key, name, event_type, conditions,
      action_type, action_config, active
    ) values (
      '66000000-0000-0000-0000-000000000010',
      'professional_direct_other', 'Professional Direct Other',
      'appointment_scheduled',
      jsonb_build_object('schedule_id', '66000000-0000-0000-0000-000000000071'),
      'remove_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
      false
    )
  $$,
  '%row-level security policy%',
  'Linked professional cannot directly create another schedule rule'
);

insert into automation_scope_test_results
select lives_ok(
  $$
    select public.create_patient_automation_rule(
      'Professional RPC Own', 'appointment_scheduled',
      jsonb_build_object('schedule_id', '66000000-0000-0000-0000-000000000070'),
      'add_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
      false, null
    )
  $$,
  'Linked professional can create an own-schedule rule through the RPC'
);

insert into automation_scope_test_results
select throws_ok(
  $$
    select public.create_patient_automation_rule(
      'Professional RPC Other', 'appointment_scheduled',
      jsonb_build_object('schedule_id', '66000000-0000-0000-0000-000000000071'),
      'add_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
      false, null
    )
  $$,
  '42501',
  'Not allowed to access this automation scope.',
  'Creation RPC rejects another professional schedule'
);

insert into automation_scope_test_results
select throws_ok(
  $$
    select public.create_patient_automation_rule(
      'Professional RPC Broad', 'new_patient', '{}'::jsonb,
      'add_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
      false, null
    )
  $$,
  '42501',
  'Not allowed to access this automation scope.',
  'Rule without schedule or professional requires a broad agenda scope'
);

insert into automation_scope_test_results
select throws_ok(
  $$ select public.set_patient_automation_rule_active('66000000-0000-0000-0000-0000000000b1', false, null) $$,
  '42501',
  'Not allowed to access this automation scope.',
  'Activation RPC validates the effective resource scope before updating'
);

insert into automation_scope_test_results
select throws_ok(
  $$ select public.delete_patient_automation_rule('66000000-0000-0000-0000-0000000000b1', null) $$,
  '42501',
  'Not allowed to access this automation scope.',
  'Deletion RPC validates the effective resource scope before deleting'
);

insert into automation_scope_test_results
select throws_ok(
  $$ select public.refresh_patient_automation_rule('66000000-0000-0000-0000-0000000000b1', null) $$,
  '42501',
  'Not allowed to access this automation scope.',
  'Refresh RPC validates the effective resource scope before backfill'
);

insert into automation_scope_test_results
select throws_ok(
  $$ select public.refresh_patient_tag_rule('66000000-0000-0000-0000-0000000000b1') $$,
  '42501',
  'Not allowed to access this automation scope.',
  'Legacy refresh API inherits the canonical RPC resource check'
);

insert into automation_scope_test_results
select lives_ok(
  $$ select public.set_patient_automation_rule_active('66000000-0000-0000-0000-0000000000a1', false, null) $$,
  'Linked professional can manage an own-schedule rule'
);

select set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000004', true);

insert into automation_scope_test_results
select throws_ok(
  $$
    select public.set_patient_automation_rule_active(
      '66000000-0000-0000-0000-0000000000b1',
      false,
      '66000000-0000-0000-0000-0000000000f0'
    )
  $$,
  '42501',
  'Not allowed to access this automation scope.',
  'Support impersonation evaluates the target user scope when activating'
);

insert into automation_scope_test_results
select throws_ok(
  $$
    select public.create_patient_automation_rule(
      'Impersonated Broad Attempt', 'new_patient', '{}'::jsonb,
      'add_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
      false, '66000000-0000-0000-0000-0000000000f0'
    )
  $$,
  '42501',
  'Not allowed to access this automation scope.',
  'Support impersonation cannot use the actor Super Admin scope for broad creation'
);

insert into automation_scope_test_results
select lives_ok(
  $$
    select public.create_patient_automation_rule(
      'Impersonated Own Rule', 'appointment_scheduled',
      jsonb_build_object('schedule_id', '66000000-0000-0000-0000-000000000070'),
      'add_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
      false, '66000000-0000-0000-0000-0000000000f0'
    )
  $$,
  'Support impersonation can create a rule inside the target user scope'
);

select set_config('request.jwt.claim.sub', '66000000-0000-0000-0000-000000000003', true);

insert into automation_scope_test_results
select is(
  (
    select count(*)
    from public.automation_rules
    where id in (
      '66000000-0000-0000-0000-0000000000a1',
      '66000000-0000-0000-0000-0000000000a2',
      '66000000-0000-0000-0000-0000000000b1',
      '66000000-0000-0000-0000-0000000000c1'
    )
  ),
  4::bigint,
  'Broad agenda scope sees schedule, professional, and organization-wide rules'
);

insert into automation_scope_test_results
select is(
  (select count(*) from public.automation_rule_executions),
  3::bigint,
  'Broad agenda scope sees all remaining execution rows in the tenant'
);

insert into automation_scope_test_results
select lives_ok(
  $$
    select public.create_patient_automation_rule(
      'Broad RPC Rule', 'new_patient', '{}'::jsonb,
      'add_tag', jsonb_build_object('tag_id', '66000000-0000-0000-0000-000000000080'),
      false, null
    )
  $$,
  'Broad write scope can create an organization-wide rule'
);

insert into automation_scope_test_results
select lives_ok(
  $$ select public.set_patient_automation_rule_active('66000000-0000-0000-0000-0000000000b1', false, null) $$,
  'Broad write scope can manage a scoped rule'
);

insert into automation_scope_test_results
select lives_ok(
  $$ select public.delete_patient_automation_rule('66000000-0000-0000-0000-0000000000b1', null) $$,
  'Broad write scope can delete a scoped rule'
);

reset role;

insert into automation_scope_test_results
select ok(
  has_function_privilege(
    'service_role',
    'public.process_patient_automation_time_triggers(uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'Temporal automation worker keeps its service-role execution grant'
);

insert into automation_scope_test_results
select is(
  app_private.user_can_access_patient_automation_conditions(
    '66000000-0000-0000-0000-000000000023',
    '66000000-0000-0000-0000-000000000010',
    jsonb_build_object('schedule_id', 'not-a-uuid'),
    'read'
  ),
  false,
  'Malformed condition identifiers are denied without leaking a cast error'
);

insert into automation_scope_test_results
select is(
  (
    select count(*)
    from pg_catalog.pg_policy
    where polrelid in (
      'public.automation_rules'::regclass,
      'public.automation_rule_executions'::regclass
    )
      and polname like 'automation%enforce_scope%'
      and not polpermissive
  ),
  5::bigint,
  'All automation resource-scope policies are restrictive'
);

insert into automation_scope_test_results
select * from finish();

select row_number() over (order by ctid) as sequence, result
from automation_scope_test_results
order by ctid;

rollback;
