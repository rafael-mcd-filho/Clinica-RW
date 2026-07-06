-- Keep appointment status history chronologically sortable even when multiple
-- transitions are executed inside the same transaction.

alter table public.appointment_status_events
  alter column created_at set default statement_timestamp();

comment on column public.appointment_status_events.created_at is
  'Statement timestamp used to preserve status transition order inside a transaction.';
