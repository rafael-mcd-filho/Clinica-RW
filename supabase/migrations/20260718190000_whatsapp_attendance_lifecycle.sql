-- Transactional WhatsApp attendance lifecycle.
--
-- A conversation is unowned while pending. Claiming or transferring it opens
-- an immutable attendance session; completing it closes the active session;
-- reopening it returns it to the unowned queue. Lifecycle mutations are
-- exposed only through security-definer RPCs (or trusted service-role writes).

-- ---------------------------------------------------------------------------
-- Lifecycle history
-- ---------------------------------------------------------------------------

create table public.whatsapp_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null,
  attendant_user_id uuid,
  started_by_user_id uuid,
  ended_by_user_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason in ('transferred', 'completed', 'reopened')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, conversation_id)
    references public.whatsapp_conversations(organization_id, id) on delete cascade,
  foreign key (organization_id, attendant_user_id)
    references public.app_users(organization_id, id) on delete set null (attendant_user_id),
  foreign key (organization_id, started_by_user_id)
    references public.app_users(organization_id, id) on delete set null (started_by_user_id),
  foreign key (organization_id, ended_by_user_id)
    references public.app_users(organization_id, id) on delete set null (ended_by_user_id),
  constraint whatsapp_attendance_sessions_end_after_start check (
    ended_at is null or ended_at >= started_at
  ),
  constraint whatsapp_attendance_sessions_end_state_check check (
    (ended_at is null and end_reason is null)
    or (ended_at is not null and end_reason is not null)
  )
);

create unique index whatsapp_attendance_sessions_one_active_idx
  on public.whatsapp_attendance_sessions (organization_id, conversation_id)
  where ended_at is null;

create index whatsapp_attendance_sessions_conversation_idx
  on public.whatsapp_attendance_sessions (
    organization_id,
    conversation_id,
    started_at desc
  );

create index whatsapp_attendance_sessions_attendant_idx
  on public.whatsapp_attendance_sessions (
    organization_id,
    attendant_user_id,
    started_at desc
  );

create table public.whatsapp_attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null,
  session_id uuid,
  event_type text not null
    check (event_type in ('started', 'transferred', 'completed', 'reopened')),
  actor_user_id uuid,
  from_user_id uuid,
  to_user_id uuid,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, conversation_id)
    references public.whatsapp_conversations(organization_id, id) on delete cascade,
  foreign key (organization_id, session_id)
    references public.whatsapp_attendance_sessions(organization_id, id)
    on delete set null (session_id),
  foreign key (organization_id, actor_user_id)
    references public.app_users(organization_id, id) on delete set null (actor_user_id),
  foreign key (organization_id, from_user_id)
    references public.app_users(organization_id, id) on delete set null (from_user_id),
  foreign key (organization_id, to_user_id)
    references public.app_users(organization_id, id) on delete set null (to_user_id),
  constraint whatsapp_attendance_events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index whatsapp_attendance_events_conversation_idx
  on public.whatsapp_attendance_events (
    organization_id,
    conversation_id,
    occurred_at desc,
    id desc
  );

create index whatsapp_attendance_events_actor_idx
  on public.whatsapp_attendance_events (
    organization_id,
    actor_user_id,
    occurred_at desc
  );

-- "Novos" is, by definition, the unowned queue. Normalize historical rows
-- before making that invariant structural.
update public.whatsapp_conversations
set assigned_user_id = null
where status = 'pending'
  and assigned_user_id is not null;

update public.whatsapp_conversations
set status = 'pending',
    assigned_user_id = null
where status = 'open'
  and assigned_user_id is null;

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_pending_unassigned_check
  check (status <> 'pending' or assigned_user_id is null),
  add constraint whatsapp_conversations_open_assigned_check
  check (status <> 'open' or assigned_user_id is not null);

create or replace function app_private.normalize_whatsapp_pending_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if new.status = 'pending' then
    new.assigned_user_id := null;
  end if;

  return new;
end;
$$;

create trigger normalize_whatsapp_pending_assignment
before insert or update of status, assigned_user_id
on public.whatsapp_conversations
for each row execute function app_private.normalize_whatsapp_pending_assignment();

