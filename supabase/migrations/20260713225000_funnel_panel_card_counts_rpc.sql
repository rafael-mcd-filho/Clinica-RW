-- Aggregate active card counts for the panel list without transferring every card.

create or replace function public.funnel_panel_card_counts(
  p_organization_id uuid
)
returns table (
  funnel_id uuid,
  active_card_count bigint
)
language plpgsql
stable
security invoker
set search_path = public, app_private, pg_temp
as $$
begin
  if not app_private.current_is_super_admin() and (
    p_organization_id is distinct from app_private.current_organization_id()
    or not app_private.current_user_has_permission('funil.ver')
  ) then
    raise exception 'Insufficient funnel permission' using errcode = '42501';
  end if;

  return query
  select
    cards.funnel_id,
    count(*)::bigint as active_card_count
  from public.funnel_cards as cards
  where cards.organization_id = p_organization_id
    and cards.archived_at is null
  group by cards.funnel_id;
end;
$$;

revoke all on function public.funnel_panel_card_counts(uuid) from public;
grant execute on function public.funnel_panel_card_counts(uuid)
  to authenticated, service_role;

comment on function public.funnel_panel_card_counts(uuid) is
  'Returns active card totals grouped by funnel for the current tenant panel list.';
