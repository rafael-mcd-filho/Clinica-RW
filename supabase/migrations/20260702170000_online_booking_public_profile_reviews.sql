-- Public profile content and reviews for the online booking page.

alter table public.online_booking_settings
  add column if not exists profile_headline text,
  add column if not exists profile_summary text,
  add column if not exists experience_text text,
  add column if not exists education_count integer not null default 0 check (education_count >= 0),
  add column if not exists accepted_plan_count integer not null default 0 check (accepted_plan_count >= 0),
  add column if not exists excellence_badge_year integer check (excellence_badge_year between 1900 and 3000),
  add column if not exists treated_conditions text[] not null default '{}',
  add column if not exists patient_groups text[] not null default '{}',
  add column if not exists consultation_formats text[] not null default '{}',
  add column if not exists profile_highlights text[] not null default '{}',
  add column if not exists accepted_health_insurance_ids uuid[] not null default '{}',
  add column if not exists accepted_payment_method_ids uuid[] not null default '{}',
  add column if not exists accepted_plan_notes text;

create table if not exists public.online_booking_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid,
  patient_display_name text not null,
  rating integer not null default 5 check (rating between 1 and 5),
  title text,
  body text not null,
  tags text[] not null default '{}',
  source_label text,
  verified boolean not null default true,
  highlighted boolean not null default false,
  active boolean not null default true,
  review_date date not null default current_date,
  professional_response text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, professional_id)
    references public.professionals(organization_id, id) on delete set null (professional_id)
);

create trigger set_online_booking_reviews_updated_at
before update on public.online_booking_reviews
for each row execute function app_private.set_updated_at();

create index if not exists online_booking_reviews_org_active_idx
  on public.online_booking_reviews(organization_id, active, highlighted, review_date desc);

alter table public.online_booking_reviews enable row level security;

drop policy if exists payment_methods_select_agenda on public.payment_methods;
create policy payment_methods_select_agenda on public.payment_methods
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and active = true
    and (
      app_private.current_user_has_permission('agenda.ver')
      or app_private.current_user_has_permission('agenda.criar_agendamento')
      or app_private.current_user_has_permission('agenda.editar_agendamento')
      or app_private.current_user_has_permission('agenda.configurar')
    )
  )
);

drop policy if exists online_booking_reviews_select_manage on public.online_booking_reviews;
create policy online_booking_reviews_select_manage on public.online_booking_reviews
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('agenda.configurar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

drop policy if exists online_booking_reviews_manage on public.online_booking_reviews;
create policy online_booking_reviews_manage on public.online_booking_reviews
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('agenda.configurar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('agenda.configurar')
      or app_private.current_user_has_permission('config.geral')
    )
  )
);

grant select, insert, update, delete on public.online_booking_reviews
to authenticated, service_role;

grant select on public.online_booking_reviews to service_role;

comment on table public.online_booking_reviews is
  'Curated public reviews and professional responses shown on the online booking page.';
