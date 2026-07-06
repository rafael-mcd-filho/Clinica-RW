begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

create temporary table phase9_test_results (result text not null) on commit drop;
create temporary table phase9_ids (
  receivable_id uuid,
  payment_method_id uuid
) on commit drop;
grant select, insert on phase9_test_results to authenticated;
grant select, insert on phase9_ids to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '91000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase9-finance@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '91000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'phase9-professional@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '92000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase9-b@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.organizations (id, name)
values
  ('91000000-0000-0000-0000-000000000010', 'Phase 9 Tenant A'),
  ('92000000-0000-0000-0000-000000000010', 'Phase 9 Tenant B');

insert into public.app_users (
  id, organization_id, auth_user_id, name, email, status, is_super_admin
)
values
  (
    '91000000-0000-0000-0000-000000000020',
    '91000000-0000-0000-0000-000000000010',
    '91000000-0000-0000-0000-000000000001',
    'Phase 9 Finance A', 'phase9-finance@example.com', 'active', false
  ),
  (
    '91000000-0000-0000-0000-000000000021',
    '91000000-0000-0000-0000-000000000010',
    '91000000-0000-0000-0000-000000000002',
    'Phase 9 Professional A', 'phase9-professional@example.com', 'active', false
  ),
  (
    '92000000-0000-0000-0000-000000000020',
    '92000000-0000-0000-0000-000000000010',
    '92000000-0000-0000-0000-000000000001',
    'Phase 9 Finance B', 'phase9-b@example.com', 'active', false
  );

insert into public.profiles (id, organization_id, name)
values
  (
    '91000000-0000-0000-0000-000000000030',
    '91000000-0000-0000-0000-000000000010',
    'Phase 9 Finance Manager'
  ),
  (
    '91000000-0000-0000-0000-000000000031',
    '91000000-0000-0000-0000-000000000010',
    'Phase 9 Professional Payout'
  );

insert into public.user_profiles (user_id, profile_id)
values
  (
    '91000000-0000-0000-0000-000000000020',
    '91000000-0000-0000-0000-000000000030'
  ),
  (
    '91000000-0000-0000-0000-000000000021',
    '91000000-0000-0000-0000-000000000031'
  );

insert into public.profile_permissions (profile_id, permission_id)
select '91000000-0000-0000-0000-000000000030', id
from public.permissions
where code in (
  'financeiro.ver_geral',
  'financeiro.receber_pagamento',
  'financeiro.gerenciar_contas_pagar',
  'agenda.criar_agendamento',
  'agenda.configurar',
  'agenda.ver'
);

insert into public.profile_permissions (profile_id, permission_id)
select '91000000-0000-0000-0000-000000000031', id
from public.permissions
where code = 'financeiro.ver_proprio_repasse';

insert into public.units (id, organization_id, name)
values
  (
    '91000000-0000-0000-0000-000000000040',
    '91000000-0000-0000-0000-000000000010',
    'Tenant A Unit'
  ),
  (
    '92000000-0000-0000-0000-000000000040',
    '92000000-0000-0000-0000-000000000010',
    'Tenant B Unit'
  );

insert into public.professionals (id, organization_id, user_id, name)
values
  (
    '91000000-0000-0000-0000-000000000050',
    '91000000-0000-0000-0000-000000000010',
    '91000000-0000-0000-0000-000000000021',
    'Tenant A Professional'
  ),
  (
    '92000000-0000-0000-0000-000000000050',
    '92000000-0000-0000-0000-000000000010',
    '92000000-0000-0000-0000-000000000020',
    'Tenant B Professional'
  );

insert into public.procedures (id, organization_id, name, duration_minutes, base_price)
values
  (
    '91000000-0000-0000-0000-000000000060',
    '91000000-0000-0000-0000-000000000010',
    'Tenant A Consultation', 30, 200
  ),
  (
    '92000000-0000-0000-0000-000000000060',
    '92000000-0000-0000-0000-000000000010',
    'Tenant B Consultation', 30, 150
  );

insert into public.patients (id, organization_id, full_name)
values
  (
    '91000000-0000-0000-0000-000000000070',
    '91000000-0000-0000-0000-000000000010',
    'Tenant A Patient'
  ),
  (
    '92000000-0000-0000-0000-000000000070',
    '92000000-0000-0000-0000-000000000010',
    'Tenant B Patient'
  );

insert into public.schedules (
  id, organization_id, professional_id, unit_id, name
)
values
  (
    '91000000-0000-0000-0000-000000000080',
    '91000000-0000-0000-0000-000000000010',
    '91000000-0000-0000-0000-000000000050',
    '91000000-0000-0000-0000-000000000040',
    'Tenant A Schedule'
  ),
  (
    '92000000-0000-0000-0000-000000000080',
    '92000000-0000-0000-0000-000000000010',
    '92000000-0000-0000-0000-000000000050',
    '92000000-0000-0000-0000-000000000040',
    'Tenant B Schedule'
  );

