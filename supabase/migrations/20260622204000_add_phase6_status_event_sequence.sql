-- Provide deterministic ordering for status events created in the same
-- transaction or SQL command.

alter table public.appointment_status_events
  add column if not exists event_sequence bigint generated always as identity;

create unique index if not exists appointment_status_events_sequence_key
  on public.appointment_status_events(event_sequence);

comment on column public.appointment_status_events.event_sequence is
  'Database sequence used as the deterministic status-event order.';
