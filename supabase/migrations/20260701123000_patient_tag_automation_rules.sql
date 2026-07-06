-- Patient tag automation rules, lifecycle metadata and event triggers.

create table if not exists public.patient_tag_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tag_id uuid not null,
  name text not null,
  trigger_type text not null
    check (trigger_type in (
      'new_patient',
      'appointment_scheduled',
      'first_visit',
      'revenue_threshold'
    )),
  active boolean not null default true,
  duration_days integer check (duration_days is null or duration_days between 1 and 3650),
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name),
  foreign key (organization_id, tag_id)
    references public.tags(organization_id, id) on delete cascade
);

create index if not exists patient_tag_rules_organization_trigger_idx
  on public.patient_tag_rules(organization_id, trigger_type)
  where active;

drop trigger if exists set_patient_tag_rules_updated_at on public.patient_tag_rules;
create trigger set_patient_tag_rules_updated_at
before update on public.patient_tag_rules
for each row execute function app_private.set_updated_at();

alter table public.patient_tags
  add column if not exists source text not null default 'manual',
  add column if not exists automation_rule_id uuid
    references public.patient_tag_rules(id) on delete cascade,
  add column if not exists expires_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'patient_tags_source_check'
      and conrelid = 'public.patient_tags'::regclass
  ) then
    alter table public.patient_tags
      add constraint patient_tags_source_check
      check (source in (
        'manual',
        'new_patient',
        'appointment_scheduled',
        'first_visit',
        'revenue_threshold'
      ));
  end if;
end $$;

create index if not exists patient_tags_expires_at_idx
  on public.patient_tags(expires_at)
  where expires_at is not null;

create index if not exists patient_tags_automation_rule_id_idx
  on public.patient_tags(automation_rule_id)
  where automation_rule_id is not null;

drop trigger if exists set_patient_tags_updated_at on public.patient_tags;
create trigger set_patient_tags_updated_at
before update on public.patient_tags
for each row execute function app_private.set_updated_at();

