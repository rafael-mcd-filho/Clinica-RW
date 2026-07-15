-- Exact operational finance indicators and indexes for paged finance lists.

create index if not exists accounts_receivable_organization_due_date_idx
  on public.accounts_receivable (organization_id, due_date, id);

create index if not exists payments_organization_paid_at_idx
  on public.payments (organization_id, paid_at desc, id);

create index if not exists accounts_payable_organization_due_date_idx
  on public.accounts_payable (organization_id, due_date, id);

create index if not exists professional_payouts_organization_due_date_idx
  on public.professional_payouts (organization_id, due_date desc, id);

create or replace function public.get_operational_finance_summary(
  p_organization_id uuid
)
returns table (
  open_receivable numeric,
  received_month numeric,
  open_payable numeric,
  pending_payout numeric,
  receivable_count bigint,
  payment_count bigint,
  payable_count bigint,
  payout_count bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public, app_private
as $$
  with settings as (
    select coalesce(
      nullif((
        select organization_settings.timezone
        from public.organization_settings
        where organization_settings.organization_id = p_organization_id
        limit 1
      ), ''),
      'America/Fortaleza'
    ) as timezone
  ),
  month_window as (
    select (
      date_trunc(
        'month',
        statement_timestamp() at time zone settings.timezone
      ) at time zone settings.timezone
    ) as start_at
    from settings
  ),
  receivable_metrics as (
    select
      count(*)::bigint as total_count,
      coalesce(
        sum(greatest(amount - paid_amount, 0))
          filter (where status in ('open', 'partial')),
        0
      )::numeric as open_total
    from public.accounts_receivable
    where organization_id = p_organization_id
  ),
  payment_metrics as (
    select
      count(*)::bigint as total_count,
      coalesce(
        sum(amount) filter (
          where paid_at >= (select start_at from month_window)
        ),
        0
      )::numeric as month_total
    from public.payments
    where organization_id = p_organization_id
  ),
  payable_metrics as (
    select
      count(*)::bigint as total_count,
      coalesce(sum(amount) filter (where status = 'open'), 0)::numeric
        as open_total
    from public.accounts_payable
    where organization_id = p_organization_id
  ),
  payout_metrics as (
    select
      count(*)::bigint as total_count,
      coalesce(sum(amount) filter (where status = 'pending'), 0)::numeric
        as pending_total
    from public.professional_payouts
    where organization_id = p_organization_id
  )
  select
    receivable_metrics.open_total,
    payment_metrics.month_total,
    payable_metrics.open_total,
    payout_metrics.pending_total,
    receivable_metrics.total_count,
    payment_metrics.total_count,
    payable_metrics.total_count,
    payout_metrics.total_count
  from receivable_metrics
  cross join payment_metrics
  cross join payable_metrics
  cross join payout_metrics;
$$;

revoke all on function public.get_operational_finance_summary(uuid)
  from public;
grant execute on function public.get_operational_finance_summary(uuid)
  to authenticated, service_role;

comment on function public.get_operational_finance_summary(uuid) is
  'Returns exact finance totals and RLS-scoped list counts for one organization.';
