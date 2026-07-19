begin;

create extension if not exists pgtap with schema extensions;
select plan(70);

create temporary table whatsapp_lifecycle_test_results (
  result text not null
) on commit drop;
grant select, insert on whatsapp_lifecycle_test_results to authenticated;

select ok(
  to_regclass('public.whatsapp_attendance_sessions') is not null,
  'Attendance sessions table exists'
);

select ok(
  to_regclass('public.whatsapp_attendance_events') is not null,
  'Attendance events table exists'
);

select ok(
  to_regprocedure('public.claim_whatsapp_conversation(uuid)') is not null,
  'Claim RPC exists'
);

select ok(
  to_regprocedure('public.transfer_whatsapp_conversation(uuid,uuid)') is not null,
  'Transfer RPC exists'
);

select ok(
  to_regprocedure('public.complete_whatsapp_conversation(uuid)') is not null,
  'Complete RPC exists'
);

select ok(
  to_regprocedure('public.reopen_whatsapp_conversation(uuid)') is not null,
  'Reopen RPC exists'
);

select ok(
  to_regprocedure('public.list_whatsapp_attendants()') is not null,
  'Safe attendant listing RPC exists'
);

select ok(
  to_regprocedure('public.mark_whatsapp_conversation_read(uuid)') is not null,
  'Mark-read RPC exists'
);

select ok(
  to_regprocedure(
    'public.record_whatsapp_outbound_activity(uuid,text,timestamp with time zone)'
  ) is not null,
  'Outbound activity RPC exists'
);

select is(
  has_table_privilege(
    'authenticated',
    'public.whatsapp_attendance_sessions',
    'INSERT'
  ),
  false,
  'Authenticated clients cannot insert attendance sessions directly'
);

select is(
  has_table_privilege(
    'authenticated',
    'public.whatsapp_attendance_events',
    'UPDATE'
  ),
  false,
  'Authenticated clients cannot update attendance events directly'
);

select is(
  has_table_privilege(
    'authenticated',
    'public.whatsapp_conversations',
    'UPDATE'
  ),
  false,
  'Authenticated clients cannot perform unrestricted conversation updates'
);

select is(
  has_column_privilege(
    'authenticated',
    'public.whatsapp_conversations',
    'unread_count',
    'UPDATE'
  ),
  false,
  'Conversation metadata is updated only through validated RPCs'
);

select is(
  has_column_privilege(
    'authenticated',
    'public.whatsapp_conversations',
    'status',
    'UPDATE'
  ),
  false,
  'Conversation status cannot be updated outside lifecycle RPCs'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.whatsapp_messages',
    'INSERT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.whatsapp_messages',
    'UPDATE'
  )
  and not has_table_privilege(
    'authenticated',
    'public.whatsapp_messages',
    'DELETE'
  ),
  'Authenticated clients cannot mutate WhatsApp messages directly'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.whatsapp_conversations'::regclass
      and conname = 'whatsapp_conversations_open_assigned_check'
  ),
  'Open conversations structurally require a responsible user'
);

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
    '19000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'wa-actor-a@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '19000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'wa-viewer-a@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '19000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'wa-target-a@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '19000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'wa-denied-a@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '19000000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated', 'wa-suspended-a@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '19200000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'wa-actor-b@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.organizations (id, name)
values
  ('19000000-0000-4000-8000-000000000010', 'WhatsApp Lifecycle A'),
  ('19200000-0000-4000-8000-000000000010', 'WhatsApp Lifecycle B');

insert into public.profiles (id, organization_id, name)
values
  (
    '19000000-0000-4000-8000-000000000030',
    '19000000-0000-4000-8000-000000000010',
    'WhatsApp Attendants A'
  ),
  (
    '19000000-0000-4000-8000-000000000031',
    '19000000-0000-4000-8000-000000000010',
    'WhatsApp Viewers A'
  ),
  (
    '19200000-0000-4000-8000-000000000030',
    '19200000-0000-4000-8000-000000000010',
    'WhatsApp Attendants B'
  );

