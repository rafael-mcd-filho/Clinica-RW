-- Retira a area de paineis/funis, inclusive dados, permissoes e RPCs.
-- As migrations anteriores permanecem como historico de ambientes existentes.

drop function if exists public.funnel_board_aggregates(uuid, uuid);
drop function if exists public.funnel_panel_card_counts(uuid);
drop function if exists public.move_funnel_card(uuid, uuid, text);

alter table public.whatsapp_conversations
  drop column if exists funnel_card_id;

drop table if exists public.funnel_card_notes;
drop table if exists public.funnel_card_movements;
drop table if exists public.funnel_cards;
drop table if exists public.funnel_stages;
drop table if exists public.funnels;

delete from public.automation_rules
where event_type = 'kanban.card_moved';

delete from public.app_events
where event_type = 'kanban.card_moved';

delete from public.permissions
where code in ('funil.ver', 'funil.gerenciar', 'funil.configurar');