create or replace function app_private.expire_patient_tags(
  p_organization_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_count integer;
begin
  delete from public.patient_tags
  where expires_at is not null
    and expires_at <= statement_timestamp()
    and (p_organization_id is null or organization_id = p_organization_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function app_private.patient_tag_rule_expires_at(
  p_duration_days integer
)
returns timestamptz
language sql
stable
set search_path = pg_catalog
as $$
  select case
    when p_duration_days is null then null::timestamptz
    else statement_timestamp() + make_interval(days => p_duration_days)
  end;
$$;

create or replace function app_private.upsert_patient_tag_from_rule(
  p_rule public.patient_tag_rules,
  p_patient_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into public.patient_tags (
    organization_id,
    patient_id,
    tag_id,
    source,
    automation_rule_id,
    expires_at
  )
  values (
    p_rule.organization_id,
    p_patient_id,
    p_rule.tag_id,
    p_rule.trigger_type,
    p_rule.id,
    app_private.patient_tag_rule_expires_at(p_rule.duration_days)
  )
  on conflict (patient_id, tag_id) do update
    set source = excluded.source,
        automation_rule_id = excluded.automation_rule_id,
        expires_at = excluded.expires_at,
        updated_at = statement_timestamp();
end;
$$;

create or replace function app_private.patient_paid_total(
  p_organization_id uuid,
  p_patient_id uuid
)
returns numeric
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(sum(payments.amount), 0)::numeric
  from public.payments payments
  join public.accounts_receivable receivables
    on receivables.organization_id = payments.organization_id
   and receivables.id = payments.account_receivable_id
  where payments.organization_id = p_organization_id
    and receivables.patient_id = p_patient_id
    and receivables.status <> 'cancelled';
$$;

create or replace function app_private.apply_patient_tag_rules(
  p_organization_id uuid,
  p_patient_id uuid,
  p_trigger_type text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_rule public.patient_tag_rules;
  v_applied integer := 0;
  v_has_finalized_encounter boolean;
  v_minimum_paid numeric;
  v_paid_total numeric;
begin
  perform app_private.expire_patient_tags(p_organization_id);

  select exists (
    select 1
    from public.encounters
    where organization_id = p_organization_id
      and patient_id = p_patient_id
      and status = 'finalized'
  )
  into v_has_finalized_encounter;

  for v_rule in
    select *
    from public.patient_tag_rules
    where organization_id = p_organization_id
      and trigger_type = p_trigger_type
      and active
  loop
    if v_rule.trigger_type = 'first_visit' and v_has_finalized_encounter then
      delete from public.patient_tags
      where organization_id = p_organization_id
        and patient_id = p_patient_id
        and automation_rule_id = v_rule.id;
      continue;
    end if;

    if v_rule.trigger_type = 'revenue_threshold' then
      v_minimum_paid := nullif(v_rule.config ->> 'minimum_paid_amount', '')::numeric;
      v_paid_total := app_private.patient_paid_total(p_organization_id, p_patient_id);

      if v_minimum_paid is null or v_paid_total < v_minimum_paid then
        delete from public.patient_tags
        where organization_id = p_organization_id
          and patient_id = p_patient_id
          and automation_rule_id = v_rule.id;
        continue;
      end if;
    end if;

    perform app_private.upsert_patient_tag_from_rule(v_rule, p_patient_id);
    v_applied := v_applied + 1;
  end loop;

  return v_applied;
end;
$$;

create or replace function app_private.remove_first_visit_patient_tags(
  p_organization_id uuid,
  p_patient_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_count integer;
begin
  delete from public.patient_tags patient_tags
  using public.patient_tag_rules rules
  where patient_tags.automation_rule_id = rules.id
    and patient_tags.organization_id = p_organization_id
    and patient_tags.patient_id = p_patient_id
    and rules.trigger_type = 'first_visit';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function app_private.handle_patient_tag_rules_after_patient()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  perform app_private.apply_patient_tag_rules(
    new.organization_id,
    new.id,
    'new_patient'
  );
  return new;
end;
$$;

create or replace function app_private.handle_patient_tag_rules_after_appointment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.status not in ('cancelled', 'no_show') then
    perform app_private.apply_patient_tag_rules(
      new.organization_id,
      new.patient_id,
      'appointment_scheduled'
    );
    perform app_private.apply_patient_tag_rules(
      new.organization_id,
      new.patient_id,
      'first_visit'
    );
  end if;

  return new;
end;
$$;

create or replace function app_private.handle_patient_tag_rules_after_encounter()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.status = 'finalized'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform app_private.remove_first_visit_patient_tags(
      new.organization_id,
      new.patient_id
    );
  end if;

  return new;
end;
$$;

create or replace function app_private.evaluate_revenue_patient_tag_rules(
  p_organization_id uuid,
  p_patient_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  return app_private.apply_patient_tag_rules(
    p_organization_id,
    p_patient_id,
    'revenue_threshold'
  );
end;
$$;

create or replace function app_private.handle_patient_tag_rules_after_payment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_new_patient_id uuid;
  v_old_patient_id uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    select patient_id
      into v_new_patient_id
    from public.accounts_receivable
    where organization_id = new.organization_id
      and id = new.account_receivable_id;

    if v_new_patient_id is not null then
      perform app_private.evaluate_revenue_patient_tag_rules(
        new.organization_id,
        v_new_patient_id
      );
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select patient_id
      into v_old_patient_id
    from public.accounts_receivable
    where organization_id = old.organization_id
      and id = old.account_receivable_id;

    if v_old_patient_id is not null
      and (v_new_patient_id is null or v_new_patient_id <> v_old_patient_id)
    then
      perform app_private.evaluate_revenue_patient_tag_rules(
        old.organization_id,
        v_old_patient_id
      );
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.refresh_patient_tag_rule(p_rule_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_rule public.patient_tag_rules;
  v_patient record;
  v_count integer := 0;
begin
  select *
    into v_rule
  from public.patient_tag_rules
  where id = p_rule_id;

  if not found then
    return 0;
  end if;

  if not (
    app_private.current_is_super_admin()
    or (
      v_rule.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('config.geral')
    )
  ) then
    raise exception 'Insufficient permission to refresh patient tag rule.'
      using errcode = '42501';
  end if;

  if not v_rule.active then
    delete from public.patient_tags
    where organization_id = v_rule.organization_id
      and automation_rule_id = v_rule.id;

    get diagnostics v_count = row_count;
    return v_count;
  end if;

  if v_rule.trigger_type = 'new_patient' then
    for v_patient in
      select id
      from public.patients
      where organization_id = v_rule.organization_id
        and deleted_at is null
    loop
      v_count := v_count + app_private.apply_patient_tag_rules(
        v_rule.organization_id,
        v_patient.id,
        v_rule.trigger_type
      );
    end loop;
  elsif v_rule.trigger_type in ('appointment_scheduled', 'first_visit') then
    for v_patient in
      select distinct patient_id as id
      from public.appointments
      where organization_id = v_rule.organization_id
        and status not in ('cancelled', 'no_show')
    loop
      v_count := v_count + app_private.apply_patient_tag_rules(
        v_rule.organization_id,
        v_patient.id,
        v_rule.trigger_type
      );
    end loop;
  elsif v_rule.trigger_type = 'revenue_threshold' then
    for v_patient in
      select distinct patient_id as id
      from public.accounts_receivable
      where organization_id = v_rule.organization_id
    loop
      v_count := v_count + app_private.apply_patient_tag_rules(
        v_rule.organization_id,
        v_patient.id,
        v_rule.trigger_type
      );
    end loop;
  end if;

  return v_count;
end;
$$;

drop trigger if exists apply_patient_tag_rules_after_patient on public.patients;
create trigger apply_patient_tag_rules_after_patient
after insert on public.patients
for each row execute function app_private.handle_patient_tag_rules_after_patient();

drop trigger if exists apply_patient_tag_rules_after_appointment on public.appointments;
create trigger apply_patient_tag_rules_after_appointment
after insert or update of patient_id, status on public.appointments
for each row execute function app_private.handle_patient_tag_rules_after_appointment();

drop trigger if exists apply_patient_tag_rules_after_encounter on public.encounters;
create trigger apply_patient_tag_rules_after_encounter
after insert or update of status on public.encounters
for each row execute function app_private.handle_patient_tag_rules_after_encounter();

drop trigger if exists apply_patient_tag_rules_after_payment on public.payments;
create trigger apply_patient_tag_rules_after_payment
after insert or update or delete on public.payments
for each row execute function app_private.handle_patient_tag_rules_after_payment();

alter table public.patient_tag_rules enable row level security;

drop policy if exists patient_tag_rules_select_tenant on public.patient_tag_rules;
drop policy if exists patient_tag_rules_insert_tenant on public.patient_tag_rules;
drop policy if exists patient_tag_rules_update_tenant on public.patient_tag_rules;
drop policy if exists patient_tag_rules_delete_tenant on public.patient_tag_rules;

create policy patient_tag_rules_select_tenant
on public.patient_tag_rules for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('config.geral')
      or app_private.current_user_has_permission('paciente.ver')
    )
  )
);

create policy patient_tag_rules_insert_tenant
on public.patient_tag_rules for insert to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
);

create policy patient_tag_rules_update_tenant
on public.patient_tag_rules for update to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
)
with check (
  app_private.current_is_super_admin()
  or organization_id = app_private.current_organization_id()
);

create policy patient_tag_rules_delete_tenant
on public.patient_tag_rules for delete to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
);

drop policy if exists tags_select_tenant on public.tags;
drop policy if exists tags_insert_tenant on public.tags;
drop policy if exists tags_update_tenant on public.tags;

create policy tags_select_tenant
on public.tags for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('paciente.ver')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

create policy tags_insert_tenant
on public.tags for insert to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('paciente.editar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

create policy tags_update_tenant
on public.tags for update to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('paciente.editar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
)
with check (
  app_private.current_is_super_admin()
  or organization_id = app_private.current_organization_id()
);

drop policy if exists patient_tags_insert_tenant on public.patient_tags;
drop policy if exists patient_tags_update_tenant on public.patient_tags;
drop policy if exists patient_tags_delete_tenant on public.patient_tags;

create policy patient_tags_insert_tenant
on public.patient_tags for insert to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('paciente.editar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

create policy patient_tags_update_tenant
on public.patient_tags for update to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('paciente.editar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
)
with check (
  app_private.current_is_super_admin()
  or organization_id = app_private.current_organization_id()
);

create policy patient_tags_delete_tenant
on public.patient_tags for delete to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('paciente.editar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

grant select, insert, update, delete on public.patient_tag_rules to authenticated;
grant select, insert, update, delete on public.patient_tags to authenticated;
grant execute on function public.refresh_patient_tag_rule(uuid) to authenticated;

comment on table public.patient_tag_rules is
  'Configurable rules that add or remove patient CRM tags from operational events.';
comment on column public.patient_tags.expires_at is
  'When set, the tag should no longer be shown after this timestamp.';
comment on function public.refresh_patient_tag_rule(uuid) is
  'Backfills or removes patient tags managed by a configured automation rule.';

with first_visit_tags as (
  insert into public.tags (organization_id, name, color)
  select organizations.id, 'Primeira vez', '#22c55e'
  from public.organizations organizations
  on conflict (organization_id, name) do nothing
  returning organization_id, id
),
resolved_first_visit_tags as (
  select organization_id, id
  from first_visit_tags
  union
  select organization_id, id
  from public.tags
  where name = 'Primeira vez'
)
insert into public.patient_tag_rules (
  organization_id,
  tag_id,
  name,
  trigger_type,
  active,
  duration_days,
  config
)
select
  organization_id,
  id,
  'Primeira vez ate finalizar atendimento',
  'first_visit',
  true,
  null,
  '{"remove_on_first_finalized": true}'::jsonb
from resolved_first_visit_tags
on conflict (organization_id, name) do nothing;

do $$
declare
  v_rule public.patient_tag_rules;
  v_patient record;
begin
  for v_rule in
    select *
    from public.patient_tag_rules
    where trigger_type = 'first_visit'
      and active
  loop
    for v_patient in
      select distinct patient_id as id
      from public.appointments
      where organization_id = v_rule.organization_id
        and status not in ('cancelled', 'no_show')
    loop
      perform app_private.apply_patient_tag_rules(
        v_rule.organization_id,
        v_patient.id,
        v_rule.trigger_type
      );
    end loop;
  end loop;
end $$;