insert into public.profile_permissions (profile_id, permission_id)
select profile_id, permissions.id
from (
  values
    ('19000000-0000-4000-8000-000000000030'::uuid),
    ('19200000-0000-4000-8000-000000000030'::uuid)
) as attendant_profiles(profile_id)
cross join public.permissions
where permissions.code in ('atendimento.ver', 'atendimento.atender');

insert into public.profile_permissions (profile_id, permission_id)
select
  '19000000-0000-4000-8000-000000000031',
  permissions.id
from public.permissions
where permissions.code = 'atendimento.ver';

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
    '19000000-0000-4000-8000-000000000020',
    '19000000-0000-4000-8000-000000000010',
    '19000000-0000-4000-8000-000000000001',
    'Atendente A', 'wa-actor-a@example.com', 'active', false
  ),
  (
    '19000000-0000-4000-8000-000000000021',
    '19000000-0000-4000-8000-000000000010',
    '19000000-0000-4000-8000-000000000002',
    'Visualizador A', 'wa-viewer-a@example.com', 'active', false
  ),
  (
    '19000000-0000-4000-8000-000000000022',
    '19000000-0000-4000-8000-000000000010',
    '19000000-0000-4000-8000-000000000003',
    'Destino A', 'wa-target-a@example.com', 'active', false
  ),
  (
    '19000000-0000-4000-8000-000000000023',
    '19000000-0000-4000-8000-000000000010',
    '19000000-0000-4000-8000-000000000004',
    'Negado A', 'wa-denied-a@example.com', 'active', false
  ),
  (
    '19000000-0000-4000-8000-000000000024',
    '19000000-0000-4000-8000-000000000010',
    '19000000-0000-4000-8000-000000000005',
    'Suspenso A', 'wa-suspended-a@example.com', 'suspended', false
  ),
  (
    '19200000-0000-4000-8000-000000000020',
    '19200000-0000-4000-8000-000000000010',
    '19200000-0000-4000-8000-000000000001',
    'Atendente B', 'wa-actor-b@example.com', 'active', false
  );

insert into public.user_profiles (user_id, profile_id)
values
  (
    '19000000-0000-4000-8000-000000000020',
    '19000000-0000-4000-8000-000000000030'
  ),
  (
    '19000000-0000-4000-8000-000000000021',
    '19000000-0000-4000-8000-000000000031'
  ),
  (
    '19000000-0000-4000-8000-000000000022',
    '19000000-0000-4000-8000-000000000030'
  ),
  (
    '19000000-0000-4000-8000-000000000023',
    '19000000-0000-4000-8000-000000000030'
  ),
  (
    '19000000-0000-4000-8000-000000000024',
    '19000000-0000-4000-8000-000000000030'
  ),
  (
    '19200000-0000-4000-8000-000000000020',
    '19200000-0000-4000-8000-000000000030'
  );

insert into public.user_permission_overrides (
  user_id,
  permission_id,
  granted
)
select
  '19000000-0000-4000-8000-000000000023',
  permissions.id,
  false
from public.permissions
where permissions.code = 'atendimento.atender';

insert into public.whatsapp_instances (
  id,
  organization_id,
  evolution_instance_name,
  status
)
values
  (
    '19000000-0000-4000-8000-000000000040',
    '19000000-0000-4000-8000-000000000010',
    'wa-lifecycle-a',
    'connected'
  ),
  (
    '19200000-0000-4000-8000-000000000040',
    '19200000-0000-4000-8000-000000000010',
    'wa-lifecycle-b',
    'connected'
  );

