-- Raio-X A7: confirmação em massa pela agenda.
--
-- ATENÇÃO: criada no repositório e NÃO aplicada em produção. Depende da
-- migração 20261105150000 (lembretes). Teste num branch: botão "Enviar
-- lembretes" na agenda de amanhã — cada paciente agendado recebe uma vez só.
--
-- Confirmar consultas por telefone toma a manhã da recepção. A função gera,
-- para um dia escolhido, o mesmo evento de lembrete do envio automático (com
-- a mesma regra, modelo, janela de envio e opt-out) para quem está agendado
-- e ainda não recebeu, e devolve quantos entraram na fila.
--
-- O índice novo atende a checagem "já recebeu?" daqui, do envio automático
-- e do ícone de lembrete no card da agenda.

begin;

create index if not exists app_events_aggregate_event_idx
  on public.app_events (organization_id, event_type, aggregate_id)
  where aggregate_id is not null;

create or replace function public.send_appointment_reminders_for_day(
  p_date date,
  p_impersonation_session_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_context record;
  v_timezone text;
  v_appointment record;
  v_count integer := 0;
begin
  select *
    into v_context
  from app_private.resolve_effective_request_context(p_impersonation_session_id);

  if v_context.effective_user_id is null
    or not (
      app_private.user_has_permission(v_context.effective_user_id, 'agenda.editar_agendamento')
      or app_private.user_has_permission(v_context.effective_user_id, 'agenda.criar_agendamento')
    ) then
    raise exception 'Not allowed to send reminders.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.automation_rules
    where organization_id = v_context.organization_id
      and event_type = 'appointment.reminder_due'
      and active
  ) then
    raise exception 'Reminder rule is disabled.' using errcode = '55000';
  end if;

  select settings.timezone
    into v_timezone
  from public.organization_settings as settings
  where settings.organization_id = v_context.organization_id;
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
    where appointments.organization_id = v_context.organization_id
      and appointments.status = 'scheduled'
      and appointments.start_at > statement_timestamp()
      and (appointments.start_at at time zone v_timezone)::date = p_date
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
      v_context.organization_id,
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
      ),
      v_context.actor_user_id
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.send_appointment_reminders_for_day(date, uuid)
  from public, anon;
grant execute on function public.send_appointment_reminders_for_day(date, uuid)
  to authenticated, service_role;

commit;
