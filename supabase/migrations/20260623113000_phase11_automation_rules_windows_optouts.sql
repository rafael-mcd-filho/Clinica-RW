-- Phase 11 extension: configurable automation rules, send windows and opt-out.

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_key text not null,
  name text not null,
  event_type text not null,
  conditions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(conditions) = 'object'),
  action_type text not null default 'send_notification'
    check (action_type in ('send_notification', 'enqueue_job')),
  action_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(action_config) = 'object'),
  schedule_delay_minutes integer not null default 0
    check (schedule_delay_minutes between 0 and 43200),
  send_window_start time,
  send_window_end time,
  timezone text not null default 'America/Fortaleza',
  respect_opt_out boolean not null default true,
  active boolean not null default true,
  is_system_default boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, rule_key),
  check (
    (send_window_start is null and send_window_end is null)
    or (
      send_window_start is not null
      and send_window_end is not null
      and send_window_start < send_window_end
    )
  )
);

create index automation_rules_event_active_idx
  on public.automation_rules (organization_id, event_type)
  where active;

create trigger set_automation_rules_updated_at
before update on public.automation_rules
for each row execute function app_private.set_updated_at();

alter table public.notification_outbox
  add column automation_rule_id uuid
    references public.automation_rules(id) on delete set null;

create index notification_outbox_automation_rule_idx
  on public.notification_outbox (organization_id, automation_rule_id, created_at desc)
  where automation_rule_id is not null;

create table public.communication_opt_outs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  recipient text not null,
  normalized_recipient text not null,
  reason text,
  source text not null default 'manual'
    check (source in ('manual', 'patient_portal', 'provider', 'import')),
  opted_out_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  check (revoked_at is null or revoked_at >= opted_out_at),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete set null (patient_id),
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id) on delete set null (created_by_user_id)
);

create unique index communication_opt_outs_active_recipient_key
  on public.communication_opt_outs (organization_id, channel, normalized_recipient)
  where revoked_at is null;

create index communication_opt_outs_patient_idx
  on public.communication_opt_outs (organization_id, patient_id, opted_out_at desc)
  where patient_id is not null;

create or replace function app_private.normalize_communication_recipient(
  p_channel text,
  p_recipient text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when lower(trim(coalesce(p_channel, ''))) = 'email'
      then lower(trim(coalesce(p_recipient, '')))
    else regexp_replace(coalesce(p_recipient, ''), '[^0-9]+', '', 'g')
  end
$$;

create or replace function app_private.set_communication_opt_out_normalized()
returns trigger
language plpgsql
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

create trigger set_communication_opt_out_normalized
before insert or update of channel, recipient on public.communication_opt_outs
for each row execute function app_private.set_communication_opt_out_normalized();

create trigger set_communication_opt_outs_updated_at
before update on public.communication_opt_outs
for each row execute function app_private.set_updated_at();

create or replace function app_private.recipient_has_opted_out(
  p_organization_id uuid,
  p_channel text,
  p_recipient text
)
returns boolean
language sql
stable
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.communication_opt_outs opt_outs
    where opt_outs.organization_id = p_organization_id
      and opt_outs.channel = p_channel
      and opt_outs.normalized_recipient =
        app_private.normalize_communication_recipient(p_channel, p_recipient)
      and opt_outs.revoked_at is null
  )
$$;

create or replace function app_private.apply_send_window(
  p_requested_at timestamptz,
  p_window_start time,
  p_window_end time,
  p_timezone text
)
returns timestamptz
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_timezone text := coalesce(nullif(trim(p_timezone), ''), 'America/Fortaleza');
  v_local timestamp;
  v_local_time time;
  v_target_local timestamp;
begin
  if p_requested_at is null
    or p_window_start is null
    or p_window_end is null
    or p_window_start >= p_window_end then
    return p_requested_at;
  end if;

  v_local := p_requested_at at time zone v_timezone;
  v_local_time := v_local::time;

  if v_local_time < p_window_start then
    v_target_local := v_local::date + p_window_start;
  elsif v_local_time >= p_window_end then
    v_target_local := (v_local::date + 1) + p_window_start;
  else
    return p_requested_at;
  end if;

  return v_target_local at time zone v_timezone;
