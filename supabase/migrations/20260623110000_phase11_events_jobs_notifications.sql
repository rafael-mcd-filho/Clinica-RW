-- Phase 11: internal event log, job queue and notification outbox.

create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  aggregate_type text,
  aggregate_id uuid,
  actor_user_id uuid references public.app_users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp()
);

create index app_events_organization_occurred_at_idx
  on public.app_events (organization_id, occurred_at desc);
create index app_events_type_occurred_at_idx
  on public.app_events (event_type, occurred_at desc);

create table public.job_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default statement_timestamp(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  locked_at timestamptz,
  locked_by text,
  error_message text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index job_queue_pending_idx
  on public.job_queue (run_at, created_at)
  where status = 'pending';
create index job_queue_organization_status_idx
  on public.job_queue (organization_id, status, created_at desc);

create trigger set_job_queue_updated_at
before update on public.job_queue
for each row execute function app_private.set_updated_at();

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  name text not null,
  subject_template text not null default '',
  body_template text not null,
  variable_keys text[] not null default '{}',
  active boolean not null default true,
  is_system_default boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (organization_id, template_key, channel)
);

create trigger set_message_templates_updated_at
before update on public.message_templates
for each row execute function app_private.set_updated_at();

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid references public.app_events(id) on delete set null,
  template_id uuid references public.message_templates(id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  recipient text not null,
  subject text,
  body text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  scheduled_at timestamptz not null default statement_timestamp(),
  sent_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index notification_outbox_queue_idx
  on public.notification_outbox (scheduled_at, created_at)
  where status = 'queued';
create index notification_outbox_organization_status_idx
  on public.notification_outbox (organization_id, status, created_at desc);

create trigger set_notification_outbox_updated_at
before update on public.notification_outbox
for each row execute function app_private.set_updated_at();

create or replace function app_private.render_message_template(
  p_template text,
  p_variables jsonb
)
returns text
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_rendered text := coalesce(p_template, '');
  v_key text;
  v_value text;
begin
  for v_key, v_value in
    select key, value
    from jsonb_each_text(coalesce(p_variables, '{}'::jsonb))
  loop
    v_rendered := replace(v_rendered, '{{' || v_key || '}}', coalesce(v_value, ''));
  end loop;

  return v_rendered;
end;
$$;

create or replace function app_private.seed_automation_templates(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into public.message_templates (
    organization_id,
    template_key,
    channel,
    name,
    subject_template,
    body_template,
    variable_keys
  )
  values
    (
      p_organization_id,
      'online_booking_requested',
      'email',
      'Solicitacao online recebida',
      'Recebemos sua solicitacao de agendamento',
      'Ola {{patient_name}}, recebemos sua solicitacao para {{requested_start_at}}. A clinica ainda vai confirmar o horario. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'online_booking_requested',
      'whatsapp',
      'Solicitacao online recebida - WhatsApp',
      '',
      'Ola {{patient_name}}, recebemos sua solicitacao para {{requested_start_at}}. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'online_booking_confirmed',
      'email',
      'Agendamento confirmado',
      'Seu agendamento foi confirmado',
      'Ola {{patient_name}}, seu agendamento de {{requested_start_at}} foi confirmado. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'online_booking_confirmed',
      'whatsapp',
      'Agendamento confirmado - WhatsApp',
      '',
      'Ola {{patient_name}}, seu agendamento de {{requested_start_at}} foi confirmado. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'online_booking_rejected',
      'email',
      'Solicitacao nao confirmada',
      'Nao foi possivel confirmar seu horario',
      'Ola {{patient_name}}, nao foi possivel confirmar sua solicitacao de {{requested_start_at}}. {{review_notes}}',
      array['patient_name', 'requested_start_at', 'review_notes']
    ),
    (
      p_organization_id,
      'online_booking_rejected',
      'whatsapp',
      'Solicitacao nao confirmada - WhatsApp',
      '',
      'Ola {{patient_name}}, nao foi possivel confirmar sua solicitacao de {{requested_start_at}}. {{review_notes}}',
      array['patient_name', 'requested_start_at', 'review_notes']
    ),
    (
      p_organization_id,
      'online_booking_cancelled',
      'email',
      'Agendamento cancelado',
      'Seu agendamento foi cancelado',
      'Ola {{patient_name}}, seu agendamento de {{requested_start_at}} foi cancelado. {{review_notes}}',
      array['patient_name', 'requested_start_at', 'review_notes']
    ),
    (
      p_organization_id,
      'online_booking_cancelled',
      'whatsapp',
      'Agendamento cancelado - WhatsApp',
      '',
      'Ola {{patient_name}}, seu agendamento de {{requested_start_at}} foi cancelado. {{review_notes}}',
      array['patient_name', 'requested_start_at', 'review_notes']
    ),
    (
      p_organization_id,
      'online_booking_rescheduled',
      'email',
      'Solicitacao remarcada',
      'Sua solicitacao foi remarcada',
      'Ola {{patient_name}}, sua solicitacao agora esta para {{requested_start_at}}. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'online_booking_rescheduled',
      'whatsapp',
      'Solicitacao remarcada - WhatsApp',
      '',
      'Ola {{patient_name}}, sua solicitacao agora esta para {{requested_start_at}}. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'appointment_reminder',
      'whatsapp',
      'Lembrete de consulta',
      '',
      'Ola {{patient_name}}, lembramos do seu agendamento em {{appointment_start_at}}.',
      array['patient_name', 'appointment_start_at']
    ),
    (
      p_organization_id,
      'appointment_nps',
      'whatsapp',
      'NPS pos-atendimento',
      '',
      'Ola {{patient_name}}, como foi sua experiencia no atendimento de hoje? {{nps_link}}',
      array['patient_name', 'nps_link']
    ),
    (
      p_organization_id,
      'finance_payment_reminder',
      'whatsapp',
      'Lembrete de cobranca',
      '',
      'Ola {{patient_name}}, identificamos um pagamento pendente de {{amount}} com vencimento em {{due_date}}.',
      array['patient_name', 'amount', 'due_date']
    )
  on conflict (organization_id, template_key, channel)
  do update set
    name = excluded.name,
    subject_template = excluded.subject_template,
    body_template = excluded.body_template,
    variable_keys = excluded.variable_keys,
    updated_at = statement_timestamp();
end;
$$;

create or replace function app_private.seed_automation_templates_for_org()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  perform app_private.seed_automation_templates(new.id);
  return new;
end;
$$;

select app_private.seed_automation_templates(id)
from public.organizations;

drop trigger if exists seed_automation_templates_after_organization_insert
  on public.organizations;
create trigger seed_automation_templates_after_organization_insert
after insert on public.organizations
for each row execute function app_private.seed_automation_templates_for_org();

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

  return v_event_id;
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
declare
  v_template public.message_templates%rowtype;
  v_notification_id uuid;
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

  insert into public.notification_outbox (
    organization_id,
    event_id,
    template_id,
    channel,
    recipient,
    subject,
    body,
    scheduled_at,
    metadata
  ) values (
    p_organization_id,
    p_event_id,
    v_template.id,
    p_channel,
    trim(p_recipient),
    nullif(app_private.render_message_template(v_template.subject_template, p_variables), ''),
    app_private.render_message_template(v_template.body_template, p_variables),
    coalesce(p_scheduled_at, statement_timestamp()),
    jsonb_build_object(
      'template_key', p_template_key,
      'variables', coalesce(p_variables, '{}'::jsonb)
    )
  )
  returning id into v_notification_id;

  insert into public.job_queue (
    organization_id,
    job_type,
    payload,
    run_at
  ) values (
    p_organization_id,
    'send_notification',
    jsonb_build_object('notification_id', v_notification_id),
    coalesce(p_scheduled_at, statement_timestamp())
  );

  return v_notification_id;
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
begin
  select public_slug
    into v_public_slug
  from public.online_booking_settings
  where organization_id = p_request.organization_id
  limit 1;

  v_link := '/agendar/acompanhar/' || p_request.public_access_token::text;

  return jsonb_build_object(
    'patient_name', p_request.patient_name,
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
  v_template_key text;
  v_event_id uuid;
  v_channel text;
  v_recipient text;
  v_variables jsonb;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'online_booking.requested';
    v_template_key := 'online_booking_requested';
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      v_event_type := case new.status
        when 'confirmed' then 'online_booking.confirmed'
        when 'rejected' then 'online_booking.rejected'
        when 'cancelled' then 'online_booking.cancelled'
        else null
      end;
      v_template_key := case new.status
        when 'confirmed' then 'online_booking_confirmed'
        when 'rejected' then 'online_booking_rejected'
        when 'cancelled' then 'online_booking_cancelled'
        else null
      end;
    elsif new.status = 'requested'
      and (
        new.requested_start_at is distinct from old.requested_start_at
        or new.requested_end_at is distinct from old.requested_end_at
      ) then
      v_event_type := 'online_booking.rescheduled';
      v_template_key := 'online_booking_rescheduled';
    end if;
  end if;

  if v_event_type is null then
    return new;
  end if;

  v_variables := app_private.online_booking_request_variables(new);
  v_event_id := app_private.enqueue_app_event(
    new.organization_id,
    v_event_type,
    'online_booking_request',
    new.id,
    v_variables || jsonb_build_object('status', new.status),
    app_private.current_app_user_id()
  );

  if new.patient_email is not null then
    v_channel := 'email';
    v_recipient := new.patient_email::text;
  elsif new.patient_phone is not null then
    v_channel := 'whatsapp';
    v_recipient := new.patient_phone;
  end if;

  if v_channel is not null and v_template_key is not null then
    perform app_private.enqueue_notification(
      new.organization_id,
      v_event_id,
      v_template_key,
      v_channel,
      v_recipient,
      v_variables
    );
  end if;

  return new;
end;
$$;

drop trigger if exists enqueue_online_booking_request_automation_insert
  on public.online_booking_requests;
create trigger enqueue_online_booking_request_automation_insert
after insert on public.online_booking_requests
for each row execute function app_private.enqueue_online_booking_request_automation();

drop trigger if exists enqueue_online_booking_request_automation_update
  on public.online_booking_requests;
create trigger enqueue_online_booking_request_automation_update
after update on public.online_booking_requests
for each row execute function app_private.enqueue_online_booking_request_automation();

create or replace function public.claim_next_job(
  p_worker_id text default null,
  p_job_types text[] default null
)
returns setof public.job_queue
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  return query
  with next_job as (
    select id
    from public.job_queue
    where status = 'pending'
      and run_at <= statement_timestamp()
      and (p_job_types is null or job_type = any(p_job_types))
    order by run_at, created_at
    for update skip locked
    limit 1
  )
  update public.job_queue job
  set status = 'running',
      locked_at = statement_timestamp(),
      locked_by = nullif(trim(coalesce(p_worker_id, '')), ''),
      error_message = null
  from next_job
  where job.id = next_job.id
  returning job.*;
end;
$$;

create or replace function public.complete_job(
  p_job_id uuid,
  p_success boolean,
  p_error_message text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_job public.job_queue%rowtype;
  v_next_attempts integer;
  v_notification_id uuid;
  v_next_status text;
begin
  select *
    into v_job
  from public.job_queue
  where id = p_job_id
  for update;

  if v_job.id is null then
    raise exception 'Job not found.' using errcode = 'P0002';
  end if;

  if v_job.status <> 'running' then
    raise exception 'Only running jobs can be completed.' using errcode = '23514';
  end if;

  v_notification_id := nullif(v_job.payload ->> 'notification_id', '')::uuid;

  if coalesce(p_success, false) then
    update public.job_queue
    set status = 'succeeded',
        locked_at = null,
        locked_by = null,
        error_message = null
    where id = v_job.id;

    if v_job.job_type = 'send_notification' and v_notification_id is not null then
      update public.notification_outbox
      set status = 'sent',
          sent_at = statement_timestamp(),
          error_message = null
      where id = v_notification_id;
    end if;

    return 'succeeded';
  end if;

  v_next_attempts := v_job.attempts + 1;
  v_next_status := case
    when v_next_attempts >= v_job.max_attempts then 'failed'
    else 'pending'
  end;

  update public.job_queue
  set status = v_next_status,
      attempts = v_next_attempts,
      run_at = case
        when v_next_status = 'pending'
          then statement_timestamp() + make_interval(mins => power(2, least(v_next_attempts, 6))::integer)
        else run_at
      end,
      locked_at = null,
      locked_by = null,
      error_message = nullif(trim(coalesce(p_error_message, '')), '')
  where id = v_job.id;

  if v_job.job_type = 'send_notification' and v_notification_id is not null then
    update public.notification_outbox
    set status = case when v_next_status = 'failed' then 'failed' else 'queued' end,
        attempts = v_next_attempts,
        error_message = nullif(trim(coalesce(p_error_message, '')), '')
    where id = v_notification_id;
  end if;

  return v_next_status;
end;
$$;

revoke all on function public.claim_next_job(text, text[]) from public;
revoke all on function public.complete_job(uuid, boolean, text) from public;
grant execute on function public.claim_next_job(text, text[]) to service_role;
grant execute on function public.complete_job(uuid, boolean, text) to service_role;

alter table public.app_events enable row level security;
alter table public.job_queue enable row level security;
alter table public.message_templates enable row level security;
alter table public.notification_outbox enable row level security;

create policy app_events_select_automation on public.app_events
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

create policy job_queue_select_automation on public.job_queue
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

create policy message_templates_select_automation on public.message_templates
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

create policy message_templates_manage_automation on public.message_templates
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('automacao.criar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('automacao.criar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

create policy notification_outbox_select_automation on public.notification_outbox
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

grant select on
  public.app_events,
  public.job_queue,
  public.notification_outbox
to authenticated;

grant select, insert, update, delete on public.message_templates to authenticated;

grant all on
  public.app_events,
  public.job_queue,
  public.message_templates,
  public.notification_outbox
to service_role;

comment on table public.app_events is
  'Internal immutable event log used by automations and operational history.';
comment on table public.job_queue is
  'Durable job queue for workers such as notification delivery.';
comment on table public.notification_outbox is
  'Rendered notification messages waiting for an external provider.';
