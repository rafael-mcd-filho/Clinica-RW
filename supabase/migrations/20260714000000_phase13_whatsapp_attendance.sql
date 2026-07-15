-- Phase 13: WhatsApp attendance (inbox + service CRM).
--
-- Tenant-scoped conversational layer that plugs into the existing domain:
-- contacts link to patients, conversations link to funnel cards, labels reuse
-- the shared `tags` taxonomy, and inbound/outbound messages stream to the
-- dashboard via Supabase Realtime. The Evolution API webhook writes with the
-- service role (bypassing RLS); authenticated dashboard access is gated by the
-- new `atendimento.*` permissions below.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One WhatsApp channel (Evolution instance) per organization/number.
create table public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  evolution_instance_name text not null,
  phone_number text,
  display_name text,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connecting', 'connected', 'error')),
  last_connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, evolution_instance_name)
);

-- A WhatsApp contact. May or may not already be a patient in the system.
create table public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null,
  wa_name text,
  patient_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, phone),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete set null (patient_id)
);

-- A conversation thread with a contact on a given instance.
create table public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid not null,
  contact_id uuid not null,
  assigned_user_id uuid,
  funnel_card_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'open', 'resolved')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, instance_id, contact_id),
  foreign key (organization_id, instance_id)
    references public.whatsapp_instances(organization_id, id) on delete cascade,
  foreign key (organization_id, contact_id)
    references public.whatsapp_contacts(organization_id, id) on delete cascade,
  foreign key (organization_id, assigned_user_id)
    references public.app_users(organization_id, id) on delete set null (assigned_user_id),
  foreign key (organization_id, funnel_card_id)
    references public.funnel_cards(organization_id, id) on delete set null (funnel_card_id)
);

-- Individual messages within a conversation (both directions).
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null,
  wa_message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_user_id uuid,
  message_type text not null default 'text'
    check (
      message_type in (
        'text', 'image', 'audio', 'video', 'document',
        'sticker', 'location', 'contact', 'system'
      )
    ),
  body text,
  media_url text,
  media_mime_type text,
  status text not null default 'received'
    check (
      status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')
    ),
  ai_suggested boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, wa_message_id),
  foreign key (organization_id, conversation_id)
    references public.whatsapp_conversations(organization_id, id) on delete cascade,
  foreign key (organization_id, sender_user_id)
    references public.app_users(organization_id, id) on delete set null (sender_user_id)
);

-- Conversation labels, reusing the organization's shared `tags` taxonomy.
create table public.conversation_tags (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, tag_id),
  foreign key (organization_id, conversation_id)
    references public.whatsapp_conversations(organization_id, id) on delete cascade,
  foreign key (organization_id, tag_id)
    references public.tags(organization_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index whatsapp_contacts_patient_idx
  on public.whatsapp_contacts (organization_id, patient_id);
create index whatsapp_conversations_status_idx
  on public.whatsapp_conversations (organization_id, status, last_message_at desc);
create index whatsapp_conversations_assigned_idx
  on public.whatsapp_conversations (organization_id, assigned_user_id);
create index whatsapp_conversations_contact_idx
  on public.whatsapp_conversations (organization_id, contact_id);
create index whatsapp_messages_conversation_idx
  on public.whatsapp_messages (organization_id, conversation_id, created_at);
create index conversation_tags_organization_idx
  on public.conversation_tags (organization_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create trigger set_whatsapp_instances_updated_at
before update on public.whatsapp_instances
for each row execute function app_private.set_updated_at();

create trigger set_whatsapp_contacts_updated_at
before update on public.whatsapp_contacts
for each row execute function app_private.set_updated_at();

create trigger set_whatsapp_conversations_updated_at
before update on public.whatsapp_conversations
for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'whatsapp_instances', 'whatsapp_contacts', 'whatsapp_conversations',
    'whatsapp_messages', 'conversation_tags'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

-- Read access: anyone in the org with any attendance permission.
create policy whatsapp_instances_select on public.whatsapp_instances
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('atendimento.ver')
      or app_private.current_user_has_permission('atendimento.atender')
      or app_private.current_user_has_permission('atendimento.configurar')
    )
  )
);

-- Connecting/configuring the channel requires the configure permission.
create policy whatsapp_instances_manage on public.whatsapp_instances
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('atendimento.configurar')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('atendimento.configurar')
  )
);

create policy whatsapp_contacts_select on public.whatsapp_contacts
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('atendimento.ver')
      or app_private.current_user_has_permission('atendimento.atender')
      or app_private.current_user_has_permission('atendimento.configurar')
    )
  )
);

create policy whatsapp_contacts_manage on public.whatsapp_contacts
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('atendimento.atender')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('atendimento.atender')
  )
);

create policy whatsapp_conversations_select on public.whatsapp_conversations
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('atendimento.ver')
      or app_private.current_user_has_permission('atendimento.atender')
      or app_private.current_user_has_permission('atendimento.configurar')
    )
  )
);

create policy whatsapp_conversations_manage on public.whatsapp_conversations
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('atendimento.atender')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('atendimento.atender')
  )
);

create policy whatsapp_messages_select on public.whatsapp_messages
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('atendimento.ver')
      or app_private.current_user_has_permission('atendimento.atender')
      or app_private.current_user_has_permission('atendimento.configurar')
    )
  )
);

create policy whatsapp_messages_manage on public.whatsapp_messages
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('atendimento.atender')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('atendimento.atender')
  )
);

create policy conversation_tags_select on public.conversation_tags
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('atendimento.ver')
      or app_private.current_user_has_permission('atendimento.atender')
      or app_private.current_user_has_permission('atendimento.configurar')
    )
  )
);

create policy conversation_tags_manage on public.conversation_tags
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('atendimento.atender')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('atendimento.atender')
  )
);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'whatsapp_instances', 'whatsapp_conversations', 'whatsapp_messages'
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

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (code, category, description)
values
  ('atendimento.ver', 'Atendimento', 'Visualizar conversas de atendimento'),
  (
    'atendimento.atender',
    'Atendimento',
    'Responder, atribuir, etiquetar e concluir conversas'
  ),
  (
    'atendimento.configurar',
    'Atendimento',
    'Conectar o número e configurar o canal de WhatsApp'
  )
on conflict (code) do update set
  category = excluded.category,
  description = excluded.description;

with grants(profile_name, permission_code) as (
  values
    ('Administrador', 'atendimento.ver'),
    ('Administrador', 'atendimento.atender'),
    ('Administrador', 'atendimento.configurar'),
    ('Profissional', 'atendimento.ver'),
    ('Profissional', 'atendimento.atender'),
    ('Atendente', 'atendimento.ver'),
    ('Atendente', 'atendimento.atender'),
    ('Financeiro', 'atendimento.ver'),
    ('Tecnico', 'atendimento.ver')
)
insert into public.profile_permissions (profile_id, permission_id)
select profiles.id, permissions.id
from grants
join public.profiles
  on profiles.name = grants.profile_name and profiles.organization_id is null
join public.permissions on permissions.code = grants.permission_code
on conflict (profile_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

comment on table public.whatsapp_instances is
  'One Evolution API WhatsApp channel per organization/number.';
comment on table public.whatsapp_contacts is
  'WhatsApp contacts, optionally linked to an existing patient.';
comment on table public.whatsapp_conversations is
  'Conversation threads with tabbed states (pending/open/resolved), optionally linked to a funnel card.';
comment on table public.whatsapp_messages is
  'Inbound/outbound messages; ai_suggested flags drafts produced by the assistant for human approval.';
comment on table public.conversation_tags is
  'Conversation labels reusing the shared tags taxonomy.';
