-- Phase 9: operational finance, receivables, payments, payables and payouts.

create table public.financial_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  default_professional_payout_percent numeric(5,2) not null default 60
    check (default_professional_payout_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  method_type text not null default 'other'
    check (method_type in (
      'cash', 'pix', 'credit_card', 'debit_card',
      'bank_transfer', 'other'
    )),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category_type text not null default 'both'
    check (category_type in ('receivable', 'payable', 'both')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid,
  patient_id uuid not null,
  professional_id uuid,
  procedure_id uuid,
  health_insurance_id uuid,
  category_id uuid,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  due_date date not null default current_date,
  status text not null default 'open'
    check (status in ('open', 'partial', 'paid', 'cancelled', 'written_off')),
  notes text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_amount <= amount),
  unique (organization_id, id),
  foreign key (organization_id, appointment_id)
    references public.appointments(organization_id, id) on delete set null (appointment_id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  foreign key (organization_id, professional_id)
    references public.professionals(organization_id, id) on delete set null (professional_id),
  foreign key (organization_id, procedure_id)
    references public.procedures(organization_id, id) on delete set null (procedure_id),
  foreign key (organization_id, health_insurance_id)
    references public.health_insurances(organization_id, id) on delete set null (health_insurance_id),
  foreign key (organization_id, category_id)
    references public.financial_categories(organization_id, id) on delete set null (category_id),
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id) on delete set null (created_by_user_id)
);

create unique index accounts_receivable_appointment_key
  on public.accounts_receivable(organization_id, appointment_id)
  where appointment_id is not null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_receivable_id uuid not null,
  payment_method_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default statement_timestamp(),
  received_by_user_id uuid,
  external_reference text,
  notes text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, account_receivable_id)
    references public.accounts_receivable(organization_id, id),
  foreign key (organization_id, payment_method_id)
    references public.payment_methods(organization_id, id),
  foreign key (organization_id, received_by_user_id)
    references public.app_users(organization_id, id) on delete set null (received_by_user_id)
);

create table public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid,
  vendor_name text not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null,
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  payment_method_id uuid,
  paid_at timestamptz,
  created_by_user_id uuid,
  paid_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (
    (status = 'paid' and paid_at is not null)
    or (status <> 'paid' and paid_at is null)
  ),
  foreign key (organization_id, category_id)
    references public.financial_categories(organization_id, id) on delete set null (category_id),
  foreign key (organization_id, payment_method_id)
    references public.payment_methods(organization_id, id) on delete set null (payment_method_id),
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id) on delete set null (created_by_user_id),
  foreign key (organization_id, paid_by_user_id)
    references public.app_users(organization_id, id) on delete set null (paid_by_user_id)
);

create table public.professional_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid not null,
  account_receivable_id uuid not null,
  payment_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  paid_at timestamptz,
  paid_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, payment_id),
  check (
    (status = 'paid' and paid_at is not null)
    or (status <> 'paid' and paid_at is null)
  ),
  foreign key (organization_id, professional_id)
    references public.professionals(organization_id, id),
  foreign key (organization_id, account_receivable_id)
    references public.accounts_receivable(organization_id, id),
  foreign key (organization_id, payment_id)
    references public.payments(organization_id, id),
  foreign key (organization_id, paid_by_user_id)
    references public.app_users(organization_id, id) on delete set null (paid_by_user_id)
);

create index accounts_receivable_patient_idx
  on public.accounts_receivable(organization_id, patient_id, due_date desc);
create index accounts_receivable_status_idx
  on public.accounts_receivable(organization_id, status, due_date);
create index payments_receivable_idx
  on public.payments(organization_id, account_receivable_id, paid_at desc);
create index accounts_payable_status_idx
  on public.accounts_payable(organization_id, status, due_date);
