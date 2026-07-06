-- Link appointments to the planned/selected payment method before checkout.

alter table public.appointments
  add column if not exists payment_method_id uuid;

do $$
begin
  alter table public.appointments
    add constraint appointments_payment_method_fk
    foreign key (organization_id, payment_method_id)
    references public.payment_methods(organization_id, id)
    on delete set null (payment_method_id);
exception
  when duplicate_object then null;
end $$;

create index if not exists appointments_payment_method_idx
  on public.appointments(organization_id, payment_method_id)
  where payment_method_id is not null;

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

comment on column public.appointments.payment_method_id is
  'Planned or selected payment method for the appointment before financial settlement.';
