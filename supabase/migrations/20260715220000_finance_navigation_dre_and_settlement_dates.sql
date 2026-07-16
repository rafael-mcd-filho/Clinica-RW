-- Finance information architecture, accrual dates and support-safe settlement actors.

alter table public.financial_categories
  add column if not exists dre_group text;

alter table public.financial_categories
  drop constraint if exists financial_categories_dre_group_check;
alter table public.financial_categories
  add constraint financial_categories_dre_group_check check (
    dre_group is null or dre_group in (
      'gross_revenue', 'revenue_deduction', 'direct_cost',
      'operating_expense', 'financial_result', 'income_tax'
    )
  );

alter table public.accounts_receivable
  add column if not exists competence_date date;
alter table public.accounts_receivable
  alter column patient_id drop not null;
alter table public.accounts_payable
  add column if not exists competence_date date;

update public.accounts_receivable
set competence_date = due_date
where competence_date is null;
update public.accounts_payable
set competence_date = due_date
where competence_date is null;

alter table public.accounts_receivable
  alter column competence_date set default current_date,
  alter column competence_date set not null;
alter table public.accounts_payable
  alter column competence_date set default current_date,
  alter column competence_date set not null;

update public.financial_categories
set dre_group = case
  when category_type = 'receivable' then 'gross_revenue'
  when category_type = 'payable' then 'operating_expense'
  else dre_group
end
where dre_group is null;

create index if not exists accounts_receivable_org_competence_idx
  on public.accounts_receivable(organization_id, competence_date, status);
create index if not exists accounts_payable_org_competence_idx
  on public.accounts_payable(organization_id, competence_date, status);

create or replace function public.receive_account_receivable_payment(
  p_account_receivable_id uuid,
  p_payment_method_id uuid,
  p_amount numeric,
  p_paid_at timestamptz default statement_timestamp(),
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_receivable public.accounts_receivable%rowtype;
  v_remaining numeric(12,2);
  v_payment_id uuid;
  v_actor_id uuid;
begin
  v_actor_id := app_private.current_app_user_id();
  select * into v_receivable from public.accounts_receivable
    where id = p_account_receivable_id for update;
  if v_receivable.id is null then
    raise exception 'Account receivable not found.' using errcode = 'P0002';
  end if;
  if not (app_private.current_is_super_admin() or (
    v_receivable.organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.receber_pagamento')
  )) then
    raise exception 'Not allowed to receive payment.' using errcode = '42501';
  end if;
  if v_receivable.status in ('paid', 'cancelled', 'written_off') then
    raise exception 'Account receivable is not open for payment.' using errcode = '23514';
  end if;
  if p_amount <= 0 then
    raise exception 'Payment amount must be positive.' using errcode = '23514';
  end if;
  v_remaining := v_receivable.amount - v_receivable.paid_amount;
  if p_amount > v_remaining then
    raise exception 'Payment amount exceeds remaining balance.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.payment_methods
    where organization_id = v_receivable.organization_id
      and id = p_payment_method_id and active) then
    raise exception 'Payment method not found.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.app_users
    where organization_id = v_receivable.organization_id and id = v_actor_id) then
    v_actor_id := null;
  end if;
  insert into public.payments (
    organization_id, account_receivable_id, payment_method_id,
    amount, paid_at, received_by_user_id, notes
  ) values (
    v_receivable.organization_id, v_receivable.id, p_payment_method_id,
    p_amount, coalesce(p_paid_at, statement_timestamp()), v_actor_id,
    nullif(trim(p_notes), '')
  ) returning id into v_payment_id;
  return v_payment_id;
end;
$$;