insert into public.whatsapp_contacts (
  id,
  organization_id,
  phone,
  wa_name
)
values
  (
    '19000000-0000-4000-8000-000000000050',
    '19000000-0000-4000-8000-000000000010',
    '5584999000001',
    'Pending A'
  ),
  (
    '19000000-0000-4000-8000-000000000051',
    '19000000-0000-4000-8000-000000000010',
    '5584999000002',
    'Complete Pending A'
  ),
  (
    '19000000-0000-4000-8000-000000000052',
    '19000000-0000-4000-8000-000000000010',
    '5584999000003',
    'Normalized A'
  ),
  (
    '19000000-0000-4000-8000-000000000053',
    '19000000-0000-4000-8000-000000000010',
    '5584999000004',
    'Already Open A'
  ),
  (
    '19000000-0000-4000-8000-000000000054',
    '19000000-0000-4000-8000-000000000010',
    '5584999000005',
    'Already Resolved A'
  ),
  (
    '19200000-0000-4000-8000-000000000050',
    '19200000-0000-4000-8000-000000000010',
    '5584999000010',
    'Open B'
  );

insert into public.whatsapp_conversations (
  id,
  organization_id,
  instance_id,
  contact_id,
  assigned_user_id,
  status
)
values
  (
    '19000000-0000-4000-8000-000000000100',
    '19000000-0000-4000-8000-000000000010',
    '19000000-0000-4000-8000-000000000040',
    '19000000-0000-4000-8000-000000000050',
    null,
    'pending'
  ),
  (
    '19000000-0000-4000-8000-000000000101',
    '19000000-0000-4000-8000-000000000010',
    '19000000-0000-4000-8000-000000000040',
    '19000000-0000-4000-8000-000000000051',
    null,
    'pending'
  ),
  (
    '19000000-0000-4000-8000-000000000102',
    '19000000-0000-4000-8000-000000000010',
    '19000000-0000-4000-8000-000000000040',
    '19000000-0000-4000-8000-000000000052',
    '19000000-0000-4000-8000-000000000020',
    'pending'
  ),
  (
    '19000000-0000-4000-8000-000000000103',
    '19000000-0000-4000-8000-000000000010',
    '19000000-0000-4000-8000-000000000040',
    '19000000-0000-4000-8000-000000000053',
    '19000000-0000-4000-8000-000000000020',
    'open'
  ),
  (
    '19000000-0000-4000-8000-000000000104',
    '19000000-0000-4000-8000-000000000010',
    '19000000-0000-4000-8000-000000000040',
    '19000000-0000-4000-8000-000000000054',
    '19000000-0000-4000-8000-000000000020',
    'resolved'
  ),
  (
    '19200000-0000-4000-8000-000000000100',
    '19200000-0000-4000-8000-000000000010',
    '19200000-0000-4000-8000-000000000040',
    '19200000-0000-4000-8000-000000000050',
    '19200000-0000-4000-8000-000000000020',
    'open'
  );

update public.whatsapp_conversations
set unread_count = 3
where id = '19000000-0000-4000-8000-000000000103';

select is(
  (
    select count(*)
    from public.whatsapp_attendance_sessions
    where conversation_id = '19000000-0000-4000-8000-000000000103'
      and ended_at is null
  ),
  1::bigint,
  'A trusted direct open write creates one active session'
);

select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000103'
      and event_type = 'started'
  ),
  1::bigint,
  'A trusted direct open write records a start event'
);

select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000104'
      and event_type = 'completed'
  ),
  1::bigint,
  'A trusted direct resolved write records a completion event'
);

select is(
  (
    select count(*)
    from public.whatsapp_attendance_sessions
    where conversation_id = '19000000-0000-4000-8000-000000000104'
      and ended_at is not null
      and end_reason = 'completed'
  ),
  1::bigint,
  'A trusted direct resolved write creates closed historical session data'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '19000000-0000-4000-8000-000000000002',
  true
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_sessions
    where organization_id = '19200000-0000-4000-8000-000000000010'
  ),
  0::bigint,
  'A viewer cannot read another tenant attendance sessions'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where organization_id = '19200000-0000-4000-8000-000000000010'
  ),
  0::bigint,
  'A viewer cannot read another tenant attendance events'
);

