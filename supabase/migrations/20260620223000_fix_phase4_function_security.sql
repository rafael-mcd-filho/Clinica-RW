-- Phase 4 RPCs perform their own tenant and permission checks. Run them as the
-- function owner so authenticated clients do not need USAGE on app_private.

alter function public.complete_organization_onboarding(uuid)
  security definer;

alter function public.complete_organization_onboarding(uuid)
  set search_path = pg_catalog, public, app_private;

alter function public.replace_clinic_business_hours(uuid, jsonb)
  security definer;

alter function public.replace_clinic_business_hours(uuid, jsonb)
  set search_path = pg_catalog, public, app_private;

revoke all on function public.complete_organization_onboarding(uuid) from public;
grant execute on function public.complete_organization_onboarding(uuid)
  to authenticated, service_role;

revoke all on function public.replace_clinic_business_hours(uuid, jsonb) from public;
grant execute on function public.replace_clinic_business_hours(uuid, jsonb)
  to authenticated, service_role;
