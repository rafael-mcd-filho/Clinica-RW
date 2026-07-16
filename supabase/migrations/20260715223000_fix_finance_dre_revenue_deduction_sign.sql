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

revoke all on function public.get_finance_dre(uuid, date, date) from public;
grant execute on function public.get_finance_dre(uuid, date, date)
  to authenticated, service_role;