insert into whatsapp_lifecycle_test_results (result)
select throws_ok(
  $$ select * from public.list_whatsapp_attendants() $$,
  '42501',
  'Acesso negado.',
  'A read-only viewer cannot list transfer targets'
);

insert into whatsapp_lifecycle_test_results (result)
select throws_ok(
  $$
    select public.claim_whatsapp_conversation(
      '19000000-0000-4000-8000-000000000100'
    )
  $$,
  '42501',
  'Acesso negado.',
  'A read-only viewer cannot claim a conversation'
);

insert into whatsapp_lifecycle_test_results (result)
select throws_ok(
  $$
    select public.mark_whatsapp_conversation_read(
      '19000000-0000-4000-8000-000000000103'
    )
  $$,
  '42501',
  'Acesso negado.',
  'A read-only viewer cannot mark a conversation as read'
);

select set_config(
  'request.jwt.claim.sub',
  '19000000-0000-4000-8000-000000000001',
  true
);

insert into whatsapp_lifecycle_test_results (result)
select results_eq(
  $$ select user_id from public.list_whatsapp_attendants() order by user_id $$,
  $$
    values
      ('19000000-0000-4000-8000-000000000020'::uuid),
      ('19000000-0000-4000-8000-000000000022'::uuid)
  $$,
  'Attendant listing returns active same-tenant users with effective permission'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (select count(*) from public.list_whatsapp_attendants()),
  2::bigint,
  'Attendant listing excludes denied, suspended and cross-tenant users'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.mark_whatsapp_conversation_read(
    '19000000-0000-4000-8000-000000000103'
  ),
  true,
  'An attendant can mark a same-tenant conversation as read'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select unread_count
    from public.whatsapp_conversations
    where id = '19000000-0000-4000-8000-000000000103'
  ),
  0,
  'Mark-read clears the unread counter'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.record_whatsapp_outbound_activity(
    '19000000-0000-4000-8000-000000000103',
    'Mensagem de teste',
    '2026-07-18 12:34:00+00'
  ),
  true,
  'The responsible attendant can record outbound activity'
);

insert into whatsapp_lifecycle_test_results (result)
select ok(
  exists (
    select 1
    from public.whatsapp_conversations
    where id = '19000000-0000-4000-8000-000000000103'
      and unread_count = 0
      and last_message_preview = 'Mensagem de teste'
      and last_message_at = '2026-07-18 12:34:00+00'::timestamptz
  ),
  'Outbound activity updates only the expected conversation metadata'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.record_whatsapp_outbound_activity(
    '19200000-0000-4000-8000-000000000100',
    'Cross tenant',
    statement_timestamp()
  ),
  false,
  'Outbound activity does not reveal or mutate another tenant conversation'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.claim_whatsapp_conversation(
    '19000000-0000-4000-8000-000000000100'
  ),
  true,
  'An attendant can claim an unowned pending conversation'
);

insert into whatsapp_lifecycle_test_results (result)
select ok(
  exists (
    select 1
    from public.whatsapp_conversations
    where id = '19000000-0000-4000-8000-000000000100'
      and status = 'open'
      and assigned_user_id = '19000000-0000-4000-8000-000000000020'
  ),
  'Claim atomically opens and assigns the conversation to the actor'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_sessions
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and attendant_user_id = '19000000-0000-4000-8000-000000000020'
      and ended_at is null
  ),
  1::bigint,
  'Claim creates one active session for the actor'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and event_type = 'started'
      and actor_user_id = '19000000-0000-4000-8000-000000000020'
      and to_user_id = '19000000-0000-4000-8000-000000000020'
  ),
  1::bigint,
  'Claim records the start event and actor'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.claim_whatsapp_conversation(
    '19000000-0000-4000-8000-000000000100'
  ),
  true,
  'Claim is idempotent when the actor already owns the open conversation'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and event_type = 'started'
  ),
  1::bigint,
  'Idempotent claim does not duplicate start history'
);

