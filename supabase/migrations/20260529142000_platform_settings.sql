create table public.platform_settings (
  id boolean primary key default true,
  app_name text not null default 'Hi Clinic',
  primary_color text not null default '#176b87',
  logo_url text,
  support_email text,
  support_phone text,
  support_whatsapp text,
  support_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_settings_singleton check (id),
  constraint platform_settings_primary_color_hex check (
    primary_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create trigger set_platform_settings_updated_at
before update on public.platform_settings
for each row execute function app_private.set_updated_at();

alter table public.platform_settings enable row level security;

create policy "platform_settings_select_public"
on public.platform_settings for select
to anon, authenticated
using (true);

create policy "platform_settings_insert_super_admin"
on public.platform_settings for insert
to authenticated
with check (app_private.current_is_super_admin());

create policy "platform_settings_update_super_admin"
on public.platform_settings for update
to authenticated
using (app_private.current_is_super_admin())
with check (app_private.current_is_super_admin());

grant select on public.platform_settings to anon, authenticated, service_role;
grant insert, update on public.platform_settings to authenticated, service_role;

insert into public.platform_settings (
  id,
  app_name,
  primary_color,
  support_email,
  support_phone,
  support_whatsapp,
  support_url
)
values (
  true,
  'Hi Clinic',
  '#176b87',
  null,
  null,
  null,
  null
)
on conflict (id) do nothing;
