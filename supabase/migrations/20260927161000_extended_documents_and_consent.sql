-- Documentos por finalidade e consentimento presencial com evidencias imutaveis.
insert into public.permissions (code, category, description) values
  ('clinico.emitir_documento', 'Clínico', 'Emitir encaminhamentos, relatórios e orientações'),
  ('clinico.gerenciar_consentimento', 'Clínico', 'Preparar termos e registrar assinaturas e revogações')
on conflict (code) do update set category = excluded.category, description = excluded.description;

-- Perfis que ja emitem atestados recebem as novas capacidades; podem ser
-- restringidas individualmente na tela de permissoes. Inclui o perfil base.
insert into public.profile_permissions (profile_id, permission_id)
select existing.profile_id, added.id
from public.profile_permissions existing
join public.permissions current_permission on current_permission.id = existing.permission_id
cross join public.permissions added
where current_permission.code = 'clinico.emitir_atestado'
  and added.code in ('clinico.emitir_documento', 'clinico.gerenciar_consentimento')
on conflict do nothing;

alter table public.clinical_document_templates drop constraint clinical_document_templates_document_type_check;
alter table public.clinical_document_templates add constraint clinical_document_templates_document_type_check
check (document_type in ('prescription', 'exam_request', 'medical_certificate', 'attendance_declaration',
  'referral', 'clinical_report', 'patient_instructions', 'informed_consent'));
alter table public.clinical_documents drop constraint clinical_documents_document_type_check;
alter table public.clinical_documents add constraint clinical_documents_document_type_check
check (document_type in ('prescription', 'exam_request', 'medical_certificate', 'attendance_declaration',
  'referral', 'clinical_report', 'patient_instructions', 'informed_consent'));

