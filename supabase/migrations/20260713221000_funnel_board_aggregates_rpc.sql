-- Return only board-level funnel insights. Full movement history remains
-- available on demand for a single opened card.

create or replace function public.funnel_board_aggregates(
  p_organization_id uuid,
  p_funnel_id uuid
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
  if not app_private.current_is_super_admin() and (
    p_organization_id is distinct from app_private.current_organization_id()
    or not app_private.current_user_has_permission('funil.ver')
  ) then
    raise exception 'Insufficient funnel permission' using errcode = '42501';
  end if;

  with board_cards as materialized (
    select id, stage_id, created_at, archived_at
    from public.funnel_cards
    where organization_id = p_organization_id
      and funnel_id = p_funnel_id
  ),
  board_movements as materialized (
    select
      m.card_id,
      m.from_stage_id,
      m.to_stage_id,
      m.moved_at,
      lag(m.moved_at) over (
        partition by m.card_id order by m.moved_at, m.id
      ) as previous_moved_at
    from public.funnel_card_movements m
    join board_cards c on c.id = m.card_id
    where m.organization_id = p_organization_id
  ),
  closed_visits as (
    select
      coalesce(m.from_stage_id, c.stage_id) as stage_id,
      coalesce(m.previous_moved_at, c.created_at) as entered_at,
      m.moved_at as exited_at,
      m.to_stage_id as next_stage_id
    from board_movements m
    join board_cards c on c.id = m.card_id
    where c.archived_at is null
  ),
  open_visits as (
    select
      c.stage_id,
      coalesce(max(m.moved_at), c.created_at) as entered_at,
      null::timestamptz as exited_at,
      null::uuid as next_stage_id
    from board_cards c
    left join board_movements m on m.card_id = c.id
    where c.archived_at is null
    group by c.id, c.stage_id, c.created_at
  ),
  visits as materialized (
    select * from closed_visits
    union all
    select * from open_visits
  ),
  stage_metrics as (
    select
      s.id as stage_id,
      count(v.stage_id)::integer as entered_count,
      case when count(v.stage_id) = 0 then null else round(
        100.0 * count(*) filter (
          where v.exited_at is not null
            and coalesce(next_stage.stage_type, 'intermediate') <> 'failure'
        ) / count(v.stage_id)
      )::integer end as conversion_rate,
      round((
        avg(extract(epoch from (v.exited_at - v.entered_at)) / 3600.0)
          filter (where v.exited_at > v.entered_at)
      )::numeric, 2) as average_duration_hours
    from public.funnel_stages s
    left join visits v on v.stage_id = s.id
    left join public.funnel_stages next_stage
      on next_stage.organization_id = p_organization_id
      and next_stage.funnel_id = p_funnel_id
      and next_stage.id = v.next_stage_id
    where s.organization_id = p_organization_id
      and s.funnel_id = p_funnel_id
    group by s.id
  ),
  last_movements as (
    select card_id, max(moved_at) as moved_at
    from board_movements
    group by card_id
  )
  select jsonb_build_object(
    'last_movements', coalesce((
      select jsonb_agg(
        jsonb_build_object('card_id', card_id, 'moved_at', moved_at)
        order by card_id
      )
      from last_movements
    ), '[]'::jsonb),
    'stage_metrics', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'stage_id', stage_id,
          'entered_count', entered_count,
          'conversion_rate', conversion_rate,
          'average_duration_hours', average_duration_hours
        ) order by stage_id
      )
      from stage_metrics
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.funnel_board_aggregates(uuid, uuid) from public;
grant execute on function public.funnel_board_aggregates(uuid, uuid)
  to authenticated, service_role;
