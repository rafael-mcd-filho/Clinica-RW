begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

create temporary table patient_deceased_test_results (
  result text not null
) on commit drop;

insert into public.organizations (id, name)
values (
  '7d3d4a18-5b9e-4b71-8c24-000000000010',
  'Patient Deceased Lifecycle Tenant'
);

insert into public.app_users (
  id, organization_id, name, email, status, is_super_admin
)
values (
  '7d3d4a18-5b9e-4b71-8c24-000000000020',
  '7d3d4a18-5b9e-4b71-8c24-000000000010',
  'Patient Lifecycle User',
  'patient-lifecycle@example.com',
  'active',
  false
);

insert into public.units (id, organization_id, name)
values (
  '7d3d4a18-5b9e-4b71-8c24-000000000040',
  '7d3d4a18-5b9e-4b71-8c24-000000000010',
  'Patient Lifecycle Unit'
);

insert into public.professionals (id, organization_id, name)
values (
  '7d3d4a18-5b9e-4b71-8c24-000000000050',
  '7d3d4a18-5b9e-4b71-8c24-000000000010',
  'Patient Lifecycle Professional'
);

insert into public.procedures (
  id, organization_id, name, duration_minutes
)
values (
  '7d3d4a18-5b9e-4b71-8c24-000000000060',
  '7d3d4a18-5b9e-4b71-8c24-000000000010',
  'Patient Lifecycle Consultation',
  30
);

insert into public.schedules (
  id, organization_id, professional_id, unit_id, name
)
values (
  '7d3d4a18-5b9e-4b71-8c24-000000000070',
  '7d3d4a18-5b9e-4b71-8c24-000000000010',
  '7d3d4a18-5b9e-4b71-8c24-000000000050',
  '7d3d4a18-5b9e-4b71-8c24-000000000040',
  'Patient Lifecycle Schedule'
);

insert into public.tags (id, organization_id, name, color)
values (
  '7d3d4a18-5b9e-4b71-8c24-000000000080',
  '7d3d4a18-5b9e-4b71-8c24-000000000010',
  'Birthday Lifecycle Test',
  '#64748b'
);

insert into public.patients (
  id, organization_id, full_name, birth_date, status
)
values
  (
    '7d3d4a18-5b9e-4b71-8c24-000000000101',
    '7d3d4a18-5b9e-4b71-8c24-000000000010',
    'Lifecycle Correction Patient',
    (current_date - interval '30 years')::date,
    'active'
  ),
  (
    '7d3d4a18-5b9e-4b71-8c24-000000000102',
    '7d3d4a18-5b9e-4b71-8c24-000000000010',
    'Lifecycle Constraint Patient',
    (current_date - interval '30 years')::date,
    'active'
  );

update public.patients
set deceased_at = current_date - 1,
    death_notes = 'Lifecycle test'
where id = '7d3d4a18-5b9e-4b71-8c24-000000000101';

insert into patient_deceased_test_results (result)
select results_eq(
  $$
    select
      status,
      status_before_deceased,
      deceased_at is not null,
      deceased_recorded_at is not null
    from public.patients
    where id = '7d3d4a18-5b9e-4b71-8c24-000000000101'
  $$,
  $$
    values ('inactive'::text, 'active'::text, true, true)
  $$,
  'Recording a death forces inactive status and preserves the prior status'
);

update public.patients
set deceased_at = null
where id = '7d3d4a18-5b9e-4b71-8c24-000000000101';

insert into patient_deceased_test_results (result)
select results_eq(
  $$
    select
      status,
      status_before_deceased,
      deceased_at,
      death_notes,
      deceased_recorded_at,
      deceased_recorded_by_user_id
    from public.patients
    where id = '7d3d4a18-5b9e-4b71-8c24-000000000101'
  $$,
  $$
    values (
      'active'::text,
      null::text,
      null::date,
      null::text,
      null::timestamptz,
      null::uuid
    )
  $$,
  'Correcting a death restores the prior status and clears death metadata'
);

insert into patient_deceased_test_results (result)
select throws_like(
  $$
    update public.patients
    set deceased_at = current_date + 1
    where id = '7d3d4a18-5b9e-4b71-8c24-000000000102'
  $$,
  '%patients_deceased_not_future_check%',
  'A future death date is rejected'
);

insert into patient_deceased_test_results (result)
select throws_like(
  $$
    update public.patients
    set deceased_at = birth_date - 1
    where id = '7d3d4a18-5b9e-4b71-8c24-000000000102'
  $$,
  '%patients_deceased_after_birth_check%',
  'A death date before birth is rejected'
);

insert into public.patients (
  id,
  organization_id,
  full_name,
  deceased_at,
  death_notes,
  deceased_recorded_at,
  deceased_recorded_by_user_id,
  status_before_deceased
)
values (
  '7d3d4a18-5b9e-4b71-8c24-000000000103',
  '7d3d4a18-5b9e-4b71-8c24-000000000010',
  'Living Metadata Cleanup Patient',
  null,
  'Must be cleared',
  statement_timestamp(),
  '7d3d4a18-5b9e-4b71-8c24-000000000020',
  'inactive'
);

insert into patient_deceased_test_results (result)
select results_eq(
  $$
    select
      deceased_at,
      death_notes,
      deceased_recorded_at,
      deceased_recorded_by_user_id,
      status_before_deceased
    from public.patients
    where id = '7d3d4a18-5b9e-4b71-8c24-000000000103'
  $$,
  $$
    values (
      null::date,
      null::text,
      null::timestamptz,
      null::uuid,
      null::text
    )
  $$,
  'Living patients cannot retain death metadata'
);

