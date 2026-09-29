alter table public.platform_settings
  add column if not exists logo_full_url text;
