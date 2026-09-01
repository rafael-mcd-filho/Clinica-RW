-- Agrega a visao geral do financeiro em uma unica chamada: serie diaria de
-- caixa (realizado e previsto), posicao de a receber / a pagar, quebra por
-- categoria e recebimentos por forma de pagamento. Tudo no banco para nao
-- trazer lancamento a lancamento (o PostgREST corta em max_rows = 1000).

create or replace function public.get_finance_overview(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_timezone text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_today date;
  v_result jsonb;
begin
  if p_from > p_to then
    raise exception 'Invalid finance range' using errcode = '22023';
  end if;

  if p_to - p_from > 731 then
    raise exception 'Finance range too wide' using errcode = '22023';
  end if;

  if not exists (
    select 1 from pg_timezone_names where name = p_timezone
  ) then
    raise exception 'Invalid finance timezone' using errcode = '22023';
  end if;

  if not app_private.current_is_super_admin() and (
    p_organization_id is distinct from app_private.current_organization_id()
    or not (
      app_private.current_user_has_permission('financeiro.ver_geral')
      or app_private.current_user_has_permission('financeiro.receber_pagamento')
      or app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
    )
  ) then
    raise exception 'Insufficient finance permission' using errcode = '42501';
  end if;

  v_today := (now() at time zone p_timezone)::date;

  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as bucket
  ),
  cash_in as (
    select (p.paid_at at time zone p_timezone)::date as bucket, sum(p.amount) as total
    from public.payments p
    where p.organization_id = p_organization_id
      and (p.paid_at at time zone p_timezone)::date between p_from and p_to
    group by 1
  ),
  cash_out as (
    select (ap.paid_at at time zone p_timezone)::date as bucket, sum(ap.amount) as total
    from public.accounts_payable ap
    where ap.organization_id = p_organization_id
      and ap.status = 'paid'
      and ap.paid_at is not null
      and (ap.paid_at at time zone p_timezone)::date between p_from and p_to
    group by 1
  ),
  expected_in as (
    select ar.due_date as bucket, sum(ar.amount - ar.paid_amount) as total
    from public.accounts_receivable ar
    where ar.organization_id = p_organization_id
      and ar.status in ('open', 'partial')
      and ar.due_date between p_from and p_to
    group by 1
  ),
  expected_out as (
    select ap.due_date as bucket, sum(ap.amount) as total
    from public.accounts_payable ap
    where ap.organization_id = p_organization_id
      and ap.status = 'open'
      and ap.due_date between p_from and p_to
    group by 1
  ),
  series as (
    select
      d.bucket,
      coalesce(ci.total, 0) as cash_in,
      coalesce(co.total, 0) as cash_out,
      coalesce(ei.total, 0) as expected_in,
      coalesce(eo.total, 0) as expected_out
    from days d
    left join cash_in ci on ci.bucket = d.bucket
    left join cash_out co on co.bucket = d.bucket
    left join expected_in ei on ei.bucket = d.bucket
    left join expected_out eo on eo.bucket = d.bucket
  ),
  receivable_open as (
    select
      coalesce(sum(ar.amount - ar.paid_amount)
        filter (where ar.due_date < v_today), 0) as overdue,
      coalesce(sum(ar.amount - ar.paid_amount)
        filter (where ar.due_date = v_today), 0) as due_today,
      coalesce(sum(ar.amount - ar.paid_amount)
        filter (where date_trunc('month', ar.due_date)
          = date_trunc('month', v_today)), 0) as due_month,
      coalesce(sum(ar.amount - ar.paid_amount)
        filter (where date_trunc('year', ar.due_date)
          = date_trunc('year', v_today)), 0) as due_year
    from public.accounts_receivable ar
    where ar.organization_id = p_organization_id
      and ar.status in ('open', 'partial')
  ),
  receivable_settled as (
    select
      coalesce(sum(p.amount) filter (
        where date_trunc('month', (p.paid_at at time zone p_timezone)::date)
          = date_trunc('month', v_today)), 0) as settled_month,
      coalesce(sum(p.amount), 0) as settled_year
    from public.payments p
    where p.organization_id = p_organization_id
      and (p.paid_at at time zone p_timezone)::date
        >= date_trunc('year', v_today)::date
      and (p.paid_at at time zone p_timezone)::date <= v_today
  ),
  payable_open as (
    select
      coalesce(sum(ap.amount) filter (where ap.due_date < v_today), 0) as overdue,
      coalesce(sum(ap.amount) filter (where ap.due_date = v_today), 0) as due_today,
      coalesce(sum(ap.amount) filter (where date_trunc('month', ap.due_date)
        = date_trunc('month', v_today)), 0) as due_month,
      coalesce(sum(ap.amount) filter (where date_trunc('year', ap.due_date)
        = date_trunc('year', v_today)), 0) as due_year
    from public.accounts_payable ap
    where ap.organization_id = p_organization_id
      and ap.status = 'open'
  ),
  payable_settled as (
    select
      coalesce(sum(ap.amount) filter (
        where date_trunc('month', (ap.paid_at at time zone p_timezone)::date)
          = date_trunc('month', v_today)), 0) as settled_month,
      coalesce(sum(ap.amount), 0) as settled_year
    from public.accounts_payable ap
    where ap.organization_id = p_organization_id
      and ap.status = 'paid'
      and ap.paid_at is not null
      and (ap.paid_at at time zone p_timezone)::date
        >= date_trunc('year', v_today)::date
      and (ap.paid_at at time zone p_timezone)::date <= v_today
  ),
  revenue_categories as (
    select
      coalesce(fc.name, 'Sem categoria') as name,
      sum(ar.amount) as total
    from public.accounts_receivable ar
    left join public.financial_categories fc
      on fc.organization_id = ar.organization_id and fc.id = ar.category_id
    where ar.organization_id = p_organization_id
      and ar.status <> 'cancelled'
      and ar.due_date between p_from and p_to
    group by 1
    having sum(ar.amount) > 0
  ),
  expense_categories as (
    select
      coalesce(fc.name, 'Sem categoria') as name,
      sum(ap.amount) as total
    from public.accounts_payable ap
    left join public.financial_categories fc
      on fc.organization_id = ap.organization_id and fc.id = ap.category_id
    where ap.organization_id = p_organization_id
      and ap.status <> 'cancelled'
      and ap.due_date between p_from and p_to
    group by 1
    having sum(ap.amount) > 0
  ),
  methods as (
    select
      pm.name,
      pm.method_type,
      sum(p.amount) as total
    from public.payments p
    join public.payment_methods pm
      on pm.organization_id = p.organization_id and pm.id = p.payment_method_id
    where p.organization_id = p_organization_id
      and (p.paid_at at time zone p_timezone)::date between p_from and p_to
    group by 1, 2
    having sum(p.amount) > 0
  )
  select jsonb_build_object(
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'bucket', to_char(s.bucket, 'YYYY-MM-DD'),
        'cashIn', s.cash_in,
        'cashOut', s.cash_out,
        'expectedIn', s.expected_in,
        'expectedOut', s.expected_out
      ) order by s.bucket), '[]'::jsonb)
      from series s
    ),
    'receivable', (
      select jsonb_build_object(
        'overdue', ro.overdue,
        'dueToday', ro.due_today,
        'dueMonth', ro.due_month,
        'dueYear', ro.due_year,
        'settledMonth', rs.settled_month,
        'settledYear', rs.settled_year
      )
      from receivable_open ro cross join receivable_settled rs
    ),
    'payable', (
      select jsonb_build_object(
        'overdue', po.overdue,
        'dueToday', po.due_today,
        'dueMonth', po.due_month,
        'dueYear', po.due_year,
        'settledMonth', ps.settled_month,
        'settledYear', ps.settled_year
      )
      from payable_open po cross join payable_settled ps
    ),
    'revenueCategories', (
      select coalesce(jsonb_agg(jsonb_build_object('name', rc.name, 'amount', rc.total)
        order by rc.total desc), '[]'::jsonb)
      from revenue_categories rc
    ),
    'expenseCategories', (
      select coalesce(jsonb_agg(jsonb_build_object('name', ec.name, 'amount', ec.total)
        order by ec.total desc), '[]'::jsonb)
      from expense_categories ec
    ),
    'paymentMethods', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', m.name,
        'methodType', m.method_type,
        'amount', m.total
      ) order by m.total desc), '[]'::jsonb)
      from methods m
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_finance_overview(
  uuid, date, date, text
) from public;

grant execute on function public.get_finance_overview(
  uuid, date, date, text
) to authenticated, service_role;
