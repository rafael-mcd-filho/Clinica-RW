begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

create temporary table phase6_test_results (result text not null) on commit drop;
grant select, insert on phase6_test_results to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '61000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase6-a@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '62000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase6-b@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.organizations (id, name)
values
  ('61000000-0000-0000-0000-000000000010', 'Phase 6 Tenant A'),
  ('62000000-0000-0000-0000-000000000010', 'Phase 6 Tenant B');

insert into public.app_users (
  id, organization_id, auth_user_id, name, email, status, is_super_admin
)
values
  (
    '61000000-0000-0000-0000-000000000020',
    '61000000-0000-0000-0000-000000000010',
    '61000000-0000-0000-0000-000000000001',
    'Phase 6 User A', 'phase6-a@example.com', 'active', false
  ),
  (
    '62000000-0000-0000-0000-000000000020',
    '62000000-0000-0000-0000-000000000010',
    '62000000-0000-0000-0000-000000000001',
    'Phase 6 User B', 'phase6-b@example.com', 'active', false
  );

insert into public.profiles (id, organization_id, name)
values (
  '61000000-0000-0000-0000-000000000030',
  '61000000-0000-0000-0000-000000000010',
  'Phase 6 Reception'
);

insert into public.user_profiles (user_id, profile_id)
values (
  '61000000-0000-0000-0000-000000000020',
  '61000000-0000-0000-0000-000000000030'
);

insert into public.profile_permissions (profile_id, permission_id)
select '61000000-0000-0000-0000-000000000030', id
from public.permissions
where code in (
  'agenda.ver', 'agenda.criar_agendamento', 'agenda.editar_agendamento',
  'agenda.encaixar', 'agenda.bloquear_horario', 'agenda.configurar'
);

insert into public.units (id, organization_id, name)
values
  (
    '61000000-0000-0000-0000-000000000040',
    '61000000-0000-0000-0000-000000000010', 'Tenant A Unit'
  ),
  (
    '62000000-0000-0000-0000-000000000040',
    '62000000-0000-0000-0000-000000000010', 'Tenant B Unit'
  );

insert into public.professionals (id, organization_id, name)
values
  (
    '61000000-0000-0000-0000-000000000050',
    '61000000-0000-0000-0000-000000000010', 'Tenant A Professional'
  ),
  (
    '62000000-0000-0000-0000-000000000050',
    '62000000-0000-0000-0000-000000000010', 'Tenant B Professional'
  );

insert into public.procedures (id, organization_id, name, duration_minutes)
values
  (
    '61000000-0000-0000-0000-000000000060',
    '61000000-0000-0000-0000-000000000010', 'Tenant A Consultation', 30
  ),
  (
    '62000000-0000-0000-0000-000000000060',
    '62000000-0000-0000-0000-000000000010', 'Tenant B Consultation', 30
  );

insert into public.patients (id, organization_id, full_name)
values
  (
    '61000000-0000-0000-0000-000000000070',
    '61000000-0000-0000-0000-000000000010', 'Tenant A Patient'
  ),
  (
    '62000000-0000-0000-0000-000000000070',
    '62000000-0000-0000-0000-000000000010', 'Tenant B Patient'
  );

insert into public.schedules (
  id, organization_id, professional_id, unit_id, name
)
values (
  '62000000-0000-0000-0000-000000000080',
  '62000000-0000-0000-0000-000000000010',
  '62000000-0000-0000-0000-000000000050',
  '62000000-0000-0000-0000-000000000040',
  'Tenant B Schedule'
);

insert into public.appointments (
  id, organization_id, patient_id, professional_id, procedure_id,
  schedule_id, unit_id, start_at, end_at
)
values (
  '62000000-0000-0000-0000-000000000090',
  '62000000-0000-0000-0000-000000000010',
  '62000000-0000-0000-0000-000000000070',
  '62000000-0000-0000-0000-000000000050',
  '62000000-0000-0000-0000-000000000060',
  '62000000-0000-0000-0000-000000000080',
  '62000000-0000-0000-0000-000000000040',
  '2026-06-22 09:00:00-03', '2026-06-22 09:30:00-03'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '61000000-0000-0000-0000-000000000001',
  true
);

insert into phase6_test_results (result)
select lives_ok(
  $$
    insert into public.schedules (
      id, organization_id, professional_id, unit_id, name
    ) values (
      '61000000-0000-0000-0000-000000000080',
      '61000000-0000-0000-0000-000000000010',
      '61000000-0000-0000-0000-000000000050',
      '61000000-0000-0000-0000-000000000040',
      'Tenant A Schedule'
    )
  $$,
  'Agenda manager can create a schedule in the own tenant'
);

insert into phase6_test_results (result)
select results_eq(
  $$ select name from public.schedules order by name $$,
  $$ values ('Tenant A Schedule'::text) $$,
  'Tenant only sees own schedules'
);

insert into phase6_test_results (result)
select lives_ok(
  $$
    insert into public.schedule_availability (
      organization_id, schedule_id, weekday, start_time, end_time, slot_minutes
    ) values (
      '61000000-0000-0000-0000-000000000010',
      '61000000-0000-0000-0000-000000000080',
      1, '08:00', '18:00', 30
    )
  $$,
  'Agenda manager can define professional availability'
);

