begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

create temporary table phase12_test_results (result text not null) on commit drop;
create temporary table phase12_ids (
  funnel_id uuid,
  stage_lead_id uuid,
  stage_won_id uuid,
  card_id uuid,
  second_card_id uuid
) on commit drop;
grant select, insert, update on phase12_test_results to authenticated;
grant select, insert, update on phase12_ids to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '12100000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase12-manager@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12100000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'phase12-viewer@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '12200000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase12-b@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.organizations (id, name)
values
  ('12100000-0000-0000-0000-000000000010', 'Phase 12 Tenant A'),
  ('12200000-0000-0000-0000-000000000010', 'Phase 12 Tenant B');

insert into public.app_users (
  id, organization_id, auth_user_id, name, email, status, is_super_admin
)
values
  (
    '12100000-0000-0000-0000-000000000020',
    '12100000-0000-0000-0000-000000000010',
    '12100000-0000-0000-0000-000000000001',
    'Phase 12 Manager A', 'phase12-manager@example.com', 'active', false
  ),
  (
    '12100000-0000-0000-0000-000000000021',
    '12100000-0000-0000-0000-000000000010',
    '12100000-0000-0000-0000-000000000002',
    'Phase 12 Viewer A', 'phase12-viewer@example.com', 'active', false
  ),
  (
    '12200000-0000-0000-0000-000000000020',
    '12200000-0000-0000-0000-000000000010',
    '12200000-0000-0000-0000-000000000001',
    'Phase 12 Manager B', 'phase12-b@example.com', 'active', false
  );

insert into public.profiles (id, organization_id, name)
values
  (
    '12100000-0000-0000-0000-000000000030',
    '12100000-0000-0000-0000-000000000010',
    'Phase 12 Funnel Manager'
  ),
  (
    '12100000-0000-0000-0000-000000000031',
    '12100000-0000-0000-0000-000000000010',
    'Phase 12 Funnel Viewer'
  ),
  (
    '12200000-0000-0000-0000-000000000030',
    '12200000-0000-0000-0000-000000000010',
    'Phase 12 Funnel Manager B'
  );

insert into public.user_profiles (user_id, profile_id)
values
  (
    '12100000-0000-0000-0000-000000000020',
    '12100000-0000-0000-0000-000000000030'
  ),
  (
    '12100000-0000-0000-0000-000000000021',
    '12100000-0000-0000-0000-000000000031'
  ),
  (
    '12200000-0000-0000-0000-000000000020',
    '12200000-0000-0000-0000-000000000030'
  );

insert into public.profile_permissions (profile_id, permission_id)
select '12100000-0000-0000-0000-000000000030', id
from public.permissions
where code in ('funil.ver', 'funil.gerenciar', 'funil.configurar');

insert into public.profile_permissions (profile_id, permission_id)
select '12100000-0000-0000-0000-000000000031', id
from public.permissions
where code = 'funil.ver';

insert into public.profile_permissions (profile_id, permission_id)
select '12200000-0000-0000-0000-000000000030', id
from public.permissions
where code in ('funil.ver', 'funil.gerenciar', 'funil.configurar');

insert into public.patients (id, organization_id, full_name)
values
  (
    '12100000-0000-0000-0000-000000000070',
    '12100000-0000-0000-0000-000000000010',
    'Tenant A Patient'
  ),
  (
    '12100000-0000-0000-0000-000000000071',
    '12100000-0000-0000-0000-000000000010',
    'Tenant A Second Patient'
  ),
  (
    '12200000-0000-0000-0000-000000000070',
    '12200000-0000-0000-0000-000000000010',
    'Tenant B Patient'
  );

insert into public.funnels (id, organization_id, name, created_by_user_id)
values
  (
    '12100000-0000-0000-0000-000000000080',
    '12100000-0000-0000-0000-000000000010',
    'Funil Comercial',
    '12100000-0000-0000-0000-000000000020'
  ),
  (
    '12200000-0000-0000-0000-000000000080',
    '12200000-0000-0000-0000-000000000010',
    'Funil Comercial B',
    '12200000-0000-0000-0000-000000000020'
  );

insert into public.funnel_stages (id, organization_id, funnel_id, name, position, stage_type, wip_limit)
values
  (
    '12100000-0000-0000-0000-000000000090',
    '12100000-0000-0000-0000-000000000010',
    '12100000-0000-0000-0000-000000000080',
    'Lead', 0, 'initial', null
  ),
  (
    '12100000-0000-0000-0000-000000000091',
    '12100000-0000-0000-0000-000000000010',
    '12100000-0000-0000-0000-000000000080',
    'Cliente ativo', 1, 'success', 1
  ),
  (
    '12200000-0000-0000-0000-000000000090',
    '12200000-0000-0000-0000-000000000010',
    '12200000-0000-0000-0000-000000000080',
    'Lead B', 0, 'initial', null
  );

insert into phase12_ids (funnel_id, stage_lead_id, stage_won_id)
values (
  '12100000-0000-0000-0000-000000000080',
  '12100000-0000-0000-0000-000000000090',
  '12100000-0000-0000-0000-000000000091'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '12100000-0000-0000-0000-000000000001',
  true
);