create index professional_payouts_professional_idx
  on public.professional_payouts(organization_id, professional_id, due_date desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'financial_settings', 'payment_methods', 'financial_categories',
    'accounts_receivable', 'accounts_payable', 'professional_payouts'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row '
      'execute function app_private.set_updated_at()',
      'set_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end;
$$;

create or replace function app_private.recalculate_receivable_status(
  p_account_receivable_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_receivable public.accounts_receivable%rowtype;
  v_paid numeric(12,2);
begin
  select *
    into v_receivable
  from public.accounts_receivable
  where id = p_account_receivable_id
  for update;

  if v_receivable.id is null then
    return;
  end if;

  select coalesce(sum(amount), 0)
    into v_paid
  from public.payments
  where organization_id = v_receivable.organization_id
    and account_receivable_id = v_receivable.id;

  update public.accounts_receivable
  set paid_amount = least(v_paid, amount),
      status = case
        when status in ('cancelled', 'written_off') then status
        when v_paid <= 0 then 'open'
        when v_paid < amount then 'partial'
        else 'paid'
      end
  where id = v_receivable.id;
end;
$$;

create or replace function app_private.sync_receivable_after_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform app_private.recalculate_receivable_status(new.account_receivable_id);
    return new;
  end if;

  perform app_private.recalculate_receivable_status(old.account_receivable_id);
  return old;
end;
$$;

create trigger sync_receivable_after_payment
after insert or update or delete on public.payments
for each row execute function app_private.sync_receivable_after_payment();

create or replace function app_private.create_professional_payout_from_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_receivable public.accounts_receivable%rowtype;
  v_percent numeric(5,2);
  v_amount numeric(12,2);
begin
  select *
    into v_receivable
  from public.accounts_receivable
  where organization_id = new.organization_id
    and id = new.account_receivable_id;

  if v_receivable.id is null or v_receivable.professional_id is null then
    return new;
  end if;

  select coalesce(default_professional_payout_percent, 60)
    into v_percent
  from public.financial_settings
  where organization_id = new.organization_id;

  v_amount := round(new.amount * coalesce(v_percent, 60) / 100, 2);
  if v_amount <= 0 then
    return new;
  end if;

  insert into public.professional_payouts (
    organization_id,
    professional_id,
    account_receivable_id,
    payment_id,
    amount,
    due_date
  ) values (
    new.organization_id,
    v_receivable.professional_id,
    v_receivable.id,
    new.id,
    v_amount,
    (new.paid_at at time zone 'America/Fortaleza')::date
  )
  on conflict (organization_id, payment_id) do update
    set amount = excluded.amount
    where public.professional_payouts.status = 'pending';

  return new;
end;
$$;

create trigger create_professional_payout_from_payment
after insert or update of amount on public.payments
for each row execute function app_private.create_professional_payout_from_payment();

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
  select base_price, name
    into v_price, v_procedure_name
  from public.procedures
  where organization_id = new.organization_id
    and id = new.procedure_id;

  if coalesce(v_price, 0) <= 0 then
    return new;
  end if;

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

create trigger create_receivable_from_appointment
after insert on public.appointments
for each row execute function app_private.create_receivable_from_appointment();

create or replace function app_private.cancel_receivable_from_cancelled_appointment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if old.status is distinct from new.status and new.status = 'cancelled' then
    update public.accounts_receivable
    set status = 'cancelled'
    where organization_id = new.organization_id
      and appointment_id = new.id
      and paid_amount = 0
      and status in ('open', 'partial');
  end if;

  return new;
end;
$$;

create trigger cancel_receivable_from_cancelled_appointment
after update of status on public.appointments
for each row execute function app_private.cancel_receivable_from_cancelled_appointment();

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

  select *
    into v_receivable
  from public.accounts_receivable
  where id = p_account_receivable_id
  for update;

  if v_receivable.id is null then
    raise exception 'Account receivable not found.' using errcode = 'P0002';
  end if;

  if not (
    app_private.current_is_super_admin()
    or (
      v_receivable.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('financeiro.receber_pagamento')
    )
  ) then
    raise exception 'Not allowed to receive payment.' using errcode = '42501';
  end if;

  if v_receivable.status in ('paid', 'cancelled', 'written_off') then
    raise exception 'Account receivable is not open for payment.'
      using errcode = '23514';
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be positive.' using errcode = '23514';
  end if;

  v_remaining := v_receivable.amount - v_receivable.paid_amount;
  if p_amount > v_remaining then
    raise exception 'Payment amount exceeds remaining balance.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.payment_methods
    where organization_id = v_receivable.organization_id
      and id = p_payment_method_id
      and active
  ) then
    raise exception 'Payment method not found.' using errcode = '23503';
  end if;

  insert into public.payments (
    organization_id,
    account_receivable_id,
    payment_method_id,
    amount,
    paid_at,
    received_by_user_id,
    notes
  ) values (
    v_receivable.organization_id,
    v_receivable.id,
    p_payment_method_id,
    p_amount,
    coalesce(p_paid_at, statement_timestamp()),
    v_actor_id,
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

  select *
    into v_payable
  from public.accounts_payable
  where id = p_account_payable_id
  for update;

  if v_payable.id is null then
    raise exception 'Account payable not found.' using errcode = 'P0002';
  end if;

  if not (
    app_private.current_is_super_admin()
    or (
      v_payable.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
    )
  ) then
    raise exception 'Not allowed to pay account payable.' using errcode = '42501';
  end if;

  if v_payable.status <> 'open' then
    return v_payable.status;
  end if;

  if not exists (
    select 1
    from public.payment_methods
    where organization_id = v_payable.organization_id
      and id = p_payment_method_id
      and active
  ) then
    raise exception 'Payment method not found.' using errcode = '23503';
  end if;

  update public.accounts_payable
  set status = 'paid',
      payment_method_id = p_payment_method_id,
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

  select *
    into v_payout
  from public.professional_payouts
  where id = p_payout_id
  for update;

  if v_payout.id is null then
    raise exception 'Professional payout not found.' using errcode = 'P0002';
  end if;

  if not (
    app_private.current_is_super_admin()
    or (
      v_payout.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
    )
  ) then
    raise exception 'Not allowed to pay professional payout.' using errcode = '42501';
  end if;

  if v_payout.status <> 'pending' then
    return v_payout.status;
  end if;

  update public.professional_payouts
  set status = 'paid',
      paid_at = coalesce(p_paid_at, statement_timestamp()),
      paid_by_user_id = v_actor_id
  where id = v_payout.id;

  return 'paid';
end;
$$;

revoke all on function public.receive_account_receivable_payment(uuid, uuid, numeric, timestamptz, text) from public;
revoke all on function public.mark_account_payable_paid(uuid, uuid, timestamptz) from public;
revoke all on function public.mark_professional_payout_paid(uuid, timestamptz) from public;
grant execute on function public.receive_account_receivable_payment(uuid, uuid, numeric, timestamptz, text)
  to authenticated, service_role;
grant execute on function public.mark_account_payable_paid(uuid, uuid, timestamptz)
  to authenticated, service_role;
grant execute on function public.mark_professional_payout_paid(uuid, timestamptz)
  to authenticated, service_role;

create or replace function app_private.audit_financial_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_row jsonb;
  v_actor_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_actor_id := app_private.current_app_user_id();

  if v_actor_id is not null then
    insert into public.audit_logs (
      organization_id,
      actor_user_id,
      action,
      resource_type,
      resource_id,
      metadata
    )
    values (
      nullif(v_row ->> 'organization_id', '')::uuid,
      v_actor_id,
      lower(tg_table_name) || '.' || lower(tg_op),
      tg_table_name,
      nullif(v_row ->> 'id', '')::uuid,
      jsonb_build_object(
        'status', v_row ->> 'status',
        'amount', v_row ->> 'amount'
      )
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'accounts_receivable', 'payments', 'accounts_payable', 'professional_payouts'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function app_private.audit_financial_change()',
      'audit_' || table_name || '_change',
      table_name
    );
  end loop;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'financial_settings', 'payment_methods', 'financial_categories',
    'accounts_receivable', 'payments', 'accounts_payable',
    'professional_payouts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

create policy financial_settings_select on public.financial_settings
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('financeiro.ver_geral')
      or app_private.current_user_has_permission('financeiro.receber_pagamento')
      or app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
    )
  )
);

