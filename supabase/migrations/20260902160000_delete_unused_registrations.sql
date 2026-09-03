-- Excluir cadastro que ninguem usa.
--
-- Ate aqui so dava para desativar unidade, sala, equipamento, especialidade,
-- procedimento e convenio. Desativar e a resposta certa para um item que ja
-- tem historico -- apagar reescreveria o passado. Mas um convenio cadastrado
-- por engano, ou um procedimento criado durante um teste, ficava para sempre
-- na lista atrapalhando quem usa.
--
-- Formas de pagamento ja resolviam isso com `delete_unused_payment_method`,
-- que checa referencias antes de apagar. Esta funcao generaliza a mesma ideia
-- para os demais cadastros: apaga apenas quando nada aponta para o item, e
-- explica o que esta preso quando nao da.

create or replace function public.delete_unused_registration(
  p_kind text,
  p_record_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_organization_id uuid;
  v_blocker text;
begin
  v_organization_id := app_private.current_organization_id();

  if not (
    app_private.current_is_super_admin()
    or (
      v_organization_id is not null
      and app_private.current_user_has_permission('config.geral')
    )
  ) then
    raise exception using errcode = '42501', message = 'permission denied';
  end if;

  -- Cada tipo conhece quem pode estar apontando para ele. A mensagem devolve
  -- o nome do vinculo para a tela dizer por que nao deu, em vez de um
  -- "erro ao excluir" generico.
  case p_kind
    when 'unit' then
      select case
        when exists (select 1 from public.appointments where organization_id = v_organization_id and unit_id = p_record_id) then 'agendamentos'
        when exists (select 1 from public.rooms where organization_id = v_organization_id and unit_id = p_record_id) then 'salas'
        when exists (select 1 from public.schedules where organization_id = v_organization_id and unit_id = p_record_id) then 'agendas'
        when exists (select 1 from public.business_hours where organization_id = v_organization_id and unit_id = p_record_id) then 'horarios de funcionamento'
      end into v_blocker;

    when 'room' then
      select case
        when exists (select 1 from public.appointments where organization_id = v_organization_id and room_id = p_record_id) then 'agendamentos'
      end into v_blocker;

    when 'equipment' then
      v_blocker := null;

    when 'specialty' then
      select case
        when exists (select 1 from public.professionals where organization_id = v_organization_id and specialty_id = p_record_id) then 'profissionais'
      end into v_blocker;

    when 'procedure' then
      select case
        when exists (select 1 from public.appointments where organization_id = v_organization_id and procedure_id = p_record_id) then 'agendamentos'
        when exists (select 1 from public.accounts_receivable where organization_id = v_organization_id and procedure_id = p_record_id) then 'contas a receber'
        when exists (select 1 from public.online_booking_requests where organization_id = v_organization_id and procedure_id = p_record_id) then 'solicitacoes online'
        when exists (select 1 from public.waitlist_entries where organization_id = v_organization_id and procedure_id = p_record_id) then 'fila de espera'
      end into v_blocker;

    when 'health_insurance' then
      select case
        when exists (select 1 from public.appointments where organization_id = v_organization_id and health_insurance_id = p_record_id) then 'agendamentos'
        when exists (select 1 from public.accounts_receivable where organization_id = v_organization_id and health_insurance_id = p_record_id) then 'contas a receber'
        when exists (select 1 from public.online_booking_requests where organization_id = v_organization_id and health_insurance_id = p_record_id) then 'solicitacoes online'
      end into v_blocker;

    else
      raise exception using errcode = '22023', message = 'unsupported kind';
  end case;

  if v_blocker is not null then
    raise exception using errcode = '23503', message = v_blocker;
  end if;

  -- Dependencias que existem so por causa do item e nao sao historico: somem
  -- junto, senao a exclusao ficaria bloqueada por algo que ninguem enxerga.
  if p_kind = 'procedure' then
    delete from public.procedure_costs
    where organization_id = v_organization_id and procedure_id = p_record_id;
    delete from public.price_table_items
    where organization_id = v_organization_id and procedure_id = p_record_id;
    delete from public.schedule_online_booking_procedures
    where organization_id = v_organization_id and procedure_id = p_record_id;
  elsif p_kind = 'health_insurance' then
    delete from public.price_table_items
    where organization_id = v_organization_id
      and price_table_id in (
        select id from public.price_tables
        where organization_id = v_organization_id
          and health_insurance_id = p_record_id
      );
    delete from public.price_tables
    where organization_id = v_organization_id
      and health_insurance_id = p_record_id;
  end if;

  execute format(
    'delete from public.%I where organization_id = $1 and id = $2',
    case p_kind
      when 'unit' then 'units'
      when 'room' then 'rooms'
      when 'equipment' then 'equipment'
      when 'specialty' then 'specialties'
      when 'procedure' then 'procedures'
      when 'health_insurance' then 'health_insurances'
    end
  ) using v_organization_id, p_record_id;
end;
$$;

comment on function public.delete_unused_registration(text, uuid) is
  'Exclui um cadastro base quando nada aponta para ele; caso contrario devolve o nome do vinculo que impede.';

revoke all on function public.delete_unused_registration(text, uuid) from public;
grant execute on function public.delete_unused_registration(text, uuid)
  to authenticated, service_role;