-- ---------------------------------------------------------------------------
-- Row-level security: tenant reads, no direct client mutations
-- ---------------------------------------------------------------------------

alter table public.whatsapp_attendance_sessions enable row level security;
alter table public.whatsapp_attendance_events enable row level security;

create policy whatsapp_attendance_sessions_select
on public.whatsapp_attendance_sessions
for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('atendimento.ver')
      or app_private.current_user_has_permission('atendimento.atender')
      or app_private.current_user_has_permission('atendimento.configurar')
    )
  )
);

create policy whatsapp_attendance_events_select
on public.whatsapp_attendance_events
for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('atendimento.ver')
      or app_private.current_user_has_permission('atendimento.atender')
      or app_private.current_user_has_permission('atendimento.configurar')
    )
  )
);

revoke all on table public.whatsapp_attendance_sessions
  from public, anon, authenticated;
revoke all on table public.whatsapp_attendance_events
  from public, anon, authenticated;
grant select on table public.whatsapp_attendance_sessions to authenticated;
grant select on table public.whatsapp_attendance_events to authenticated;
grant all on table public.whatsapp_attendance_sessions to service_role;
grant all on table public.whatsapp_attendance_events to service_role;

-- Keep ordinary conversation metadata editable, but force status/ownership
-- transitions through the RPCs below. Trusted service-role ingestion keeps its
-- table privileges and is tracked by the lifecycle trigger installed later.
revoke insert, update, delete on table public.whatsapp_conversations
  from authenticated;
revoke insert, update, delete on table public.whatsapp_messages
  from authenticated;

-- ---------------------------------------------------------------------------
-- Historical backfill (idempotent guards make repair/replay safe)
-- ---------------------------------------------------------------------------

insert into public.whatsapp_attendance_sessions (
  organization_id,
  conversation_id,
  attendant_user_id,
  started_by_user_id,
  started_at
)
select
  conversations.organization_id,
  conversations.id,
  conversations.assigned_user_id,
  conversations.assigned_user_id,
  coalesce(
    conversations.last_message_at,
    conversations.updated_at,
    conversations.created_at
  )
from public.whatsapp_conversations as conversations
where conversations.status = 'open'
  and conversations.assigned_user_id is not null
  and not exists (
    select 1
    from public.whatsapp_attendance_sessions as sessions
    where sessions.organization_id = conversations.organization_id
      and sessions.conversation_id = conversations.id
      and sessions.ended_at is null
  );

insert into public.whatsapp_attendance_sessions (
  organization_id,
  conversation_id,
  attendant_user_id,
  started_by_user_id,
  ended_by_user_id,
  started_at,
  ended_at,
  end_reason
)
select
  conversations.organization_id,
  conversations.id,
  conversations.assigned_user_id,
  conversations.assigned_user_id,
  conversations.assigned_user_id,
  least(conversations.created_at, conversations.updated_at),
  greatest(conversations.created_at, conversations.updated_at),
  'completed'
from public.whatsapp_conversations as conversations
where conversations.status = 'resolved'
  and conversations.assigned_user_id is not null
  and not exists (
    select 1
    from public.whatsapp_attendance_sessions as sessions
    where sessions.organization_id = conversations.organization_id
      and sessions.conversation_id = conversations.id
  );

insert into public.whatsapp_attendance_events (
  organization_id,
  conversation_id,
  session_id,
  event_type,
  actor_user_id,
  to_user_id,
  occurred_at,
  metadata
)
select
  conversations.organization_id,
  conversations.id,
  sessions.id,
  'started',
  conversations.assigned_user_id,
  conversations.assigned_user_id,
  coalesce(sessions.started_at, conversations.updated_at, conversations.created_at),
  jsonb_build_object('backfilled', true)
from public.whatsapp_conversations as conversations
left join lateral (
  select attendance_sessions.id, attendance_sessions.started_at
  from public.whatsapp_attendance_sessions as attendance_sessions
  where attendance_sessions.organization_id = conversations.organization_id
    and attendance_sessions.conversation_id = conversations.id
  order by attendance_sessions.started_at desc, attendance_sessions.id desc
  limit 1
) as sessions on true
where conversations.status = 'open'
  and not exists (
    select 1
    from public.whatsapp_attendance_events as events
    where events.organization_id = conversations.organization_id
      and events.conversation_id = conversations.id
      and events.event_type = 'started'
  );