insert into public.appointments (
  id, organization_id, patient_id, professional_id, procedure_id,
  schedule_id, unit_id, start_at, end_at, created_by_user_id
)
values
  (
    '91000000-0000-0000-0000-000000000090',
    '91000000-0000-0000-0000-000000000010',
    '91000000-0000-0000-0000-000000000070',
    '91000000-0000-0000-0000-000000000050',
    '91000000-0000-0000-0000-000000000060',
    '91000000-0000-0000-0000-000000000080',
    '91000000-0000-0000-0000-000000000040',
    '2026-06-22 09:00:00-03',
    '2026-06-22 09:30:00-03',
    '91000000-0000-0000-0000-000000000020'
  ),
  (
    '92000000-0000-0000-0000-000000000090',
    '92000000-0000-0000-0000-000000000010',
    '92000000-0000-0000-0000-000000000070',
    '92000000-0000-0000-0000-000000000050',
    '92000000-0000-0000-0000-000000000060',
    '92000000-0000-0000-0000-000000000080',
    '92000000-0000-0000-0000-000000000040',
    '2026-06-22 09:00:00-03',
    '2026-06-22 09:30:00-03',
    '92000000-0000-0000-0000-000000000020'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-0000-0000-000000000001',
  true
);

insert into phase9_test_results (result)
select results_eq(
  $$ select amount, paid_amount, status from public.accounts_receivable $$,
  $$ values (200.00::numeric, 0.00::numeric, 'open'::text) $$,
  'Appointment automatically generates an open receivable'
);

insert into phase9_test_results (result)
select is(
  (select count(*) from public.payment_methods),
  5::bigint,
  'Default payment methods are available'
);

insert into phase9_test_results (result)
select lives_ok(
  $$
    select public.receive_account_receivable_payment(
      (select id from public.accounts_receivable limit 1),
      (select id from public.payment_methods where name = 'Pix' limit 1),
      200,
      '2026-06-22 10:00:00-03',
      'Paid in test'
    )
  $$,
  'Finance user can receive a payment'
);

insert into phase9_test_results (result)
select results_eq(
  $$ select paid_amount, status from public.accounts_receivable $$,
  $$ values (200.00::numeric, 'paid'::text) $$,
  'Receiving full amount marks receivable as paid'
);

insert into phase9_test_results (result)
select results_eq(
  $$ select amount, status from public.professional_payouts $$,
  $$ values (120.00::numeric, 'pending'::text) $$,
  'Payment creates a simple professional payout'
);

insert into public.accounts_payable (
  organization_id, category_id, vendor_name, description, amount, due_date,
  created_by_user_id
)
values (
  '91000000-0000-0000-0000-000000000010',
  (select id from public.financial_categories
   where organization_id = '91000000-0000-0000-0000-000000000010'
     and name = 'Despesas operacionais'
   limit 1),
  'Fornecedor Teste',
  'Aluguel',
  500,
  '2026-06-30',
  '91000000-0000-0000-0000-000000000020'
);

insert into phase9_test_results (result)
select lives_ok(
  $$
    select public.mark_account_payable_paid(
      (select id from public.accounts_payable limit 1),
      (select id from public.payment_methods where name = 'Pix' limit 1),
      '2026-06-22 11:00:00-03'
    )
  $$,
  'Finance manager can mark account payable as paid'
);

insert into phase9_test_results (result)
select results_eq(
  $$ select count(*) from public.accounts_receivable $$,
  $$ values (1::bigint) $$,
  'Finance user cannot see another tenant receivable'
);

insert into phase9_ids (receivable_id, payment_method_id)
select
  (select id from public.accounts_receivable limit 1),
  (select id from public.payment_methods where name = 'Pix' limit 1);

select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-0000-0000-000000000002',
  true
);

insert into phase9_test_results (result)
select results_eq(
  $$ select count(*) from public.professional_payouts $$,
  $$ values (1::bigint) $$,
  'Professional can see own payout'
);

insert into phase9_test_results (result)
select results_eq(
  $$ select count(*) from public.accounts_receivable $$,
  $$ values (0::bigint) $$,
  'Professional payout-only user cannot see receivables'
);

insert into phase9_test_results (result)
select throws_ok(
  $$
    select public.receive_account_receivable_payment(
      (select receivable_id from phase9_ids limit 1),
      (select payment_method_id from phase9_ids limit 1),
      1,
      now(),
      null
    )
  $$,
  '42501',
  'Not allowed to receive payment.',
  'User without cashier permission cannot receive payments'
);

insert into phase9_test_results (result)
select * from finish();

select row_number() over (order by ctid) as sequence, result
from phase9_test_results
order by ctid;

rollback;
