-- Patient profile photos stored in a private bucket.

alter table public.patients
  add column if not exists photo_path text;

comment on column public.patients.photo_path is
  'Private Supabase Storage object path for the patient profile photo.';

insert into storage.buckets (id, name, public)
values ('patient-photos', 'patient-photos', false)
on conflict (id) do update
set public = false;