create or replace function app_private.clinical_document_permission(p_document_type text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case p_document_type
    when 'prescription' then 'clinico.prescrever'
    when 'exam_request' then 'clinico.solicitar_exame'
    when 'medical_certificate' then 'clinico.emitir_atestado'
    when 'attendance_declaration' then 'clinico.emitir_atestado'
    when 'referral' then 'clinico.emitir_documento'
    when 'clinical_report' then 'clinico.emitir_documento'
    when 'patient_instructions' then 'clinico.emitir_documento'
    when 'informed_consent' then 'clinico.gerenciar_consentimento'
  end
$$;

create or replace function app_private.validate_document_fields()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare v_key text; v_keys text[];
begin
  v_keys := case new.document_type
    when 'referral' then array['destination','reason']
    when 'clinical_report' then array['purpose']
    when 'patient_instructions' then array['care']
    when 'informed_consent' then array['procedure']
    else array[]::text[] end;
  foreach v_key in array v_keys loop
    if jsonb_typeof(new.metadata #> array['fields',v_key]) is distinct from 'string'
      or length(trim(new.metadata #>> array['fields',v_key])) not between 3 and 1000 then
      raise exception 'Missing document purpose fields' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
create trigger validate_document_fields before insert on public.clinical_documents
for each row execute function app_private.validate_document_fields();

-- Modelos continuam RPC-only; consulta inclui as duas novas permissoes.
create policy extended_document_templates_select on public.clinical_document_templates
for select to authenticated using (
  organization_id = app_private.current_organization_id() and (
    app_private.current_user_has_permission('clinico.emitir_documento')
    or app_private.current_user_has_permission('clinico.gerenciar_consentimento')
  )
);
create policy extended_document_versions_select on public.clinical_document_template_versions
for select to authenticated using (
  organization_id = app_private.current_organization_id() and (
    app_private.current_user_has_permission('clinico.emitir_documento')
    or app_private.current_user_has_permission('clinico.gerenciar_consentimento')
  )
);

create table public.clinical_document_consent_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  document_id uuid not null,
  event_type text not null check (event_type in ('signed','cancelled','revoked')),
  signer_role text check (signer_role in ('patient','guardian')),
  signer_name text,
  signer_document text,
  guardian_relationship text,
  signature jsonb,
  reason text,
  document_hash text not null,
  recorded_by_user_id uuid not null,
  actor_user_id uuid not null,
  impersonation_session_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, document_id) references public.clinical_documents(organization_id,id),
  foreign key (organization_id, recorded_by_user_id) references public.app_users(organization_id,id),
  foreign key (actor_user_id) references public.app_users(id),
  foreign key (impersonation_session_id) references public.impersonation_sessions(id),
  unique (document_id,event_type),
  check (event_type <> 'signed' or (
    signer_role is not null and nullif(trim(signer_name),'') is not null
    and nullif(trim(signer_document),'') is not null and signature is not null
    and (signer_role <> 'guardian' or nullif(trim(guardian_relationship),'') is not null)
  ))
);
create index clinical_document_consent_events_document_idx
on public.clinical_document_consent_events(organization_id,document_id,created_at);
alter table public.clinical_document_consent_events enable row level security;
create policy clinical_document_consent_events_select
on public.clinical_document_consent_events for select to authenticated using (
  exists (select 1 from public.clinical_documents d
    where d.organization_id = clinical_document_consent_events.organization_id
      and d.id = clinical_document_consent_events.document_id)
);
revoke all on public.clinical_document_consent_events from anon, authenticated, service_role;
grant select on public.clinical_document_consent_events to authenticated;
grant select on public.clinical_document_consent_events to service_role;
create trigger prevent_consent_event_change before update or delete
on public.clinical_document_consent_events for each row
execute function app_private.prevent_clinical_immutable_change();

create or replace function app_private.is_valid_consent_signature(p_signature jsonb, p_name text)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare v_stroke jsonb; v_point jsonb; v_count int := 0;
  v_min_x numeric := 1; v_min_y numeric := 1; v_max_x numeric := 0; v_max_y numeric := 0;
  v_x numeric; v_y numeric;
begin
  if p_signature is null or jsonb_typeof(p_signature) <> 'object' or pg_column_size(p_signature) > 120000 then return false; end if;
  if p_signature->>'method' = 'typed' then
    return coalesce(length(trim(p_name)),0) between 3 and 160
      and trim(p_signature->>'name') is not distinct from trim(p_name);
  end if;
  if p_signature->>'method' is distinct from 'drawn' or jsonb_typeof(p_signature->'strokes') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_signature->'strokes') not between 1 and 100 then return false; end if;
  for v_stroke in select value from jsonb_array_elements(p_signature->'strokes') loop
    if jsonb_typeof(v_stroke) <> 'array' or jsonb_array_length(v_stroke) < 2 then return false; end if;
    for v_point in select value from jsonb_array_elements(v_stroke) loop
      if jsonb_typeof(v_point->'x') is distinct from 'number' or jsonb_typeof(v_point->'y') is distinct from 'number' then return false; end if;
      v_x := (v_point->>'x')::numeric; v_y := (v_point->>'y')::numeric;
      if v_x < 0 or v_x > 1 or v_y < 0 or v_y > 1 then return false; end if;
      v_count := v_count + 1;
      if v_count > 2048 then return false; end if;
      v_min_x := least(v_min_x,v_x); v_max_x := greatest(v_max_x,v_x);
      v_min_y := least(v_min_y,v_y); v_max_y := greatest(v_max_y,v_y);
    end loop;
  end loop;
  return v_count >= 4 and greatest(v_max_x-v_min_x,v_max_y-v_min_y) >= 0.03;
exception when others then return false;
end;
$$;

-- Mesmo escopo do prontuario, inclusive durante suporte por impersonacao.
create or replace function app_private.require_consent_document(p_document_id uuid, p_session_id uuid)
returns public.clinical_documents language plpgsql security definer
set search_path = pg_catalog, public, app_private as $$
declare v_context record; v_document public.clinical_documents;
begin
  select * into v_context from app_private.resolve_effective_request_context(p_session_id);
  select * into v_document from public.clinical_documents
    where id = p_document_id and organization_id = v_context.organization_id and document_type = 'informed_consent';
  if v_document.id is null then raise exception 'Consent document not found' using errcode = 'P0002'; end if;
  if not (app_private.user_has_permission(v_context.effective_user_id,'clinico.ver_prontuario') or (
    app_private.user_has_permission(v_context.effective_user_id,'clinico.ver_prontuario_proprios')
    and exists (select 1 from public.professionals where id = v_document.professional_id
      and organization_id = v_context.organization_id and user_id = v_context.effective_user_id and active)
  )) then raise exception 'Consent access denied' using errcode = '42501'; end if;
  return v_document;
end;
$$;

create or replace function public.get_clinical_document_consent(p_document_id uuid, p_impersonation_session_id uuid default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, app_private as $$
declare v_document public.clinical_documents; v_context record;
begin
  v_document := app_private.require_consent_document(p_document_id,p_impersonation_session_id);
  select * into v_context from app_private.resolve_effective_request_context(p_impersonation_session_id);
  return jsonb_build_object('id', v_document.id, 'encounterId', v_document.encounter_id, 'patientId', v_document.patient_id,
    'title', v_document.title, 'body', v_document.body, 'issuedAt', v_document.issued_at,
    'procedure', v_document.metadata #>> '{fields,procedure}',
    'patientName', v_document.metadata #>> '{render,patient,full_name}',
    'timeZone', coalesce(v_document.metadata #>> '{render,timezone}', 'America/Fortaleza'),
    'canManage', app_private.user_has_permission(v_context.effective_user_id,'clinico.gerenciar_consentimento'),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) || jsonb_build_object('recorded_by_name', u.name) order by e.created_at),'[]'::jsonb)
      from public.clinical_document_consent_events e join public.app_users u on u.id=e.recorded_by_user_id
      where e.organization_id=v_document.organization_id and e.document_id=v_document.id));
