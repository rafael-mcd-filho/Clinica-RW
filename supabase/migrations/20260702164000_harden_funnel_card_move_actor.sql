-- Ensure funnel card movement history only stores an actor from the card organization.

create or replace function public.move_funnel_card(
  p_card_id uuid,
  p_to_stage_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  v_card public.funnel_cards%rowtype;
  v_to_stage public.funnel_stages%rowtype;
  v_raw_actor_id uuid;
  v_actor_id uuid;
  v_wip_count integer;
begin
  v_raw_actor_id := app_private.current_app_user_id();

  select *
    into v_card
  from public.funnel_cards
  where id = p_card_id
  for update;

  if v_card.id is null then
    raise exception 'Funnel card not found.' using errcode = 'P0002';
  end if;

  if not (
    app_private.current_is_super_admin()
    or (
      v_card.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('funil.gerenciar')
    )
  ) then
    raise exception 'Not allowed to move funnel card.' using errcode = '42501';
  end if;

  select id
    into v_actor_id
  from public.app_users
  where id = v_raw_actor_id
    and organization_id = v_card.organization_id
    and status = 'active'
  limit 1;

  if v_card.archived_at is not null then
    raise exception 'Cannot move an archived card.' using errcode = '23514';
  end if;

  select *
    into v_to_stage
  from public.funnel_stages
  where organization_id = v_card.organization_id
    and funnel_id = v_card.funnel_id
    and id = p_to_stage_id;

  if v_to_stage.id is null then
    raise exception 'Target stage not found in this funnel.' using errcode = 'P0002';
  end if;

  if v_to_stage.id = v_card.stage_id then
    return;
  end if;

  if v_to_stage.wip_limit is not null then
    select count(*)
      into v_wip_count
    from public.funnel_cards
    where organization_id = v_card.organization_id
      and stage_id = v_to_stage.id
      and archived_at is null;

    if v_wip_count >= v_to_stage.wip_limit then
      raise exception 'Target stage reached its WIP limit.' using errcode = '23514';
    end if;
  end if;

  insert into public.funnel_card_movements (
    organization_id, card_id, from_stage_id, to_stage_id, moved_by_user_id, note
  ) values (
    v_card.organization_id, v_card.id, v_card.stage_id, v_to_stage.id,
    v_actor_id, nullif(trim(p_note), '')
  );

  update public.funnel_cards
  set stage_id = v_to_stage.id
  where id = v_card.id;

  perform app_private.enqueue_app_event(
    v_card.organization_id,
    'kanban.card_moved',
    'funnel_card',
    v_card.id,
    jsonb_build_object(
      'funnel_id', v_card.funnel_id,
      'from_stage_id', v_card.stage_id,
      'to_stage_id', v_to_stage.id,
      'patient_id', v_card.patient_id
    ),
    v_actor_id
  );
end;
$$;
