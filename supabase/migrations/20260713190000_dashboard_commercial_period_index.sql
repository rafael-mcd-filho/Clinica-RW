create index if not exists appointments_organization_created_at_idx
  on public.appointments (organization_id, created_at);

comment on index public.appointments_organization_created_at_idx is
  'Supports commercial dashboard cohorts grouped by appointment creation time.';