insert into whatsapp_lifecycle_test_results (result)
select throws_ok(
  $$
    select public.transfer_whatsapp_conversation(
      '19000000-0000-4000-8000-000000000100',
      '19200000-0000-4000-8000-000000000020'
    )
  $$,
  '23514',
  'Atendente de destino invalido ou sem permissao.',
  'Transfer rejects a target from another tenant'
);

insert into whatsapp_lifecycle_test_results (result)
select throws_ok(
  $$
    select public.transfer_whatsapp_conversation(
      '19000000-0000-4000-8000-000000000100',
      '19000000-0000-4000-8000-000000000023'
    )
  $$,
  '23514',
  'Atendente de destino invalido ou sem permissao.',
  'Transfer respects an effective permission denial override'
);

insert into whatsapp_lifecycle_test_results (result)
select throws_ok(
  $$
    select public.transfer_whatsapp_conversation(
      '19000000-0000-4000-8000-000000000100',
      '19000000-0000-4000-8000-000000000024'
    )
  $$,
  '23514',
  'Atendente de destino invalido ou sem permissao.',
  'Transfer rejects a suspended target'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.transfer_whatsapp_conversation(
    '19000000-0000-4000-8000-000000000100',
    '19000000-0000-4000-8000-000000000022'
  ),
  true,
  'An attendant can transfer an open conversation to a valid target'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select assigned_user_id
    from public.whatsapp_conversations
    where id = '19000000-0000-4000-8000-000000000100'
  ),
  '19000000-0000-4000-8000-000000000022'::uuid,
  'Transfer changes ownership to the target'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select end_reason
    from public.whatsapp_attendance_sessions
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and attendant_user_id = '19000000-0000-4000-8000-000000000020'
  ),
  'transferred',
  'Transfer closes the previous attendant session'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_sessions
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and attendant_user_id = '19000000-0000-4000-8000-000000000022'
      and ended_at is null
  ),
  1::bigint,
  'Transfer opens one active session for the target'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and event_type = 'transferred'
      and actor_user_id = '19000000-0000-4000-8000-000000000020'
      and from_user_id = '19000000-0000-4000-8000-000000000020'
      and to_user_id = '19000000-0000-4000-8000-000000000022'
  ),
  1::bigint,
  'Transfer records actor, source and target users'
);

insert into whatsapp_lifecycle_test_results (result)
select throws_ok(
  $$
    select public.record_whatsapp_outbound_activity(
      '19000000-0000-4000-8000-000000000100',
      'Nao autorizado',
      statement_timestamp()
    )
  $$,
  '42501',
  'Atendimento nao pertence ao usuario atual.',
  'The previous attendant cannot record activity after transfer'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.transfer_whatsapp_conversation(
    '19000000-0000-4000-8000-000000000100',
    '19000000-0000-4000-8000-000000000022'
  ),
  true,
  'Transfer is idempotent when the target already owns the open conversation'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and event_type = 'transferred'
  ),
  1::bigint,
  'Idempotent transfer does not duplicate history'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.complete_whatsapp_conversation(
    '19000000-0000-4000-8000-000000000100'
  ),
  true,
  'An attendant can complete an open conversation'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select status
    from public.whatsapp_conversations
    where id = '19000000-0000-4000-8000-000000000100'
  ),
  'resolved',
  'Completion resolves the conversation'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_sessions
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and ended_at is null
  ),
  0::bigint,
  'Completion leaves no active session'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select end_reason
    from public.whatsapp_attendance_sessions
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and attendant_user_id = '19000000-0000-4000-8000-000000000022'
  ),
  'completed',
  'Completion closes the target session with the correct reason'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and event_type = 'completed'
      and actor_user_id = '19000000-0000-4000-8000-000000000020'
      and from_user_id = '19000000-0000-4000-8000-000000000022'
  ),
  1::bigint,
  'Completion records the actor and final responsible user'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.complete_whatsapp_conversation(
    '19000000-0000-4000-8000-000000000100'
  ),
  true,
  'Completion is idempotent for an already resolved conversation'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and event_type = 'completed'
  ),
  1::bigint,
  'Idempotent completion does not duplicate history'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.reopen_whatsapp_conversation(
    '19000000-0000-4000-8000-000000000100'
  ),
  true,
  'An attendant can reopen a resolved conversation'
);

