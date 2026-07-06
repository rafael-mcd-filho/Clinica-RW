-- Adds contact + branding fields to organizations, a phone to app_users,
-- and a public storage bucket for the platform and company logos.
-- Additive only: no existing column or data is altered or removed.

alter table public.organizations
  add column if not exists email    text,
  add column if not exists phone    text,
  add column if not exists logo_url text;

alter table public.app_users
  add column if not exists phone text;

-- Public bucket used for the platform logo and each company's logo.
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Anyone can read branding assets (served via the public object endpoint).
-- Writes are performed by the service role from server actions, which
-- bypasses RLS, so no insert/update/delete policy is required here.
drop policy if exists "branding_public_read" on storage.objects;
create policy "branding_public_read"
on storage.objects for select
to public
using (bucket_id = 'branding');