insert into public.whatsapp_attendance_events (
  organization_id,
  conversation_id,
  session_id,
  event_type,
  actor_user_id,
  from_user_id,
  occurred_at,
  metadata
)
select
  conversations.organization_id,
  conversations.id,
  sessions.id,
  'completed',
  conversations.assigned_user_id,
  conversations.assigned_user_id,
  conversations.updated_at,
  jsonb_build_object('backfilled', true)
from public.whatsapp_conversations as conversations
left join lateral (
  select attendance_sessions.id
  from public.whatsapp_attendance_sessions as attendance_sessions
  where attendance_sessions.organization_id = conversations.organization_id
    and attendance_sessions.conversation_id = conversations.id
  order by attendance_sessions.started_at desc, attendance_sessions.id desc
  limit 1
) as sessions on true
where conversations.status = 'resolved'
  and not exists (
    select 1
    from public.whatsapp_attendance_events as events
    where events.organization_id = conversations.organization_id
      and events.conversation_id = conversations.id
      and events.event_type = 'completed'
  );

-- ---------------------------------------------------------------------------
-- Track trusted direct writes (webhooks/jobs) without duplicating RPC events
-- ---------------------------------------------------------------------------

create or replace function app_private.track_whatsapp_attendance_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_session_id uuid;
  v_previous_user_id uuid;
  v_now timestamptz := statement_timestamp();
