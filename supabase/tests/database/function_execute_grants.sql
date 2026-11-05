begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

-- Funções que só o servidor (service_role) pode executar: confiam no ID do
-- ator recebido por parâmetro ou não conferem quem chama (Raio-X S1 e S2).
create temporary table server_only_functions (signature text not null)
on commit drop;
insert into server_only_functions (signature)
values
  ('public.create_organization_with_owner(uuid, uuid, text, text, text, text, text, text, text, text)'),
  ('public.update_organization_as_super_admin(uuid, uuid, text, text, text, text)'),
  ('public.delete_organization_as_super_admin(uuid, uuid)'),
  ('public.start_impersonation_session(uuid, uuid, uuid, text)'),
  ('public.end_impersonation_session(uuid, uuid)'),
  ('public.manage_company_profile_create(uuid, uuid, uuid, text, text, uuid[], uuid)'),
  ('public.manage_company_profile_update(uuid, uuid, uuid, uuid, text, text, uuid[])'),
  ('public.manage_company_profile_delete(uuid, uuid, uuid, uuid)'),
  ('public.manage_company_user_identity(uuid, uuid, uuid, uuid, text, text, text, uuid)'),
  ('public.manage_company_user_permission_overrides(uuid, uuid, uuid, uuid, jsonb)'),
  ('public.manage_company_user_profile(uuid, uuid, uuid, uuid, uuid)'),
  ('public.manage_company_user_resource_scopes(uuid, uuid, uuid, uuid, text, jsonb)'),
  ('public.manage_company_user_status(uuid, uuid, uuid, uuid, text)'),
  ('public.claim_next_job(text, text[])'),
  ('public.complete_job(uuid, boolean, text)'),
  ('public.run_scheduled_maintenance()'),
  ('public.expire_stale_online_booking_requests(integer)'),
  ('public.expire_stale_waitlist_entries(integer)'),
  ('public.user_permission_codes(uuid)');

select is_empty(
  $$
    select signature
    from server_only_functions
    where has_function_privilege('anon', signature::regprocedure, 'EXECUTE')
       or has_function_privilege(
         'authenticated',
         signature::regprocedure,
         'EXECUTE'
       )
  $$,
  'Funções de super admin, gestão de acessos e fila de jobs não são executáveis pela API pública'
);

select is_empty(
  $$
    select signature
    from server_only_functions
    where not has_function_privilege(
      'service_role',
      signature::regprocedure,
      'EXECUTE'
    )
  $$,
  'O servidor (service_role) continua executando as funções internas'
);

-- Usadas por gatilhos e cálculos que rodam como o usuário logado.
select is_empty(
  $$
    select signature
    from (
      values
        ('public.resolve_procedure_price(uuid, uuid, uuid)'),
        ('public.procedure_cost_total(uuid, uuid, numeric, text)'),
        ('public.payment_method_fee_total(uuid, uuid, numeric)'),
        ('public.refresh_patient_tag_rule(uuid)')
    ) as functions(signature)
    where has_function_privilege('anon', signature::regprocedure, 'EXECUTE')
  $$,
  'Cálculos de preço, custo, taxa e etiquetas não são executáveis por anon'
);

select is_empty(
  $$
    select signature
    from (
      values
        ('public.resolve_procedure_price(uuid, uuid, uuid)'),
        ('public.procedure_cost_total(uuid, uuid, numeric, text)'),
        ('public.payment_method_fee_total(uuid, uuid, numeric)'),
        ('public.refresh_patient_tag_rule(uuid)'),
        ('public.transition_appointment_status_v2(uuid, text, text, uuid)'),
        ('public.start_clinical_encounter_v2(uuid, uuid, uuid, uuid, uuid)'),
        ('public.finalize_clinical_encounter_v2(uuid, timestamp with time zone, uuid)')
    ) as functions(signature)
    where not has_function_privilege(
      'authenticated',
      signature::regprocedure,
      'EXECUTE'
    )
  $$,
  'Quem está logado continua executando as funções do dia a dia'
);

-- Guarda contra regressão: função SECURITY DEFINER nova no schema public
-- nasce executável por anon no Supabase. Só o agendamento online pode.
select is_empty(
  $$
    select p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.proname || '(' || oidvectortypes(p.proargtypes) || ')' <> all (
        array[
          'verify_online_booking_contact(uuid, text)',
          'submit_online_booking_request(text, uuid, uuid, timestamp with time zone, text, text, text, text, uuid, text, boolean)',
          'submit_online_booking_request_with_token(text, uuid, uuid, timestamp with time zone, text, text, text, text, uuid, text, boolean)',
          'reschedule_online_booking_request(uuid, timestamp with time zone)',
          'cancel_online_booking_request(uuid, text)',
          'rls_auto_enable()'
        ]
      )
  $$,
  'Nenhuma função SECURITY DEFINER do schema public fica aberta para anon fora do agendamento online'
);

select * from finish();

rollback;
