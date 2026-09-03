-- Relatorio de comissao por profissional.
--
-- Ate aqui a comissao vivia em dois lugares que nunca se falavam:
--
--   * `procedure_costs` com cost_type = 'commission' -- a regra por
--     procedimento, que existia na tela de configuracoes e nao entrava em
--     conta nenhuma;
--   * `professional_payouts` -- o repasse de verdade, gerado no pagamento a
--     partir de um percentual unico da organizacao.
--
-- Este relatorio mostra os dois lado a lado: o quanto a regra do procedimento
-- diz que aquele profissional gerou de comissao no periodo, e o quanto de
-- repasse foi de fato lancado, separando pago de pendente. A diferenca entre
-- as duas colunas e o que revela regra desatualizada ou repasse esquecido.

create or replace function public.commission_report(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  professional_id uuid,
  professional_name text,
  appointment_count integer,
  revenue numeric,
  commission_due numeric,
  payout_total numeric,
  payout_paid numeric,
  payout_pending numeric,
  commission_percent numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_organization_id uuid;
begin
  v_organization_id := app_private.current_organization_id();

  if v_organization_id is null
    or not app_private.current_user_has_permission('financeiro.ver_geral') then
    raise exception 'Not allowed to read the commission report.' using errcode = '42501';
  end if;

  return query
  with attended as (
    select
      appointment.id,
      appointment.professional_id as pro_id,
      coalesce(appointment.price, 0) as price,
      public.procedure_cost_total(
        v_organization_id,
        appointment.procedure_id,
        coalesce(appointment.price, 0),
        'commission'
      ) as commission
    from public.appointments appointment
    where appointment.organization_id = v_organization_id
      and appointment.start_at >= p_from
      and appointment.start_at < p_to
      and appointment.status not in ('cancelled', 'no_show')
  ),
  by_professional as (
    select
      attended.pro_id,
      count(*)::integer as appointment_count,
      sum(attended.price) as revenue,
      sum(attended.commission) as commission_due
    from attended
    group by attended.pro_id
  ),
  payouts as (
    select
      payout.professional_id as pro_id,
      sum(payout.amount) as payout_total,
      sum(payout.amount) filter (where payout.status = 'paid') as payout_paid,
      sum(payout.amount) filter (where payout.status <> 'paid') as payout_pending
    from public.professional_payouts payout
    where payout.organization_id = v_organization_id
      and payout.due_date >= (p_from at time zone 'UTC')::date
      and payout.due_date <= (p_to at time zone 'UTC')::date
    group by payout.professional_id
  )
  select
    professional.id,
    professional.name,
    coalesce(by_professional.appointment_count, 0),
    round(coalesce(by_professional.revenue, 0), 2),
    round(coalesce(by_professional.commission_due, 0), 2),
    round(coalesce(payouts.payout_total, 0), 2),
    round(coalesce(payouts.payout_paid, 0), 2),
    round(coalesce(payouts.payout_pending, 0), 2),
    case
      when coalesce(by_professional.revenue, 0) > 0
        then round(
          coalesce(by_professional.commission_due, 0) * 100
            / by_professional.revenue,
          1
        )
      else 0
    end
  from public.professionals professional
  left join by_professional on by_professional.pro_id = professional.id
  left join payouts on payouts.pro_id = professional.id
  where professional.organization_id = v_organization_id
    and (
      coalesce(by_professional.appointment_count, 0) > 0
      or coalesce(payouts.payout_total, 0) > 0
    )
  order by round(coalesce(by_professional.commission_due, 0), 2) desc;
end;
$$;

comment on function public.commission_report(timestamptz, timestamptz) is
  'Comissao gerada pelas regras do procedimento x repasse lancado, por profissional no periodo.';

-- Evolucao mensal, para o grafico do relatorio.
create or replace function public.commission_monthly_series(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  month_start date,
  revenue numeric,
  commission_due numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_organization_id uuid;
  v_timezone text;
begin
  v_organization_id := app_private.current_organization_id();

  if v_organization_id is null
    or not app_private.current_user_has_permission('financeiro.ver_geral') then
    raise exception 'Not allowed to read the commission report.' using errcode = '42501';
  end if;

  select coalesce(settings.timezone, 'America/Fortaleza')
    into v_timezone
  from public.organization_settings as settings
  where settings.organization_id = v_organization_id;
  v_timezone := coalesce(v_timezone, 'America/Fortaleza');

  return query
  select
    date_trunc(
      'month',
      appointment.start_at at time zone v_timezone
    )::date as month_start,
    round(sum(coalesce(appointment.price, 0)), 2) as revenue,
    round(sum(public.procedure_cost_total(
      v_organization_id,
      appointment.procedure_id,
      coalesce(appointment.price, 0),
      'commission'
    )), 2) as commission_due
  from public.appointments appointment
  where appointment.organization_id = v_organization_id
    and appointment.start_at >= p_from
    and appointment.start_at < p_to
    and appointment.status not in ('cancelled', 'no_show')
  group by 1
  order by 1;
end;
$$;

revoke all on function public.commission_report(timestamptz, timestamptz) from public;
revoke all on function public.commission_monthly_series(timestamptz, timestamptz) from public;

grant execute on function public.commission_report(timestamptz, timestamptz)
  to authenticated, service_role;
grant execute on function public.commission_monthly_series(timestamptz, timestamptz)
  to authenticated, service_role;