insert into whatsapp_lifecycle_test_results (result)
select ok(
  exists (
    select 1
    from public.whatsapp_conversations
    where id = '19000000-0000-4000-8000-000000000100'
      and status = 'pending'
      and assigned_user_id is null
  ),
  'Reopen returns the conversation to the unowned pending queue'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and event_type = 'reopened'
      and actor_user_id = '19000000-0000-4000-8000-000000000020'
      and from_user_id = '19000000-0000-4000-8000-000000000022'
  ),
  1::bigint,
  'Reopen records its actor and previous responsible user'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_sessions
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and ended_at is null
  ),
  0::bigint,
  'Reopened pending conversation has no active session'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.reopen_whatsapp_conversation(
    '19000000-0000-4000-8000-000000000100'
  ),
  true,
  'Reopen is idempotent for an already pending conversation'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and event_type = 'reopened'
  ),
  1::bigint,
  'Idempotent reopen does not duplicate history'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.transfer_whatsapp_conversation(
    '19000000-0000-4000-8000-000000000100',
    '19000000-0000-4000-8000-000000000022'
  ),
  true,
  'A pending conversation can be transferred directly to an attendant'
);

insert into whatsapp_lifecycle_test_results (result)
select ok(
  exists (
    select 1
    from public.whatsapp_conversations as conversations
    join public.whatsapp_attendance_sessions as sessions
      on sessions.organization_id = conversations.organization_id
     and sessions.conversation_id = conversations.id
     and sessions.ended_at is null
    where conversations.id = '19000000-0000-4000-8000-000000000100'
      and conversations.status = 'open'
      and conversations.assigned_user_id = '19000000-0000-4000-8000-000000000022'
      and sessions.attendant_user_id = '19000000-0000-4000-8000-000000000022'
  ),
  'Pending transfer opens both the conversation and a target session'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000100'
      and event_type = 'transferred'
      and from_user_id is null
      and to_user_id = '19000000-0000-4000-8000-000000000022'
  ),
  1::bigint,
  'Pending transfer records a null source and the destination user'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.complete_whatsapp_conversation(
    '19000000-0000-4000-8000-000000000101'
  ),
  true,
  'A pending conversation may be completed without first being claimed'
);

insert into whatsapp_lifecycle_test_results (result)
select ok(
  exists (
    select 1
    from public.whatsapp_conversations
    where id = '19000000-0000-4000-8000-000000000101'
      and status = 'resolved'
      and assigned_user_id is null
  ),
  'Pending completion preserves the absence of a responsible user'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select count(*)
    from public.whatsapp_attendance_events
    where conversation_id = '19000000-0000-4000-8000-000000000101'
      and event_type = 'completed'
      and session_id is null
  ),
  1::bigint,
  'Pending completion records an event without inventing a session'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  (
    select assigned_user_id
    from public.whatsapp_conversations
    where id = '19000000-0000-4000-8000-000000000102'
  ),
  null::uuid,
  'Pending writes are structurally normalized to have no responsible user'
);

insert into whatsapp_lifecycle_test_results (result)
select is(
  public.claim_whatsapp_conversation(
    '19200000-0000-4000-8000-000000000100'
  ),
  false,
  'Claim does not reveal or mutate another tenant conversation'
);

reset role;

select * from finish();

select row_number() over (order by ctid) as sequence, result
from whatsapp_lifecycle_test_results
order by ctid;

rollback;