begin
  if current_setting('app.whatsapp_lifecycle_managed', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'open' and new.assigned_user_id is not null then
      insert into public.whatsapp_attendance_sessions (
        organization_id,
        conversation_id,
        attendant_user_id,
        started_at
      )
      values (
        new.organization_id,
        new.id,
        new.assigned_user_id,
        coalesce(new.updated_at, new.created_at, v_now)
      )
      returning id into v_session_id;

      insert into public.whatsapp_attendance_events (
        organization_id,
        conversation_id,
        session_id,
        event_type,
        to_user_id,
        occurred_at,
        metadata
      )
      values (
        new.organization_id,
        new.id,
        v_session_id,
        'started',
        new.assigned_user_id,
        coalesce(new.updated_at, new.created_at, v_now),
        jsonb_build_object('source', 'service_role')
      );
    elsif new.status = 'resolved' then
      if new.assigned_user_id is not null then
        insert into public.whatsapp_attendance_sessions (
          organization_id,
          conversation_id,
          attendant_user_id,
          started_at,
          ended_at,
          end_reason
        )
        values (
          new.organization_id,
          new.id,
          new.assigned_user_id,
          coalesce(new.created_at, v_now),
          greatest(coalesce(new.created_at, v_now), coalesce(new.updated_at, v_now)),
          'completed'
        )
        returning id into v_session_id;
      end if;

      insert into public.whatsapp_attendance_events (
        organization_id,
        conversation_id,
        session_id,
        event_type,
        from_user_id,
        occurred_at,
        metadata
      )
      values (
        new.organization_id,
        new.id,
        v_session_id,
        'completed',
        new.assigned_user_id,
        coalesce(new.updated_at, new.created_at, v_now),
        jsonb_build_object('source', 'service_role')
      );
    end if;

    return new;
  end if;

  v_previous_user_id := old.assigned_user_id;

  if new.status = 'pending' and old.status <> 'pending' then
    update public.whatsapp_attendance_sessions
    set ended_at = greatest(started_at, v_now),
        ended_by_user_id = null,
        end_reason = 'reopened'
    where organization_id = new.organization_id
      and conversation_id = new.id
      and ended_at is null
    returning id into v_session_id;

    insert into public.whatsapp_attendance_events (
      organization_id,
      conversation_id,
      session_id,
      event_type,
      from_user_id,
      occurred_at,
      metadata
    )
    values (
      new.organization_id,
      new.id,
      v_session_id,
      'reopened',
      v_previous_user_id,
      v_now,
      jsonb_build_object('source', 'service_role')
    );
  elsif new.status = 'resolved' and old.status <> 'resolved' then
    update public.whatsapp_attendance_sessions
    set ended_at = greatest(started_at, v_now),
        ended_by_user_id = null,
        end_reason = 'completed'
    where organization_id = new.organization_id
      and conversation_id = new.id
      and ended_at is null
    returning id into v_session_id;

    insert into public.whatsapp_attendance_events (
      organization_id,
      conversation_id,
      session_id,
      event_type,
      from_user_id,
      occurred_at,
      metadata
    )
    values (
      new.organization_id,
      new.id,
      v_session_id,
      'completed',
      v_previous_user_id,
      v_now,
      jsonb_build_object('source', 'service_role')
    );
  elsif new.status = 'open'
    and (
      old.status <> 'open'
      or old.assigned_user_id is distinct from new.assigned_user_id
    )
    and new.assigned_user_id is not null then
    if old.status = 'open' and old.assigned_user_id is distinct from new.assigned_user_id then
      update public.whatsapp_attendance_sessions
      set ended_at = greatest(started_at, v_now),
          ended_by_user_id = null,
          end_reason = 'transferred'
      where organization_id = new.organization_id
        and conversation_id = new.id
        and ended_at is null;
    end if;

    insert into public.whatsapp_attendance_sessions (
      organization_id,
      conversation_id,
      attendant_user_id,
      started_at
    )
    values (
      new.organization_id,
      new.id,
      new.assigned_user_id,
      v_now
    )
    returning id into v_session_id;

    insert into public.whatsapp_attendance_events (
      organization_id,
      conversation_id,
      session_id,
      event_type,
      from_user_id,
      to_user_id,
      occurred_at,
      metadata
    )
    values (
      new.organization_id,
      new.id,
      v_session_id,
      case when old.status = 'open' then 'transferred' else 'started' end,
      case when old.status = 'open' then old.assigned_user_id else null end,
      new.assigned_user_id,
      v_now,
      jsonb_build_object('source', 'service_role')
    );
  end if;

  return new;
end;
$$;

create trigger track_whatsapp_attendance_lifecycle
after insert or update of status, assigned_user_id
on public.whatsapp_conversations
for each row execute function app_private.track_whatsapp_attendance_lifecycle();

-- ---------------------------------------------------------------------------
-- Transactional lifecycle RPCs
-- ---------------------------------------------------------------------------

create or replace function public.claim_whatsapp_conversation(
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_user_id uuid := app_private.current_app_user_id();
  v_organization_id uuid := app_private.current_organization_id();
  v_conversation public.whatsapp_conversations%rowtype;
  v_session_id uuid;
  v_previous_guard text := current_setting('app.whatsapp_lifecycle_managed', true);
begin
  if v_user_id is null
    or v_organization_id is null
    or not app_private.current_user_has_permission('atendimento.atender') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  select conversations.*
  into v_conversation
  from public.whatsapp_conversations as conversations
  where conversations.organization_id = v_organization_id
    and conversations.id = p_conversation_id
  for update;

  if not found then
    return false;
  end if;

  if v_conversation.status = 'open'
    and v_conversation.assigned_user_id = v_user_id then
    return true;
  end if;

  if v_conversation.status <> 'pending'
    or v_conversation.assigned_user_id is not null then
    return false;
  end if;

  perform set_config('app.whatsapp_lifecycle_managed', 'on', true);

  update public.whatsapp_conversations
  set assigned_user_id = v_user_id,
      status = 'open'
  where organization_id = v_organization_id
    and id = p_conversation_id;

  perform set_config(
    'app.whatsapp_lifecycle_managed',
    coalesce(v_previous_guard, ''),
    true
  );

  insert into public.whatsapp_attendance_sessions (
    organization_id,
    conversation_id,
    attendant_user_id,
    started_by_user_id
  )
  values (
    v_organization_id,
    p_conversation_id,
    v_user_id,
    v_user_id
  )
  returning id into v_session_id;

  insert into public.whatsapp_attendance_events (
    organization_id,
    conversation_id,
    session_id,
    event_type,
    actor_user_id,
    to_user_id
  )
  values (
    v_organization_id,
    p_conversation_id,
    v_session_id,
    'started',
    v_user_id,
    v_user_id
  );

  return true;
end;
$$;

create or replace function public.transfer_whatsapp_conversation(
  p_conversation_id uuid,
  p_target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_user_id uuid := app_private.current_app_user_id();
  v_organization_id uuid := app_private.current_organization_id();
  v_conversation public.whatsapp_conversations%rowtype;
  v_new_session_id uuid;
  v_now timestamptz := statement_timestamp();
  v_previous_guard text := current_setting('app.whatsapp_lifecycle_managed', true);
begin
  if v_actor_user_id is null
    or v_organization_id is null
    or not app_private.current_user_has_permission('atendimento.atender') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.app_users as users
    where users.organization_id = v_organization_id
      and users.id = p_target_user_id
      and users.status = 'active'
      and exists (
        select 1
        from app_private.user_permission_codes(users.id) as permission_codes(code)
        where permission_codes.code = 'atendimento.atender'
      )
  ) then
    raise exception 'Atendente de destino invalido ou sem permissao.'
      using errcode = '23514';
  end if;

  select conversations.*
  into v_conversation
  from public.whatsapp_conversations as conversations
  where conversations.organization_id = v_organization_id
    and conversations.id = p_conversation_id
  for update;

  if not found or v_conversation.status = 'resolved' then
    return false;
  end if;

  if v_conversation.status = 'open'
    and v_conversation.assigned_user_id = p_target_user_id then
    return true;
  end if;

  update public.whatsapp_attendance_sessions
  set ended_at = greatest(started_at, v_now),
      ended_by_user_id = v_actor_user_id,
      end_reason = 'transferred'
  where organization_id = v_organization_id
    and conversation_id = p_conversation_id
    and ended_at is null;

  perform set_config('app.whatsapp_lifecycle_managed', 'on', true);

  update public.whatsapp_conversations
  set assigned_user_id = p_target_user_id,
      status = 'open'
  where organization_id = v_organization_id
    and id = p_conversation_id;

  perform set_config(
    'app.whatsapp_lifecycle_managed',
    coalesce(v_previous_guard, ''),
    true
  );

  insert into public.whatsapp_attendance_sessions (
    organization_id,
    conversation_id,
    attendant_user_id,
    started_by_user_id,
    started_at
  )
  values (
    v_organization_id,
    p_conversation_id,
    p_target_user_id,
    v_actor_user_id,
    v_now
  )
  returning id into v_new_session_id;

  insert into public.whatsapp_attendance_events (
    organization_id,
    conversation_id,
    session_id,
    event_type,
    actor_user_id,
    from_user_id,
    to_user_id,
    occurred_at
  )
  values (
    v_organization_id,
    p_conversation_id,
    v_new_session_id,
    'transferred',
    v_actor_user_id,
    v_conversation.assigned_user_id,
    p_target_user_id,
    v_now
  );

  return true;
end;
$$;

create or replace function public.complete_whatsapp_conversation(
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_user_id uuid := app_private.current_app_user_id();
  v_organization_id uuid := app_private.current_organization_id();
  v_conversation public.whatsapp_conversations%rowtype;
  v_session_id uuid;
  v_now timestamptz := statement_timestamp();
  v_previous_guard text := current_setting('app.whatsapp_lifecycle_managed', true);
begin
  if v_actor_user_id is null
    or v_organization_id is null
    or not app_private.current_user_has_permission('atendimento.atender') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  select conversations.*
  into v_conversation
  from public.whatsapp_conversations as conversations
  where conversations.organization_id = v_organization_id
    and conversations.id = p_conversation_id
  for update;

  if not found then
    return false;
  end if;

  if v_conversation.status = 'resolved' then
    return true;
  end if;

  update public.whatsapp_attendance_sessions
  set ended_at = greatest(started_at, v_now),
      ended_by_user_id = v_actor_user_id,
      end_reason = 'completed'
  where organization_id = v_organization_id
    and conversation_id = p_conversation_id
    and ended_at is null
  returning id into v_session_id;

  perform set_config('app.whatsapp_lifecycle_managed', 'on', true);

  update public.whatsapp_conversations
  set status = 'resolved'
  where organization_id = v_organization_id
    and id = p_conversation_id;

  perform set_config(
    'app.whatsapp_lifecycle_managed',
    coalesce(v_previous_guard, ''),
    true
  );

  insert into public.whatsapp_attendance_events (
    organization_id,
    conversation_id,
    session_id,
    event_type,
    actor_user_id,
    from_user_id,
    occurred_at
  )
  values (
    v_organization_id,
    p_conversation_id,
    v_session_id,
    'completed',
    v_actor_user_id,
    v_conversation.assigned_user_id,
    v_now
  );

  return true;
end;
$$;

create or replace function public.reopen_whatsapp_conversation(
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_user_id uuid := app_private.current_app_user_id();
  v_organization_id uuid := app_private.current_organization_id();
  v_conversation public.whatsapp_conversations%rowtype;
  v_session_id uuid;
  v_now timestamptz := statement_timestamp();
  v_previous_guard text := current_setting('app.whatsapp_lifecycle_managed', true);
begin
  if v_actor_user_id is null
    or v_organization_id is null
    or not app_private.current_user_has_permission('atendimento.atender') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  select conversations.*
  into v_conversation
  from public.whatsapp_conversations as conversations
  where conversations.organization_id = v_organization_id
    and conversations.id = p_conversation_id
  for update;

  if not found then
    return false;
  end if;

  if v_conversation.status = 'pending'
    and v_conversation.assigned_user_id is null then
    return true;
  end if;

  if v_conversation.status <> 'resolved' then
    return false;
  end if;

  update public.whatsapp_attendance_sessions
  set ended_at = greatest(started_at, v_now),
      ended_by_user_id = v_actor_user_id,
      end_reason = 'reopened'
  where organization_id = v_organization_id
    and conversation_id = p_conversation_id
    and ended_at is null
  returning id into v_session_id;

  perform set_config('app.whatsapp_lifecycle_managed', 'on', true);

  update public.whatsapp_conversations
  set status = 'pending',
      assigned_user_id = null
  where organization_id = v_organization_id
    and id = p_conversation_id;

  perform set_config(
    'app.whatsapp_lifecycle_managed',
    coalesce(v_previous_guard, ''),
    true
  );

  if v_session_id is null then
    select sessions.id
    into v_session_id
    from public.whatsapp_attendance_sessions as sessions
    where sessions.organization_id = v_organization_id
      and sessions.conversation_id = p_conversation_id
    order by sessions.started_at desc, sessions.id desc
    limit 1;
  end if;

  insert into public.whatsapp_attendance_events (
    organization_id,
    conversation_id,
    session_id,
    event_type,
    actor_user_id,
    from_user_id,
    occurred_at
  )
  values (
    v_organization_id,
    p_conversation_id,
    v_session_id,
    'reopened',
    v_actor_user_id,
    v_conversation.assigned_user_id,
    v_now
  );

  return true;
end;
$$;

create or replace function public.list_whatsapp_attendants()
returns table (
  user_id uuid,
  name text,
  email text
)
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
declare
  v_organization_id uuid := app_private.current_organization_id();
begin
  if v_organization_id is null
    or not app_private.current_user_has_permission('atendimento.atender') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  return query
  select users.id, users.name, users.email::text
  from public.app_users as users
  where users.organization_id = v_organization_id
    and users.status = 'active'
    and exists (
      select 1
      from app_private.user_permission_codes(users.id) as permission_codes(code)
      where permission_codes.code = 'atendimento.atender'
    )
  order by users.name, users.id;
end;
$$;

create or replace function public.mark_whatsapp_conversation_read(
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_user_id uuid := app_private.current_app_user_id();
  v_organization_id uuid := app_private.current_organization_id();
  v_updated boolean;
begin
  if v_actor_user_id is null
    or v_organization_id is null
    or not app_private.current_user_has_permission('atendimento.atender') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  update public.whatsapp_conversations
  set unread_count = 0
  where organization_id = v_organization_id
    and id = p_conversation_id
  returning true into v_updated;

  return coalesce(v_updated, false);
end;
$$;

create or replace function public.record_whatsapp_outbound_activity(
  p_conversation_id uuid,
  p_preview text,
  p_sent_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_actor_user_id uuid := app_private.current_app_user_id();
  v_organization_id uuid := app_private.current_organization_id();
  v_updated boolean;
begin
  if v_actor_user_id is null
    or v_organization_id is null
    or not app_private.current_user_has_permission('atendimento.atender') then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  update public.whatsapp_conversations
  set unread_count = 0,
      last_message_at = coalesce(p_sent_at, statement_timestamp()),
      last_message_preview = nullif(trim(p_preview), '')
  where organization_id = v_organization_id
    and id = p_conversation_id
    and status = 'open'
    and assigned_user_id = v_actor_user_id
  returning true into v_updated;

  if not coalesce(v_updated, false) then
    if exists (
      select 1
      from public.whatsapp_conversations as conversations
      where conversations.organization_id = v_organization_id
        and conversations.id = p_conversation_id
    ) then
      raise exception 'Atendimento nao pertence ao usuario atual.'
        using errcode = '42501';
    end if;

    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.claim_whatsapp_conversation(uuid) from public;
revoke all on function public.transfer_whatsapp_conversation(uuid, uuid) from public;
revoke all on function public.complete_whatsapp_conversation(uuid) from public;
revoke all on function public.reopen_whatsapp_conversation(uuid) from public;
revoke all on function public.list_whatsapp_attendants() from public;
revoke all on function public.mark_whatsapp_conversation_read(uuid) from public;
revoke all on function public.record_whatsapp_outbound_activity(uuid, text, timestamptz)
  from public;

grant execute on function public.claim_whatsapp_conversation(uuid)
  to authenticated, service_role;
grant execute on function public.transfer_whatsapp_conversation(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.complete_whatsapp_conversation(uuid)
  to authenticated, service_role;
grant execute on function public.reopen_whatsapp_conversation(uuid)
  to authenticated, service_role;
grant execute on function public.list_whatsapp_attendants()
  to authenticated, service_role;
grant execute on function public.mark_whatsapp_conversation_read(uuid)
  to authenticated, service_role;
grant execute on function public.record_whatsapp_outbound_activity(uuid, text, timestamptz)
  to authenticated, service_role;

revoke all on function app_private.normalize_whatsapp_pending_assignment()
  from public;
revoke all on function app_private.track_whatsapp_attendance_lifecycle()
  from public;

-- History is useful to the inbox in realtime and remains protected by RLS.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'whatsapp_attendance_sessions',
    'whatsapp_attendance_events'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and pg_publication_tables.tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end;
$$;

comment on table public.whatsapp_attendance_sessions is
  'Immutable per-attendant handling intervals for WhatsApp conversations; at most one session is active per conversation.';
comment on table public.whatsapp_attendance_events is
  'Tenant-scoped audit history of WhatsApp attendance starts, transfers, completions and reopenings.';
comment on function public.claim_whatsapp_conversation(uuid) is
  'Atomically claims an unowned pending conversation and opens its first attendance session.';
comment on function public.transfer_whatsapp_conversation(uuid, uuid) is
  'Atomically transfers a pending or open conversation to an active same-tenant attendant with effective atendimento.atender permission.';
comment on function public.complete_whatsapp_conversation(uuid) is
  'Atomically resolves a pending or open conversation, closes its active session when present, and records the event.';
comment on function public.reopen_whatsapp_conversation(uuid) is
  'Atomically returns a resolved conversation to the unowned pending queue and records the event.';
comment on function public.list_whatsapp_attendants() is
  'Lists active same-tenant transfer targets with effective atendimento.atender permission.';
comment on function public.mark_whatsapp_conversation_read(uuid) is
  'Marks a same-tenant WhatsApp conversation as read for an authenticated attendant.';
comment on function public.record_whatsapp_outbound_activity(uuid, text, timestamptz) is
  'Updates outbound conversation metadata only when the authenticated attendant owns the open conversation.';
