-- Gestao de tags centralizada em Cadastros.
--
-- Ate aqui tag podia ser criada em dois lugares com regras diferentes: em
-- Configuracoes, via create_patient_tag (auditado), e na edicao do paciente,
-- com insert direto na tabela (sem auditoria, bastando `paciente.editar`).
-- E nunca podia ser renomeada, recolorida ou excluida.
--
-- A criacao passa a existir so em Cadastros > Tags, e so por funcao:
--
-- * create_patient_tag: passa a recusar nome repetido ignorando maiusculas
--   ("VIP" e "vip" eram duas tags);
-- * list_patient_tags_with_usage: tags com quantos pacientes, conversas e
--   automacoes usam cada uma, para a tela avisar antes de excluir;
-- * update_patient_tag: renomeia/recolore, auditado;
-- * delete_patient_tag: exclui de vez. Pacientes e conversas perdem a tag por
--   cascata; automacoes que poem/tiram a tag sao excluidas junto (sem a tag
--   nao teriam o que fazer). Tudo registrado na auditoria.
--
-- As politicas de insert/update direto em `tags` saem: escrever so pelas
-- funcoes acima garante a auditoria e o lugar unico de criacao.

-- ---------------------------------------------------------------------------
-- Validacao comum de nome/cor
-- ---------------------------------------------------------------------------

create or replace function app_private.assert_valid_patient_tag(
  p_organization_id uuid,
  p_name text,
  p_color text,
  p_ignore_tag_id uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if nullif(trim(coalesce(p_name, '')), '') is null
    or char_length(trim(p_name)) > 80
  then
    raise exception 'Tag name must have between 1 and 80 characters.'
      using errcode = '23514';
  end if;

  if coalesce(p_color, '') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Tag color must use the #RRGGBB format.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.tags tags
    where tags.organization_id = p_organization_id
      and lower(tags.name) = lower(trim(p_name))
      and tags.id is distinct from p_ignore_tag_id
  ) then
    raise exception 'duplicate tag name'
      using errcode = '23505';
  end if;
end;
$$;

revoke all on function app_private.assert_valid_patient_tag(uuid, text, text, uuid)
  from public;

-- ---------------------------------------------------------------------------
-- Criar (mesma assinatura; agora com a checagem de nome repetido)
-- ---------------------------------------------------------------------------

create or replace function public.create_patient_tag(
  p_name text,
  p_color text default '#64748b',
  p_impersonation_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_tag_id uuid;
begin
  select *
    into v_context
  from app_private.resolve_patient_automation_context(
    p_impersonation_session_id,
    'automacao.criar'
  );

  perform app_private.assert_valid_patient_tag(
    v_context.organization_id,
    p_name,
    p_color
  );

  insert into public.tags (organization_id, name, color)
  values (v_context.organization_id, trim(p_name), p_color)
  returning id into v_tag_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'tags.created',
    'tag',
    v_tag_id,
    jsonb_strip_nulls(jsonb_build_object(
      'name', trim(p_name),
      'color', p_color,
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id
    ))
  );

  return v_tag_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Listar com uso
-- ---------------------------------------------------------------------------

