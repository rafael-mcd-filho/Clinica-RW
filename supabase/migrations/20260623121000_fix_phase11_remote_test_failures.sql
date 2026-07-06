-- Fixes found while running phase 11 pgTAP checks against the linked database.

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
  on conflict (organization_id, appointment_id)
    where appointment_id is not null
  do nothing;

  return new;
end;
$$;

create or replace function app_private.set_communication_opt_out_normalized()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  new.normalized_recipient := app_private.normalize_communication_recipient(
    new.channel,
    new.recipient
  );

  if nullif(new.normalized_recipient, '') is null then
    raise exception 'Recipient is required.' using errcode = '23514';
  end if;

  return new;
end;
$$;