create or replace function public.mark_account_payable_paid(
  p_account_payable_id uuid,
  p_payment_method_id uuid,
  p_paid_at timestamptz default statement_timestamp()
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_payable public.accounts_payable%rowtype;
  v_actor_id uuid;
begin
  v_actor_id := app_private.current_app_user_id();
  select * into v_payable from public.accounts_payable
    where id = p_account_payable_id for update;
  if v_payable.id is null then
    raise exception 'Account payable not found.' using errcode = 'P0002';
  end if;
  if not (app_private.current_is_super_admin() or (
    v_payable.organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
  )) then
    raise exception 'Not allowed to pay account payable.' using errcode = '42501';
  end if;
  if v_payable.status <> 'open' then return v_payable.status; end if;
  if not exists (select 1 from public.payment_methods
    where organization_id = v_payable.organization_id
      and id = p_payment_method_id and active) then
    raise exception 'Payment method not found.' using errcode = '23503';
  end if;
  if not exists (select 1 from public.app_users
    where organization_id = v_payable.organization_id and id = v_actor_id) then
    v_actor_id := null;
  end if;
  update public.accounts_payable set
    status = 'paid', payment_method_id = p_payment_method_id,
    paid_at = coalesce(p_paid_at, statement_timestamp()),
    paid_by_user_id = v_actor_id
  where id = v_payable.id;
  return 'paid';
end;
$$;

create or replace function public.mark_professional_payout_paid(
  p_payout_id uuid,
  p_paid_at timestamptz default statement_timestamp()
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_payout public.professional_payouts%rowtype;
  v_actor_id uuid;
begin
  v_actor_id := app_private.current_app_user_id();
  select * into v_payout from public.professional_payouts
    where id = p_payout_id for update;
  if v_payout.id is null then
    raise exception 'Professional payout not found.' using errcode = 'P0002';
  end if;
  if not (app_private.current_is_super_admin() or (
    v_payout.organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
  )) then
    raise exception 'Not allowed to pay professional payout.' using errcode = '42501';
  end if;
  if v_payout.status <> 'pending' then return v_payout.status; end if;
  if not exists (select 1 from public.app_users
    where organization_id = v_payout.organization_id and id = v_actor_id) then
    v_actor_id := null;
  end if;
  update public.professional_payouts set
    status = 'paid', paid_at = coalesce(p_paid_at, statement_timestamp()),
    paid_by_user_id = v_actor_id
  where id = v_payout.id;
  return 'paid';
end;
$$;

revoke all on function public.receive_account_receivable_payment(uuid, uuid, numeric, timestamptz, text) from public;
revoke all on function public.mark_account_payable_paid(uuid, uuid, timestamptz) from public;
revoke all on function public.mark_professional_payout_paid(uuid, timestamptz) from public;
grant execute on function public.receive_account_receivable_payment(uuid, uuid, numeric, timestamptz, text) to authenticated, service_role;
grant execute on function public.mark_account_payable_paid(uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.mark_professional_payout_paid(uuid, timestamptz) to authenticated, service_role;

comment on column public.accounts_receivable.competence_date is
  'Date on which revenue is recognized in the managerial income statement.';
comment on column public.accounts_payable.competence_date is
  'Date on which expense is recognized in the managerial income statement.';

create or replace function public.get_finance_period_metrics(
  p_organization_id uuid,
  p_from date,
  p_to date
)
returns table (
  accrual_revenue numeric,
  accrual_expense numeric,
  cash_in numeric,
  cash_out numeric,
  open_receivable numeric,
  open_payable numeric,
  average_collection_days numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  with receivables as (
    select coalesce(sum(amount), 0) value
    from public.accounts_receivable
    where organization_id = p_organization_id
      and competence_date between p_from and p_to
      and status not in ('cancelled', 'written_off')
      and (appointment_id is null or exists (
        select 1 from public.appointments
        where appointments.organization_id = accounts_receivable.organization_id
          and appointments.id = accounts_receivable.appointment_id
          and appointments.status in ('attended', 'finalized')
      ))
  ), expenses as (
    select coalesce(sum(value), 0) value from (
      select amount value from public.accounts_payable
      where organization_id = p_organization_id
        and competence_date between p_from and p_to and status <> 'cancelled'
      union all
      select amount from public.professional_payouts
      where organization_id = p_organization_id
        and due_date between p_from and p_to and status <> 'cancelled'
    ) expense_rows
  ), received as (
    select coalesce(sum(amount), 0) value
    from public.payments
    where organization_id = p_organization_id
      and (paid_at at time zone 'America/Fortaleza')::date between p_from and p_to
  ), paid as (
    select coalesce(sum(value), 0) value from (
      select amount value from public.accounts_payable
      where organization_id = p_organization_id and status = 'paid'
        and (paid_at at time zone 'America/Fortaleza')::date between p_from and p_to
      union all
      select amount from public.professional_payouts
      where organization_id = p_organization_id and status = 'paid'
        and (paid_at at time zone 'America/Fortaleza')::date between p_from and p_to
    ) paid_rows
  ), collection_time as (
    select avg(greatest(0, extract(epoch from (
      payments.paid_at - receivables.competence_date::timestamp
    )) / 86400.0)) value
    from public.payments
    join public.accounts_receivable receivables
      on receivables.organization_id = payments.organization_id
     and receivables.id = payments.account_receivable_id
    where payments.organization_id = p_organization_id
      and (payments.paid_at at time zone 'America/Fortaleza')::date between p_from and p_to
  )
  select
    receivables.value, expenses.value, received.value, paid.value,
    (select coalesce(sum(amount - paid_amount), 0) from public.accounts_receivable
      where organization_id = p_organization_id and status in ('open', 'partial')),
    (select coalesce(sum(amount), 0) from public.accounts_payable
      where organization_id = p_organization_id and status = 'open'),
    coalesce(collection_time.value, 0)
  from receivables, expenses, received, paid, collection_time
  where app_private.current_is_super_admin()
     or (p_organization_id = app_private.current_organization_id()
       and (app_private.current_user_has_permission('financeiro.ver_geral')
         or app_private.current_user_has_permission('financeiro.receber_pagamento')
         or app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')));
$$;

create or replace function public.get_finance_dre(
  p_organization_id uuid,
  p_from date,
  p_to date
)
returns table (dre_group text, amount numeric)
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select grouped.dre_group, sum(grouped.amount)::numeric
  from (
    select coalesce(categories.dre_group, 'gross_revenue') dre_group,
      receivables.amount
    from public.accounts_receivable receivables
    left join public.financial_categories categories
      on categories.organization_id = receivables.organization_id
     and categories.id = receivables.category_id
    where receivables.organization_id = p_organization_id
      and receivables.competence_date between p_from and p_to
      and receivables.status not in ('cancelled', 'written_off')
      and (receivables.appointment_id is null or exists (
        select 1 from public.appointments
        where appointments.organization_id = receivables.organization_id
          and appointments.id = receivables.appointment_id
          and appointments.status in ('attended', 'finalized')
      ))
    union all
    select coalesce(categories.dre_group, 'operating_expense'),
      -payables.amount
    from public.accounts_payable payables
    left join public.financial_categories categories
      on categories.organization_id = payables.organization_id
     and categories.id = payables.category_id
    where payables.organization_id = p_organization_id
      and payables.competence_date between p_from and p_to
      and payables.status <> 'cancelled'
    union all
    select 'direct_cost', -payouts.amount
    from public.professional_payouts payouts
    where payouts.organization_id = p_organization_id
      and payouts.due_date between p_from and p_to
      and payouts.status <> 'cancelled'
  ) grouped
  where app_private.current_is_super_admin()
     or (p_organization_id = app_private.current_organization_id()
       and app_private.current_user_has_permission('financeiro.ver_geral'))
  group by grouped.dre_group;
$$;

revoke all on function public.get_finance_period_metrics(uuid, date, date) from public;
revoke all on function public.get_finance_dre(uuid, date, date) from public;
grant execute on function public.get_finance_period_metrics(uuid, date, date) to authenticated, service_role;
grant execute on function public.get_finance_dre(uuid, date, date) to authenticated, service_role;
