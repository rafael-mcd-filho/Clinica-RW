-- Optional cost rules for procedures/services and payment methods.

create table if not exists public.procedure_costs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  procedure_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  cost_type text not null default 'other'
    check (cost_type in ('commission', 'location_fee', 'other')),
  calculation_type text not null
    check (calculation_type in ('fixed', 'percentage')),
  value numeric(12,4) not null check (
    value >= 0
    and (calculation_type <> 'percentage' or value <= 100)
  ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, procedure_id)
    references public.procedures(organization_id, id) on delete cascade
);

create table if not exists public.payment_method_fees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_method_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  calculation_type text not null
    check (calculation_type in ('fixed', 'percentage')),
  value numeric(12,4) not null check (
    value >= 0
    and (calculation_type <> 'percentage' or value <= 100)
  ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, payment_method_id)
    references public.payment_methods(organization_id, id) on delete cascade
);

create index if not exists procedure_costs_catalog_idx
  on public.procedure_costs(organization_id, procedure_id, active, created_at);
create index if not exists payment_method_fees_catalog_idx
  on public.payment_method_fees(organization_id, payment_method_id, active, created_at);

drop trigger if exists set_procedure_costs_updated_at on public.procedure_costs;
create trigger set_procedure_costs_updated_at
before update on public.procedure_costs
for each row execute function app_private.set_updated_at();

drop trigger if exists set_payment_method_fees_updated_at
  on public.payment_method_fees;
create trigger set_payment_method_fees_updated_at
before update on public.payment_method_fees
for each row execute function app_private.set_updated_at();

alter table public.procedure_costs enable row level security;
alter table public.payment_method_fees enable row level security;

drop policy if exists procedure_costs_select on public.procedure_costs;
create policy procedure_costs_select on public.procedure_costs
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('config.geral')
      or app_private.current_user_has_permission('financeiro.ver_geral')
    )
  )
);

drop policy if exists procedure_costs_manage on public.procedure_costs;
create policy procedure_costs_manage on public.procedure_costs
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
);

drop policy if exists payment_method_fees_select on public.payment_method_fees;
create policy payment_method_fees_select on public.payment_method_fees
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('config.geral')
      or app_private.current_user_has_permission('financeiro.ver_geral')
    )
  )
);

drop policy if exists payment_method_fees_manage on public.payment_method_fees;
create policy payment_method_fees_manage on public.payment_method_fees
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
);

-- Payment-method administration now belongs to general company settings.
drop policy if exists payment_methods_manage on public.payment_methods;
create policy payment_methods_manage on public.payment_methods
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
);

drop policy if exists payment_methods_select_config on public.payment_methods;
create policy payment_methods_select_config on public.payment_methods
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
);

create or replace function public.delete_unused_payment_method(
  p_payment_method_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_organization_id uuid;
begin
  v_organization_id := app_private.current_organization_id();

  if not (
    app_private.current_is_super_admin()
    or app_private.current_user_has_permission('config.geral')
  ) then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  if not exists (
    select 1
    from public.payment_methods
    where id = p_payment_method_id
      and organization_id = v_organization_id
  ) then
    raise exception using errcode = 'P0002', message = 'payment method not found';
  end if;

  if exists (
    select 1 from public.payments
    where organization_id = v_organization_id
      and payment_method_id = p_payment_method_id
  ) or exists (
    select 1 from public.accounts_payable
    where organization_id = v_organization_id
      and payment_method_id = p_payment_method_id
  ) or exists (
    select 1 from public.appointments
    where organization_id = v_organization_id
      and payment_method_id = p_payment_method_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'payment method is referenced';
  end if;

  update public.online_booking_settings
  set accepted_payment_method_ids = array_remove(
    accepted_payment_method_ids,
    p_payment_method_id
  )
  where organization_id = v_organization_id
    and p_payment_method_id = any(accepted_payment_method_ids);

  delete from public.payment_methods
  where id = p_payment_method_id
    and organization_id = v_organization_id;
end;
$$;

revoke all on function public.delete_unused_payment_method(uuid) from public;
grant execute on function public.delete_unused_payment_method(uuid) to authenticated;
grant execute on function public.delete_unused_payment_method(uuid) to service_role;

grant select, insert, update, delete on
  public.procedure_costs,
  public.payment_method_fees
to authenticated;

grant all on
  public.procedure_costs,
  public.payment_method_fees
to service_role;

comment on table public.procedure_costs is
  'Optional fixed or percentage cost rules associated with a procedure/service.';
comment on table public.payment_method_fees is
  'Optional fixed or percentage fees associated with a payment method.';

-- Repair the original default labels if they were created from a mojibake seed.
update public.payment_methods as method
set name = case method_type
  when 'credit_card' then 'Cartão de crédito'
  when 'debit_card' then 'Cartão de débito'
  when 'bank_transfer' then 'Transferência bancária'
  else name
end
where
  (
    (method_type = 'credit_card' and name in ('CartÃ£o de crÃ©dito', 'CartÃƒÂ£o de crÃƒÂ©dito'))
    or (method_type = 'debit_card' and name in ('CartÃ£o de dÃ©bito', 'CartÃƒÂ£o de dÃƒÂ©bito'))
    or (method_type = 'bank_transfer' and name in ('TransferÃªncia bancÃ¡ria', 'TransferÃƒÂªncia bancÃƒÂ¡ria'))
  )
  and not exists (
    select 1
    from public.payment_methods as existing
    where existing.organization_id = method.organization_id
      and existing.id <> method.id
      and existing.name = case method.method_type
        when 'credit_card' then 'Cartão de crédito'
        when 'debit_card' then 'Cartão de débito'
        when 'bank_transfer' then 'Transferência bancária'
        else method.name
      end
  );
