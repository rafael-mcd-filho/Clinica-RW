-- Phase 13: report permissions can read the source rows needed for BI.

drop policy if exists schedules_select_reports on public.schedules;
create policy schedules_select_reports on public.schedules
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('relatorio.operacional')
  )
);

drop policy if exists schedule_availability_select_reports
  on public.schedule_availability;
create policy schedule_availability_select_reports on public.schedule_availability
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('relatorio.operacional')
  )
);

drop policy if exists appointments_select_reports on public.appointments;
create policy appointments_select_reports on public.appointments
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('relatorio.operacional')
      or app_private.current_user_has_permission('relatorio.financeiro')
      or app_private.current_user_has_permission('relatorio.clinico')
    )
  )
);

drop policy if exists payment_methods_select_reports on public.payment_methods;
create policy payment_methods_select_reports on public.payment_methods
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('relatorio.financeiro')
  )
);

drop policy if exists accounts_receivable_select_reports
  on public.accounts_receivable;
create policy accounts_receivable_select_reports on public.accounts_receivable
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('relatorio.financeiro')
  )
);

drop policy if exists payments_select_reports on public.payments;
create policy payments_select_reports on public.payments
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('relatorio.financeiro')
  )
);

drop policy if exists accounts_payable_select_reports on public.accounts_payable;
create policy accounts_payable_select_reports on public.accounts_payable
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('relatorio.financeiro')
  )
);

drop policy if exists professional_payouts_select_reports
  on public.professional_payouts;
create policy professional_payouts_select_reports on public.professional_payouts
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('relatorio.financeiro')
  )
);

drop policy if exists encounters_select_reports on public.encounters;
create policy encounters_select_reports on public.encounters
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('relatorio.clinico')
  )
);

drop policy if exists encounter_diagnoses_select_reports
  on public.encounter_diagnoses;
create policy encounter_diagnoses_select_reports on public.encounter_diagnoses
for select to authenticated
using (
  exists (
    select 1
    from public.encounters
    where encounters.organization_id = encounter_diagnoses.organization_id
      and encounters.id = encounter_diagnoses.encounter_id
      and (
        app_private.current_is_super_admin() or (
          encounters.organization_id = app_private.current_organization_id()
          and app_private.current_user_has_permission('relatorio.clinico')
        )
      )
  )
);