exception
  when invalid_parameter_value then
    return p_requested_at;
end;
$$;

create or replace function app_private.automation_condition_matches(
  p_payload jsonb,
  p_conditions jsonb
)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(
    bool_and(coalesce(p_payload ->> condition.key, '') = condition.value),
    true
  )
  from jsonb_each_text(coalesce(p_conditions, '{}'::jsonb)) as condition(key, value)
$$;

create or replace function app_private.enqueue_notification_with_options(
  p_organization_id uuid,
  p_event_id uuid,
  p_template_key text,
  p_channel text,
  p_recipient text,
  p_variables jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default statement_timestamp(),
  p_respect_opt_out boolean default true,
  p_automation_rule_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_template public.message_templates%rowtype;
  v_notification_id uuid;
  v_scheduled_at timestamptz := coalesce(p_scheduled_at, statement_timestamp());
  v_opted_out boolean := false;
begin
  if nullif(trim(coalesce(p_recipient, '')), '') is null then
    return null;
  end if;

  select *
    into v_template
  from public.message_templates
  where organization_id = p_organization_id
    and template_key = p_template_key
    and channel = p_channel
    and active
  limit 1;

  if v_template.id is null then
    return null;
  end if;

  v_opted_out := coalesce(p_respect_opt_out, true)
    and app_private.recipient_has_opted_out(
      p_organization_id,
      p_channel,
      p_recipient
    );

  insert into public.notification_outbox (
    organization_id,
    event_id,
    automation_rule_id,
    template_id,
    channel,
    recipient,
    subject,
    body,
    status,
    scheduled_at,
    metadata
  ) values (
    p_organization_id,
    p_event_id,
    p_automation_rule_id,
    v_template.id,
    p_channel,
    trim(p_recipient),
    nullif(app_private.render_message_template(v_template.subject_template, p_variables), ''),
    app_private.render_message_template(v_template.body_template, p_variables),
    case when v_opted_out then 'skipped' else 'queued' end,
    v_scheduled_at,
    jsonb_build_object(
      'template_key', p_template_key,
      'variables', coalesce(p_variables, '{}'::jsonb),
      'automation_rule_id', p_automation_rule_id,
      'opted_out', v_opted_out
    )
  )
  returning id into v_notification_id;

  if not v_opted_out then
    insert into public.job_queue (
      organization_id,
      job_type,
      payload,
      run_at
    ) values (
      p_organization_id,
      'send_notification',
      jsonb_build_object('notification_id', v_notification_id),
      v_scheduled_at
    );
  end if;

  return v_notification_id;
end;
$$;

create or replace function app_private.enqueue_notification(
  p_organization_id uuid,
  p_event_id uuid,
  p_template_key text,
  p_channel text,
  p_recipient text,
  p_variables jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default statement_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  return app_private.enqueue_notification_with_options(
    p_organization_id,
    p_event_id,
    p_template_key,
    p_channel,
    p_recipient,
    p_variables,
    p_scheduled_at,
    true,
    null
  );
end;
$$;

create or replace function app_private.process_app_event(
  p_event_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event public.app_events%rowtype;
  v_rule public.automation_rules%rowtype;
  v_config jsonb;
  v_recipient text;
  v_template_key text;
  v_channel text;
  v_job_type text;
  v_scheduled_at timestamptz;
  v_processed integer := 0;
begin
  select *
    into v_event
  from public.app_events
  where id = p_event_id;

  if v_event.id is null then
    return 0;
  end if;

  for v_rule in
    select *
    from public.automation_rules
    where organization_id = v_event.organization_id
      and event_type = v_event.event_type
      and active
    order by created_at, id
  loop
    if not app_private.automation_condition_matches(
      v_event.payload,
      v_rule.conditions
    ) then
      continue;
    end if;

    v_config := coalesce(v_rule.action_config, '{}'::jsonb);
    v_scheduled_at := app_private.apply_send_window(
      statement_timestamp() + make_interval(mins => v_rule.schedule_delay_minutes),
      v_rule.send_window_start,
      v_rule.send_window_end,
      v_rule.timezone
    );

    if v_rule.action_type = 'send_notification' then
      v_template_key := nullif(trim(coalesce(v_config ->> 'template_key', '')), '');
      v_channel := nullif(trim(coalesce(v_config ->> 'channel', '')), '');
      v_recipient := nullif(
        trim(coalesce(v_event.payload ->> coalesce(
          nullif(trim(coalesce(v_config ->> 'recipient_path', '')), ''),
          'recipient'
        ), '')),
        ''
      );

      if v_template_key is null or v_channel is null or v_recipient is null then
        continue;
      end if;

      perform app_private.enqueue_notification_with_options(
        v_event.organization_id,
        v_event.id,
        v_template_key,
        v_channel,
        v_recipient,
        v_event.payload,
        v_scheduled_at,
        v_rule.respect_opt_out,
        v_rule.id
      );
      v_processed := v_processed + 1;
    elsif v_rule.action_type = 'enqueue_job' then
      v_job_type := nullif(trim(coalesce(v_config ->> 'job_type', '')), '');

      if v_job_type is null then
        continue;
      end if;

      insert into public.job_queue (
        organization_id,
        job_type,
        payload,
        run_at
      ) values (
        v_event.organization_id,
        v_job_type,
        coalesce(v_config -> 'payload', '{}'::jsonb) || jsonb_build_object(
          'event_id', v_event.id,
          'automation_rule_id', v_rule.id
        ),
        v_scheduled_at
      );
      v_processed := v_processed + 1;
    end if;
  end loop;

  return v_processed;
end;
$$;

create or replace function app_private.enqueue_app_event(
  p_organization_id uuid,
  p_event_type text,
  p_aggregate_type text default null,
  p_aggregate_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event_id uuid;
begin
  insert into public.app_events (
    organization_id,
    event_type,
    aggregate_type,
    aggregate_id,
    actor_user_id,
    payload
  ) values (
    p_organization_id,
    p_event_type,
    nullif(trim(coalesce(p_aggregate_type, '')), ''),
    p_aggregate_id,
    p_actor_user_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  perform app_private.process_app_event(v_event_id);

  return v_event_id;
end;
$$;

create or replace function app_private.online_booking_request_variables(
  p_request public.online_booking_requests
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_public_slug text;
  v_link text;
  v_email text;
  v_phone text;
begin
  select public_slug
    into v_public_slug
  from public.online_booking_settings
  where organization_id = p_request.organization_id
  limit 1;

  v_link := '/agendar/acompanhar/' || p_request.public_access_token::text;
  v_email := nullif(trim(coalesce(p_request.patient_email::text, '')), '');
  v_phone := nullif(trim(coalesce(p_request.patient_phone, '')), '');

  return jsonb_build_object(
    'patient_name', p_request.patient_name,
    'patient_email', coalesce(v_email, ''),
    'patient_phone', coalesce(v_phone, ''),
    'primary_channel', case
      when v_email is not null then 'email'
      when v_phone is not null then 'whatsapp'
      else ''
    end,
    'requested_start_at', to_char(
      p_request.requested_start_at at time zone 'America/Fortaleza',
      'DD/MM/YYYY HH24:MI'
    ),
    'request_link', v_link,
    'public_slug', coalesce(v_public_slug, ''),
    'review_notes', coalesce(p_request.review_notes, '')
  );
end;
$$;

create or replace function app_private.enqueue_online_booking_request_automation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_event_type text;
  v_variables jsonb;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'online_booking.requested';
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      v_event_type := case new.status
        when 'confirmed' then 'online_booking.confirmed'
        when 'rejected' then 'online_booking.rejected'
        when 'cancelled' then 'online_booking.cancelled'
        else null
      end;
    elsif new.status = 'requested'
      and (
        new.requested_start_at is distinct from old.requested_start_at
        or new.requested_end_at is distinct from old.requested_end_at
      ) then
      v_event_type := 'online_booking.rescheduled';
    end if;
  end if;

  if v_event_type is null then
    return new;
  end if;

  v_variables := app_private.online_booking_request_variables(new);

  perform app_private.enqueue_app_event(
    new.organization_id,
    v_event_type,
    'online_booking_request',
    new.id,
    v_variables || jsonb_build_object('status', new.status),
    app_private.current_app_user_id()
  );

  return new;
end;
$$;

create or replace function app_private.seed_automation_rules(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into public.automation_rules (
    organization_id,
    rule_key,
    name,
    event_type,
    conditions,
    action_type,
    action_config,
    schedule_delay_minutes,
    send_window_start,
    send_window_end,
    timezone,
    respect_opt_out,
    is_system_default
  )
  values
    (
      p_organization_id,
      'online_booking_requested_email',
      'Solicitacao online recebida por e-mail',
      'online_booking.requested',
      '{"primary_channel": "email"}'::jsonb,
      'send_notification',
      '{"template_key": "online_booking_requested", "channel": "email", "recipient_path": "patient_email"}'::jsonb,
      0,
      null,
      null,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'online_booking_requested_whatsapp',
      'Solicitacao online recebida por WhatsApp',
      'online_booking.requested',
      '{"primary_channel": "whatsapp"}'::jsonb,
      'send_notification',
      '{"template_key": "online_booking_requested", "channel": "whatsapp", "recipient_path": "patient_phone"}'::jsonb,
      0,
      null,
      null,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'online_booking_confirmed_email',
      'Agendamento online confirmado por e-mail',
      'online_booking.confirmed',
      '{"primary_channel": "email"}'::jsonb,
      'send_notification',
      '{"template_key": "online_booking_confirmed", "channel": "email", "recipient_path": "patient_email"}'::jsonb,
      0,
      null,
      null,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'online_booking_confirmed_whatsapp',
      'Agendamento online confirmado por WhatsApp',
      'online_booking.confirmed',
      '{"primary_channel": "whatsapp"}'::jsonb,
      'send_notification',
      '{"template_key": "online_booking_confirmed", "channel": "whatsapp", "recipient_path": "patient_phone"}'::jsonb,
      0,
      null,
      null,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'online_booking_rejected_email',
      'Solicitacao online rejeitada por e-mail',
      'online_booking.rejected',
      '{"primary_channel": "email"}'::jsonb,
      'send_notification',
      '{"template_key": "online_booking_rejected", "channel": "email", "recipient_path": "patient_email"}'::jsonb,
      0,
      null,
      null,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'online_booking_rejected_whatsapp',
      'Solicitacao online rejeitada por WhatsApp',
      'online_booking.rejected',
      '{"primary_channel": "whatsapp"}'::jsonb,
      'send_notification',
      '{"template_key": "online_booking_rejected", "channel": "whatsapp", "recipient_path": "patient_phone"}'::jsonb,
      0,
      null,
      null,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'online_booking_cancelled_email',
      'Agendamento online cancelado por e-mail',
      'online_booking.cancelled',
      '{"primary_channel": "email"}'::jsonb,
      'send_notification',
      '{"template_key": "online_booking_cancelled", "channel": "email", "recipient_path": "patient_email"}'::jsonb,
      0,
      null,
      null,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'online_booking_cancelled_whatsapp',
      'Agendamento online cancelado por WhatsApp',
      'online_booking.cancelled',
      '{"primary_channel": "whatsapp"}'::jsonb,
      'send_notification',
      '{"template_key": "online_booking_cancelled", "channel": "whatsapp", "recipient_path": "patient_phone"}'::jsonb,
      0,
      null,
      null,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'online_booking_rescheduled_email',
      'Solicitacao online remarcada por e-mail',
      'online_booking.rescheduled',
      '{"primary_channel": "email"}'::jsonb,
      'send_notification',
      '{"template_key": "online_booking_rescheduled", "channel": "email", "recipient_path": "patient_email"}'::jsonb,
      0,
      null,
      null,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'online_booking_rescheduled_whatsapp',
      'Solicitacao online remarcada por WhatsApp',
      'online_booking.rescheduled',
      '{"primary_channel": "whatsapp"}'::jsonb,
      'send_notification',
      '{"template_key": "online_booking_rescheduled", "channel": "whatsapp", "recipient_path": "patient_phone"}'::jsonb,
      0,
      null,
      null,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'appointment_reminder_whatsapp',
      'Lembrete de consulta por WhatsApp',
      'appointment.reminder_due',
      '{}'::jsonb,
      'send_notification',
      '{"template_key": "appointment_reminder", "channel": "whatsapp", "recipient_path": "patient_phone"}'::jsonb,
      0,
      '08:00'::time,
      '20:00'::time,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'appointment_nps_whatsapp',
      'NPS pos-atendimento por WhatsApp',
      'appointment.completed',
      '{}'::jsonb,
      'send_notification',
      '{"template_key": "appointment_nps", "channel": "whatsapp", "recipient_path": "patient_phone"}'::jsonb,
      60,
      '08:00'::time,
      '20:00'::time,
      'America/Fortaleza',
      true,
      true
    ),
    (
      p_organization_id,
      'finance_payment_reminder_whatsapp',
      'Lembrete de cobranca por WhatsApp',
      'finance.receivable_due',
      '{}'::jsonb,
      'send_notification',
      '{"template_key": "finance_payment_reminder", "channel": "whatsapp", "recipient_path": "patient_phone"}'::jsonb,
      0,
      '08:00'::time,
      '20:00'::time,
      'America/Fortaleza',
      true,
      true
    )
  on conflict (organization_id, rule_key)
  do update set
    name = excluded.name,
    event_type = excluded.event_type,
    conditions = excluded.conditions,
    action_type = excluded.action_type,
    action_config = excluded.action_config,
    schedule_delay_minutes = excluded.schedule_delay_minutes,
    send_window_start = excluded.send_window_start,
    send_window_end = excluded.send_window_end,
    timezone = excluded.timezone,
    respect_opt_out = excluded.respect_opt_out,
    is_system_default = excluded.is_system_default,
    updated_at = statement_timestamp();
end;
$$;

select app_private.seed_automation_rules(id)
from public.organizations;

create or replace function app_private.seed_automation_templates_for_org()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  perform app_private.seed_automation_templates(new.id);
  perform app_private.seed_automation_rules(new.id);
  return new;
end;
$$;

with admin_profiles as (
  select id
  from public.profiles
  where name = 'Administrador'
    and is_system_default
),
automation_permissions as (
  select id
  from public.permissions
  where code in ('automacao.ver', 'automacao.criar', 'automacao.ativar')
)
insert into public.profile_permissions (profile_id, permission_id)
select admin_profiles.id, automation_permissions.id
from admin_profiles
cross join automation_permissions
on conflict do nothing;

alter table public.automation_rules enable row level security;
alter table public.communication_opt_outs enable row level security;

create policy automation_rules_select_automation on public.automation_rules
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('automacao.ver')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

create policy automation_rules_manage_automation on public.automation_rules
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('automacao.criar')
      or app_private.current_user_has_permission('automacao.ativar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('automacao.criar')
      or app_private.current_user_has_permission('automacao.ativar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

create policy communication_opt_outs_select_automation on public.communication_opt_outs
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('automacao.ver')
      or app_private.current_user_has_permission('config.geral')
      or app_private.current_user_has_permission('paciente.ver')
    )
  )
);

create policy communication_opt_outs_manage_automation on public.communication_opt_outs
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('automacao.criar')
      or app_private.current_user_has_permission('config.geral')
      or app_private.current_user_has_permission('paciente.editar')
    )
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('automacao.criar')
      or app_private.current_user_has_permission('config.geral')
      or app_private.current_user_has_permission('paciente.editar')
    )
  )
);

grant select, insert, update, delete on
  public.automation_rules,
  public.communication_opt_outs
to authenticated;

grant all on
  public.automation_rules,
  public.communication_opt_outs
to service_role;

comment on table public.automation_rules is
  'Tenant-scoped event automation rules with simple conditions and actions.';
comment on table public.communication_opt_outs is
  'Tenant-scoped communication opt-outs used by notification automation.';
comment on function app_private.process_app_event(uuid) is
  'Evaluates active automation rules for one app event and enqueues actions.';
