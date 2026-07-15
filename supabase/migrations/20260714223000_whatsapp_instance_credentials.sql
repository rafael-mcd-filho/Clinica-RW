-- Store tenant-specific Evolution API configuration. Secrets are encrypted by
-- the application before persistence and are never exposed through the UI.
alter table public.whatsapp_instances
  add column if not exists evolution_api_url text,
  add column if not exists api_key_encrypted text,
  add column if not exists webhook_secret_encrypted text,
  add column if not exists webhook_url text,
  add column if not exists configured_at timestamptz;

comment on column public.whatsapp_instances.api_key_encrypted is
  'AES-256-GCM encrypted Evolution API key; application server only.';
comment on column public.whatsapp_instances.webhook_secret_encrypted is
  'AES-256-GCM encrypted secret sent by Evolution in webhook requests.';

