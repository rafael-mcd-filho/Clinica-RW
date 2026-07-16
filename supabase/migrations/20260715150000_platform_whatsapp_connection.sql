-- Evolution API is platform infrastructure. Tenant users only own the
-- connection/instance created for their organization.
create table if not exists public.platform_integration_settings (
  id boolean primary key default true check (id),
  evolution_api_url text,
  evolution_api_key_encrypted text,
  updated_at timestamptz not null default now()
);

alter table public.platform_integration_settings enable row level security;
revoke all on table public.platform_integration_settings from anon, authenticated;

alter table public.whatsapp_instances
  add column if not exists profile_picture_url text;

comment on column public.platform_integration_settings.evolution_api_key_encrypted is
  'AES-256-GCM encrypted global Evolution API key; application server only.';
comment on column public.whatsapp_instances.profile_picture_url is
  'Current WhatsApp account profile picture reported by Evolution API.';
