-- Valor no agendamento, e os custos finalmente saindo do papel.
--
-- O que existia: procedures.base_price, price_tables por convenio,
-- procedure_costs (7 categorias, fixo ou percentual) e payment_method_fees.
-- Tudo configuravel na tela de configuracoes.
--
-- O que faltava: o agendamento nao carregava valor nenhum. A receita nascia de
-- um gatilho que lia procedures.base_price na hora, o que trazia tres
-- problemas:
--
--   1. Tabela de preco por convenio era ignorada -- paciente de convenio
--      gerava recebivel pelo preco particular.
--   2. Sem lugar para ajustar valor: desconto, cortesia, valor combinado.
--   3. Preco mudava o passado -- relatorio le base_price no momento da
--      consulta, entao reajustar hoje reescrevia o faturamento do mes passado.
--
-- E procedure_costs / payment_method_fees eram dados mortos: configurados e
-- nunca usados em calculo nenhum. Nao existia margem em lugar algum.

-- ---------------------------------------------------------------------------
-- 1. O agendamento passa a carregar valor
-- ---------------------------------------------------------------------------

alter table public.appointments
  add column if not exists list_price numeric(12,2)
    check (list_price is null or list_price >= 0),
  add column if not exists price numeric(12,2)
    check (price is null or price >= 0),
  add column if not exists price_note text;

comment on column public.appointments.list_price is
  'Preco de tabela no momento do agendamento (convenio quando houver, senao base_price). Congelado: reajuste posterior nao reescreve o passado.';
comment on column public.appointments.price is
  'Valor efetivamente cobrado. Igual ao list_price quando nao houve ajuste.';
comment on column public.appointments.price_note is
  'Por que o valor saiu do preco de tabela (desconto, cortesia, valor combinado).';

-- ---------------------------------------------------------------------------
-- 2. Resolucao de preco: convenio manda, base_price e o piso
-- ---------------------------------------------------------------------------