create policy financial_settings_manage on public.financial_settings
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.ver_geral')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.ver_geral')
  )
);

create policy payment_methods_select on public.payment_methods
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('financeiro.ver_geral')
      or app_private.current_user_has_permission('financeiro.receber_pagamento')
      or app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
    )
  )
);

create policy payment_methods_manage on public.payment_methods
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.ver_geral')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.ver_geral')
  )
);

create policy financial_categories_select on public.financial_categories
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('financeiro.ver_geral')
      or app_private.current_user_has_permission('financeiro.receber_pagamento')
      or app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
    )
  )
);

create policy financial_categories_manage on public.financial_categories
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.ver_geral')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.ver_geral')
  )
);

create policy accounts_receivable_select on public.accounts_receivable
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('financeiro.ver_geral')
      or app_private.current_user_has_permission('financeiro.receber_pagamento')
    )
  )
);

create policy accounts_receivable_manage on public.accounts_receivable
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.ver_geral')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.ver_geral')
  )
);

create policy payments_select on public.payments
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('financeiro.ver_geral')
      or app_private.current_user_has_permission('financeiro.receber_pagamento')
    )
  )
);

create policy accounts_payable_select on public.accounts_payable
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('financeiro.ver_geral')
      or app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
    )
  )
);

create policy accounts_payable_manage on public.accounts_payable
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
  )
);

