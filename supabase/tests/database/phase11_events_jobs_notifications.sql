begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

create temporary table phase11_test_results (result text not null) on commit drop;
create temporary table phase11_ids (
  request_id uuid,
  job_id uuid,
  notification_id uuid,
  opt_out_event_id uuid
) on commit drop;
grant select, insert on phase11_test_results to anon, authenticated, service_role;
grant select, insert on phase11_ids to anon, authenticated, service_role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  'b1000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'phase11-automation@example.com', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.organizations (id, name)
values ('b1000000-0000-0000-0000-000000000010', 'Phase 11 Tenant');

insert into public.app_users (
  id, organization_id, auth_user_id, name, email, status, is_super_admin
)
values (
  'b1000000-0000-0000-0000-000000000020',
  'b1000000-0000-0000-0000-000000000010',
  'b1000000-0000-0000-0000-000000000001',
  'Phase 11 Automation User', 'phase11-automation@example.com', 'active', false
);

insert into public.profiles (id, organization_id, name)
values (
  'b1000000-0000-0000-0000-000000000030',
  'b1000000-0000-0000-0000-000000000010',
  'Phase 11 Automation Manager'
);

insert into public.user_profiles (user_id, profile_id)
values (
  'b1000000-0000-0000-0000-000000000020',
  'b1000000-0000-0000-0000-000000000030'
);

insert into public.profile_permissions (profile_id, permission_id)
select 'b1000000-0000-0000-0000-000000000030', id
from public.permissions
where code in (
  'agenda.ver',
  'agenda.configurar',
  'agenda.criar_agendamento',
  'paciente.criar',
  'automacao.ver',
  'automacao.criar'
);

insert into public.units (id, organization_id, name)
values (
  'b1000000-0000-0000-0000-000000000040',
  'b1000000-0000-0000-0000-000000000010',
  'Phase 11 Unit'
);

insert into public.professionals (id, organization_id, name)
values (
  'b1000000-0000-0000-0000-000000000050',
  'b1000000-0000-0000-0000-000000000010',
  'Phase 11 Professional'
);

insert into public.procedures (id, organization_id, name, duration_minutes, base_price)
values (
  'b1000000-0000-0000-0000-000000000060',
  'b1000000-0000-0000-0000-000000000010',
  'Phase 11 Consultation', 30, 180
);

insert into public.schedules (
  id, organization_id, professional_id, unit_id, name
)
values (
  'b1000000-0000-0000-0000-000000000070',
  'b1000000-0000-0000-0000-000000000010',
  'b1000000-0000-0000-0000-000000000050',
  'b1000000-0000-0000-0000-000000000040',
  'Phase 11 Public Schedule'
);

insert into public.schedule_availability (
  organization_id, schedule_id, weekday, start_time, end_time, slot_minutes
)
select
  'b1000000-0000-0000-0000-000000000010',
  'b1000000-0000-0000-0000-000000000070',
  weekday,
  '08:00'::time,
  '18:00'::time,
  30
from generate_series(0, 6) as weekdays(weekday);

update public.online_booking_settings
set enabled = true,
    public_slug = 'phase11-a',
    min_notice_hours = 0,
    max_days_ahead = 60
where organization_id = 'b1000000-0000-0000-0000-000000000010';

update public.schedule_online_booking_settings
set enabled = true,
    min_notice_hours = 0,
    max_days_ahead = 60,
    cancellation_notice_hours = 24
where organization_id = 'b1000000-0000-0000-0000-000000000010'
  and schedule_id = 'b1000000-0000-0000-0000-000000000070';

