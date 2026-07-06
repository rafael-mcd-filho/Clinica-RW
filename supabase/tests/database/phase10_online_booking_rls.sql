begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

create temporary table phase10_test_results (result text not null) on commit drop;
create temporary table phase10_ids (
  request_id uuid,
  access_token uuid,
  verification_id uuid,
  verification_code text
) on commit drop;
grant select, insert on phase10_test_results to anon, authenticated;
grant select, insert on phase10_ids to anon, authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'a1000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase10-agenda@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a2000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase10-other@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.organizations (id, name)
values
  ('a1000000-0000-0000-0000-000000000010', 'Phase 10 Tenant A'),
  ('a2000000-0000-0000-0000-000000000010', 'Phase 10 Tenant B');

insert into public.app_users (
  id, organization_id, auth_user_id, name, email, status, is_super_admin
)
values
  (
    'a1000000-0000-0000-0000-000000000020',
    'a1000000-0000-0000-0000-000000000010',
    'a1000000-0000-0000-0000-000000000001',
    'Phase 10 Reception A', 'phase10-agenda@example.com', 'active', false
  ),
  (
    'a2000000-0000-0000-0000-000000000020',
    'a2000000-0000-0000-0000-000000000010',
    'a2000000-0000-0000-0000-000000000001',
    'Phase 10 Reception B', 'phase10-other@example.com', 'active', false
  );

insert into public.profiles (id, organization_id, name)
values
  (
    'a1000000-0000-0000-0000-000000000030',
    'a1000000-0000-0000-0000-000000000010',
    'Phase 10 Online Booking Manager A'
  ),
  (
    'a2000000-0000-0000-0000-000000000030',
    'a2000000-0000-0000-0000-000000000010',
    'Phase 10 Online Booking Viewer B'
  );

insert into public.user_profiles (user_id, profile_id)
values
  (
    'a1000000-0000-0000-0000-000000000020',
    'a1000000-0000-0000-0000-000000000030'
  ),
  (
    'a2000000-0000-0000-0000-000000000020',
    'a2000000-0000-0000-0000-000000000030'
  );

insert into public.profile_permissions (profile_id, permission_id)
select 'a1000000-0000-0000-0000-000000000030', id
from public.permissions
where code in (
  'agenda.ver',
  'agenda.configurar',
  'agenda.criar_agendamento',
  'paciente.ver',
  'paciente.criar'
);

insert into public.profile_permissions (profile_id, permission_id)
select 'a2000000-0000-0000-0000-000000000030', id
from public.permissions
where code = 'agenda.ver';

insert into public.units (id, organization_id, name)
values (
  'a1000000-0000-0000-0000-000000000040',
  'a1000000-0000-0000-0000-000000000010',
  'Phase 10 Unit'
);

insert into public.professionals (id, organization_id, user_id, name)
values (
  'a1000000-0000-0000-0000-000000000050',
  'a1000000-0000-0000-0000-000000000010',
  null,
  'Phase 10 Professional'
);

insert into public.procedures (id, organization_id, name, duration_minutes, base_price)
values (
  'a1000000-0000-0000-0000-000000000060',
  'a1000000-0000-0000-0000-000000000010',
  'Phase 10 Consultation', 30, 180
);

insert into public.schedules (
  id, organization_id, professional_id, unit_id, name
)
values (
  'a1000000-0000-0000-0000-000000000070',
  'a1000000-0000-0000-0000-000000000010',
  'a1000000-0000-0000-0000-000000000050',
  'a1000000-0000-0000-0000-000000000040',
  'Phase 10 Public Schedule'
);

insert into public.schedule_availability (
  organization_id, schedule_id, weekday, start_time, end_time, slot_minutes
)
select
  'a1000000-0000-0000-0000-000000000010',
  'a1000000-0000-0000-0000-000000000070',
  weekday,
  '08:00'::time,
  '18:00'::time,
  30
from generate_series(0, 6) as weekdays(weekday);

update public.online_booking_settings
set enabled = true,
    public_slug = 'phase10-a',
    min_notice_hours = 0,
    max_days_ahead = 60,
    max_requests_per_contact_day = 1,
    max_no_shows_180_days = 1
where organization_id = 'a1000000-0000-0000-0000-000000000010';

insert into public.patients (
  id, organization_id, full_name, cpf, phone, whatsapp
)
values (
  'a1000000-0000-0000-0000-000000000080',
  'a1000000-0000-0000-0000-000000000010',
  'Phase 10 No Show Patient',
  '99999999999',
  '5584888888888',
  '5584888888888'
);

