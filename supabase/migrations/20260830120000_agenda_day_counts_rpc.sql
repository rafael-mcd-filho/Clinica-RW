-- Conta agendamentos por dia local para colorir a ocupacao no mini calendario
-- da agenda. Agregar no banco evita trazer a grade inteira do mes linha a
-- linha (o PostgREST corta em max_rows = 1000 e o mapa de calor ficaria
-- silenciosamente subestimado nos meses cheios).

create or replace function public.agenda_day_counts(
  p_organization_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_timezone text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_start >= p_end then
    raise exception 'Invalid agenda range' using errcode = '22023';
  end if;

  if not exists (
    select 1 from pg_timezone_names where name = p_timezone
  ) then
    raise exception 'Invalid agenda timezone' using errcode = '22023';
  end if;

  if not app_private.current_is_super_admin() and (
    p_organization_id is distinct from app_private.current_organization_id()
    or not app_private.current_user_has_permission('agenda.ver')
  ) then
    raise exception 'Insufficient agenda permission' using errcode = '42501';
  end if;

  select coalesce(jsonb_object_agg(grouped.day_key, grouped.total), '{}'::jsonb)
  into v_result
  from (
    select
      to_char((a.start_at at time zone p_timezone)::date, 'YYYY-MM-DD') as day_key,
      count(*) as total
    from public.appointments a
    where a.organization_id = p_organization_id
      and a.start_at >= p_start
      and a.start_at < p_end
      and a.status <> 'cancelled'
    group by 1
  ) grouped;

  return v_result;
end;
$$;

revoke all on function public.agenda_day_counts(
  uuid, timestamptz, timestamptz, text
) from public;

grant execute on function public.agenda_day_counts(
  uuid, timestamptz, timestamptz, text
) to authenticated, service_role;