insert into phase6_test_results (result)
select lives_ok(
  $$
    insert into public.appointments (
      id, organization_id, patient_id, professional_id, procedure_id,
      schedule_id, unit_id, start_at, end_at, created_by_user_id
    ) values (
      '61000000-0000-0000-0000-000000000090',
      '61000000-0000-0000-0000-000000000010',
      '61000000-0000-0000-0000-000000000070',
      '61000000-0000-0000-0000-000000000050',
      '61000000-0000-0000-0000-000000000060',
      '61000000-0000-0000-0000-000000000080',
      '61000000-0000-0000-0000-000000000040',
      '2026-06-22 09:00:00-03', '2026-06-22 09:30:00-03',
      '61000000-0000-0000-0000-000000000020'
    )
  $$,
  'Reception can create an appointment inside availability'
);

insert into phase6_test_results (result)
select throws_like(
  $$
    insert into public.appointments (
      organization_id, patient_id, professional_id, procedure_id,
      schedule_id, unit_id, start_at, end_at
    ) values (
      '61000000-0000-0000-0000-000000000010',
      '61000000-0000-0000-0000-000000000070',
      '61000000-0000-0000-0000-000000000050',
      '61000000-0000-0000-0000-000000000060',
      '61000000-0000-0000-0000-000000000080',
      '61000000-0000-0000-0000-000000000040',
      '2026-06-22 09:15:00-03', '2026-06-22 09:45:00-03'
    )
  $$,
  '%exclusion constraint%',
  'Overlapping professional appointments are rejected'
);

insert into phase6_test_results (result)
select throws_ok(
  $$
    insert into public.appointments (
      organization_id, patient_id, professional_id, procedure_id,
      schedule_id, unit_id, start_at, end_at
    ) values (
      '61000000-0000-0000-0000-000000000010',
      '61000000-0000-0000-0000-000000000070',
      '61000000-0000-0000-0000-000000000050',
      '61000000-0000-0000-0000-000000000060',
      '61000000-0000-0000-0000-000000000080',
      '61000000-0000-0000-0000-000000000040',
      '2026-06-22 19:00:00-03', '2026-06-22 19:30:00-03'
    )
  $$,
  '23514',
  'Appointment is outside schedule availability.',
  'Appointments outside configured availability are rejected'
);

insert into public.schedule_blocks (
  organization_id, schedule_id, start_at, end_at, reason,
  created_by_user_id
)
values (
  '61000000-0000-0000-0000-000000000010',
  '61000000-0000-0000-0000-000000000080',
  '2026-06-22 11:00:00-03', '2026-06-22 12:00:00-03',
  'Team meeting', '61000000-0000-0000-0000-000000000020'
);

insert into phase6_test_results (result)
select throws_ok(
  $$
    insert into public.appointments (
      organization_id, patient_id, professional_id, procedure_id,
      schedule_id, unit_id, start_at, end_at
    ) values (
      '61000000-0000-0000-0000-000000000010',
      '61000000-0000-0000-0000-000000000070',
      '61000000-0000-0000-0000-000000000050',
      '61000000-0000-0000-0000-000000000060',
      '61000000-0000-0000-0000-000000000080',
      '61000000-0000-0000-0000-000000000040',
      '2026-06-22 11:30:00-03', '2026-06-22 12:00:00-03'
    )
  $$,
  '23P01',
  'Appointment overlaps a schedule block.',
  'Appointments inside schedule blocks are rejected'
);

select public.transition_appointment_status(
  '61000000-0000-0000-0000-000000000090', 'confirmed', null
);
select public.transition_appointment_status(
  '61000000-0000-0000-0000-000000000090', 'waiting', null
);

insert into phase6_test_results (result)
select results_eq(
  $$
    select from_status, to_status
    from public.appointment_status_events
    where appointment_id = '61000000-0000-0000-0000-000000000090'
    order by event_sequence
  $$,
  $$
    values
      (null::text, 'scheduled'::text),
      ('scheduled'::text, 'confirmed'::text),
      ('confirmed'::text, 'waiting'::text)
  $$,
  'Status transitions append immutable history events'
);

insert into phase6_test_results (result)
select throws_ok(
  $$
    select public.transition_appointment_status(
      '61000000-0000-0000-0000-000000000090', 'attended', null
    )
  $$,
  '23514',
  'Invalid appointment status transition.',
  'Invalid workflow transitions are rejected'
);

insert into phase6_test_results (result)
select results_eq(
  $$
    with updated as (
      update public.appointments
      set start_at = '2026-06-22 10:00:00-03',
          end_at = '2026-06-22 10:30:00-03'
      where id = '62000000-0000-0000-0000-000000000090'
      returning id
    )
    select count(*) from updated
  $$,
  $$ values (0::bigint) $$,
  'Tenant cannot reschedule another tenant appointment'
);

insert into public.waitlist_entries (
  organization_id, patient_id, procedure_id, preferred_period
)
values (
  '61000000-0000-0000-0000-000000000010',
  '61000000-0000-0000-0000-000000000070',
  '61000000-0000-0000-0000-000000000060',
  'morning'
);

insert into phase6_test_results (result)
select is(
  (select count(*) from public.waitlist_entries),
  1::bigint,
  'Reception can manage the own tenant waitlist'
);

insert into phase6_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from phase6_test_results
order by ctid;

rollback;