insert into public.schedule_online_booking_procedures (
  organization_id,
  schedule_id,
  procedure_id
)
values (
  'b1000000-0000-0000-0000-000000000010',
  'b1000000-0000-0000-0000-000000000070',
  'b1000000-0000-0000-0000-000000000060'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

insert into phase11_test_results (result)
select lives_ok(
  $$
    insert into phase11_ids (request_id)
    select (payload ->> 'request_id')::uuid
    from (
      select public.submit_online_booking_request_with_token(
        'phase11-a',
        'b1000000-0000-0000-0000-000000000070',
        'b1000000-0000-0000-0000-000000000060',
        ((current_date + 7)::timestamp + time '10:00') at time zone 'America/Fortaleza',
        'Paciente Automacao',
        'paciente.automacao@example.com',
        null,
        null,
        null,
        null,
        true
      ) as payload
    ) as submitted
  $$,
  'Anonymous booking request enqueues automation work'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-0000-0000-000000000001',
  true
);

insert into phase11_test_results (result)
select is(
  (select count(*) >= 8 from public.message_templates),
  true,
  'Default automation templates are seeded'
);

insert into phase11_test_results (result)
select is(
  (select count(*) >= 13 from public.automation_rules),
  true,
  'Default automation rules are seeded'
);

reset role;

insert into phase11_test_results (result)
select is(
  app_private.apply_send_window(
    '2026-07-01 22:30:00-03'::timestamptz,
    '08:00'::time,
    '20:00'::time,
    'America/Fortaleza'
  ),
  '2026-07-02 08:00:00-03'::timestamptz,
  'Send window moves late jobs to the next opening'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-0000-0000-000000000001',
  true
);

insert into phase11_test_results (result)
select results_eq(
  $$ select count(*) from public.app_events where event_type = 'online_booking.requested' $$,
  $$ values (1::bigint) $$,
  'Online booking request creates an internal event'
);

insert into phase11_test_results (result)
select results_eq(
  $$ select count(*) from public.notification_outbox where status = 'queued' $$,
  $$ values (1::bigint) $$,
  'Online booking request creates a queued notification'
);

insert into phase11_test_results (result)
select results_eq(
  $$
    select count(*)
    from public.notification_outbox notifications
    join public.automation_rules rules
      on rules.id = notifications.automation_rule_id
    where rules.rule_key = 'online_booking_requested_email'
      and notifications.channel = 'email'
  $$,
  $$ values (1::bigint) $$,
  'Requested booking uses the matching automation rule without duplicate channels'
);

insert into phase11_test_results (result)
select results_eq(
  $$ select count(*) from public.job_queue where status = 'pending' and job_type = 'send_notification' $$,
  $$ values (1::bigint) $$,
  'Queued notification creates a pending job'
);

insert into phase11_test_results (result)
select lives_ok(
  $$
    select public.confirm_online_booking_request(
      (select request_id from phase11_ids limit 1)
    )
  $$,
  'Clinic confirmation triggers automations'
);

insert into phase11_test_results (result)
select results_eq(
  $$ select count(*) from public.app_events where event_type = 'online_booking.confirmed' $$,
  $$ values (1::bigint) $$,
  'Confirmed booking creates an internal event'
);

insert into phase11_test_results (result)
select results_eq(
  $$ select count(*) from public.notification_outbox where status = 'queued' $$,
  $$ values (2::bigint) $$,
  'Confirmed booking creates another queued notification'
);

insert into phase11_test_results (result)
select lives_ok(
  $$
    insert into public.communication_opt_outs (
      organization_id,
      channel,
      recipient,
      reason,
      created_by_user_id
    ) values (
      'b1000000-0000-0000-0000-000000000010',
      'whatsapp',
      '+55 (85) 99999-0000',
      'Paciente pediu para nao receber mensagens',
      'b1000000-0000-0000-0000-000000000020'
    )
  $$,
  'Automation manager can register a communication opt-out'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);

insert into phase11_test_results (result)
select lives_ok(
  $$
    insert into phase11_ids (opt_out_event_id)
    select app_private.enqueue_app_event(
      'b1000000-0000-0000-0000-000000000010',
      'appointment.reminder_due',
      'appointment',
      'b1000000-0000-0000-0000-000000000099',
      jsonb_build_object(
        'patient_name', 'Paciente Opt-out',
        'patient_phone', '+55 85 99999-0000',
        'appointment_start_at', '02/07/2026 10:00'
      ),
      null
    )
  $$,
  'Service automation can process an event that matches an opted-out recipient'
);

insert into phase11_test_results (result)
select results_eq(
  $$
    select count(*)
    from public.notification_outbox
    where status = 'skipped'
      and channel = 'whatsapp'
      and recipient = '+55 85 99999-0000'
  $$,
  $$ values (1::bigint) $$,
  'Opted-out recipient creates a skipped notification'
);

insert into phase11_test_results (result)
select results_eq(
  $$
    select count(*)
    from public.job_queue jobs
    join public.notification_outbox notifications
      on notifications.id::text = jobs.payload ->> 'notification_id'
    where notifications.status = 'skipped'
  $$,
  $$ values (0::bigint) $$,
  'Skipped notifications do not create delivery jobs'
);

set local role service_role;
select set_config('request.jwt.claim.sub', '', true);

insert into phase11_test_results (result)
select lives_ok(
  $$
    insert into phase11_ids (job_id, notification_id)
    select id, (payload ->> 'notification_id')::uuid
    from public.claim_next_job('phase11-test-worker', array['send_notification'])
    limit 1
  $$,
  'Service worker can claim the next pending job'
);

insert into phase11_test_results (result)
select lives_ok(
  $$
    select public.complete_job(
      (select job_id from phase11_ids where job_id is not null limit 1),
      true,
      null
    )
  $$,
  'Service worker can complete a notification job'
);

insert into phase11_test_results (result)
select results_eq(
  $$
    select job.status, notification.status
    from public.job_queue job
    join phase11_ids ids on ids.job_id = job.id
    join public.notification_outbox notification
      on notification.id = ids.notification_id
    limit 1
  $$,
  $$ values ('succeeded'::text, 'sent'::text) $$,
  'Completing a notification job marks job and notification as delivered'
);

insert into phase11_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from phase11_test_results
order by ctid;

rollback;
