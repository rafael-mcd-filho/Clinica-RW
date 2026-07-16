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
  with eligible_receivables as (
    select receivables.*
    from public.accounts_receivable receivables
    where receivables.organization_id = p_organization_id
      and receivables.competence_date between p_from and p_to
      and receivables.status not in ('cancelled', 'written_off')
      and (receivables.appointment_id is null or exists (
        select 1 from public.appointments
        where appointments.organization_id = receivables.organization_id
          and appointments.id = receivables.appointment_id
          and appointments.status in ('attended', 'finalized')
      ))
  ), receivables as (
    select coalesce(sum(amount), 0) value from eligible_receivables
  ), direct_costs as (
    select coalesce(sum(case
      when costs.calculation_type = 'percentage'
        then receivables.amount * costs.value / 100
      else costs.value
    end), 0) value
    from eligible_receivables receivables
    join public.procedure_costs costs
      on costs.organization_id = receivables.organization_id
     and costs.procedure_id = receivables.procedure_id
     and costs.active
  ), expenses as (
    select coalesce(sum(amount), 0) value
    from public.accounts_payable
    where organization_id = p_organization_id
      and competence_date between p_from and p_to
      and status <> 'cancelled'
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
    receivables.value, expenses.value + direct_costs.value,
    received.value, paid.value,
    (select coalesce(sum(amount - paid_amount), 0) from public.accounts_receivable
      where organization_id = p_organization_id and status in ('open', 'partial')),
    (select coalesce(sum(amount), 0) from public.accounts_payable
      where organization_id = p_organization_id and status = 'open'),
    coalesce(collection_time.value, 0)
  from receivables, direct_costs, expenses, received, paid, collection_time
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
      case when categories.dre_group = 'revenue_deduction'
        then -receivables.amount else receivables.amount end amount
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
    select coalesce(categories.dre_group, 'operating_expense'), -payables.amount
    from public.accounts_payable payables
    left join public.financial_categories categories
      on categories.organization_id = payables.organization_id
     and categories.id = payables.category_id
    where payables.organization_id = p_organization_id
      and payables.competence_date between p_from and p_to
      and payables.status <> 'cancelled'
    union all
    select 'direct_cost', -case
      when costs.calculation_type = 'percentage'
        then receivables.amount * costs.value / 100
      else costs.value
    end
    from public.accounts_receivable receivables
    join public.procedure_costs costs
      on costs.organization_id = receivables.organization_id
     and costs.procedure_id = receivables.procedure_id
     and costs.active
    where receivables.organization_id = p_organization_id
      and receivables.competence_date between p_from and p_to
      and receivables.status not in ('cancelled', 'written_off')
      and exists (
        select 1 from public.appointments
        where appointments.organization_id = receivables.organization_id
          and appointments.id = receivables.appointment_id
          and appointments.status in ('attended', 'finalized')
      )
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