end;
$$;

create or replace function public.record_clinical_document_consent(
  p_document_id uuid, p_event_type text, p_evidence jsonb default '{}'::jsonb,
  p_impersonation_session_id uuid default null
)
returns uuid language plpgsql security definer set search_path = pg_catalog, public, app_private as $$
declare v_document public.clinical_documents; v_context record; v_previous text; v_event_id uuid; v_hash text;
begin
  v_document := app_private.require_consent_document(p_document_id,p_impersonation_session_id);
  select * into v_context from app_private.resolve_effective_request_context(p_impersonation_session_id);
  if not app_private.user_has_permission(v_context.effective_user_id,'clinico.gerenciar_consentimento') then
    raise exception 'Consent management denied' using errcode = '42501';
  end if;
  if p_event_type is null or p_event_type not in ('signed','cancelled','revoked')
    or p_evidence is null or jsonb_typeof(p_evidence) <> 'object' or pg_column_size(p_evidence) > 130000 then
    raise exception 'Invalid consent evidence' using errcode = '22023';
  end if;
  -- Serializa transicoes; o texto original e as evidencias nao sao editados.
  perform 1 from public.clinical_documents where id=v_document.id for update;
  select event_type into v_previous from public.clinical_document_consent_events
    where document_id=v_document.id order by created_at desc limit 1;
  if (p_event_type in ('signed','cancelled') and v_previous is not null)
    or (p_event_type='revoked' and v_previous is distinct from 'signed') then
    raise exception 'Consent state changed' using errcode = '40001';
  end if;
  if p_event_type='signed' then
    if p_evidence->'acknowledged' is distinct from 'true'::jsonb
      or p_evidence->>'signer_role' is null or p_evidence->>'signer_role' not in ('patient','guardian')
      or coalesce(length(trim(p_evidence->>'signer_name')),0) not between 3 and 160
      or coalesce(length(trim(p_evidence->>'signer_document')),0) not between 3 and 80
      or (p_evidence->>'signer_role'='patient' and trim(p_evidence->>'signer_name')
        is distinct from trim(v_document.metadata #>> '{render,patient,full_name}'))
      or (p_evidence->>'signer_role'='guardian' and coalesce(length(trim(p_evidence->>'guardian_relationship')),0) not between 3 and 160)
      or not app_private.is_valid_consent_signature(p_evidence->'signature',p_evidence->>'signer_name') then
      raise exception 'Invalid consent signature' using errcode = '22023';
    end if;
  elsif coalesce(length(trim(p_evidence->>'reason')),0) not between 5 and 2000 then
    raise exception 'Consent reason required' using errcode = '22023';
  end if;
  v_hash := encode(sha256(convert_to(jsonb_build_object('id',v_document.id,'title',v_document.title,
    'body',v_document.body,'metadata',v_document.metadata)::text,'UTF8')),'hex');
  insert into public.clinical_document_consent_events(organization_id,document_id,event_type,
    signer_role,signer_name,signer_document,guardian_relationship,signature,reason,document_hash,
    recorded_by_user_id,actor_user_id,impersonation_session_id)
  values(v_document.organization_id,v_document.id,p_event_type,
    case when p_event_type='signed' then p_evidence->>'signer_role' end,
    case when p_event_type='signed' then trim(p_evidence->>'signer_name') end,
    case when p_event_type='signed' then trim(p_evidence->>'signer_document') end,
    case when p_event_type='signed' and p_evidence->>'signer_role'='guardian' then trim(p_evidence->>'guardian_relationship') end,
    case when p_event_type='signed' then p_evidence->'signature' end,
    case when p_event_type<>'signed' then trim(p_evidence->>'reason') end,
    v_hash,v_context.effective_user_id,v_context.actor_user_id,v_context.impersonation_session_id)
  returning id into v_event_id;
  insert into public.audit_logs(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(v_document.organization_id,v_context.actor_user_id,'clinical_consent.'||p_event_type,
    'clinical_documents',v_document.id,jsonb_build_object('event_id',v_event_id,'effective_user_id',v_context.effective_user_id,
      'impersonation_session_id',v_context.impersonation_session_id,'document_hash',v_hash));
  return v_event_id;
end;
$$;

revoke all on function app_private.validate_document_fields() from public;
revoke all on function app_private.is_valid_consent_signature(jsonb,text) from public;
revoke all on function app_private.require_consent_document(uuid,uuid) from public;
revoke all on function public.get_clinical_document_consent(uuid,uuid) from public;
revoke all on function public.record_clinical_document_consent(uuid,text,jsonb,uuid) from public;
grant execute on function public.get_clinical_document_consent(uuid,uuid) to authenticated;
grant execute on function public.record_clinical_document_consent(uuid,text,jsonb,uuid) to authenticated;
