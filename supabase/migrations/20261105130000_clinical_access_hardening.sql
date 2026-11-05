-- Raio-X S8 e S5: acesso ao conteúdo clínico.
--
-- ATENÇÃO: criada no repositório e NÃO aplicada em produção. Teste num
-- branch do Supabase: médico sem "dados sensíveis" vendo alergias na ficha,
-- recepção sem a permissão nova sem ver o resumo, super admin sem ver
-- prontuário fora do suporte e vendo dentro de uma sessão de suporte ativa.
--
-- S8: o resumo clínico permanente (alergias, medicações, comorbidades,
-- antecedentes) usava a permissão de CPF e endereço. Médico sem ela não via
-- as alergias; recepção com ela via o histórico clínico. Agora ele tem
-- permissão própria. Ninguém perde acesso no dia da migração: recebem a
-- permissão nova os perfis que já viam o resumo e os que acessam
-- prontuário; depois o admin tira de quem não precisa (ex.: recepção).
--
-- S5: as políticas das tabelas clínicas liberavam tudo para super admin,
-- mesmo fora de uma sessão de suporte. Agora o super admin só lê conteúdo
-- clínico de uma clínica enquanto tem uma sessão de suporte ativa nela
-- (aberta com motivo, há menos de 4 horas e não encerrada).

begin;

-- S8 -------------------------------------------------------------------------

insert into public.permissions (code, category, description) values
  ('clinico.ver_resumo_clinico', 'Clínico',
   'Ver e editar o resumo clínico permanente (alergias, medicações, comorbidades e antecedentes)')
on conflict (code) do update
  set category = excluded.category,
      description = excluded.description;

insert into public.profile_permissions (profile_id, permission_id)
select distinct existing.profile_id, added.id
from public.profile_permissions as existing
join public.permissions as current_permission
  on current_permission.id = existing.permission_id
cross join public.permissions as added
where current_permission.code in (
    'paciente.ver_dados_sensiveis',
    'clinico.ver_prontuario',
    'clinico.ver_prontuario_proprios'
  )
  and added.code = 'clinico.ver_resumo_clinico'
on conflict do nothing;

-- S5: acesso de suporte com prazo -------------------------------------------

create or replace function app_private.super_admin_support_access(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.current_is_super_admin()
    and exists (
      select 1
      from public.impersonation_sessions as sessions
      join public.app_users as admins
        on admins.id = sessions.super_admin_user_id
      where admins.auth_user_id = auth.uid()
        and sessions.organization_id = p_organization_id
        and sessions.ended_at is null
        and sessions.started_at <= statement_timestamp()
        and sessions.started_at > statement_timestamp() - interval '4 hours'
    )
$$;

revoke all on function app_private.super_admin_support_access(uuid)
  from public, anon;
grant execute on function app_private.super_admin_support_access(uuid)
  to authenticated, service_role;

comment on function app_private.super_admin_support_access(uuid) is
  'Super admin só acessa conteúdo clínico de uma clínica durante uma sessão de suporte ativa nela (até 4 horas).';

create or replace function app_private.can_access_clinical_record(
  p_organization_id uuid,
  p_professional_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select app_private.super_admin_support_access(p_organization_id)
    or (
      p_organization_id = app_private.current_organization_id()
      and (
        app_private.current_user_has_permission('clinico.ver_prontuario')
        or (
          app_private.current_user_has_permission('clinico.ver_prontuario_proprios')
          and p_professional_id = app_private.current_professional_id(p_organization_id)
        )
      )
    )
$$;

-- Resumo clínico (S8 + S5).
drop policy if exists patient_clinical_summaries_select_sensitive
  on public.patient_clinical_summaries;
drop policy if exists patient_clinical_summaries_insert_sensitive
  on public.patient_clinical_summaries;
drop policy if exists patient_clinical_summaries_update_sensitive
  on public.patient_clinical_summaries;

create policy patient_clinical_summaries_select_clinical
on public.patient_clinical_summaries for select to authenticated
using (
  app_private.super_admin_support_access(organization_id)
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('clinico.ver_resumo_clinico')
  )
);

create policy patient_clinical_summaries_insert_clinical
on public.patient_clinical_summaries for insert to authenticated
with check (
  app_private.super_admin_support_access(organization_id)
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('clinico.ver_resumo_clinico')
  )
);

create policy patient_clinical_summaries_update_clinical
on public.patient_clinical_summaries for update to authenticated
using (
  app_private.super_admin_support_access(organization_id)
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('clinico.ver_resumo_clinico')
  )
)
with check (
  app_private.super_admin_support_access(organization_id)
  or organization_id = app_private.current_organization_id()
);

-- Demais tabelas clínicas: troca o atalho de super admin pelo acesso de
-- suporte em cada política existente, sem reescrever as regras à mão.
do $$
declare
  v_policy record;
  v_using text;
  v_check text;
  v_roles text;
  v_sql text;
begin
  -- Caminho de busca fixo: o texto das políticas sai com o schema escrito.
  perform set_config('search_path', 'pg_catalog, public', true);

  for v_policy in
    select policies.schemaname,
           policies.tablename,
           policies.policyname,
           policies.permissive,
           policies.roles,
           policies.cmd,
           policies.qual,
           policies.with_check
    from pg_policies as policies
    where policies.schemaname = 'public'
      and policies.tablename = any (array[
        'encounters',
        'encounter_entries',
        'encounter_diagnoses',
        'encounter_addenda',
        'encounter_attachments',
        'clinical_documents',
        'clinical_document_consent_events',
        'patient_diagnoses'
      ])
      and (
        coalesce(policies.qual, '') like '%current_is_super_admin()%'
        or coalesce(policies.with_check, '') like '%current_is_super_admin()%'
      )
  loop
    v_using := replace(
      v_policy.qual,
      'app_private.current_is_super_admin()',
      'app_private.super_admin_support_access(organization_id)'
    );
    v_check := replace(
      v_policy.with_check,
      'app_private.current_is_super_admin()',
      'app_private.super_admin_support_access(organization_id)'
    );

    select string_agg(
      case when role_name = 'public' then 'public' else quote_ident(role_name) end,
      ', '
    )
      into v_roles
    from unnest(v_policy.roles) as role_name;

    v_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename,
      v_policy.permissive,
      v_policy.cmd,
      v_roles
    );
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute format(
      'drop policy %I on %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );
    execute v_sql;
    raise notice 'Política clínica restrita ao suporte: %.%',
      v_policy.tablename,
      v_policy.policyname;
  end loop;
end;
$$;

commit;
