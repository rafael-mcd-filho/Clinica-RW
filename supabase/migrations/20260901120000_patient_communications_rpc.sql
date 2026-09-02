-- A aba Mensagens do paciente deixa de espelhar mensagem a mensagem da
-- conversa (isso ja e o atendimento) e passa a listar as comunicacoes
-- disparadas para ele: lembretes, confirmacoes e o que mais as automacoes
-- enviarem.
--
-- Esses envios vivem em notification_outbox, que a RLS abre apenas para quem
-- tem 'automacao.ver' e que nao guarda patient_id -- o vinculo com o paciente
-- e o destinatario. Dai a RPC: security definer para alcancar a tabela, com a
-- checagem de permissao feita aqui dentro e o casamento de telefone/e-mail
-- pelo mesmo normalizador que os opt-outs ja usam.

-- Os ultimos 8 digitos absorvem as variacoes de DDI e do nono digito, que e
-- onde os formatos divergem (o cadastro guarda "(84) 99646-3570", a automacao
-- dispara para "5584996463570").
create index if not exists notification_outbox_recipient_tail_idx
  on public.notification_outbox (
    organization_id,
    right(app_private.normalize_communication_recipient(channel, recipient), 8)
  );

create or replace function public.get_patient_communications(
  p_patient_id uuid,
  p_limit integer default 20
)
returns table (
  id uuid,
  channel text,
  recipient text,
  subject text,
  body text,
  status text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  error_message text,
  template_name text,
  automation_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_organization_id uuid;
  v_email text;
begin
  select
    p.organization_id,
    nullif(lower(trim(coalesce(p.email, ''))), '')
  into v_organization_id, v_email
  from public.patients p
  where p.id = p_patient_id;

  if v_organization_id is null then
    return;
  end if;

  if not app_private.current_is_super_admin() and (
    v_organization_id is distinct from app_private.current_organization_id()
    or not app_private.current_user_has_permission('atendimento.ver')
  ) then
    raise exception 'Insufficient communication permission' using errcode = '42501';
  end if;

  return query
  with phone_tails as (
    select distinct right(raw.normalized, 8) as tail
    from (
      select app_private.normalize_communication_recipient('whatsapp', p.phone)
        as normalized
      from public.patients p
      where p.id = p_patient_id
      union
      select app_private.normalize_communication_recipient('whatsapp', p.whatsapp)
      from public.patients p
      where p.id = p_patient_id
      union
      select app_private.normalize_communication_recipient('whatsapp', c.phone)
      from public.whatsapp_contacts c
      where c.organization_id = v_organization_id
        and c.patient_id = p_patient_id
    ) raw
    where length(coalesce(raw.normalized, '')) >= 8
  ),
  tails as (
    select phone_tails.tail from phone_tails
    union
    select right(v_email, 8) where v_email is not null
  )
  select
    n.id,
    n.channel::text,
    n.recipient::text,
    n.subject::text,
    n.body::text,
    n.status::text,
    n.scheduled_at,
    n.sent_at,
    n.error_message::text,
    t.name::text,
    r.name::text
  from public.notification_outbox n
  left join public.message_templates t
    on t.id = n.template_id
   and t.organization_id = n.organization_id
  left join public.automation_rules r
    on r.id = n.automation_rule_id
   and r.organization_id = n.organization_id
  where n.organization_id = v_organization_id
    -- Primeiro o corte pelo indice, depois a confirmacao exata por canal.
    and right(
      app_private.normalize_communication_recipient(n.channel, n.recipient), 8
    ) in (select tails.tail from tails)
    and case
      when n.channel = 'email' then
        app_private.normalize_communication_recipient(n.channel, n.recipient)
          = v_email
      else right(
        app_private.normalize_communication_recipient(n.channel, n.recipient), 8
      ) in (select phone_tails.tail from phone_tails)
    end
  order by coalesce(n.sent_at, n.scheduled_at) desc, n.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_patient_communications(uuid, integer)
  from public;

grant execute on function public.get_patient_communications(uuid, integer)
  to authenticated, service_role;
