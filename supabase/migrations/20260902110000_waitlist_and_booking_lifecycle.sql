-- Ciclo de vida da fila de espera e das solicitacoes online.
--
-- Tres buracos que a operacao esbarrava todo dia:
--
-- 1. "Contatado" na fila nao guardava quando nem quem. Dois dias depois
--    ninguem sabia se o selo era de hoje ou da semana passada.
-- 2. Solicitacao online pendente segura o horario (a checagem de
--    disponibilidade considera status 'requested'), e nada expirava: sem
--    revisao, o slot ficava preso para sempre.
-- 3. A fila so crescia -- quem entrou ha meses continuava ocupando posicao de
--    prioridade, e nada ligava um cancelamento a quem estava esperando.

-- ---------------------------------------------------------------------------
-- 1. Rastro do contato na fila
-- ---------------------------------------------------------------------------

alter table public.waitlist_entries
  add column if not exists contacted_at timestamptz,
  add column if not exists contacted_by_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'waitlist_entries_contacted_by_fk'
  ) then
    alter table public.waitlist_entries
      add constraint waitlist_entries_contacted_by_fk
      foreign key (organization_id, contacted_by_user_id)
      references public.app_users(organization_id, id) on delete set null (contacted_by_user_id);
  end if;
end;
$$;

comment on column public.waitlist_entries.contacted_at is
  'Quando a clinica avisou o paciente sobre a fila. Sem isso o selo "Contatado" envelhece sem ninguem perceber.';

-- ---------------------------------------------------------------------------
-- 2. Solicitacao online pendente expira
-- ---------------------------------------------------------------------------

