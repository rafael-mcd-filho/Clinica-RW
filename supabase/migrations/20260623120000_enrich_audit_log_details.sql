-- Enrich audit metadata and expose appointment status transitions in audit logs.

create or replace function app_private.audit_metadata_summary(
  p_row jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_key text;
begin
  if p_row is null then
    return '{}'::jsonb;
  end if;

  foreach v_key in array array[
    'id',
    'organization_id',
    'name',
    'code',
    'status',
    'active',
    'mode',
    'timezone',
    'locale',
    'automatic_mode',
    'retention_policy_key',
    'trade_name',
    'unit_id',
    'room_id',
    'equipment_id',
    'specialty_id',
    'professional_id',
    'procedure_id',
    'health_insurance_id',
    'price_table_id',
    'patient_id',
    'appointment_id',
    'encounter_id',
    'document_type',
    'consent_type',
    'tag_id',
    'weekday',
    'start_time',
    'end_time',
    'start_at',
    'end_at',
    'slot_minutes',
    'duration_minutes',
    'base_price',
    'amount',
    'paid_amount',
    'due_date',
    'deleted_at',
    'revoked_at',
    'preferred_contact',
    'allow_email',
    'allow_whatsapp',
    'allow_sms',
    'source'
  ] loop
    if p_row ? v_key then
      v_result := v_result || jsonb_build_object(v_key, p_row -> v_key);
    end if;
  end loop;

  return v_result;
end;
$$;

create or replace function app_private.audit_phase4_change()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_row jsonb;
  v_previous jsonb;
  v_current jsonb;
  v_actor_id uuid;
  v_resource_id uuid;
  v_organization_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_previous := case
    when tg_op in ('UPDATE', 'DELETE')
      then app_private.audit_metadata_summary(to_jsonb(old))
    else null
  end;
  v_current := case
    when tg_op in ('INSERT', 'UPDATE')
      then app_private.audit_metadata_summary(to_jsonb(new))
    else null
  end;
  v_actor_id := app_private.current_app_user_id();
  v_resource_id := nullif(v_row ->> 'id', '')::uuid;
  v_organization_id := nullif(v_row ->> 'organization_id', '')::uuid;

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
      v_organization_id,
      v_actor_id,
      lower(tg_table_name) || '.' || lower(tg_op),
      tg_table_name,
      v_resource_id,
      jsonb_strip_nulls(jsonb_build_object(
        'operation', lower(tg_op),
        'name', v_row ->> 'name',
        'previous', v_previous,
        'current', v_current
      ))
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function app_private.audit_patient_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_row jsonb;
  v_previous jsonb;
  v_current jsonb;
  v_actor_id uuid;
  v_resource_id uuid;
  v_patient_id uuid;
  v_organization_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_previous := case
    when tg_op in ('UPDATE', 'DELETE')
      then app_private.audit_metadata_summary(to_jsonb(old))
    else null
  end;
  v_current := case
    when tg_op in ('INSERT', 'UPDATE')
      then app_private.audit_metadata_summary(to_jsonb(new))
    else null
  end;
  v_actor_id := app_private.current_app_user_id();
  v_resource_id := nullif(v_row ->> 'id', '')::uuid;
  v_patient_id := coalesce(
    nullif(v_row ->> 'patient_id', '')::uuid,
    case when tg_table_name = 'patients' then v_resource_id else null end
  );
  v_organization_id := nullif(v_row ->> 'organization_id', '')::uuid;

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
      v_organization_id,
      v_actor_id,
      lower(tg_table_name) || '.' || lower(tg_op),
      tg_table_name,
      coalesce(v_patient_id, v_resource_id),
      jsonb_strip_nulls(jsonb_build_object(
        'operation', lower(tg_op),
        'patient_id', v_patient_id,
        'previous', v_previous,
        'current', v_current
      ))
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function app_private.audit_financial_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_row jsonb;
  v_previous jsonb;
  v_current jsonb;
  v_actor_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_previous := case
    when tg_op in ('UPDATE', 'DELETE')
      then app_private.audit_metadata_summary(to_jsonb(old))
    else null
  end;
  v_current := case
    when tg_op in ('INSERT', 'UPDATE')
      then app_private.audit_metadata_summary(to_jsonb(new))
    else null
  end;
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
      jsonb_strip_nulls(jsonb_build_object(
        'operation', lower(tg_op),
        'status', v_row ->> 'status',
        'amount', v_row ->> 'amount',
        'previous', v_previous,
        'current', v_current
      ))
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function app_private.audit_appointment_status_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    new.organization_id,
    new.actor_user_id,
    case
      when new.from_status is null then 'appointments.status_initialized'
      else 'appointments.status_changed'
    end,
    'appointments',
    new.appointment_id,
    jsonb_strip_nulls(jsonb_build_object(
      'appointment_id', new.appointment_id,
      'status_event_id', new.id,
      'from_status', new.from_status,
      'to_status', new.to_status,
      'reason', new.reason,
      'previous', case
        when new.from_status is null then null
        else jsonb_build_object('status', new.from_status)
      end,
      'current', jsonb_build_object('status', new.to_status)
    ))
  );

  return new;
end;
$$;

drop trigger if exists audit_appointment_status_event
  on public.appointment_status_events;
create trigger audit_appointment_status_event
after insert on public.appointment_status_events
for each row execute function app_private.audit_appointment_status_event();

insert into public.audit_logs (
  organization_id,
  actor_user_id,
  action,
  resource_type,
  resource_id,
  metadata,
  created_at
)
select
  status_events.organization_id,
  status_events.actor_user_id,
  case
    when status_events.from_status is null then 'appointments.status_initialized'
    else 'appointments.status_changed'
  end,
  'appointments',
  status_events.appointment_id,
  jsonb_strip_nulls(jsonb_build_object(
    'appointment_id', status_events.appointment_id,
    'status_event_id', status_events.id,
    'from_status', status_events.from_status,
    'to_status', status_events.to_status,
    'reason', status_events.reason,
    'previous', case
      when status_events.from_status is null then null
      else jsonb_build_object('status', status_events.from_status)
    end,
    'current', jsonb_build_object('status', status_events.to_status)
  )),
  status_events.created_at
from public.appointment_status_events status_events
where not exists (
  select 1
  from public.audit_logs audit
  where audit.action in (
      'appointments.status_initialized',
      'appointments.status_changed'
    )
    and audit.resource_type = 'appointments'
    and audit.resource_id = status_events.appointment_id
    and audit.metadata ->> 'status_event_id' = status_events.id::text
);

comment on function app_private.audit_metadata_summary(jsonb) is
  'Returns a conservative audit summary used in previous/current metadata.';
comment on function app_private.audit_appointment_status_event() is
  'Mirrors appointment status history into audit_logs with previous and current status.';