insert into phase12_test_results (result)
select lives_ok(
  $$
    insert into public.funnel_cards (organization_id, funnel_id, stage_id, patient_id, created_by_user_id)
    values (
      '12100000-0000-0000-0000-000000000010',
      '12100000-0000-0000-0000-000000000080',
      '12100000-0000-0000-0000-000000000090',
      '12100000-0000-0000-0000-000000000070',
      '12100000-0000-0000-0000-000000000020'
    )
  $$,
  'Manager can create a funnel card for an existing patient'
);

update phase12_ids
set card_id = (
  select id from public.funnel_cards
  where patient_id = '12100000-0000-0000-0000-000000000070'
);

insert into phase12_test_results (result)
select throws_ok(
  $$
    insert into public.funnel_cards (organization_id, funnel_id, stage_id, patient_id, created_by_user_id)
    values (
      '12100000-0000-0000-0000-000000000010',
      '12100000-0000-0000-0000-000000000080',
      '12100000-0000-0000-0000-000000000090',
      '12100000-0000-0000-0000-000000000070',
      '12100000-0000-0000-0000-000000000020'
    )
  $$
);

insert into phase12_test_results (result)
select lives_ok(
  format(
    $$ select public.move_funnel_card(%L::uuid, %L::uuid, 'Respondeu WhatsApp') $$,
    (select card_id from phase12_ids),
    (select stage_won_id from phase12_ids)
  ),
  'Manager can move card to the success stage'
);

insert into phase12_test_results (result)
select results_eq(
  $$ select stage_id from public.funnel_cards where patient_id = '12100000-0000-0000-0000-000000000070' $$,
  $$ values ('12100000-0000-0000-0000-000000000091'::uuid) $$,
  'Card stage_id reflects the move'
);

insert into phase12_test_results (result)
select results_eq(
  $$ select from_stage_id, to_stage_id from public.funnel_card_movements $$,
  $$ values ('12100000-0000-0000-0000-000000000090'::uuid, '12100000-0000-0000-0000-000000000091'::uuid) $$,
  'Movement history records the stage transition'
);

-- app_events is only readable with automacao.ver/config.geral (Phase 11 policy);
-- a funil.* profile correctly cannot see it, so check the side effect as the
-- privileged setup role instead of re-testing Phase 11's own RLS here.
reset role;

insert into phase12_test_results (result)
select is(
  (
    select count(*)::int from public.app_events
    where organization_id = '12100000-0000-0000-0000-000000000010'
      and event_type = 'kanban.card_moved'
  ),
  1,
  'Moving a card emits a kanban.card_moved event for automations'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '12100000-0000-0000-0000-000000000001',
  true
);

insert into public.funnel_cards (organization_id, funnel_id, stage_id, patient_id, created_by_user_id)
values (
  '12100000-0000-0000-0000-000000000010',
  '12100000-0000-0000-0000-000000000080',
  '12100000-0000-0000-0000-000000000090',
  '12100000-0000-0000-0000-000000000071',
  '12100000-0000-0000-0000-000000000020'
);

update phase12_ids
set second_card_id = (
  select id from public.funnel_cards
  where patient_id = '12100000-0000-0000-0000-000000000071'
);

insert into phase12_test_results (result)
select throws_ok(
  format(
    $$ select public.move_funnel_card(%L::uuid, %L::uuid, null) $$,
    (select second_card_id from phase12_ids),
    (select stage_won_id from phase12_ids)
  ),
  '23514',
  'Target stage reached its WIP limit.',
  'Stage WIP limit blocks moving a second card into a full stage'
);

select set_config(
  'request.jwt.claim.sub',
  '12100000-0000-0000-0000-000000000002',
  true
);

insert into phase12_test_results (result)
select results_eq(
  $$ select count(*) from public.funnel_cards $$,
  $$ values (2::bigint) $$,
  'Viewer (funil.ver only) can see both existing cards'
);

insert into phase12_test_results (result)
select throws_ok(
  format(
    $$ select public.move_funnel_card(%L::uuid, %L::uuid, null) $$,
    (select card_id from phase12_ids),
    (select stage_lead_id from phase12_ids)
  ),
  '42501',
  'Not allowed to move funnel card.',
  'Viewer without funil.gerenciar cannot move a card'
);

select set_config(
  'request.jwt.claim.sub',
  '12200000-0000-0000-0000-000000000001',
  true
);

insert into phase12_test_results (result)
select results_eq(
  $$ select count(*) from public.funnels $$,
  $$ values (1::bigint) $$,
  'Tenant B user cannot see Tenant A funnel'
);

insert into phase12_test_results (result)
select throws_ok(
  format(
    $$ select public.move_funnel_card(%L::uuid, %L::uuid, null) $$,
    (select card_id from phase12_ids),
    (select stage_lead_id from phase12_ids)
  ),
  '42501',
  'Not allowed to move funnel card.',
  'Tenant B user cannot move a card that belongs to Tenant A (found across tenants by the security-definer function, rejected by its explicit org check, same pattern as receive_account_receivable_payment in Phase 9)'
);

insert into phase12_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from phase12_test_results
order by ctid;

rollback;