-- Cancela em vez de inventar um status novo: 'cancelled' ja existe no check da
-- tabela e ja dispara 'online_booking.cancelled' na automacao, entao o paciente
-- fica sabendo pelo mesmo caminho de sempre.
create or replace function public.expire_stale_online_booking_requests(
  p_pending_ttl_hours integer default 48
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_expired integer;
begin
  with expired as (
    update public.online_booking_requests
    set status = 'cancelled',
        reviewed_at = statement_timestamp(),
        review_notes = case
          when requested_start_at <= statement_timestamp()
            then 'Expirada automaticamente: o horario solicitado passou sem revisao.'
          else format(
            'Expirada automaticamente: %s horas sem revisao.',
            greatest(p_pending_ttl_hours, 1)
          )
        end
    where status = 'requested'
      and (
        requested_start_at <= statement_timestamp()
        or created_at <= statement_timestamp()
             - make_interval(hours => greatest(p_pending_ttl_hours, 1))
      )
    returning 1
  )
  select count(*)::integer into v_expired from expired;

  return coalesce(v_expired, 0);
end;
$$;

comment on function public.expire_stale_online_booking_requests(integer) is
  'Solta o horario preso por solicitacao que ninguem revisou, ou cujo slot ja passou.';

-- ---------------------------------------------------------------------------
-- 3. Entrada de fila expira
-- ---------------------------------------------------------------------------

create or replace function public.expire_stale_waitlist_entries(
  p_max_age_days integer default 90
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_expired integer;
begin
  with expired as (
    update public.waitlist_entries
    set status = 'cancelled',
        notes = concat_ws(
          chr(10),
          notes,
          format(
            'Removido automaticamente da fila apos %s dias sem encaixe.',
            greatest(p_max_age_days, 1)
          )
        )
    where status in ('waiting', 'contacted')
      and created_at <= statement_timestamp()
           - make_interval(days => greatest(p_max_age_days, 1))
    returning 1
  )
  select count(*)::integer into v_expired from expired;

  return coalesce(v_expired, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Quem da fila cabe num horario que vagou
-- ---------------------------------------------------------------------------

-- O casamento usa o que a entrada da fila ja guarda: procedimento e
-- profissional quando foram pedidos (nulo = "qualquer um" e casa com tudo) e o
-- turno preferido comparado no fuso da empresa. A ordem continua sendo a de
-- chegada -- e a unica prioridade que a fila conhece.
create or replace function public.waitlist_candidates_for_slot(
  p_professional_id uuid,
  p_procedure_id uuid,
  p_start_at timestamptz,
  p_limit integer default 10
)
returns table (
  id uuid,
  patient_id uuid,
  patient_name text,
  patient_phone text,
  procedure_name text,
  professional_name text,
  preferred_period text,
  status text,
  notes text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_organization_id uuid;
  v_timezone text;
  v_local_hour integer;
  v_period text;
begin
  v_organization_id := app_private.current_organization_id();

  if v_organization_id is null
    or not (
      app_private.current_user_has_permission('agenda.criar_agendamento')
      or app_private.current_user_has_permission('agenda.editar_agendamento')
    ) then
    raise exception 'Not allowed to read the waiting list.' using errcode = '42501';
  end if;

  select coalesce(settings.timezone, 'America/Fortaleza')
    into v_timezone
  from public.organization_settings as settings
  where settings.organization_id = v_organization_id;

  v_timezone := coalesce(v_timezone, 'America/Fortaleza');
  v_local_hour := extract(hour from (p_start_at at time zone v_timezone))::integer;
  v_period := case
    when v_local_hour < 12 then 'morning'
    when v_local_hour < 18 then 'afternoon'
    else 'evening'
  end;

  return query
  select
    entry.id,
    entry.patient_id,
    coalesce(nullif(patient.social_name, ''), patient.full_name) as patient_name,
    coalesce(nullif(patient.whatsapp, ''), patient.phone) as patient_phone,
    procedure.name as procedure_name,
    professional.name as professional_name,
    entry.preferred_period,
    entry.status,
    entry.notes,
    entry.created_at
  from public.waitlist_entries entry
  join public.patients patient
    on patient.organization_id = entry.organization_id
   and patient.id = entry.patient_id
   and patient.deleted_at is null
  left join public.procedures procedure
    on procedure.organization_id = entry.organization_id
   and procedure.id = entry.procedure_id
  left join public.professionals professional
    on professional.organization_id = entry.organization_id
   and professional.id = entry.professional_id
  where entry.organization_id = v_organization_id
    and entry.status in ('waiting', 'contacted')
    and (entry.professional_id is null or p_professional_id is null
         or entry.professional_id = p_professional_id)
    and (entry.procedure_id is null or p_procedure_id is null
         or entry.procedure_id = p_procedure_id)
    and (entry.preferred_period is null
         or entry.preferred_period = 'any'
         or entry.preferred_period = v_period)
  order by entry.created_at
  limit greatest(coalesce(p_limit, 10), 1);
end;
$$;

comment on function public.waitlist_candidates_for_slot(uuid, uuid, timestamptz, integer) is
  'Quem da fila de espera cabe num horario que acabou de vagar, na ordem de chegada.';

-- ---------------------------------------------------------------------------
-- 5. Manutencao agendada
-- ---------------------------------------------------------------------------

-- Um unico ponto de entrada para o worker chamar: quem opera nao precisa saber
-- quais varreduras existem.
create or replace function public.run_scheduled_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_expired_requests integer;
  v_expired_waitlist integer;
begin
  v_expired_requests := public.expire_stale_online_booking_requests();
  v_expired_waitlist := public.expire_stale_waitlist_entries();

  return jsonb_build_object(
    'expired_online_requests', v_expired_requests,
    'expired_waitlist_entries', v_expired_waitlist
  );
end;
$$;

revoke all on function public.expire_stale_online_booking_requests(integer) from public;
revoke all on function public.expire_stale_waitlist_entries(integer) from public;
revoke all on function public.run_scheduled_maintenance() from public;
revoke all on function public.waitlist_candidates_for_slot(uuid, uuid, timestamptz, integer) from public;

grant execute on function public.expire_stale_online_booking_requests(integer) to service_role;
grant execute on function public.expire_stale_waitlist_entries(integer) to service_role;
grant execute on function public.run_scheduled_maintenance() to service_role;
grant execute on function public.waitlist_candidates_for_slot(uuid, uuid, timestamptz, integer)
  to authenticated, service_role;
