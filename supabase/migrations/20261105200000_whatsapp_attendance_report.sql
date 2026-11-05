-- Raio-X W4: indicadores do atendimento por WhatsApp.
--
-- ATENÇÃO: criada no repositório e NÃO aplicada em produção. Teste num
-- branch: Relatórios > Atendimento no WhatsApp com um período que tenha
-- conversas; confira os números com a caixa de entrada.
--
-- O gestor não sabia o tempo de primeira resposta, o volume por atendente
-- nem quantas conversas viram consulta. A função calcula, no período:
-- - conversas com mensagem do paciente e quantas foram respondidas por uma
--   pessoa (notas internas e mensagens de sistema não contam);
-- - tempo até a primeira resposta humana (mediana, média e % em até 1 hora);
-- - por atendente: atendimentos, conversas, mensagens enviadas e mediana da
--   primeira resposta;
-- - conversas que viraram agendamento: contato ligado a paciente que ganhou
--   agendamento criado em até 7 dias depois da primeira mensagem.

create or replace function public.whatsapp_attendance_report(
  p_from timestamptz,
  p_to timestamptz,
  p_impersonation_session_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_result jsonb;
begin
  select *
    into v_context
  from app_private.resolve_effective_request_context(p_impersonation_session_id);

  if v_context.effective_user_id is null
    or not (
      app_private.user_has_permission(v_context.effective_user_id, 'relatorio.operacional')
      or app_private.user_has_permission(v_context.effective_user_id, 'atendimento.configurar')
    ) then
    raise exception 'Not allowed to view attendance report.' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_to <= p_from
    or p_to - p_from > interval '400 days' then
    raise exception 'Invalid report period.' using errcode = '22023';
  end if;

  with first_inbound as (
    select
      messages.conversation_id,
      min(coalesce(messages.sent_at, messages.created_at)) as asked_at
    from public.whatsapp_messages as messages
    where messages.organization_id = v_context.organization_id
      and messages.direction = 'inbound'
      and messages.message_type not in ('note', 'system')
      and coalesce(messages.sent_at, messages.created_at) >= p_from
      and coalesce(messages.sent_at, messages.created_at) < p_to
    group by messages.conversation_id
  ),
  first_reply as (
    select distinct on (inbound.conversation_id)
      inbound.conversation_id,
      inbound.asked_at,
      reply.sender_user_id,
      coalesce(reply.sent_at, reply.created_at) as replied_at
    from first_inbound as inbound
    join public.whatsapp_messages as reply
      on reply.organization_id = v_context.organization_id
     and reply.conversation_id = inbound.conversation_id
     and reply.direction = 'outbound'
     and reply.sender_user_id is not null
     and reply.message_type not in ('note', 'system')
     and coalesce(reply.sent_at, reply.created_at) >= inbound.asked_at
    order by inbound.conversation_id, coalesce(reply.sent_at, reply.created_at)
  ),
  response as (
    select
      inbound.conversation_id,
      inbound.asked_at,
      reply.sender_user_id,
      extract(epoch from (reply.replied_at - inbound.asked_at)) / 60.0
        as minutes
    from first_inbound as inbound
    left join first_reply as reply
      on reply.conversation_id = inbound.conversation_id
  ),
  converted as (
    select distinct inbound.conversation_id
    from first_inbound as inbound
    join public.whatsapp_conversations as conversations
      on conversations.organization_id = v_context.organization_id
     and conversations.id = inbound.conversation_id
    join public.whatsapp_contacts as contacts
      on contacts.organization_id = v_context.organization_id
     and contacts.id = conversations.contact_id
     and contacts.patient_id is not null
    join public.appointments
      on appointments.organization_id = v_context.organization_id
     and appointments.patient_id = contacts.patient_id
     and appointments.created_at >= inbound.asked_at
     and appointments.created_at < inbound.asked_at + interval '7 days'
  ),
  attendants as (
    select
      sessions.attendant_user_id as user_id,
      count(*) as sessions,
      count(distinct sessions.conversation_id) as conversations
    from public.whatsapp_attendance_sessions as sessions
    where sessions.organization_id = v_context.organization_id
      and sessions.attendant_user_id is not null
      and sessions.started_at >= p_from
      and sessions.started_at < p_to
    group by sessions.attendant_user_id
  ),
  sent as (
    select messages.sender_user_id as user_id, count(*) as messages_sent
    from public.whatsapp_messages as messages
    where messages.organization_id = v_context.organization_id
      and messages.direction = 'outbound'
      and messages.sender_user_id is not null
      and messages.message_type not in ('note', 'system')
      and coalesce(messages.sent_at, messages.created_at) >= p_from
      and coalesce(messages.sent_at, messages.created_at) < p_to
    group by messages.sender_user_id
  ),
  first_by_user as (
    select
      response.sender_user_id as user_id,
      percentile_cont(0.5) within group (order by response.minutes)
        as median_minutes,
      count(*) as first_replies
    from response
    where response.sender_user_id is not null
    group by response.sender_user_id
  ),
  people as (
    select user_id from attendants
    union
    select user_id from sent
    union
    select user_id from first_by_user
  )
  select jsonb_build_object(
    'conversations', (select count(*) from response),
    'answered', (select count(*) from response where minutes is not null),
    'unanswered', (select count(*) from response where minutes is null),
    'median_first_response_minutes', (
      select round(
        (percentile_cont(0.5) within group (order by minutes))::numeric, 1
      )
      from response where minutes is not null
    ),
    'average_first_response_minutes', (
      select round(avg(minutes)::numeric, 1)
      from response where minutes is not null
    ),
    'answered_within_hour', (
      select count(*) from response where minutes is not null and minutes <= 60
    ),
    'converted', (select count(*) from converted),
    'by_attendant', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', people.user_id,
          'name', coalesce(users.name, 'Usuário removido'),
          'sessions', coalesce(attendants.sessions, 0),
          'conversations', coalesce(attendants.conversations, 0),
          'messages_sent', coalesce(sent.messages_sent, 0),
          'first_replies', coalesce(first_by_user.first_replies, 0),
          'median_first_response_minutes',
            round(first_by_user.median_minutes::numeric, 1)
        )
        order by coalesce(sent.messages_sent, 0) desc
      )
      from people
      left join public.app_users as users
        on users.organization_id = v_context.organization_id
       and users.id = people.user_id
      left join attendants on attendants.user_id = people.user_id
      left join sent on sent.user_id = people.user_id
      left join first_by_user on first_by_user.user_id = people.user_id
    ), '[]'::jsonb)
  )
    into v_result;

  return v_result;
end;
$$;

revoke all on function public.whatsapp_attendance_report(timestamptz, timestamptz, uuid)
  from public, anon;
grant execute on function public.whatsapp_attendance_report(timestamptz, timestamptz, uuid)
  to authenticated, service_role;
