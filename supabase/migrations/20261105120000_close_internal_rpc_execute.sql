-- Raio-X S1 e S2: funções internas executáveis pela API pública.
--
-- ATENÇÃO: esta migração foi criada no repositório e NÃO foi aplicada em
-- produção. Rode antes num branch do Supabase e teste: criar/editar/excluir
-- empresa (super admin), iniciar/encerrar suporte, editar usuário e perfil
-- de acesso, o cron /api/jobs/dispatch, o agendamento online completo
-- (verificar contato, enviar, remarcar e cancelar pelo link) e o fluxo de
-- atendimento (iniciar, salvar, finalizar, adendo, emitir documento).
--
-- Por que é preciso: no Supabase as funções do schema public nascem com
-- EXECUTE concedido diretamente a anon e authenticated (privilégio padrão do
-- schema). "revoke all ... from public", usado nas migrations anteriores, não
-- remove esses grants diretos — por isso funções de super admin e de gestão
-- de acessos, que confiam no ID do ator recebido por parâmetro, e a fila de
-- jobs (sem checagem nenhuma) podiam ser chamadas por /rest/v1/rpc com a
-- chave pública.
--
-- Por que é seguro para o app: as funções da Parte A só são chamadas pelo
-- servidor com a service role (createSupabaseAdminClient), que continua com
-- acesso; as da Parte B e C mantêm o acesso de quem já está logado.

begin;

-- Parte A: somente o servidor (service_role) -------------------------------

-- A1. Confiam no "ID do ator" recebido como parâmetro (super admin e gestão
--     de acessos da empresa).
revoke execute on function public.create_organization_with_owner(uuid, uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.update_organization_as_super_admin(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.delete_organization_as_super_admin(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.start_impersonation_session(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.end_impersonation_session(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.manage_company_profile_create(uuid, uuid, uuid, text, text, uuid[], uuid) from public, anon, authenticated;
revoke execute on function public.manage_company_profile_update(uuid, uuid, uuid, uuid, text, text, uuid[]) from public, anon, authenticated;
revoke execute on function public.manage_company_profile_delete(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.manage_company_user_identity(uuid, uuid, uuid, uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.manage_company_user_permission_overrides(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.manage_company_user_profile(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.manage_company_user_resource_scopes(uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.manage_company_user_status(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;

-- A2. Operação interna sem checagem nenhuma (fila de envios e expirações).
revoke execute on function public.claim_next_job(text, text[]) from public, anon, authenticated;
revoke execute on function public.complete_job(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.run_scheduled_maintenance() from public, anon, authenticated;
revoke execute on function public.expire_stale_online_booking_requests(integer) from public, anon, authenticated;
revoke execute on function public.expire_stale_waitlist_entries(integer) from public, anon, authenticated;

-- A3. Permissões de qualquer usuário a partir do UUID (o app só usa no
--     servidor, durante o suporte).
revoke execute on function public.user_permission_codes(uuid) from public, anon, authenticated;

grant execute on function public.create_organization_with_owner(uuid, uuid, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.update_organization_as_super_admin(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.delete_organization_as_super_admin(uuid, uuid) to service_role;
grant execute on function public.start_impersonation_session(uuid, uuid, uuid, text) to service_role;
grant execute on function public.end_impersonation_session(uuid, uuid) to service_role;
grant execute on function public.manage_company_profile_create(uuid, uuid, uuid, text, text, uuid[], uuid) to service_role;
grant execute on function public.manage_company_profile_update(uuid, uuid, uuid, uuid, text, text, uuid[]) to service_role;
grant execute on function public.manage_company_profile_delete(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.manage_company_user_identity(uuid, uuid, uuid, uuid, text, text, text, uuid) to service_role;
grant execute on function public.manage_company_user_permission_overrides(uuid, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.manage_company_user_profile(uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.manage_company_user_resource_scopes(uuid, uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function public.manage_company_user_status(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.claim_next_job(text, text[]) to service_role;
grant execute on function public.complete_job(uuid, boolean, text) to service_role;
grant execute on function public.run_scheduled_maintenance() to service_role;
grant execute on function public.expire_stale_online_booking_requests(integer) to service_role;
grant execute on function public.expire_stale_waitlist_entries(integer) to service_role;
grant execute on function public.user_permission_codes(uuid) to service_role;

-- Parte B: só o visitante anônimo perde o acesso -----------------------------
-- São chamadas por gatilhos e funções que rodam como o usuário logado.
revoke execute on function public.resolve_procedure_price(uuid, uuid, uuid) from public, anon;
revoke execute on function public.procedure_cost_total(uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.payment_method_fee_total(uuid, uuid, numeric) from public, anon;
revoke execute on function public.refresh_patient_tag_rule(uuid) from public, anon;
grant execute on function public.resolve_procedure_price(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.procedure_cost_total(uuid, uuid, numeric, text) to authenticated, service_role;
grant execute on function public.payment_method_fee_total(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.refresh_patient_tag_rule(uuid) to authenticated, service_role;

-- Parte C: o visitante anônimo só executa o agendamento online --------------
-- As demais funções SECURITY DEFINER do schema public (atendimento v2,
-- modelos clínicos, financeiro, WhatsApp...) identificam quem chama por
-- auth.uid() e falham para anon, mas não há motivo para ficarem expostas.
-- Quem já tinha acesso logado (authenticated) ou pelo servidor continua
-- tendo: o grant é refeito explicitamente antes de tirar o de public.
do $$
declare
  v_function record;
  v_allowed constant text[] := array[
    'verify_online_booking_contact(uuid, text)',
    'submit_online_booking_request(text, uuid, uuid, timestamp with time zone, text, text, text, text, uuid, text, boolean)',
    'submit_online_booking_request_with_token(text, uuid, uuid, timestamp with time zone, text, text, text, text, uuid, text, boolean)',
    'reschedule_online_booking_request(uuid, timestamp with time zone)',
    'cancel_online_booking_request(uuid, text)',
    -- Gatilho de evento da própria plataforma Supabase.
    'rls_auto_enable()'
  ];
begin
  for v_function in
    select
      p.oid::regprocedure as procedure,
      p.proname || '(' || oidvectortypes(p.proargtypes) || ')' as signature,
      has_function_privilege('authenticated', p.oid, 'EXECUTE')
        as authenticated_can,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_can
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    continue when v_function.signature = any (v_allowed);

    if v_function.authenticated_can then
      execute format(
        'grant execute on function %s to authenticated',
        v_function.procedure
      );
    end if;
    if v_function.service_can then
      execute format(
        'grant execute on function %s to service_role',
        v_function.procedure
      );
    end if;
    execute format(
      'revoke execute on function %s from public, anon',
      v_function.procedure
    );
    raise notice 'Execução por anon removida: %', v_function.signature;
  end loop;
end;
$$;

commit;

-- Privilégios padrão: não foram alterados de propósito. Tirar o EXECUTE
-- padrão de PUBLIC valeria também para as funções novas de app_private, que
-- as políticas de RLS chamam como o usuário logado; uma migration futura que
-- esquecesse o grant quebraria telas em produção sem aviso. A proteção contra
-- regressão fica no teste supabase/tests/database/function_execute_grants.sql,
-- que falha se surgir função SECURITY DEFINER do schema public executável por
-- anon fora do agendamento online. Toda migration nova deve terminar com
-- "revoke execute ... from public, anon" e o grant explícito de quem usa.