create or replace function public.resolve_procedure_price(
  p_organization_id uuid,
  p_procedure_id uuid,
  p_health_insurance_id uuid default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_price numeric(12,2);
begin
  -- Convenio com tabela propria tem preferencia sobre o preco particular.
  if p_health_insurance_id is not null then
    select item.price
      into v_price
    from public.price_table_items item
    join public.price_tables tables
      on tables.organization_id = item.organization_id
     and tables.id = item.price_table_id
    where item.organization_id = p_organization_id
      and item.procedure_id = p_procedure_id
      and tables.health_insurance_id = p_health_insurance_id
      and tables.active
    order by item.updated_at desc
    limit 1;

    if v_price is not null then
      return v_price;
    end if;
  end if;

  select base_price
    into v_price
  from public.procedures
  where organization_id = p_organization_id
    and id = p_procedure_id;

  return coalesce(v_price, 0);
end;
$$;

comment on function public.resolve_procedure_price(uuid, uuid, uuid) is
  'Preco de tabela de um procedimento: item da tabela do convenio quando existir, senao o base_price do procedimento.';

-- Preenche o valor de quem nao informou, e congela o preco de tabela do dia.
create or replace function app_private.set_appointment_pricing()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_list_price numeric(12,2);
begin
  v_list_price := public.resolve_procedure_price(
    new.organization_id,
    new.procedure_id,
    new.health_insurance_id
  );

  -- list_price e sempre o da tabela: e a referencia para saber que houve
  -- desconto. price so e calculado quando quem agendou nao informou um valor.
  new.list_price := coalesce(new.list_price, v_list_price);
  new.price := coalesce(new.price, v_list_price);

  return new;
end;
$$;

drop trigger if exists set_appointment_pricing on public.appointments;
create trigger set_appointment_pricing
before insert on public.appointments
for each row execute function app_private.set_appointment_pricing();

-- Agendamentos que ja existiam ficam com o preco vigente do procedimento: e a
-- melhor aproximacao disponivel, e e exatamente o que os relatorios ja liam.
update public.appointments as appointment
set list_price = coalesce(
      appointment.list_price,
      public.resolve_procedure_price(
        appointment.organization_id,
        appointment.procedure_id,
        appointment.health_insurance_id
      )
    ),
    price = coalesce(
      appointment.price,
      public.resolve_procedure_price(
        appointment.organization_id,
        appointment.procedure_id,
        appointment.health_insurance_id
      )
    )
where appointment.price is null or appointment.list_price is null;

-- ---------------------------------------------------------------------------
-- 3. O recebivel passa a nascer do valor do agendamento
-- ---------------------------------------------------------------------------

create or replace function app_private.create_receivable_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_price numeric(12,2);
  v_category_id uuid;
  v_patient_name text;
  v_procedure_name text;
  v_timezone text;
begin
  -- Antes lia procedures.base_price aqui, ignorando convenio e qualquer ajuste
  -- feito no agendamento. Agora o valor ja chega decidido na linha.
  v_price := coalesce(new.price, 0);

  if v_price <= 0 then
    return new;
  end if;

  select name
    into v_procedure_name
  from public.procedures
  where organization_id = new.organization_id
    and id = new.procedure_id;

  select id
    into v_category_id
  from public.financial_categories
  where organization_id = new.organization_id
    and name = 'Consultas'
  limit 1;

  select coalesce(social_name, full_name)
    into v_patient_name
  from public.patients
  where organization_id = new.organization_id
    and id = new.patient_id;

  select coalesce(settings.timezone, 'America/Fortaleza')
    into v_timezone
  from public.organization_settings as settings
  where settings.organization_id = new.organization_id;

  insert into public.accounts_receivable (
    organization_id,
    appointment_id,
    patient_id,
    professional_id,
    procedure_id,
    health_insurance_id,
    category_id,
    description,
    amount,
    due_date,
    created_by_user_id
  ) values (
    new.organization_id,
    new.id,
    new.patient_id,
    new.professional_id,
    new.procedure_id,
    new.health_insurance_id,
    v_category_id,
    coalesce(v_procedure_name, 'Atendimento') || ' - ' || coalesce(v_patient_name, 'Paciente'),
    v_price,
    (new.start_at at time zone coalesce(v_timezone, 'America/Fortaleza'))::date,
    new.created_by_user_id
  )
  on conflict (organization_id, appointment_id) do nothing;

  return new;
end;
$$;

-- Ajustar o valor de um agendamento que ainda nao foi pago acerta o recebivel
-- junto: sem isso o desconto ficaria so na agenda e o financeiro cobraria o
-- valor antigo.
create or replace function app_private.sync_receivable_amount_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.price is not distinct from old.price then
    return new;
  end if;

  update public.accounts_receivable
  set amount = new.price
  where organization_id = new.organization_id
    and appointment_id = new.id
    and paid_amount = 0
    and status in ('open', 'partial')
    and new.price > 0;

  return new;
end;
$$;

drop trigger if exists sync_receivable_amount_from_appointment
  on public.appointments;
create trigger sync_receivable_amount_from_appointment
after update of price on public.appointments
for each row execute function app_private.sync_receivable_amount_from_appointment();

-- ---------------------------------------------------------------------------
-- 4. Custos deixam de ser dado morto
-- ---------------------------------------------------------------------------

-- Soma as regras de custo de um procedimento sobre um valor. Percentual incide
-- sobre o valor cobrado; fixo entra como esta.
create or replace function public.procedure_cost_total(
  p_organization_id uuid,
  p_procedure_id uuid,
  p_price numeric,
  p_cost_type text default null
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select coalesce(sum(
    case cost.calculation_type
      when 'percentage' then round(coalesce(p_price, 0) * cost.value / 100, 2)
      else round(cost.value, 2)
    end
  ), 0)
  from public.procedure_costs cost
  where cost.organization_id = p_organization_id
    and cost.procedure_id = p_procedure_id
    and cost.active
    and (p_cost_type is null or cost.cost_type = p_cost_type)
$$;

create or replace function public.payment_method_fee_total(
  p_organization_id uuid,
  p_payment_method_id uuid,
  p_price numeric
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select coalesce(sum(
    case fee.calculation_type
      when 'percentage' then round(coalesce(p_price, 0) * fee.value / 100, 2)
      else round(fee.value, 2)
    end
  ), 0)
  from public.payment_method_fees fee
  where fee.organization_id = p_organization_id
    and fee.payment_method_id = p_payment_method_id
    and fee.active
$$;

-- ---------------------------------------------------------------------------
-- 5. Relatorio de margem
-- ---------------------------------------------------------------------------

-- Receita, custo por categoria e margem, agrupados por procedimento. Conta
-- apenas atendimento que aconteceu ou esta marcado para acontecer: cancelado e
-- falta nao geram receita nem custo.
create or replace function public.procedure_margin_report(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  procedure_id uuid,
  procedure_name text,
  appointment_count integer,
  list_total numeric,
  revenue numeric,
  discount_total numeric,
  commission_total numeric,
  location_total numeric,
  materials_total numeric,
  other_costs_total numeric,
  payment_fee_total numeric,
  cost_total numeric,
  margin numeric,
  margin_percent numeric
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
    raise exception 'Not allowed to read the margin report.' using errcode = '42501';
  end if;

  return query
  with priced as (
    select
      appointment.procedure_id as pid,
      coalesce(appointment.price, 0) as price,
      coalesce(appointment.list_price, appointment.price, 0) as list_price,
      public.procedure_cost_total(
        v_organization_id, appointment.procedure_id,
        coalesce(appointment.price, 0), 'commission'
      ) as commission,
      public.procedure_cost_total(
        v_organization_id, appointment.procedure_id,
        coalesce(appointment.price, 0), 'location_fee'
      ) as location_fee,
      public.procedure_cost_total(
        v_organization_id, appointment.procedure_id,
        coalesce(appointment.price, 0), 'materials'
      ) as materials,
      public.procedure_cost_total(
        v_organization_id, appointment.procedure_id,
        coalesce(appointment.price, 0), null
      ) as all_costs,
      case
        when appointment.payment_method_id is null then 0
        else public.payment_method_fee_total(
          v_organization_id, appointment.payment_method_id,
          coalesce(appointment.price, 0)
        )
      end as payment_fee
    from public.appointments appointment
    where appointment.organization_id = v_organization_id
      and appointment.start_at >= p_from
      and appointment.start_at < p_to
      and appointment.status not in ('cancelled', 'no_show')
  )
  select
    priced.pid,
    procedure.name,
    count(*)::integer,
    round(sum(priced.list_price), 2),
    round(sum(priced.price), 2),
    round(sum(priced.list_price - priced.price), 2),
    round(sum(priced.commission), 2),
    round(sum(priced.location_fee), 2),
    round(sum(priced.materials), 2),
    round(sum(priced.all_costs - priced.commission - priced.location_fee - priced.materials), 2),
    round(sum(priced.payment_fee), 2),
    round(sum(priced.all_costs + priced.payment_fee), 2),
    round(sum(priced.price - priced.all_costs - priced.payment_fee), 2),
    case
      when sum(priced.price) > 0
        then round(
          sum(priced.price - priced.all_costs - priced.payment_fee)
            * 100 / sum(priced.price),
          1
        )
      else 0
    end
  from priced
  join public.procedures procedure
    on procedure.organization_id = v_organization_id
   and procedure.id = priced.pid
  group by priced.pid, procedure.name
  order by round(sum(priced.price - priced.all_costs - priced.payment_fee), 2) desc;
end;
$$;

comment on function public.procedure_margin_report(timestamptz, timestamptz) is
  'Receita, custos por categoria e margem por procedimento no periodo. E o que da uso as regras de procedure_costs e payment_method_fees.';

revoke all on function public.resolve_procedure_price(uuid, uuid, uuid) from public;
revoke all on function public.procedure_cost_total(uuid, uuid, numeric, text) from public;
revoke all on function public.payment_method_fee_total(uuid, uuid, numeric) from public;
revoke all on function public.procedure_margin_report(timestamptz, timestamptz) from public;

grant execute on function public.resolve_procedure_price(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.procedure_cost_total(uuid, uuid, numeric, text)
  to authenticated, service_role;
grant execute on function public.payment_method_fee_total(uuid, uuid, numeric)
  to authenticated, service_role;
grant execute on function public.procedure_margin_report(timestamptz, timestamptz)
  to authenticated, service_role;
