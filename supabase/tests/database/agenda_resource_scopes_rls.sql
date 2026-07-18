begin;

create extension if not exists pgtap with schema extensions;
select plan(77);

create temporary table agenda_scope_test_results (result text not null)
on commit drop;
grant select, insert on agenda_scope_test_results to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '63000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'scope-reception@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '63000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'scope-pro-a@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '63000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'scope-pro-b@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '63000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'scope-operator@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '63000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'scope-view@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '63000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'scope-inactive@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '65000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'scope-support@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '64000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'scope-other@example.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name)
values
  ('63000000-0000-0000-0000-000000000010', 'Agenda Scope Tenant'),
  ('64000000-0000-0000-0000-000000000010', 'Agenda Scope Other Tenant');

insert into public.app_users (
  id, organization_id, auth_user_id, name, email, status, is_super_admin
)
values
  ('63000000-0000-0000-0000-000000000021', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000001', 'Scope Reception', 'scope-reception@example.com', 'active', false),
  ('63000000-0000-0000-0000-000000000022', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000002', 'Scope Professional A', 'scope-pro-a@example.com', 'active', false),
  ('63000000-0000-0000-0000-000000000023', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000003', 'Scope Professional B', 'scope-pro-b@example.com', 'active', false),
  ('63000000-0000-0000-0000-000000000024', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000004', 'Scoped Operator', 'scope-operator@example.com', 'active', false),
  ('63000000-0000-0000-0000-000000000025', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000005', 'View Only User', 'scope-view@example.com', 'active', false),
  ('63000000-0000-0000-0000-000000000026', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000006', 'Inactive Linked Professional', 'scope-inactive@example.com', 'active', false),
  ('65000000-0000-0000-0000-000000000020', null, '65000000-0000-0000-0000-000000000001', 'Scope Support', 'scope-support@example.com', 'active', true),
  ('64000000-0000-0000-0000-000000000020', '64000000-0000-0000-0000-000000000010', '64000000-0000-0000-0000-000000000001', 'Other Tenant User', 'scope-other@example.com', 'active', false);

insert into public.impersonation_sessions (
  id, super_admin_user_id, organization_id, target_user_id, reason
)
values (
  '65000000-0000-0000-0000-000000000030',
  '65000000-0000-0000-0000-000000000020',
  '63000000-0000-0000-0000-000000000010',
  '63000000-0000-0000-0000-000000000022',
  'Agenda scope test'
);

insert into public.profiles (
  id, organization_id, name, is_system_default
)
values
  ('63000000-0000-0000-0000-000000000031', '63000000-0000-0000-0000-000000000010', 'Scope Reception Profile', false),
  ('63000000-0000-0000-0000-000000000032', '63000000-0000-0000-0000-000000000010', 'Scope Professional Profile', false),
  ('63000000-0000-0000-0000-000000000033', '63000000-0000-0000-0000-000000000010', 'Scope Operator Profile', false),
  ('63000000-0000-0000-0000-000000000034', '63000000-0000-0000-0000-000000000010', 'Scope View Profile', false),
  ('63000000-0000-0000-0000-000000000035', '63000000-0000-0000-0000-000000000010', 'Protected Default Profile', true),
  ('64000000-0000-0000-0000-000000000030', '64000000-0000-0000-0000-000000000010', 'Other Tenant Profile', false);

insert into public.profile_permissions (profile_id, permission_id)
select profiles.id, permissions.id
from public.profiles as profiles
cross join public.permissions as permissions
where profiles.id in (
    '63000000-0000-0000-0000-000000000031',
    '63000000-0000-0000-0000-000000000032',
    '63000000-0000-0000-0000-000000000033'
  )
  and permissions.code in (
    'agenda.ver', 'agenda.criar_agendamento', 'agenda.editar_agendamento',
    'agenda.cancelar_agendamento', 'agenda.encaixar',
    'agenda.bloquear_horario', 'agenda.configurar', 'paciente.criar'
  );

insert into public.profile_permissions (profile_id, permission_id)
select '63000000-0000-0000-0000-000000000034', id
from public.permissions
where code = 'agenda.ver';

insert into public.user_profiles (user_id, profile_id)
values
  ('63000000-0000-0000-0000-000000000021', '63000000-0000-0000-0000-000000000031'),
  ('63000000-0000-0000-0000-000000000022', '63000000-0000-0000-0000-000000000032'),
  ('63000000-0000-0000-0000-000000000023', '63000000-0000-0000-0000-000000000032'),
  ('63000000-0000-0000-0000-000000000024', '63000000-0000-0000-0000-000000000033'),
  ('63000000-0000-0000-0000-000000000025', '63000000-0000-0000-0000-000000000034'),
  ('63000000-0000-0000-0000-000000000026', '63000000-0000-0000-0000-000000000032');

insert into public.units (id, organization_id, name)
values
  ('63000000-0000-0000-0000-000000000040', '63000000-0000-0000-0000-000000000010', 'Scope Unit A'),
  ('63000000-0000-0000-0000-000000000041', '63000000-0000-0000-0000-000000000010', 'Scope Unit B'),
  ('64000000-0000-0000-0000-000000000040', '64000000-0000-0000-0000-000000000010', 'Other Scope Unit');

insert into public.specialties (id, organization_id, name)
values
  ('63000000-0000-0000-0000-000000000050', '63000000-0000-0000-0000-000000000010', 'Scope Specialty A'),
  ('63000000-0000-0000-0000-000000000051', '63000000-0000-0000-0000-000000000010', 'Scope Specialty B'),
  ('64000000-0000-0000-0000-000000000050', '64000000-0000-0000-0000-000000000010', 'Other Scope Specialty');

insert into public.professionals (
  id, organization_id, user_id, specialty_id, name, active
)
values
  ('63000000-0000-0000-0000-000000000060', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000022', '63000000-0000-0000-0000-000000000050', 'Scope Professional A', true),
  ('63000000-0000-0000-0000-000000000061', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000023', '63000000-0000-0000-0000-000000000051', 'Scope Professional B', true),
  ('63000000-0000-0000-0000-000000000062', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000026', '63000000-0000-0000-0000-000000000050', 'Inactive Scope Professional', false),
  ('63000000-0000-0000-0000-000000000063', '63000000-0000-0000-0000-000000000010', null, '63000000-0000-0000-0000-000000000050', 'Unlinked Scope Professional', true),
  ('64000000-0000-0000-0000-000000000060', '64000000-0000-0000-0000-000000000010', null, '64000000-0000-0000-0000-000000000050', 'Other Scope Professional', true);

insert into public.procedures (id, organization_id, name, duration_minutes)
values
  ('63000000-0000-0000-0000-000000000070', '63000000-0000-0000-0000-000000000010', 'Scope Consultation', 30),
  ('64000000-0000-0000-0000-000000000070', '64000000-0000-0000-0000-000000000010', 'Other Scope Consultation', 30);

insert into public.patients (id, organization_id, full_name)
values
  ('63000000-0000-0000-0000-000000000080', '63000000-0000-0000-0000-000000000010', 'Scope Patient'),
  ('64000000-0000-0000-0000-000000000080', '64000000-0000-0000-0000-000000000010', 'Other Scope Patient');

insert into public.schedules (
  id, organization_id, professional_id, unit_id, name
)
values
  ('63000000-0000-0000-0000-000000000090', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000060', '63000000-0000-0000-0000-000000000040', 'Schedule A'),
  ('63000000-0000-0000-0000-000000000091', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000061', '63000000-0000-0000-0000-000000000041', 'Schedule B'),
  ('63000000-0000-0000-0000-000000000092', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000062', '63000000-0000-0000-0000-000000000040', 'Schedule Inactive Professional'),
  ('64000000-0000-0000-0000-000000000090', '64000000-0000-0000-0000-000000000010', '64000000-0000-0000-0000-000000000060', '64000000-0000-0000-0000-000000000040', 'Other Tenant Schedule');

insert into public.appointments (
  id, organization_id, patient_id, professional_id, procedure_id,
  schedule_id, unit_id, start_at, end_at
)
values
  ('63000000-0000-0000-0000-0000000000a0', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000080', '63000000-0000-0000-0000-000000000060', '63000000-0000-0000-0000-000000000070', '63000000-0000-0000-0000-000000000090', '63000000-0000-0000-0000-000000000040', '2031-01-06 09:00:00-03', '2031-01-06 09:30:00-03'),
  ('63000000-0000-0000-0000-0000000000a1', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000080', '63000000-0000-0000-0000-000000000061', '63000000-0000-0000-0000-000000000070', '63000000-0000-0000-0000-000000000091', '63000000-0000-0000-0000-000000000041', '2031-01-06 10:00:00-03', '2031-01-06 10:30:00-03'),
  ('63000000-0000-0000-0000-0000000000a2', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000080', '63000000-0000-0000-0000-000000000062', '63000000-0000-0000-0000-000000000070', '63000000-0000-0000-0000-000000000092', '63000000-0000-0000-0000-000000000040', '2031-01-06 11:00:00-03', '2031-01-06 11:30:00-03');

insert into public.waitlist_entries (
  id, organization_id, patient_id, procedure_id, professional_id,
  preferred_period
)
values
  ('63000000-0000-0000-0000-0000000000b0', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000080', '63000000-0000-0000-0000-000000000070', '63000000-0000-0000-0000-000000000060', 'morning'),
  ('63000000-0000-0000-0000-0000000000b1', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000080', '63000000-0000-0000-0000-000000000070', '63000000-0000-0000-0000-000000000061', 'afternoon'),
  ('63000000-0000-0000-0000-0000000000b2', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000080', '63000000-0000-0000-0000-000000000070', null, 'any');

insert into public.schedule_availability (
  organization_id, schedule_id, weekday, start_time, end_time, slot_minutes
)
values
  ('63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000090', 1, '08:00', '18:00', 30),
  ('63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000091', 1, '08:00', '18:00', 30),
  ('63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000092', 1, '08:00', '18:00', 30),
  ('64000000-0000-0000-0000-000000000010', '64000000-0000-0000-0000-000000000090', 1, '08:00', '18:00', 30);

insert into public.schedule_online_booking_procedures (
  organization_id, schedule_id, procedure_id
)
values
  ('63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000090', '63000000-0000-0000-0000-000000000070'),
  ('63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000091', '63000000-0000-0000-0000-000000000070'),
  ('63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000092', '63000000-0000-0000-0000-000000000070'),
  ('64000000-0000-0000-0000-000000000010', '64000000-0000-0000-0000-000000000090', '64000000-0000-0000-0000-000000000070');

insert into public.online_booking_requests (
  id, organization_id, schedule_id, procedure_id, professional_id, unit_id,
  requested_start_at, requested_end_at, patient_name, patient_email,
  lgpd_consent_at
)
values
  ('63000000-0000-0000-0000-0000000000c0', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000090', '63000000-0000-0000-0000-000000000070', '63000000-0000-0000-0000-000000000060', '63000000-0000-0000-0000-000000000040', '2031-01-06 14:00:00-03', '2031-01-06 14:30:00-03', 'Online Patient A Confirm', 'online-a-confirm@example.com', now()),
  ('63000000-0000-0000-0000-0000000000c1', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000091', '63000000-0000-0000-0000-000000000070', '63000000-0000-0000-0000-000000000061', '63000000-0000-0000-0000-000000000041', '2031-01-06 14:00:00-03', '2031-01-06 14:30:00-03', 'Online Patient B', 'online-b@example.com', now()),
  ('63000000-0000-0000-0000-0000000000c2', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000090', '63000000-0000-0000-0000-000000000070', '63000000-0000-0000-0000-000000000060', '63000000-0000-0000-0000-000000000040', '2031-01-06 15:00:00-03', '2031-01-06 15:30:00-03', 'Online Patient A Reject', 'online-a-reject@example.com', now()),
  ('63000000-0000-0000-0000-0000000000c3', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000092', '63000000-0000-0000-0000-000000000070', '63000000-0000-0000-0000-000000000062', '63000000-0000-0000-0000-000000000040', '2031-01-06 14:00:00-03', '2031-01-06 14:30:00-03', 'Online Inactive Professional', 'online-inactive@example.com', now()),
  ('64000000-0000-0000-0000-0000000000c0', '64000000-0000-0000-0000-000000000010', '64000000-0000-0000-0000-000000000090', '64000000-0000-0000-0000-000000000070', '64000000-0000-0000-0000-000000000060', '64000000-0000-0000-0000-000000000040', '2031-01-06 14:00:00-03', '2031-01-06 14:30:00-03', 'Other Tenant Online Patient', 'online-other@example.com', now());

insert into public.online_booking_reviews (
  id, organization_id, professional_id, patient_display_name, body
)
values
  ('63000000-0000-0000-0000-0000000000d0', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000060', 'Patient A', 'Review for Professional A'),
  ('63000000-0000-0000-0000-0000000000d1', '63000000-0000-0000-0000-000000000010', '63000000-0000-0000-0000-000000000061', 'Patient B', 'Review for Professional B'),
  ('63000000-0000-0000-0000-0000000000d2', '63000000-0000-0000-0000-000000000010', null, 'General Patient', 'Organization-wide review'),
  ('64000000-0000-0000-0000-0000000000d0', '64000000-0000-0000-0000-000000000010', '64000000-0000-0000-0000-000000000060', 'Other Patient', 'Other tenant review');

-- Legacy broad operators are explicitly backfilled to a broad agenda scope;
-- operational permissions alone are never interpreted as a data scope.
insert into public.resource_scopes (
  organization_id, user_id, resource_type, resource_id, access_level
)
values (
  '63000000-0000-0000-0000-000000000010',
  '63000000-0000-0000-0000-000000000021',
  'agenda', null, 'write'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000002', true);

insert into agenda_scope_test_results
select results_eq(
  $$ select name from public.schedules order by name $$,
  $$ values ('Schedule A'::text) $$,
  'Linked professional sees only the own schedule by default'
);

insert into agenda_scope_test_results
select results_eq(
  $$ select id from public.appointments order by id $$,
  $$ values ('63000000-0000-0000-0000-0000000000a0'::uuid) $$,
  'Linked professional sees only the own appointments by default'
);

insert into agenda_scope_test_results
select is(
  (select count(*) from public.appointment_status_events),
  1::bigint,
  'Appointment status history follows the professional scope'
);

insert into agenda_scope_test_results
select results_eq(
  $$ select id from public.waitlist_entries order by id $$,
  $$ values ('63000000-0000-0000-0000-0000000000b0'::uuid) $$,
  'Waitlist activity follows the professional scope'
);

insert into agenda_scope_test_results
select results_eq(
  $$ select id from public.online_booking_requests order by id $$,
  $$
    values
      ('63000000-0000-0000-0000-0000000000c0'::uuid),
      ('63000000-0000-0000-0000-0000000000c2'::uuid)
  $$,
  'Online booking requests follow the linked professional scope'
);

insert into agenda_scope_test_results
select results_eq(
  $$ select schedule_id from public.schedule_online_booking_settings order by schedule_id $$,
  $$ values ('63000000-0000-0000-0000-000000000090'::uuid) $$,
  'Per-schedule online booking settings follow schedule read scope'
);

insert into agenda_scope_test_results
select results_eq(
  $$ select schedule_id from public.schedule_online_booking_procedures order by schedule_id $$,
  $$ values ('63000000-0000-0000-0000-000000000090'::uuid) $$,
  'Online booking procedures follow schedule read scope'
);

insert into agenda_scope_test_results
select results_eq(
  $$ select id from public.online_booking_reviews order by id $$,
  $$ values ('63000000-0000-0000-0000-0000000000d0'::uuid) $$,
  'Professional-scoped public reviews follow the linked professional scope'
);

insert into agenda_scope_test_results
select is((select count(*) from public.online_booking_settings), 0::bigint,
  'Linked professional cannot access organization-global booking settings');

insert into agenda_scope_test_results
select throws_ok(
  $$ select public.confirm_online_booking_request('63000000-0000-0000-0000-0000000000c1') $$,
  '42501',
  'Not allowed to confirm online booking request.',
  'Confirmation RPC cannot review another professional request'
);

insert into agenda_scope_test_results
select throws_ok(
  $$ select public.reject_online_booking_request('63000000-0000-0000-0000-0000000000c1', 'scope test') $$,
  '42501',
  'Not allowed to reject online booking request.',
  'Rejection RPC cannot review another professional request'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    select public.save_schedule_configuration(
      '63000000-0000-0000-0000-000000000091',
      '63000000-0000-0000-0000-000000000061',
      '63000000-0000-0000-0000-000000000041',
      'Schedule B', '#2563EB', true, false,
      24, 30, 24, 30, '[]'::jsonb, array[]::uuid[]
    )
  $$,
  '42501',
  'Not allowed to configure schedules.',
  'Schedule configuration RPC checks the current schedule resource'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    select public.save_schedule_configuration(
      '63000000-0000-0000-0000-000000000090',
      '63000000-0000-0000-0000-000000000061',
      '63000000-0000-0000-0000-000000000041',
      'Reassigned Schedule', '#2563EB', true, false,
      24, 30, 24, 30, '[]'::jsonb, array[]::uuid[]
    )
  $$,
  '42501',
  'Not allowed to configure schedules.',
  'Schedule configuration RPC checks destination professional and unit scopes'
);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.appointments set notes = 'forbidden'
      where id = '63000000-0000-0000-0000-0000000000a1'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (0::bigint) $$,
  'Professional A cannot update Professional B appointment'
);

insert into agenda_scope_test_results
select throws_like(
  $$
    insert into public.appointments (
      organization_id, patient_id, professional_id, procedure_id,
      schedule_id, unit_id, start_at, end_at
    ) values (
      '63000000-0000-0000-0000-000000000010',
      '63000000-0000-0000-0000-000000000080',
      '63000000-0000-0000-0000-000000000061',
      '63000000-0000-0000-0000-000000000070',
      '63000000-0000-0000-0000-000000000091',
      '63000000-0000-0000-0000-000000000041',
      '2031-01-06 12:00:00-03', '2031-01-06 12:30:00-03'
    )
  $$,
  '%row-level security policy%',
  'Professional A cannot create an appointment for Professional B'
);

insert into agenda_scope_test_results
select throws_ok(
  $$ select public.transition_appointment_status('63000000-0000-0000-0000-0000000000a1', 'confirmed', null) $$,
  '42501',
  'Not allowed to change appointment status.',
  'Status transition RPC enforces the professional scope'
);

insert into agenda_scope_test_results
select lives_ok(
  $$ select public.transition_appointment_status('63000000-0000-0000-0000-0000000000a0', 'confirmed', null) $$,
  'Professional can transition the own appointment'
);

select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000006', true);

insert into agenda_scope_test_results
select is((select count(*) from public.schedules), 0::bigint,
  'Inactive linked professional receives no implicit schedule access');

insert into agenda_scope_test_results
select is((select count(*) from public.appointments), 0::bigint,
  'Inactive linked professional receives no implicit appointment access');

insert into agenda_scope_test_results
select is((select count(*) from public.online_booking_requests), 0::bigint,
  'Inactive linked professional receives no implicit online request access');

insert into agenda_scope_test_results
select throws_ok(
  $$ select public.transition_appointment_status('63000000-0000-0000-0000-0000000000a2', 'confirmed', null) $$,
  '42501',
  'Not allowed to change appointment status.',
  'Inactive professional link never escalates through the status RPC'
);

select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000005', true);

insert into agenda_scope_test_results
select is((select count(*) from public.schedules), 0::bigint,
  'Unlinked agenda.ver-only user needs an explicit data scope');

insert into agenda_scope_test_results
select is((select count(*) from public.online_booking_requests), 0::bigint,
  'Unlinked agenda.ver-only user cannot read online requests without a scope');

insert into agenda_scope_test_results
select is((select count(*) from public.schedule_online_booking_settings), 0::bigint,
  'Unlinked agenda.ver-only user cannot read per-schedule portal settings');

select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', true);

insert into agenda_scope_test_results
select is((select count(*) from public.schedules), 3::bigint,
  'Explicit broad reception scope grants organization-wide schedule access');

insert into agenda_scope_test_results
select is((select count(*) from public.appointments), 3::bigint,
  'Explicit broad reception scope grants organization-wide appointment access');

insert into agenda_scope_test_results
select is((select count(*) from public.online_booking_requests), 4::bigint,
  'Explicit broad reception scope grants organization-wide online request access');

insert into agenda_scope_test_results
select is((select count(*) from public.online_booking_reviews), 3::bigint,
  'Explicit broad reception scope grants organization-wide public review access');

insert into agenda_scope_test_results
select is((select count(*) from public.online_booking_settings), 1::bigint,
  'Explicit broad write scope grants access to global booking settings');

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.appointments set notes = 'reception update'
      where id = '63000000-0000-0000-0000-0000000000a1'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (1::bigint) $$,
  'Reception can update another professional appointment when permitted'
);

reset role;
insert into public.resource_scopes (
  organization_id, user_id, resource_type, resource_id, access_level
)
values (
  '63000000-0000-0000-0000-000000000010',
  '63000000-0000-0000-0000-000000000022',
  'profissional', '63000000-0000-0000-0000-000000000061', 'read'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000002', true);

insert into agenda_scope_test_results
select results_eq(
  $$ select name from public.schedules order by name $$,
  $$ values ('Schedule A'::text), ('Schedule B'::text) $$,
  'Professional scope explicitly extends linked professional read access'
);

insert into agenda_scope_test_results
select results_eq(
  $$ select id from public.waitlist_entries order by id $$,
  $$ values ('63000000-0000-0000-0000-0000000000b0'::uuid), ('63000000-0000-0000-0000-0000000000b1'::uuid) $$,
  'Explicit professional scope also constrains waitlist visibility'
);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.appointments set notes = 'still read only'
      where id = '63000000-0000-0000-0000-0000000000a1'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (0::bigint) $$,
  'Read scope does not grant appointment write access'
);

reset role;
insert into public.resource_scopes (
  organization_id, user_id, resource_type, resource_id, access_level
)
values (
  '63000000-0000-0000-0000-000000000010',
  '63000000-0000-0000-0000-000000000022',
  'agenda', '63000000-0000-0000-0000-000000000091', 'write'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000002', true);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.appointments set notes = 'explicit write'
      where id = '63000000-0000-0000-0000-0000000000a1'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (1::bigint) $$,
  'Explicit schedule write scope grants appointment write access'
);

insert into agenda_scope_test_results
select lives_ok(
  $$ select public.transition_appointment_status('63000000-0000-0000-0000-0000000000a1', 'confirmed', null) $$,
  'Explicit schedule write scope is honored by status RPC'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    update public.schedules
    set unit_id = '63000000-0000-0000-0000-000000000040'
    where id = '63000000-0000-0000-0000-000000000091'
  $$,
  '42501',
  'Not allowed to reassign schedule outside the destination resource scope.',
  'Direct schedule reassignment cannot reuse a schedule-only write grant'
);

insert into agenda_scope_test_results
select results_eq(
  $$ select distinct appointment_id from public.appointment_status_events order by appointment_id $$,
  $$ values ('63000000-0000-0000-0000-0000000000a0'::uuid), ('63000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'Status event scope extends only to explicitly granted appointments'
);

reset role;
insert into public.resource_scopes (
  organization_id, user_id, resource_type, resource_id, access_level
)
values (
  '63000000-0000-0000-0000-000000000010',
  '63000000-0000-0000-0000-000000000024',
  'unidade', '63000000-0000-0000-0000-000000000040', 'read'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000004', true);

insert into agenda_scope_test_results
select results_eq(
  $$ select name from public.schedules order by name $$,
  $$ values ('Schedule A'::text), ('Schedule Inactive Professional'::text) $$,
  'Explicit unit read scope constrains an unlinked operator'
);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.schedules set color = '#111111'
      where id = '63000000-0000-0000-0000-000000000090'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (0::bigint) $$,
  'Explicit unit read scope cannot modify schedules'
);

reset role;
insert into public.resource_scopes (
  organization_id, user_id, resource_type, resource_id, access_level
)
values (
  '63000000-0000-0000-0000-000000000010',
  '63000000-0000-0000-0000-000000000024',
  'unidade', '63000000-0000-0000-0000-000000000040', 'write'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000004', true);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.schedules set color = '#222222'
      where id = '63000000-0000-0000-0000-000000000090'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (1::bigint) $$,
  'Explicit unit write scope can modify matching schedules'
);

reset role;
delete from public.resource_scopes
where user_id = '63000000-0000-0000-0000-000000000024';
insert into public.resource_scopes (
  organization_id, user_id, resource_type, resource_id, access_level
)
values (
  '63000000-0000-0000-0000-000000000010',
  '63000000-0000-0000-0000-000000000024',
  'especialidade', '63000000-0000-0000-0000-000000000051', 'read'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000004', true);

insert into agenda_scope_test_results
select results_eq(
  $$ select name from public.schedules order by name $$,
  $$ values ('Schedule B'::text) $$,
  'Explicit specialty scope resolves through the professional'
);

reset role;
delete from public.resource_scopes
where user_id = '63000000-0000-0000-0000-000000000024';
insert into public.resource_scopes (
  organization_id, user_id, resource_type, resource_id, access_level
)
values (
  '63000000-0000-0000-0000-000000000010',
  '63000000-0000-0000-0000-000000000024',
  'agenda', null, 'read'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000004', true);

insert into agenda_scope_test_results
select is((select count(*) from public.schedules), 3::bigint,
  'NULL agenda scope means all schedules for reads');

insert into agenda_scope_test_results
select is((select count(*) from public.waitlist_entries), 3::bigint,
  'NULL agenda scope also covers generic waitlist activity');

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.schedules set color = '#333333'
      where id = '63000000-0000-0000-0000-000000000091'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (0::bigint) $$,
  'NULL agenda read scope does not grant writes'
);

reset role;

insert into agenda_scope_test_results
select throws_like(
  $$
    insert into public.resource_scopes (
      organization_id, user_id, resource_type, resource_id, access_level
    ) values (
      '63000000-0000-0000-0000-000000000010',
      '63000000-0000-0000-0000-000000000024',
      'agenda', null, 'read'
    )
  $$,
  '%duplicate key value%',
  'Duplicate NULL broad scopes are rejected'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    insert into public.resource_scopes (
      organization_id, user_id, resource_type, resource_id, access_level
    ) values (
      '63000000-0000-0000-0000-000000000010',
      '63000000-0000-0000-0000-000000000024',
      'agenda', '64000000-0000-0000-0000-000000000090', 'read'
    )
  $$,
  '23503',
  'Scope resource must belong to the selected organization and type.',
  'Cross-tenant resource scope is rejected'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    insert into public.resource_scopes (
      organization_id, user_id, resource_type, resource_id, access_level
    ) values (
      '63000000-0000-0000-0000-000000000010',
      '64000000-0000-0000-0000-000000000020',
      'agenda', null, 'read'
    )
  $$,
  '23503',
  'Scope user must belong to the selected organization.',
  'Cross-tenant scope user is rejected'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    insert into public.user_profiles (user_id, profile_id)
    values (
      '63000000-0000-0000-0000-000000000025',
      '64000000-0000-0000-0000-000000000030'
    )
  $$,
  '23514',
  'User and profile must belong to the same organization.',
  'Cross-tenant profile assignment is rejected'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    insert into public.user_profiles (user_id, profile_id)
    select '63000000-0000-0000-0000-000000000025', id
    from public.profiles
    where organization_id is null and name = 'Profissional'
  $$,
  '23514',
  'User and profile must belong to the same organization.',
  'Global profile template cannot be assigned directly'
);

insert into public.user_permission_overrides (user_id, permission_id, granted)
select '63000000-0000-0000-0000-000000000021', id, true
from public.permissions
where code = 'config.geral';

set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', true);

insert into agenda_scope_test_results
select throws_ok(
  $$
    update public.professionals
    set user_id = '63000000-0000-0000-0000-000000000025'
    where id = '63000000-0000-0000-0000-000000000063'
  $$,
  '42501',
  'Only access managers can change a professional user link.',
  'config.geral alone cannot change a professional login link'
);

select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000005', true);

insert into agenda_scope_test_results
select throws_ok(
  $$
    update public.app_users
    set organization_id = null, is_super_admin = true
    where id = '63000000-0000-0000-0000-000000000025'
  $$,
  '42501',
  'Self-service cannot change protected user identity or access fields.',
  'User cannot self-escalate to Super Admin or leave the tenant'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    update public.app_users
    set status = 'suspended'
    where id = '63000000-0000-0000-0000-000000000025'
  $$,
  '42501',
  'Self-service cannot change protected user identity or access fields.',
  'User cannot change the own access status'
);

insert into agenda_scope_test_results
select lives_ok(
  $$
    update public.app_users
    set name = 'Updated View User', phone = '+5585999999999'
    where id = '63000000-0000-0000-0000-000000000025'
  $$,
  'Self-service may update safe personal display fields'
);

reset role;

insert into public.user_permission_overrides (user_id, permission_id, granted)
select '63000000-0000-0000-0000-000000000021', id, true
from public.permissions
where code = 'config.usuarios';

set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000001', true);

insert into agenda_scope_test_results
select throws_like(
  $$
    insert into public.profile_permissions (profile_id, permission_id)
    select '63000000-0000-0000-0000-000000000035', id
    from public.permissions where code = 'paciente.ver'
  $$,
  '%row-level security policy%',
  'Tenant manager cannot modify a protected default profile permission set'
);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.profiles set name = 'Changed Protected Profile'
      where id = '63000000-0000-0000-0000-000000000035'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (0::bigint) $$,
  'Tenant manager cannot convert or update a protected default profile'
);

insert into agenda_scope_test_results
select lives_ok(
  $$
    insert into public.profile_permissions (profile_id, permission_id)
    select '63000000-0000-0000-0000-000000000034', id
    from public.permissions where code = 'paciente.ver'
  $$,
  'Tenant manager can customize a non-default tenant profile'
);

insert into agenda_scope_test_results
select lives_ok(
  $$
    update public.professionals
    set user_id = '63000000-0000-0000-0000-000000000025'
    where id = '63000000-0000-0000-0000-000000000063'
  $$,
  'Access manager can explicitly link a professional and user'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    update public.app_users
    set auth_user_id = null
    where id = '63000000-0000-0000-0000-000000000025'
  $$,
  '42501',
  'Tenant access managers cannot change protected user identity fields.',
  'Tenant manager cannot replace an authentication identity directly'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    update public.app_users
    set organization_id = null, is_super_admin = true
    where id = '63000000-0000-0000-0000-000000000025'
  $$,
  '42501',
  'Tenant access managers cannot change protected user identity fields.',
  'Tenant manager cannot elevate another user to Super Admin'
);

insert into agenda_scope_test_results
select lives_ok(
  $$
    update public.app_users
    set status = 'suspended'
    where id = '63000000-0000-0000-0000-000000000025'
  $$,
  'Tenant manager can suspend an ordinary tenant user'
);

reset role;
delete from public.resource_scopes
where user_id = '63000000-0000-0000-0000-000000000024';
insert into public.resource_scopes (
  organization_id, user_id, resource_type, resource_id, access_level
)
values (
  '63000000-0000-0000-0000-000000000010',
  '63000000-0000-0000-0000-000000000024',
  'agenda', '63000000-0000-0000-0000-000000000090', 'read'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000004', true);

insert into agenda_scope_test_results
select results_eq(
  $$ select id from public.online_booking_requests order by id $$,
  $$
    values
      ('63000000-0000-0000-0000-0000000000c0'::uuid),
      ('63000000-0000-0000-0000-0000000000c2'::uuid)
  $$,
  'Explicit schedule read scope constrains online request visibility'
);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.schedule_online_booking_settings
      set min_notice_hours = 12
      where schedule_id = '63000000-0000-0000-0000-000000000090'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (0::bigint) $$,
  'Schedule read scope cannot modify online booking settings'
);

insert into agenda_scope_test_results
select results_eq(
  $$
    with removed as (
      delete from public.schedule_online_booking_procedures
      where schedule_id = '63000000-0000-0000-0000-000000000090'
      returning id
    ) select count(*) from removed
  $$,
  $$ values (0::bigint) $$,
  'Schedule read scope cannot remove online booking procedures'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    select public.save_schedule_configuration(
      '63000000-0000-0000-0000-000000000090',
      '63000000-0000-0000-0000-000000000060',
      '63000000-0000-0000-0000-000000000040',
      'Read-only Save', '#2563EB', true, false,
      24, 30, 24, 30, '[]'::jsonb, array[]::uuid[]
    )
  $$,
  '42501',
  'Not allowed to configure schedules.',
  'Schedule configuration RPC requires write resource access'
);

reset role;
insert into public.resource_scopes (
  organization_id, user_id, resource_type, resource_id, access_level
)
values (
  '63000000-0000-0000-0000-000000000010',
  '63000000-0000-0000-0000-000000000024',
  'agenda', '63000000-0000-0000-0000-000000000090', 'write'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000004', true);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.schedule_online_booking_settings
      set min_notice_hours = 12
      where schedule_id = '63000000-0000-0000-0000-000000000090'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (1::bigint) $$,
  'Schedule write scope can modify matching online booking settings'
);

insert into agenda_scope_test_results
select results_eq(
  $$
    with removed as (
      delete from public.schedule_online_booking_procedures
      where schedule_id = '63000000-0000-0000-0000-000000000090'
      returning id
    ) select count(*) from removed
  $$,
  $$ values (1::bigint) $$,
  'Schedule write scope can remove matching online booking procedures'
);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.online_booking_settings
      set public_instructions = 'must remain unchanged'
      where organization_id = '63000000-0000-0000-0000-000000000010'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (0::bigint) $$,
  'A schedule-specific write scope cannot modify global booking settings'
);

reset role;
insert into public.resource_scopes (
  organization_id, user_id, resource_type, resource_id, access_level
)
values (
  '63000000-0000-0000-0000-000000000010',
  '63000000-0000-0000-0000-000000000024',
  'agenda', null, 'write'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000004', true);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.online_booking_settings
      set public_instructions = 'broad scope update'
      where organization_id = '63000000-0000-0000-0000-000000000010'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (1::bigint) $$,
  'A broad agenda write scope can modify global booking settings'
);

reset role;
delete from public.resource_scopes
where user_id = '63000000-0000-0000-0000-000000000022';
set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-0000-0000-000000000002', true);

insert into agenda_scope_test_results
select lives_ok(
  $$
    select public.save_schedule_configuration(
      '63000000-0000-0000-0000-000000000090',
      '63000000-0000-0000-0000-000000000060',
      '63000000-0000-0000-0000-000000000040',
      'Schedule A Updated', '#2563EB', true, false,
      24, 30, 24, 30,
      '[{"weekday":1,"start_time":"08:00","end_time":"18:00"}]'::jsonb,
      array['63000000-0000-0000-0000-000000000070'::uuid]
    )
  $$,
  'Linked professional can save the own schedule configuration'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    select public.save_schedule_configuration(
      null,
      '63000000-0000-0000-0000-000000000061',
      '63000000-0000-0000-0000-000000000041',
      'New Schedule B', '#2563EB', true, false,
      24, 30, 24, 30, '[]'::jsonb, array[]::uuid[]
    )
  $$,
  '42501',
  'Not allowed to configure schedules.',
  'Linked professional cannot create a schedule for another professional'
);

insert into agenda_scope_test_results
select lives_ok(
  $$
    select public.save_schedule_configuration(
      null,
      '63000000-0000-0000-0000-000000000060',
      '63000000-0000-0000-0000-000000000040',
      'New Own Schedule', '#2563EB', true, false,
      24, 30, 24, 30, '[]'::jsonb, array[]::uuid[]
    )
  $$,
  'Linked professional can create a schedule in the own resource scope'
);

insert into agenda_scope_test_results
select lives_ok(
  $$ select public.confirm_online_booking_request('63000000-0000-0000-0000-0000000000c0') $$,
  'Linked professional can confirm an online request from the own schedule'
);

insert into agenda_scope_test_results
select lives_ok(
  $$ select public.reject_online_booking_request('63000000-0000-0000-0000-0000000000c2', 'not available') $$,
  'Linked professional can reject an online request from the own schedule'
);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.online_booking_reviews set highlighted = true
      where id = '63000000-0000-0000-0000-0000000000d0'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (1::bigint) $$,
  'Linked professional can manage a public review in the own scope'
);

insert into agenda_scope_test_results
select results_eq(
  $$
    with changed as (
      update public.online_booking_reviews set highlighted = true
      where id = '63000000-0000-0000-0000-0000000000d1'
      returning id
    ) select count(*) from changed
  $$,
  $$ values (0::bigint) $$,
  'Linked professional cannot manage another professional public review'
);

select set_config('request.jwt.claim.sub', '65000000-0000-0000-0000-000000000001', true);

insert into agenda_scope_test_results
select throws_ok(
  $$
    select public.confirm_online_booking_request(
      '63000000-0000-0000-0000-0000000000c1',
      '65000000-0000-0000-0000-000000000030'
    )
  $$,
  '42501',
  'Not allowed to confirm online booking request.',
  'Support impersonation evaluates the target professional scope for confirmation'
);

insert into agenda_scope_test_results
select throws_ok(
  $$
    select public.save_schedule_configuration(
      '63000000-0000-0000-0000-000000000091',
      '63000000-0000-0000-0000-000000000061',
      '63000000-0000-0000-0000-000000000041',
      'Support Scope Attempt', '#2563EB', true, false,
      24, 30, 24, 30, '[]'::jsonb, array[]::uuid[],
      '65000000-0000-0000-0000-000000000030'
    )
  $$,
  '42501',
  'Not allowed to configure schedules.',
  'Support impersonation evaluates the target professional scope for schedule saves'
);

insert into agenda_scope_test_results
select * from finish();

reset role;
select row_number() over (order by ctid) as sequence, result
from agenda_scope_test_results
order by ctid;

rollback;
