-- Harden direct table grants for public online booking tables.

revoke all privileges on table public.online_booking_settings
  from public, anon, authenticated;
revoke all privileges on table public.online_booking_requests
  from public, anon, authenticated;
revoke all privileges on table public.online_booking_contact_verifications
  from public, anon, authenticated;

grant select, update on table public.online_booking_settings
  to authenticated;
grant select on table public.online_booking_requests
  to authenticated;

grant all privileges on table
  public.online_booking_settings,
  public.online_booking_requests,
  public.online_booking_contact_verifications
to service_role;