create policy professional_payouts_select on public.professional_payouts
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('financeiro.ver_geral')
      or (
        app_private.current_user_has_permission('financeiro.ver_proprio_repasse')
        and professional_id = app_private.current_professional_id(organization_id)
      )
    )
  )
);

create policy professional_payouts_manage on public.professional_payouts
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('financeiro.gerenciar_contas_pagar')
  )
);

grant select, insert, update, delete on
  public.financial_settings,
  public.payment_methods,
  public.financial_categories,
  public.accounts_receivable,
  public.accounts_payable,
  public.professional_payouts
to authenticated;
grant select on public.payments to authenticated;

grant all on
  public.financial_settings,
  public.payment_methods,
  public.financial_categories,
  public.accounts_receivable,
  public.payments,
  public.accounts_payable,
  public.professional_payouts
to service_role;

create or replace function app_private.seed_default_financial_data(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into public.financial_settings (organization_id)
  values (p_organization_id)
  on conflict (organization_id) do nothing;

  insert into public.payment_methods (organization_id, name, method_type)
  values
    (p_organization_id, 'Dinheiro', 'cash'),
    (p_organization_id, 'Pix', 'pix'),
    (p_organization_id, 'Cartão de crédito', 'credit_card'),
    (p_organization_id, 'Cartão de débito', 'debit_card'),
    (p_organization_id, 'Transferência bancária', 'bank_transfer')
  on conflict (organization_id, name) do nothing;

  insert into public.financial_categories (organization_id, name, category_type)
  values
    (p_organization_id, 'Consultas', 'receivable'),
    (p_organization_id, 'Procedimentos', 'receivable'),
    (p_organization_id, 'Despesas operacionais', 'payable'),
    (p_organization_id, 'Repasse profissional', 'payable')
  on conflict (organization_id, name) do nothing;
end;
$$;

do $$
declare organization_row record;
begin
  for organization_row in select id from public.organizations loop
    perform app_private.seed_default_financial_data(organization_row.id);
  end loop;
end;
$$;

create or replace function app_private.seed_financial_data_on_organization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  perform app_private.seed_default_financial_data(new.id);
  return new;
end;
$$;

create trigger seed_financial_data_on_organization
after insert on public.organizations
for each row execute function app_private.seed_financial_data_on_organization();

insert into public.profile_permissions (profile_id, permission_id)
select profiles.id, permissions.id
from public.profiles
join public.permissions on permissions.code in (
  'financeiro.ver_geral',
  'financeiro.receber_pagamento',
  'financeiro.gerenciar_contas_pagar'
)
where profiles.name = 'Administrador'
on conflict (profile_id, permission_id) do nothing;

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
)
select
  appointments.organization_id,
  appointments.id,
  appointments.patient_id,
  appointments.professional_id,
  appointments.procedure_id,
  appointments.health_insurance_id,
  categories.id,
  procedures.name || ' - ' || coalesce(patients.social_name, patients.full_name, 'Paciente'),
  procedures.base_price,
  (appointments.start_at at time zone coalesce(settings.timezone, 'America/Fortaleza'))::date,
  appointments.created_by_user_id
from public.appointments
join public.procedures
  on procedures.organization_id = appointments.organization_id
 and procedures.id = appointments.procedure_id
join public.patients
  on patients.organization_id = appointments.organization_id
 and patients.id = appointments.patient_id
left join public.organization_settings as settings
  on settings.organization_id = appointments.organization_id
left join public.financial_categories as categories
  on categories.organization_id = appointments.organization_id
 and categories.name = 'Consultas'
where procedures.base_price > 0
  and appointments.status <> 'cancelled'
on conflict (organization_id, appointment_id)
  where appointment_id is not null
do nothing;

comment on table public.accounts_receivable is
  'Tenant-scoped receivables generated from appointments or manually managed.';
comment on table public.payments is
  'Payments received against accounts receivable.';
comment on table public.accounts_payable is
  'Operational expenses and payables.';
comment on table public.professional_payouts is
  'Simple professional payout entries generated from received payments.';
