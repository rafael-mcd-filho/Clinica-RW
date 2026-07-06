-- Unified patient/record list: clinical viewers can read patient directory rows and tags.

drop policy if exists patients_select_tenant on public.patients;
create policy patients_select_tenant
on public.patients for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('paciente.ver')
      or app_private.current_user_has_permission('clinico.ver_prontuario')
      or app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
    )
  )
);

drop policy if exists tags_select_tenant on public.tags;
create policy tags_select_tenant
on public.tags for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('paciente.ver')
      or app_private.current_user_has_permission('config.geral')
      or app_private.current_user_has_permission('clinico.ver_prontuario')
      or app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
    )
  )
);

drop policy if exists patient_tags_select_tenant on public.patient_tags;
create policy patient_tags_select_tenant
on public.patient_tags for select to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('paciente.ver')
      or app_private.current_user_has_permission('clinico.ver_prontuario')
      or app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
    )
  )
);