insert into public.appointments (
  id,
  organization_id,
  patient_id,
  professional_id,
  procedure_id,
  schedule_id,
  unit_id,
  start_at,
  end_at
)
values (
  '7d3d4a18-5b9e-4b71-8c24-000000000201',
  '7d3d4a18-5b9e-4b71-8c24-000000000010',
  '7d3d4a18-5b9e-4b71-8c24-000000000103',
  '7d3d4a18-5b9e-4b71-8c24-000000000050',
  '7d3d4a18-5b9e-4b71-8c24-000000000060',
  '7d3d4a18-5b9e-4b71-8c24-000000000070',
  '7d3d4a18-5b9e-4b71-8c24-000000000040',
  statement_timestamp() + interval '3 days',
  statement_timestamp() + interval '3 days 30 minutes'
);

update public.patients
set deceased_at = current_date - 1
where id = '7d3d4a18-5b9e-4b71-8c24-000000000103';

insert into patient_deceased_test_results (result)
select throws_ok(
  $$
    update public.appointments
    set start_at = start_at + interval '1 hour',
        end_at = end_at + interval '1 hour'
    where id = '7d3d4a18-5b9e-4b71-8c24-000000000201'
  $$,
  '23514',
  'Paciente com óbito registrado não pode receber novos agendamentos.',
  'An existing appointment cannot be rescheduled after the patient dies'
);

insert into public.patients (
  id, organization_id, full_name, birth_date, deceased_at
)
values (
  '7d3d4a18-5b9e-4b71-8c24-000000000104',
  '7d3d4a18-5b9e-4b71-8c24-000000000010',
  'Deceased Operational Patient',
  date '1980-01-01',
  current_date - 1
);

insert into patient_deceased_test_results (result)
select throws_ok(
  $$
    insert into public.appointments (
      organization_id,
      patient_id,
      professional_id,
      procedure_id,
      schedule_id,
      unit_id,
      start_at,
      end_at
    )
    values (
      '7d3d4a18-5b9e-4b71-8c24-000000000010',
      '7d3d4a18-5b9e-4b71-8c24-000000000104',
      '7d3d4a18-5b9e-4b71-8c24-000000000050',
      '7d3d4a18-5b9e-4b71-8c24-000000000060',
      '7d3d4a18-5b9e-4b71-8c24-000000000070',
      '7d3d4a18-5b9e-4b71-8c24-000000000040',
      statement_timestamp() + interval '1 day',
      statement_timestamp() + interval '1 day 30 minutes'
    )
  $$,
  '23514',
  'Paciente com óbito registrado não pode receber novos agendamentos.',
  'A deceased patient cannot receive a new appointment'
);

insert into patient_deceased_test_results (result)
select throws_ok(
  $$
    insert into public.waitlist_entries (
      organization_id, patient_id, procedure_id, preferred_period
    )
    values (
      '7d3d4a18-5b9e-4b71-8c24-000000000010',
      '7d3d4a18-5b9e-4b71-8c24-000000000104',
      '7d3d4a18-5b9e-4b71-8c24-000000000060',
      'morning'
    )
  $$,
  '23514',
  'Paciente com óbito registrado não pode receber novos agendamentos.',
  'A deceased patient cannot enter the waitlist'
);

insert into public.patients (
  id, organization_id, full_name, birth_date, deceased_at
)
values
  (
    '7d3d4a18-5b9e-4b71-8c24-000000000105',
    '7d3d4a18-5b9e-4b71-8c24-000000000010',
    'Living Birthday Patient',
    date '1990-07-19',
    null
  ),
  (
    '7d3d4a18-5b9e-4b71-8c24-000000000106',
    '7d3d4a18-5b9e-4b71-8c24-000000000010',
    'Deceased Birthday Patient',
    date '1990-07-19',
    current_date - 1
  );

insert into public.automation_rules (
  id,
  organization_id,
  rule_key,
  name,
  event_type,
  conditions,
  action_type,
  action_config,
  timezone,
  active,
  is_system_default
)
values (
  '7d3d4a18-5b9e-4b71-8c24-000000000090',
  '7d3d4a18-5b9e-4b71-8c24-000000000010',
  'patient_deceased_lifecycle_birthday',
  'Patient Deceased Lifecycle Birthday',
  'birthday',
  '{}'::jsonb,
  'add_tag',
  jsonb_build_object(
    'tag_id',
    '7d3d4a18-5b9e-4b71-8c24-000000000080'::uuid
  ),
  'America/Fortaleza',
  true,
  false
);

insert into patient_deceased_test_results (result)
select is(
  app_private.process_patient_automation_time_triggers(
    '7d3d4a18-5b9e-4b71-8c24-000000000010',
    make_timestamptz(
      extract(year from current_date)::integer,
      7,
      19,
      12,
      0,
      0,
      'America/Fortaleza'
    ),
    '7d3d4a18-5b9e-4b71-8c24-000000000090'
  ),
  1,
  'Birthday processing applies the rule only to eligible living patients'
);

insert into patient_deceased_test_results (result)
select results_eq(
  $$
    select patient_id
    from public.patient_tags
    where tag_id = '7d3d4a18-5b9e-4b71-8c24-000000000080'
    order by patient_id
  $$,
  $$
    values ('7d3d4a18-5b9e-4b71-8c24-000000000105'::uuid)
  $$,
  'Birthday automation does not tag deceased patients'
);

insert into patient_deceased_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from patient_deceased_test_results
order by ctid;

rollback;
