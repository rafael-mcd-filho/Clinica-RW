-- Relatorio de comissao no fuso da clinica.
--
-- O app passou a mandar o periodo no fuso da clinica: p_from e o primeiro
-- instante do primeiro dia e p_to e o fim exclusivo (meia-noite do dia
-- seguinte). Os atendimentos ja eram filtrados assim (start_at < p_to), mas os
-- repasses convertiam as pontas para data em UTC -- em Fortaleza, o fim
-- exclusivo virava o dia seguinte e puxava repasses de fora do periodo. As
-- datas de vencimento agora saem no fuso da clinica, como ja fazia
-- commission_monthly_series.

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
  v_timezone text;
  v_from_date date;
  v_to_date date;
begin
  v_organization_id := app_private.current_organization_id();

  if v_organization_id is null
    or not app_private.current_user_has_permission('financeiro.ver_geral') then
    raise exception 'Not allowed to read the commission report.' using errcode = '42501';
  end if;

  select settings.timezone
    into v_timezone
  from public.organization_settings as settings
  where settings.organization_id = v_organization_id;

  if v_timezone is null
    or not exists (select 1 from pg_timezone_names where name = v_timezone) then
    v_timezone := 'America/Fortaleza';
  end if;

  -- p_to e exclusivo: o ultimo dia do periodo e o do instante anterior a ele.
  v_from_date := (p_from at time zone v_timezone)::date;
  v_to_date := ((p_to - interval '1 millisecond') at time zone v_timezone)::date;

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
      and payout.due_date >= v_from_date
      and payout.due_date <= v_to_date
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
  'Comissao gerada pelas regras do procedimento x repasse lancado, por profissional no periodo (p_to exclusivo, datas no fuso da clinica).';
