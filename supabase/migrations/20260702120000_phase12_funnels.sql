-- Phase 12: configurable funnels (Kanban) for patients and leads.

create table public.funnels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name),
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id) on delete set null (created_by_user_id)
);

create table public.funnel_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  funnel_id uuid not null,
  name text not null,
  color text not null default '#2563eb',
  position integer not null default 0,
  stage_type text not null default 'intermediate'
    check (stage_type in ('initial', 'intermediate', 'success', 'failure')),
  wip_limit integer check (wip_limit is null or wip_limit > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, funnel_id, name),
  foreign key (organization_id, funnel_id)
    references public.funnels(organization_id, id) on delete cascade
);

create table public.funnel_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  funnel_id uuid not null,
  stage_id uuid not null,
  patient_id uuid not null,
  assigned_professional_id uuid,
  next_action text,
  next_action_date date,
  value numeric(12,2) check (value is null or value >= 0),
  archived_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, funnel_id)
    references public.funnels(organization_id, id) on delete cascade,
  foreign key (organization_id, stage_id)
    references public.funnel_stages(organization_id, id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  foreign key (organization_id, assigned_professional_id)
    references public.professionals(organization_id, id) on delete set null (assigned_professional_id),
  foreign key (organization_id, created_by_user_id)
    references public.app_users(organization_id, id) on delete set null (created_by_user_id)
);

create unique index funnel_cards_active_patient_key
  on public.funnel_cards(organization_id, funnel_id, patient_id)
  where archived_at is null;

create table public.funnel_card_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  card_id uuid not null,
  from_stage_id uuid,
  to_stage_id uuid not null,
  moved_by_user_id uuid,
  moved_at timestamptz not null default now(),
  note text,
  unique (organization_id, id),
  foreign key (organization_id, card_id)
    references public.funnel_cards(organization_id, id) on delete cascade,
  foreign key (organization_id, from_stage_id)
    references public.funnel_stages(organization_id, id),
  foreign key (organization_id, to_stage_id)
    references public.funnel_stages(organization_id, id),
  foreign key (organization_id, moved_by_user_id)
    references public.app_users(organization_id, id) on delete set null (moved_by_user_id)
);

create table public.funnel_card_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  card_id uuid not null,
  author_user_id uuid,
  note text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, card_id)
    references public.funnel_cards(organization_id, id) on delete cascade,
  foreign key (organization_id, author_user_id)
    references public.app_users(organization_id, id) on delete set null (author_user_id)
);

create index funnel_stages_funnel_idx
  on public.funnel_stages(organization_id, funnel_id, position);
create index funnel_cards_funnel_stage_idx
  on public.funnel_cards(organization_id, funnel_id, stage_id)
  where archived_at is null;
create index funnel_cards_patient_idx
  on public.funnel_cards(organization_id, patient_id);
create index funnel_card_movements_card_idx
  on public.funnel_card_movements(organization_id, card_id, moved_at desc);
create index funnel_card_notes_card_idx
  on public.funnel_card_notes(organization_id, card_id, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['funnels', 'funnel_cards'] loop
    execute format(
      'create trigger %I before update on public.%I for each row '
      'execute function app_private.set_updated_at()',
      'set_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end;
$$;

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
  v_actor_id uuid;
  v_wip_count integer;
begin
  v_actor_id := app_private.current_app_user_id();

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

revoke all on function public.move_funnel_card(uuid, uuid, text) from public;
grant execute on function public.move_funnel_card(uuid, uuid, text)
  to authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'funnels', 'funnel_stages', 'funnel_cards',
    'funnel_card_movements', 'funnel_card_notes'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

create policy funnels_select on public.funnels
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('funil.ver')
      or app_private.current_user_has_permission('funil.gerenciar')
      or app_private.current_user_has_permission('funil.configurar')
    )
  )
);

create policy funnels_manage on public.funnels
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('funil.configurar')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('funil.configurar')
  )
);

create policy funnel_stages_select on public.funnel_stages
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('funil.ver')
      or app_private.current_user_has_permission('funil.gerenciar')
      or app_private.current_user_has_permission('funil.configurar')
    )
  )
);

create policy funnel_stages_manage on public.funnel_stages
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('funil.configurar')
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('funil.configurar')
  )
);

create policy funnel_cards_select on public.funnel_cards
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('funil.ver')
      or app_private.current_user_has_permission('funil.gerenciar')
      or app_private.current_user_has_permission('funil.configurar')
    )
  )
);

create policy funnel_cards_manage on public.funnel_cards
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('funil.gerenciar')
      or app_private.current_user_has_permission('funil.configurar')
    )
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('funil.gerenciar')
      or app_private.current_user_has_permission('funil.configurar')
    )
  )
);

create policy funnel_card_movements_select on public.funnel_card_movements
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('funil.ver')
      or app_private.current_user_has_permission('funil.gerenciar')
      or app_private.current_user_has_permission('funil.configurar')
    )
  )
);

create policy funnel_card_notes_select on public.funnel_card_notes
for select to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('funil.ver')
      or app_private.current_user_has_permission('funil.gerenciar')
      or app_private.current_user_has_permission('funil.configurar')
    )
  )
);

create policy funnel_card_notes_manage on public.funnel_card_notes
for all to authenticated
using (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('funil.gerenciar')
      or app_private.current_user_has_permission('funil.configurar')
    )
  )
)
with check (
  app_private.current_is_super_admin() or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('funil.gerenciar')
      or app_private.current_user_has_permission('funil.configurar')
    )
  )
);

grant select, insert, update, delete on
  public.funnels,
  public.funnel_stages,
  public.funnel_cards,
  public.funnel_card_notes
to authenticated;
grant select, insert on public.funnel_card_movements to authenticated;

grant all on
  public.funnels,
  public.funnel_stages,
  public.funnel_cards,
  public.funnel_card_movements,
  public.funnel_card_notes
to service_role;

insert into public.permissions (code, category, description)
values
  ('funil.ver', 'Funis', 'Visualizar funis e cards'),
  ('funil.gerenciar', 'Funis', 'Criar e mover cards, adicionar notas'),
  ('funil.configurar', 'Funis', 'Criar e editar funis e etapas')
on conflict (code) do update set
  category = excluded.category,
  description = excluded.description;

with grants(profile_name, permission_code) as (
  values
    ('Administrador', 'funil.ver'),
    ('Administrador', 'funil.gerenciar'),
    ('Administrador', 'funil.configurar'),
    ('Profissional', 'funil.ver'),
    ('Profissional', 'funil.gerenciar'),
    ('Atendente', 'funil.ver'),
    ('Atendente', 'funil.gerenciar'),
    ('Financeiro', 'funil.ver'),
    ('Tecnico', 'funil.ver')
)
insert into public.profile_permissions (profile_id, permission_id)
select profiles.id, permissions.id
from grants
join public.profiles on profiles.name = grants.profile_name and profiles.organization_id is null
join public.permissions on permissions.code = grants.permission_code
on conflict (profile_id, permission_id) do nothing;

comment on table public.funnels is
  'Tenant-scoped configurable Kanban funnels (commercial, pre/post-consultation, treatment tracks).';
comment on table public.funnel_stages is
  'Ordered columns of a funnel with an optional WIP limit and a type used to derive outcomes.';
comment on table public.funnel_cards is
  'A patient tracked within a funnel stage; a patient may have one active card per funnel.';
comment on table public.funnel_card_movements is
  'Append-only history of stage-to-stage card movements, also used to compute stage timing metrics.';
comment on table public.funnel_card_notes is
  'Internal team notes attached to a funnel card.';
