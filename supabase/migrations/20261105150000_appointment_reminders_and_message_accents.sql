-- Raio-X C1 e N6: lembretes de consulta que de fato disparam e mensagens
-- automáticas com acento.
--
-- ATENÇÃO: criada no repositório e NÃO aplicada em produção. Teste num
-- branch do Supabase: ligar o lembrete na tela Configurações > Mensagens
-- automáticas, ter um agendamento nas próximas 24 h com WhatsApp do paciente
-- e chamar /api/jobs/dispatch (o cron) duas vezes — deve sair um lembrete só.
--
-- A regra "Lembrete de consulta por WhatsApp" existia, mas nada gerava o
-- evento appointment.reminder_due: o lembrete nunca saía. Agora a manutenção
-- agendada (run_scheduled_maintenance, chamada pelo cron) gera o evento uma
-- vez por agendamento, dentro da antecedência da regra.
--
-- Os textos padrão iam sem acento para o paciente ("Ola..., recebemos sua
-- solicitacao"). Os modelos que a clínica não editou são corrigidos; os
-- editados ficam como estão.

begin;

create or replace function app_private.seed_automation_templates(
  p_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  insert into public.message_templates (
    organization_id,
    template_key,
    channel,
    name,
    subject_template,
    body_template,
    variable_keys
  )
  values
    (
      p_organization_id,
      'online_booking_requested',
      'email',
      'Solicitação online recebida',
      'Recebemos sua solicitação de agendamento',
      'Olá {{patient_name}}, recebemos sua solicitação para {{requested_start_at}}. A clínica ainda vai confirmar o horário. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'online_booking_requested',
      'whatsapp',
      'Solicitação online recebida - WhatsApp',
      '',
      'Olá {{patient_name}}, recebemos sua solicitação para {{requested_start_at}}. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'online_booking_confirmed',
      'email',
      'Agendamento confirmado',
      'Seu agendamento foi confirmado',
      'Olá {{patient_name}}, seu agendamento de {{requested_start_at}} foi confirmado. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'online_booking_confirmed',
      'whatsapp',
      'Agendamento confirmado - WhatsApp',
      '',
      'Olá {{patient_name}}, seu agendamento de {{requested_start_at}} foi confirmado. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'online_booking_rejected',
      'email',
      'Solicitação não confirmada',
      'Não foi possível confirmar seu horário',
      'Olá {{patient_name}}, não foi possível confirmar sua solicitação de {{requested_start_at}}. {{review_notes}}',
      array['patient_name', 'requested_start_at', 'review_notes']
    ),
    (
      p_organization_id,
      'online_booking_rejected',
      'whatsapp',
      'Solicitação não confirmada - WhatsApp',
      '',
      'Olá {{patient_name}}, não foi possível confirmar sua solicitação de {{requested_start_at}}. {{review_notes}}',
      array['patient_name', 'requested_start_at', 'review_notes']
    ),
    (
      p_organization_id,
      'online_booking_cancelled',
      'email',
      'Agendamento cancelado',
      'Seu agendamento foi cancelado',
      'Olá {{patient_name}}, seu agendamento de {{requested_start_at}} foi cancelado. {{review_notes}}',
      array['patient_name', 'requested_start_at', 'review_notes']
    ),
    (
      p_organization_id,
      'online_booking_cancelled',
      'whatsapp',
      'Agendamento cancelado - WhatsApp',
      '',
      'Olá {{patient_name}}, seu agendamento de {{requested_start_at}} foi cancelado. {{review_notes}}',
      array['patient_name', 'requested_start_at', 'review_notes']
    ),
    (
      p_organization_id,
      'online_booking_rescheduled',
      'email',
      'Solicitação remarcada',
      'Sua solicitação foi remarcada',
      'Olá {{patient_name}}, sua solicitação agora está para {{requested_start_at}}. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'online_booking_rescheduled',
      'whatsapp',
      'Solicitação remarcada - WhatsApp',
      '',
      'Olá {{patient_name}}, sua solicitação agora está para {{requested_start_at}}. Acompanhe em {{request_link}}.',
      array['patient_name', 'requested_start_at', 'request_link']
    ),
    (
      p_organization_id,
      'appointment_reminder',
      'whatsapp',
      'Lembrete de consulta',
      '',
      'Olá {{patient_name}}! Lembrete do seu agendamento: {{procedure_name}} com {{professional_name}} em {{appointment_start_at}}, na {{clinic_name}}. Se não puder comparecer, responda esta mensagem para remarcar.',
      array['patient_name', 'appointment_start_at', 'procedure_name', 'professional_name', 'clinic_name']
    ),
    (
      p_organization_id,
      'appointment_nps',
      'whatsapp',
      'NPS pós-atendimento',
      '',
      'Olá {{patient_name}}, como foi sua experiência no atendimento de hoje? {{nps_link}}',
      array['patient_name', 'nps_link']
    ),
    (
      p_organization_id,
      'finance_payment_reminder',
      'whatsapp',
      'Lembrete de cobrança',
      '',
      'Olá {{patient_name}}, identificamos um pagamento pendente de {{amount}} com vencimento em {{due_date}}.',
      array['patient_name', 'amount', 'due_date']
    )
  on conflict (organization_id, template_key, channel)
  do update set
    name = excluded.name,
    subject_template = excluded.subject_template,
    body_template = excluded.body_template,
    variable_keys = excluded.variable_keys,
    updated_at = statement_timestamp();
end;
$$;

update public.message_templates set body_template = 'Solicitação online recebida' where body_template = 'Solicitacao online recebida';
update public.message_templates set subject_template = 'Solicitação online recebida' where subject_template = 'Solicitacao online recebida';
update public.message_templates set name = 'Solicitação online recebida' where name = 'Solicitacao online recebida';
update public.message_templates set body_template = 'Recebemos sua solicitação de agendamento' where body_template = 'Recebemos sua solicitacao de agendamento';
update public.message_templates set subject_template = 'Recebemos sua solicitação de agendamento' where subject_template = 'Recebemos sua solicitacao de agendamento';
update public.message_templates set name = 'Recebemos sua solicitação de agendamento' where name = 'Recebemos sua solicitacao de agendamento';
update public.message_templates set body_template = 'Olá {{patient_name}}, recebemos sua solicitação para {{requested_start_at}}. A clínica ainda vai confirmar o horário. Acompanhe em {{request_link}}.' where body_template = 'Ola {{patient_name}}, recebemos sua solicitacao para {{requested_start_at}}. A clinica ainda vai confirmar o horario. Acompanhe em {{request_link}}.';
update public.message_templates set subject_template = 'Olá {{patient_name}}, recebemos sua solicitação para {{requested_start_at}}. A clínica ainda vai confirmar o horário. Acompanhe em {{request_link}}.' where subject_template = 'Ola {{patient_name}}, recebemos sua solicitacao para {{requested_start_at}}. A clinica ainda vai confirmar o horario. Acompanhe em {{request_link}}.';
update public.message_templates set name = 'Olá {{patient_name}}, recebemos sua solicitação para {{requested_start_at}}. A clínica ainda vai confirmar o horário. Acompanhe em {{request_link}}.' where name = 'Ola {{patient_name}}, recebemos sua solicitacao para {{requested_start_at}}. A clinica ainda vai confirmar o horario. Acompanhe em {{request_link}}.';
update public.message_templates set body_template = 'Solicitação online recebida - WhatsApp' where body_template = 'Solicitacao online recebida - WhatsApp';
update public.message_templates set subject_template = 'Solicitação online recebida - WhatsApp' where subject_template = 'Solicitacao online recebida - WhatsApp';
update public.message_templates set name = 'Solicitação online recebida - WhatsApp' where name = 'Solicitacao online recebida - WhatsApp';
update public.message_templates set body_template = 'Olá {{patient_name}}, recebemos sua solicitação para {{requested_start_at}}. Acompanhe em {{request_link}}.' where body_template = 'Ola {{patient_name}}, recebemos sua solicitacao para {{requested_start_at}}. Acompanhe em {{request_link}}.';
update public.message_templates set subject_template = 'Olá {{patient_name}}, recebemos sua solicitação para {{requested_start_at}}. Acompanhe em {{request_link}}.' where subject_template = 'Ola {{patient_name}}, recebemos sua solicitacao para {{requested_start_at}}. Acompanhe em {{request_link}}.';
update public.message_templates set name = 'Olá {{patient_name}}, recebemos sua solicitação para {{requested_start_at}}. Acompanhe em {{request_link}}.' where name = 'Ola {{patient_name}}, recebemos sua solicitacao para {{requested_start_at}}. Acompanhe em {{request_link}}.';
update public.message_templates set body_template = 'Olá {{patient_name}}, seu agendamento de {{requested_start_at}} foi confirmado. Acompanhe em {{request_link}}.' where body_template = 'Ola {{patient_name}}, seu agendamento de {{requested_start_at}} foi confirmado. Acompanhe em {{request_link}}.';
update public.message_templates set subject_template = 'Olá {{patient_name}}, seu agendamento de {{requested_start_at}} foi confirmado. Acompanhe em {{request_link}}.' where subject_template = 'Ola {{patient_name}}, seu agendamento de {{requested_start_at}} foi confirmado. Acompanhe em {{request_link}}.';
update public.message_templates set name = 'Olá {{patient_name}}, seu agendamento de {{requested_start_at}} foi confirmado. Acompanhe em {{request_link}}.' where name = 'Ola {{patient_name}}, seu agendamento de {{requested_start_at}} foi confirmado. Acompanhe em {{request_link}}.';
update public.message_templates set body_template = 'Solicitação não confirmada' where body_template = 'Solicitacao nao confirmada';
update public.message_templates set subject_template = 'Solicitação não confirmada' where subject_template = 'Solicitacao nao confirmada';
update public.message_templates set name = 'Solicitação não confirmada' where name = 'Solicitacao nao confirmada';
update public.message_templates set body_template = 'Não foi possível confirmar seu horário' where body_template = 'Nao foi possivel confirmar seu horario';
update public.message_templates set subject_template = 'Não foi possível confirmar seu horário' where subject_template = 'Nao foi possivel confirmar seu horario';
update public.message_templates set name = 'Não foi possível confirmar seu horário' where name = 'Nao foi possivel confirmar seu horario';
update public.message_templates set body_template = 'Olá {{patient_name}}, não foi possível confirmar sua solicitação de {{requested_start_at}}. {{review_notes}}' where body_template = 'Ola {{patient_name}}, nao foi possivel confirmar sua solicitacao de {{requested_start_at}}. {{review_notes}}';
update public.message_templates set subject_template = 'Olá {{patient_name}}, não foi possível confirmar sua solicitação de {{requested_start_at}}. {{review_notes}}' where subject_template = 'Ola {{patient_name}}, nao foi possivel confirmar sua solicitacao de {{requested_start_at}}. {{review_notes}}';
update public.message_templates set name = 'Olá {{patient_name}}, não foi possível confirmar sua solicitação de {{requested_start_at}}. {{review_notes}}' where name = 'Ola {{patient_name}}, nao foi possivel confirmar sua solicitacao de {{requested_start_at}}. {{review_notes}}';
update public.message_templates set body_template = 'Solicitação não confirmada - WhatsApp' where body_template = 'Solicitacao nao confirmada - WhatsApp';
update public.message_templates set subject_template = 'Solicitação não confirmada - WhatsApp' where subject_template = 'Solicitacao nao confirmada - WhatsApp';
update public.message_templates set name = 'Solicitação não confirmada - WhatsApp' where name = 'Solicitacao nao confirmada - WhatsApp';
update public.message_templates set body_template = 'Olá {{patient_name}}, seu agendamento de {{requested_start_at}} foi cancelado. {{review_notes}}' where body_template = 'Ola {{patient_name}}, seu agendamento de {{requested_start_at}} foi cancelado. {{review_notes}}';
update public.message_templates set subject_template = 'Olá {{patient_name}}, seu agendamento de {{requested_start_at}} foi cancelado. {{review_notes}}' where subject_template = 'Ola {{patient_name}}, seu agendamento de {{requested_start_at}} foi cancelado. {{review_notes}}';
update public.message_templates set name = 'Olá {{patient_name}}, seu agendamento de {{requested_start_at}} foi cancelado. {{review_notes}}' where name = 'Ola {{patient_name}}, seu agendamento de {{requested_start_at}} foi cancelado. {{review_notes}}';
update public.message_templates set body_template = 'Solicitação remarcada' where body_template = 'Solicitacao remarcada';
update public.message_templates set subject_template = 'Solicitação remarcada' where subject_template = 'Solicitacao remarcada';
update public.message_templates set name = 'Solicitação remarcada' where name = 'Solicitacao remarcada';
update public.message_templates set body_template = 'Sua solicitação foi remarcada' where body_template = 'Sua solicitacao foi remarcada';
update public.message_templates set subject_template = 'Sua solicitação foi remarcada' where subject_template = 'Sua solicitacao foi remarcada';
update public.message_templates set name = 'Sua solicitação foi remarcada' where name = 'Sua solicitacao foi remarcada';
update public.message_templates set body_template = 'Olá {{patient_name}}, sua solicitação agora está para {{requested_start_at}}. Acompanhe em {{request_link}}.' where body_template = 'Ola {{patient_name}}, sua solicitacao agora esta para {{requested_start_at}}. Acompanhe em {{request_link}}.';
update public.message_templates set subject_template = 'Olá {{patient_name}}, sua solicitação agora está para {{requested_start_at}}. Acompanhe em {{request_link}}.' where subject_template = 'Ola {{patient_name}}, sua solicitacao agora esta para {{requested_start_at}}. Acompanhe em {{request_link}}.';
update public.message_templates set name = 'Olá {{patient_name}}, sua solicitação agora está para {{requested_start_at}}. Acompanhe em {{request_link}}.' where name = 'Ola {{patient_name}}, sua solicitacao agora esta para {{requested_start_at}}. Acompanhe em {{request_link}}.';
update public.message_templates set body_template = 'Solicitação remarcada - WhatsApp' where body_template = 'Solicitacao remarcada - WhatsApp';
update public.message_templates set subject_template = 'Solicitação remarcada - WhatsApp' where subject_template = 'Solicitacao remarcada - WhatsApp';
update public.message_templates set name = 'Solicitação remarcada - WhatsApp' where name = 'Solicitacao remarcada - WhatsApp';
update public.message_templates set body_template = 'Olá {{patient_name}}, lembramos do seu agendamento em {{appointment_start_at}}.' where body_template = 'Ola {{patient_name}}, lembramos do seu agendamento em {{appointment_start_at}}.';
update public.message_templates set subject_template = 'Olá {{patient_name}}, lembramos do seu agendamento em {{appointment_start_at}}.' where subject_template = 'Ola {{patient_name}}, lembramos do seu agendamento em {{appointment_start_at}}.';
update public.message_templates set name = 'Olá {{patient_name}}, lembramos do seu agendamento em {{appointment_start_at}}.' where name = 'Ola {{patient_name}}, lembramos do seu agendamento em {{appointment_start_at}}.';
update public.message_templates set body_template = 'NPS pós-atendimento' where body_template = 'NPS pos-atendimento';
update public.message_templates set subject_template = 'NPS pós-atendimento' where subject_template = 'NPS pos-atendimento';
update public.message_templates set name = 'NPS pós-atendimento' where name = 'NPS pos-atendimento';
update public.message_templates set body_template = 'Olá {{patient_name}}, como foi sua experiência no atendimento de hoje? {{nps_link}}' where body_template = 'Ola {{patient_name}}, como foi sua experiencia no atendimento de hoje? {{nps_link}}';
update public.message_templates set subject_template = 'Olá {{patient_name}}, como foi sua experiência no atendimento de hoje? {{nps_link}}' where subject_template = 'Ola {{patient_name}}, como foi sua experiencia no atendimento de hoje? {{nps_link}}';
update public.message_templates set name = 'Olá {{patient_name}}, como foi sua experiência no atendimento de hoje? {{nps_link}}' where name = 'Ola {{patient_name}}, como foi sua experiencia no atendimento de hoje? {{nps_link}}';
update public.message_templates set body_template = 'Lembrete de cobrança' where body_template = 'Lembrete de cobranca';
update public.message_templates set subject_template = 'Lembrete de cobrança' where subject_template = 'Lembrete de cobranca';
update public.message_templates set name = 'Lembrete de cobrança' where name = 'Lembrete de cobranca';
update public.message_templates set body_template = 'Olá {{patient_name}}, identificamos um pagamento pendente de {{amount}} com vencimento em {{due_date}}.' where body_template = 'Ola {{patient_name}}, identificamos um pagamento pendente de {{amount}} com vencimento em {{due_date}}.';
update public.message_templates set subject_template = 'Olá {{patient_name}}, identificamos um pagamento pendente de {{amount}} com vencimento em {{due_date}}.' where subject_template = 'Ola {{patient_name}}, identificamos um pagamento pendente de {{amount}} com vencimento em {{due_date}}.';
update public.message_templates set name = 'Olá {{patient_name}}, identificamos um pagamento pendente de {{amount}} com vencimento em {{due_date}}.' where name = 'Ola {{patient_name}}, identificamos um pagamento pendente de {{amount}} com vencimento em {{due_date}}.';
update public.message_templates set body_template = 'Olá {{patient_name}}! Lembrete do seu agendamento: {{procedure_name}} com {{professional_name}} em {{appointment_start_at}}, na {{clinic_name}}. Se não puder comparecer, responda esta mensagem para remarcar.', variable_keys = array['patient_name', 'appointment_start_at', 'procedure_name', 'professional_name', 'clinic_name'] where template_key = 'appointment_reminder' and body_template in ('Ola {{patient_name}}, lembramos do seu agendamento em {{appointment_start_at}}.', 'Olá {{patient_name}}, lembramos do seu agendamento em {{appointment_start_at}}.');

-- Gera o evento "lembrete devido" para os agendamentos que começam dentro da
-- antecedência configurada na regra (action_config.hours_before, padrão 24 h).
-- O resto (modelo, janela de envio, opt-out, fila do WhatsApp) já existia.
create or replace function app_private.emit_due_appointment_reminders()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_rule record;
  v_appointment record;
  v_hours integer;
  v_timezone text;
  v_count integer := 0;
begin
  for v_rule in
    select distinct on (rules.organization_id)
      rules.organization_id,
      rules.action_config
    from public.automation_rules as rules
    where rules.event_type = 'appointment.reminder_due'
      and rules.active
    order by rules.organization_id, rules.created_at
  loop
    v_hours := greatest(
      1,
      least(168, coalesce((v_rule.action_config ->> 'hours_before')::integer, 24))
    );
    select settings.timezone
      into v_timezone
    from public.organization_settings as settings
    where settings.organization_id = v_rule.organization_id;
    v_timezone := coalesce(nullif(v_timezone, ''), 'America/Sao_Paulo');

    for v_appointment in
      select
        appointments.id,
        appointments.start_at,
        coalesce(nullif(patients.social_name, ''), patients.full_name) as patient_name,
        coalesce(nullif(patients.whatsapp, ''), nullif(patients.phone, '')) as patient_phone,
        professionals.name as professional_name,
        procedures.name as procedure_name,
        coalesce(clinics.trade_name, organizations.name) as clinic_name
      from public.appointments
      join public.patients
        on patients.id = appointments.patient_id
       and patients.deleted_at is null
      join public.professionals on professionals.id = appointments.professional_id
      join public.procedures on procedures.id = appointments.procedure_id
      join public.organizations on organizations.id = appointments.organization_id
      left join public.clinics on clinics.organization_id = appointments.organization_id
      where appointments.organization_id = v_rule.organization_id
        and appointments.status in ('scheduled', 'confirmed')
        and appointments.start_at > statement_timestamp()
        and appointments.start_at <= statement_timestamp() + make_interval(hours => v_hours)
        and not exists (
          select 1
          from public.app_events
          where app_events.organization_id = appointments.organization_id
            and app_events.event_type = 'appointment.reminder_due'
            and app_events.aggregate_id = appointments.id
        )
      order by appointments.start_at
      limit 500
    loop
      continue when v_appointment.patient_phone is null;
      perform app_private.enqueue_app_event(
        v_rule.organization_id,
        'appointment.reminder_due',
        'appointment',
        v_appointment.id,
        jsonb_build_object(
          'appointment_id', v_appointment.id,
          'patient_name', v_appointment.patient_name,
          'patient_phone', v_appointment.patient_phone,
          'appointment_start_at',
            to_char(v_appointment.start_at at time zone v_timezone, 'DD/MM "às" HH24:MI'),
          'professional_name', v_appointment.professional_name,
          'procedure_name', v_appointment.procedure_name,
          'clinic_name', v_appointment.clinic_name
        )
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function app_private.emit_due_appointment_reminders() from public, anon, authenticated;
grant execute on function app_private.emit_due_appointment_reminders() to service_role;

create or replace function public.run_scheduled_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_expired_requests integer;
  v_expired_waitlist integer;
  v_reminders integer;
begin
  v_expired_requests := public.expire_stale_online_booking_requests();
  v_expired_waitlist := public.expire_stale_waitlist_entries();
  v_reminders := app_private.emit_due_appointment_reminders();

  return jsonb_build_object(
    'expired_online_requests', v_expired_requests,
    'expired_waitlist_entries', v_expired_waitlist,
    'appointment_reminders', v_reminders
  );
end;
$$;

revoke execute on function public.run_scheduled_maintenance() from public, anon, authenticated;
grant execute on function public.run_scheduled_maintenance() to service_role;

commit;