create or replace function public.list_patient_tags_with_usage(
  p_impersonation_session_id uuid default null
)
returns table (
  id uuid,
  name text,
  color text,
  patient_count integer,
  conversation_count integer,
  automation_names text[]
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
begin
  select *
    into v_context
  from app_private.resolve_patient_automation_context(
    p_impersonation_session_id,
    'automacao.criar'
  );

  return query
  select
    tags.id,
    tags.name,
    tags.color,
    (
      select count(*)::integer
      from public.patient_tags patient_tags
      where patient_tags.organization_id = tags.organization_id
        and patient_tags.tag_id = tags.id
    ),
    (
      select count(*)::integer
      from public.conversation_tags conversation_tags
      where conversation_tags.organization_id = tags.organization_id
        and conversation_tags.tag_id = tags.id
    ),
    coalesce(
      (
        select array_agg(rules.name order by rules.name)
        from public.automation_rules rules
        where rules.organization_id = tags.organization_id
          and rules.action_type in ('add_tag', 'remove_tag')
          and rules.action_config ->> 'tag_id' = tags.id::text
      ),
      '{}'::text[]
    )
  from public.tags tags
  where tags.organization_id = v_context.organization_id
  order by lower(tags.name);
end;
$$;

-- ---------------------------------------------------------------------------
-- Editar
-- ---------------------------------------------------------------------------

create or replace function public.update_patient_tag(
  p_tag_id uuid,
  p_name text,
  p_color text,
  p_impersonation_session_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_tag public.tags%rowtype;
begin
  select *
    into v_context
  from app_private.resolve_patient_automation_context(
    p_impersonation_session_id,
    'automacao.criar'
  );

  select tags.*
    into v_tag
  from public.tags tags
  where tags.id = p_tag_id
    and tags.organization_id = v_context.organization_id
  for update;

  if v_tag.id is null then
    return false;
  end if;

  perform app_private.assert_valid_patient_tag(
    v_context.organization_id,
    p_name,
    p_color,
    v_tag.id
  );

  update public.tags tags
  set name = trim(p_name),
      color = p_color,
      updated_at = now()
  where tags.id = v_tag.id
    and tags.organization_id = v_tag.organization_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'tags.updated',
    'tag',
    v_tag.id,
    jsonb_strip_nulls(jsonb_build_object(
      'previous_name', v_tag.name,
      'name', trim(p_name),
      'previous_color', v_tag.color,
      'color', p_color,
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id
    ))
  );

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Excluir (com o que depende dela)
-- ---------------------------------------------------------------------------

create or replace function public.delete_patient_tag(
  p_tag_id uuid,
  p_impersonation_session_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_tag public.tags%rowtype;
  v_rule record;
  v_patient_count integer;
  v_conversation_count integer;
  v_automation_names text[] := '{}'::text[];
begin
  select *
    into v_context
  from app_private.resolve_patient_automation_context(
    p_impersonation_session_id,
    'automacao.criar'
  );

  select tags.*
    into v_tag
  from public.tags tags
  where tags.id = p_tag_id
    and tags.organization_id = v_context.organization_id
  for update;

  if v_tag.id is null then
    return false;
  end if;

  select count(*)::integer
    into v_patient_count
  from public.patient_tags patient_tags
  where patient_tags.organization_id = v_tag.organization_id
    and patient_tags.tag_id = v_tag.id;

  select count(*)::integer
    into v_conversation_count
  from public.conversation_tags conversation_tags
  where conversation_tags.organization_id = v_tag.organization_id
    and conversation_tags.tag_id = v_tag.id;

  -- `automation_rules` guarda a tag dentro de action_config, sem FK: sem este
  -- passo as regras sobrariam apontando para uma tag que nao existe. Mesma
  -- checagem de escopo de delete_patient_automation_rule.
  for v_rule in
    select rules.id, rules.name, rules.event_type, rules.action_type,
           rules.conditions
    from public.automation_rules rules
    where rules.organization_id = v_tag.organization_id
      and rules.action_type in ('add_tag', 'remove_tag')
      and rules.action_config ->> 'tag_id' = v_tag.id::text
    order by rules.name
  loop
    if not app_private.user_can_access_patient_automation_conditions(
      v_context.effective_user_id,
      v_context.organization_id,
      v_rule.conditions,
      'write'
    ) then
      raise exception 'Not allowed to access this automation scope.'
        using errcode = '42501';
    end if;

    v_automation_names := v_automation_names || v_rule.name;

    delete from public.patient_tag_rules legacy_rules
    where legacy_rules.id = v_rule.id
      and legacy_rules.organization_id = v_tag.organization_id;

    delete from public.automation_rules rules
    where rules.id = v_rule.id
      and rules.organization_id = v_tag.organization_id;

    insert into public.audit_logs (
      organization_id,
      actor_user_id,
      action,
      resource_type,
      resource_id,
      metadata
    ) values (
      v_context.organization_id,
      v_context.actor_user_id,
      'automation_rules.deleted',
      'automation_rule',
      v_rule.id,
      jsonb_strip_nulls(jsonb_build_object(
        'name', v_rule.name,
        'trigger_type', v_rule.event_type,
        'action_type', v_rule.action_type,
        'reason', 'tag_deleted',
        'tag_id', v_tag.id,
        'effective_user_id', v_context.effective_user_id,
        'impersonation_session_id', v_context.impersonation_session_id
      ))
    );
  end loop;

  -- patient_tags, conversation_tags e patient_tag_rules saem por cascata.
  delete from public.tags tags
  where tags.id = v_tag.id
    and tags.organization_id = v_tag.organization_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_context.organization_id,
    v_context.actor_user_id,
    'tags.deleted',
    'tag',
    v_tag.id,
    jsonb_strip_nulls(jsonb_build_object(
      'name', v_tag.name,
      'color', v_tag.color,
      'patient_count', v_patient_count,
      'conversation_count', v_conversation_count,
      'deleted_automations', to_jsonb(v_automation_names),
      'effective_user_id', v_context.effective_user_id,
      'impersonation_session_id', v_context.impersonation_session_id
    ))
  );

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Escrita direta em `tags` fecha: so pelas funcoes acima
-- ---------------------------------------------------------------------------

drop policy if exists tags_insert_tenant on public.tags;
drop policy if exists tags_update_tenant on public.tags;

-- ---------------------------------------------------------------------------
-- Permissoes
-- ---------------------------------------------------------------------------

revoke all on function public.list_patient_tags_with_usage(uuid)
  from public, anon;
revoke all on function public.update_patient_tag(uuid, text, text, uuid)
  from public, anon;
revoke all on function public.delete_patient_tag(uuid, uuid)
  from public, anon;

grant execute on function public.list_patient_tags_with_usage(uuid)
  to authenticated;
grant execute on function public.update_patient_tag(uuid, text, text, uuid)
  to authenticated;
grant execute on function public.delete_patient_tag(uuid, uuid)
  to authenticated;

comment on function public.list_patient_tags_with_usage(uuid) is
  'Tags da empresa com quantos pacientes, conversas e automacoes usam cada uma.';
comment on function public.update_patient_tag(uuid, text, text, uuid) is
  'Renomeia/recolore uma tag, recusando nome repetido (sem diferenciar maiusculas), com auditoria.';
comment on function public.delete_patient_tag(uuid, uuid) is
  'Exclui a tag, tirando-a de pacientes e conversas e excluindo as automacoes que a usam, com auditoria.';