insert into public.appointments (
  id, organization_id, patient_id, professional_id, procedure_id,
  schedule_id, unit_id, status, start_at, end_at
)
values (
  'a1000000-0000-0000-0000-000000000090',
  'a1000000-0000-0000-0000-000000000010',
  'a1000000-0000-0000-0000-000000000080',
  'a1000000-0000-0000-0000-000000000050',
  'a1000000-0000-0000-0000-000000000060',
  'a1000000-0000-0000-0000-000000000070',
  'a1000000-0000-0000-0000-000000000040',
  'no_show',
  ((current_date - 7)::timestamp + time '10:00') at time zone 'America/Fortaleza',
  ((current_date - 7)::timestamp + time '10:30') at time zone 'America/Fortaleza'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

insert into phase10_test_results (result)
select lives_ok(
  $$
    insert into phase10_ids (request_id, access_token)
    select
      (payload ->> 'request_id')::uuid,
      (payload ->> 'access_token')::uuid
    from (
      select public.submit_online_booking_request_with_token(
        'phase10-a',
        'a1000000-0000-0000-0000-000000000070',
        'a1000000-0000-0000-0000-000000000060',
        ((current_date + 7)::timestamp + time '10:00') at time zone 'America/Fortaleza',
        'Paciente Online',
        'paciente.online@example.com',
        '5584999999999',
        '12345678909',
        null,
        'Preferencia por confirmacao via WhatsApp',
        true
      ) as payload
    ) as submitted
  $$,
  'Anonymous visitor can submit an online booking request'
);

insert into phase10_test_results (result)
select throws_ok(
  $$ select count(*) from public.online_booking_requests $$,
  '42501',
  'permission denied for table online_booking_requests',
  'Anonymous visitor cannot read booking requests'
);

insert into phase10_test_results (result)
select throws_ok(
  $$
    select public.submit_online_booking_request(
      'phase10-a',
      'a1000000-0000-0000-0000-000000000070',
      'a1000000-0000-0000-0000-000000000060',
      ((current_date + 7)::timestamp + time '10:00') at time zone 'America/Fortaleza',
      'Paciente Duplicado',
      'duplicado@example.com',
      null,
      null,
      null,
      null,
      true
    )
  $$,
  '23P01',
  'Requested slot is not available.',
  'Pending public request reserves the slot'
);

insert into phase10_test_results (result)
select throws_ok(
  $$
    select public.submit_online_booking_request(
      'phase10-a',
      'a1000000-0000-0000-0000-000000000070',
      'a1000000-0000-0000-0000-000000000060',
      ((current_date + 7)::timestamp + time '11:00') at time zone 'America/Fortaleza',
      'Paciente Online Limite',
      'paciente.online@example.com',
      null,
      null,
      null,
      null,
      true
    )
  $$,
  '23514',
  'Online booking request limit reached for this contact.',
  'Public booking blocks excessive requests from same contact'
);

insert into phase10_test_results (result)
select throws_ok(
  $$
    select public.submit_online_booking_request(
      'phase10-a',
      'a1000000-0000-0000-0000-000000000070',
      'a1000000-0000-0000-0000-000000000060',
      ((current_date + 7)::timestamp + time '11:30') at time zone 'America/Fortaleza',
      'Paciente Com Falta',
      'faltou@example.com',
      '5584888888888',
      '99999999999',
      null,
      null,
      true
    )
  $$,
  '23514',
  'Online booking is blocked by recent no-show history.',
  'Public booking blocks recent no-show history'
);

insert into phase10_test_results (result)
select lives_ok(
  $$
    select public.reschedule_online_booking_request(
      (
        select access_token
        from phase10_ids
        where access_token is not null
        order by ctid
        limit 1
      ),
      ((current_date + 8)::timestamp + time '11:00') at time zone 'America/Fortaleza'
    )
  $$,
  'Anonymous visitor can reschedule a pending request with token'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-0000-0000-000000000001',
  true
);

insert into phase10_test_results (result)
select results_eq(
  $$ select count(*) from public.online_booking_requests where status = 'requested' $$,
  $$ values (1::bigint) $$,
  'Clinic user can see pending online booking request'
);

insert into phase10_test_results (result)
select lives_ok(
  $$
    select public.confirm_online_booking_request(
      (
        select request_id
        from phase10_ids
        where access_token is not null
        order by ctid
        limit 1
      )
    )
  $$,
  'Clinic user can confirm online booking request'
);

insert into phase10_test_results (result)
select results_eq(
  $$
    select count(*)
    from public.appointments
    where id = (
      select appointment_id
      from public.online_booking_requests
      where id = (
        select request_id
        from phase10_ids
        where access_token is not null
        order by ctid
        limit 1
      )
    )
  $$,
  $$ values (1::bigint) $$,
  'Confirmation creates an internal appointment'
);

insert into phase10_test_results (result)
select results_eq(
  $$ select count(*) from public.patient_consents where consent_type = 'online_booking_lgpd' $$,
  $$ values (1::bigint) $$,
  'Confirmation preserves LGPD consent on patient'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

insert into phase10_test_results (result)
select lives_ok(
  $$
    insert into phase10_ids (request_id, access_token)
    select
      (payload ->> 'request_id')::uuid,
      (payload ->> 'access_token')::uuid
    from (
      select public.submit_online_booking_request_with_token(
        'phase10-a',
        'a1000000-0000-0000-0000-000000000070',
        'a1000000-0000-0000-0000-000000000060',
        ((current_date + 9)::timestamp + time '10:00') at time zone 'America/Fortaleza',
        'Paciente Cancelamento',
        'cancelamento@example.com',
        null,
        null,
        null,
        null,
        true
      ) as payload
    ) as submitted
  $$,
  'Anonymous visitor receives a self-service token'
);

insert into phase10_test_results (result)
select lives_ok(
  $$
    select public.cancel_online_booking_request(
      (
        select access_token
        from phase10_ids
        where access_token is not null
        order by ctid desc
        limit 1
      ),
      'Desistencia pelo portal'
    )
  $$,
  'Anonymous visitor can cancel a request with token'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-0000-0000-000000000001',
  true
);

insert into phase10_test_results (result)
select results_eq(
  $$ select count(*) from public.online_booking_requests where status = 'cancelled' $$,
  $$ values (1::bigint) $$,
  'Cancellation by token is visible to clinic'
);

update public.online_booking_settings
set require_contact_verification = true,
    contact_verification_ttl_minutes = 15,
    max_requests_per_contact_day = 3
where organization_id = 'a1000000-0000-0000-0000-000000000010';

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

insert into phase10_test_results (result)
select throws_ok(
  $$
    select public.submit_online_booking_request_with_token(
      'phase10-a',
      'a1000000-0000-0000-0000-000000000070',
      'a1000000-0000-0000-0000-000000000060',
      ((current_date + 10)::timestamp + time '09:00') at time zone 'America/Fortaleza',
      'Paciente Sem Verificacao',
      'semverificacao@example.com',
      null,
      null,
      null,
      null,
      true
    )
  $$,
  '42501',
  'Contact verification is required.',
  'Public booking requires verified contact when configured'
);

insert into phase10_test_results (result)
select lives_ok(
  $$
    insert into phase10_ids (verification_id, verification_code)
    select
      (payload ->> 'verification_id')::uuid,
      payload ->> 'delivery_debug_code'
    from (
      select public.start_online_booking_contact_verification(
        'phase10-a',
        'email',
        'verificado@example.com'
      ) as payload
    ) as verification
  $$,
  'Anonymous visitor can start contact verification'
);

insert into phase10_test_results (result)
select lives_ok(
  $$
    select public.verify_online_booking_contact(
      (
        select verification_id
        from phase10_ids
        where verification_id is not null
        order by ctid desc
        limit 1
      ),
      (
        select verification_code
        from phase10_ids
        where verification_code is not null
        order by ctid desc
        limit 1
      )
    )
  $$,
  'Anonymous visitor can verify contact code'
);

insert into phase10_test_results (result)
select lives_ok(
  $$
    insert into phase10_ids (request_id, access_token)
    select
      (payload ->> 'request_id')::uuid,
      (payload ->> 'access_token')::uuid
    from (
      select public.submit_online_booking_request_with_token(
        'phase10-a',
        'a1000000-0000-0000-0000-000000000070',
        'a1000000-0000-0000-0000-000000000060',
        ((current_date + 10)::timestamp + time '10:00') at time zone 'America/Fortaleza',
        'Paciente Verificado',
        'verificado@example.com',
        null,
        null,
        null,
        null,
        true
      ) as payload
    ) as submitted
  $$,
  'Anonymous visitor can submit with verified contact'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a2000000-0000-0000-0000-000000000001',
  true
);

insert into phase10_test_results (result)
select results_eq(
  $$ select count(*) from public.online_booking_requests $$,
  $$ values (0::bigint) $$,
  'Other tenant cannot see online booking request'
);

insert into phase10_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from phase10_test_results
order by ctid;

rollback;
