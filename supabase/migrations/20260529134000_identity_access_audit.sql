create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  document text,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'suspended', 'cancelled')),
  plan_key text not null default 'starter',
  mode text not null default 'solo'
    check (mode in ('solo', 'clinic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_organizations_updated_at
before update on public.organizations
for each row execute function app_private.set_updated_at();

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email citext not null,
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended')),
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_tenant_consistency check (
    (is_super_admin and organization_id is null)
    or (not is_super_admin and organization_id is not null)
  )
);

create unique index app_users_organization_email_key
on public.app_users (organization_id, email)
where organization_id is not null;

create unique index app_users_super_admin_email_key
on public.app_users (email)
where is_super_admin;

create index app_users_organization_id_idx
on public.app_users (organization_id);

create trigger set_app_users_updated_at
before update on public.app_users
for each row execute function app_private.set_updated_at();

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  is_system_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_system_name_key
on public.profiles (name)
where organization_id is null;

create unique index profiles_organization_name_key
on public.profiles (organization_id, name)
where organization_id is not null;

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function app_private.set_updated_at();

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
  category text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.profile_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, permission_id)
);

create table public.user_profiles (
  user_id uuid not null references public.app_users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);

create table public.user_permission_overrides (
  user_id uuid not null references public.app_users(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_id)
);

create trigger set_user_permission_overrides_updated_at
before update on public.user_permission_overrides
for each row execute function app_private.set_updated_at();

create table public.resource_scopes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  resource_type text not null
    check (resource_type in ('agenda', 'profissional', 'unidade', 'especialidade')),
  resource_id uuid,
  access_level text not null default 'read'
    check (access_level in ('read', 'write', 'full')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, resource_type, resource_id, access_level)
);

create index resource_scopes_organization_id_idx
on public.resource_scopes (organization_id);

create trigger set_resource_scopes_updated_at
before update on public.resource_scopes
for each row execute function app_private.set_updated_at();

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_organization_created_at_idx
on public.audit_logs (organization_id, created_at desc);

create index audit_logs_actor_user_created_at_idx
on public.audit_logs (actor_user_id, created_at desc);

create table public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  super_admin_user_id uuid not null references public.app_users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_user_id uuid references public.app_users(id) on delete set null,
  reason text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint impersonation_sessions_end_after_start check (
    ended_at is null or ended_at >= started_at
  )
);

create index impersonation_sessions_organization_started_at_idx
on public.impersonation_sessions (organization_id, started_at desc);

create trigger set_impersonation_sessions_updated_at
before update on public.impersonation_sessions
for each row execute function app_private.set_updated_at();

create or replace function app_private.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, app_private
as $$
  select id
  from public.app_users
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1
$$;

create or replace function app_private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, app_private
as $$
  select organization_id
  from public.app_users
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1
$$;

create or replace function app_private.current_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select coalesce(
    (
      select is_super_admin
      from public.app_users
      where auth_user_id = auth.uid()
        and status = 'active'
      limit 1
    ),
    false
  )
$$;

create or replace function app_private.current_user_has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  with current_user_row as (
    select id
    from public.app_users
    where auth_user_id = auth.uid()
      and status = 'active'
    limit 1
  ),
  requested_permission as (
    select id
    from public.permissions
    where code = permission_code
    limit 1
  )
  select case
    when app_private.current_is_super_admin() then true
    when exists (
      select 1
      from current_user_row cu
      join requested_permission rp on true
      join public.user_permission_overrides upo
        on upo.user_id = cu.id
       and upo.permission_id = rp.id
       and upo.granted = false
    ) then false
    when exists (
      select 1
      from current_user_row cu
      join requested_permission rp on true
      join public.user_permission_overrides upo
        on upo.user_id = cu.id
       and upo.permission_id = rp.id
       and upo.granted = true
    ) then true
    else exists (
      select 1
      from current_user_row cu
      join public.user_profiles upr on upr.user_id = cu.id
      join public.profile_permissions pp on pp.profile_id = upr.profile_id
      join requested_permission rp on rp.id = pp.permission_id
    )
  end
$$;

create or replace function app_private.can_access_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select app_private.current_is_super_admin()
    or target_organization_id = app_private.current_organization_id()
$$;

revoke all on function app_private.current_app_user_id() from public;
revoke all on function app_private.current_organization_id() from public;
revoke all on function app_private.current_is_super_admin() from public;
revoke all on function app_private.current_user_has_permission(text) from public;
revoke all on function app_private.can_access_organization(uuid) from public;

grant execute on function app_private.current_app_user_id() to authenticated, service_role;
grant execute on function app_private.current_organization_id() to authenticated, service_role;
grant execute on function app_private.current_is_super_admin() to authenticated, service_role;
grant execute on function app_private.current_user_has_permission(text) to authenticated, service_role;
grant execute on function app_private.can_access_organization(uuid) to authenticated, service_role;

alter table public.organizations enable row level security;
alter table public.app_users enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.profile_permissions enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.resource_scopes enable row level security;
alter table public.audit_logs enable row level security;
alter table public.impersonation_sessions enable row level security;

create policy "organizations_select_by_membership"
on public.organizations for select
to authenticated
using (app_private.can_access_organization(id));

create policy "organizations_insert_super_admin"
on public.organizations for insert
to authenticated
with check (app_private.current_is_super_admin());

create policy "organizations_update_super_admin_or_config"
on public.organizations for update
to authenticated
using (
  app_private.current_is_super_admin()
  or (
    id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
)
with check (
  app_private.current_is_super_admin()
  or (
    id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.geral')
  )
);

create policy "app_users_select_same_org"
on public.app_users for select
to authenticated
using (
  app_private.current_is_super_admin()
  or organization_id = app_private.current_organization_id()
  or id = app_private.current_app_user_id()
);

create policy "app_users_insert_access_managers"
on public.app_users for insert
to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and not is_super_admin
    and app_private.current_user_has_permission('config.usuarios')
  )
);

create policy "app_users_update_access_managers"
on public.app_users for update
to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.usuarios')
  )
  or id = app_private.current_app_user_id()
)
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and not is_super_admin
    and app_private.current_user_has_permission('config.usuarios')
  )
  or id = app_private.current_app_user_id()
);

create policy "profiles_select_system_or_same_org"
on public.profiles for select
to authenticated
using (
  organization_id is null
  or app_private.can_access_organization(organization_id)
);

create policy "profiles_insert_access_managers"
on public.profiles for insert
to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and not is_system_default
    and app_private.current_user_has_permission('config.usuarios')
  )
);

create policy "profiles_update_access_managers"
on public.profiles for update
to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.usuarios')
  )
)
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and not is_system_default
    and app_private.current_user_has_permission('config.usuarios')
  )
);

create policy "profiles_delete_access_managers"
on public.profiles for delete
to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and not is_system_default
    and app_private.current_user_has_permission('config.usuarios')
  )
);

create policy "permissions_select_authenticated"
on public.permissions for select
to authenticated
using (true);

create policy "profile_permissions_select_visible_profiles"
on public.profile_permissions for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and (
        p.organization_id is null
        or app_private.can_access_organization(p.organization_id)
      )
  )
);

create policy "profile_permissions_manage_access_managers"
on public.profile_permissions for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and (
        app_private.current_is_super_admin()
        or (
          p.organization_id = app_private.current_organization_id()
          and app_private.current_user_has_permission('config.usuarios')
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and (
        app_private.current_is_super_admin()
        or (
          p.organization_id = app_private.current_organization_id()
          and app_private.current_user_has_permission('config.usuarios')
        )
      )
  )
);

create policy "user_profiles_select_same_org"
on public.user_profiles for select
to authenticated
using (
  exists (
    select 1
    from public.app_users u
    where u.id = user_id
      and (
        app_private.current_is_super_admin()
        or u.organization_id = app_private.current_organization_id()
      )
  )
);

create policy "user_profiles_manage_access_managers"
on public.user_profiles for all
to authenticated
using (
  app_private.current_is_super_admin()
  or exists (
    select 1
    from public.app_users u
    where u.id = user_id
      and u.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('config.usuarios')
  )
)
with check (
  app_private.current_is_super_admin()
  or exists (
    select 1
    from public.app_users u
    where u.id = user_id
      and u.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('config.usuarios')
  )
);

create policy "user_permission_overrides_select_same_org"
on public.user_permission_overrides for select
to authenticated
using (
  exists (
    select 1
    from public.app_users u
    where u.id = user_id
      and (
        app_private.current_is_super_admin()
        or u.organization_id = app_private.current_organization_id()
      )
  )
);

create policy "user_permission_overrides_manage_access_managers"
on public.user_permission_overrides for all
to authenticated
using (
  app_private.current_is_super_admin()
  or exists (
    select 1
    from public.app_users u
    where u.id = user_id
      and u.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('config.usuarios')
  )
)
with check (
  app_private.current_is_super_admin()
  or exists (
    select 1
    from public.app_users u
    where u.id = user_id
      and u.organization_id = app_private.current_organization_id()
      and app_private.current_user_has_permission('config.usuarios')
  )
);

create policy "resource_scopes_select_same_org"
on public.resource_scopes for select
to authenticated
using (app_private.can_access_organization(organization_id));

create policy "resource_scopes_manage_access_managers"
on public.resource_scopes for all
to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.usuarios')
  )
)
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and app_private.current_user_has_permission('config.usuarios')
  )
);

create policy "audit_logs_select_same_org_admins"
on public.audit_logs for select
to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('config.geral')
      or app_private.current_user_has_permission('config.usuarios')
    )
  )
  or actor_user_id = app_private.current_app_user_id()
);

create policy "audit_logs_insert_current_actor"
on public.audit_logs for insert
to authenticated
with check (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and actor_user_id = app_private.current_app_user_id()
  )
);

create policy "impersonation_sessions_select_super_or_tenant_admin"
on public.impersonation_sessions for select
to authenticated
using (
  app_private.current_is_super_admin()
  or (
    organization_id = app_private.current_organization_id()
    and (
      app_private.current_user_has_permission('config.geral')
      or app_private.current_user_has_permission('config.usuarios')
    )
  )
);

create policy "impersonation_sessions_insert_super_admin"
on public.impersonation_sessions for insert
to authenticated
with check (
  app_private.current_is_super_admin()
  and super_admin_user_id = app_private.current_app_user_id()
);

create policy "impersonation_sessions_update_super_admin"
on public.impersonation_sessions for update
to authenticated
using (app_private.current_is_super_admin())
with check (app_private.current_is_super_admin());

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on
  public.organizations,
  public.app_users,
  public.profiles,
  public.permissions,
  public.profile_permissions,
  public.user_profiles,
  public.user_permission_overrides,
  public.resource_scopes,
  public.audit_logs,
  public.impersonation_sessions
to authenticated, service_role;

insert into public.permissions (code, category, description)
values
  ('agenda.ver', 'Agenda', 'Visualizar agendas dentro do escopo'),
  ('agenda.criar_agendamento', 'Agenda', 'Criar novo agendamento'),
  ('agenda.editar_agendamento', 'Agenda', 'Editar agendamento existente'),
  ('agenda.cancelar_agendamento', 'Agenda', 'Cancelar agendamento'),
  ('agenda.encaixar', 'Agenda', 'Criar encaixe fora do slot normal'),
  ('agenda.bloquear_horario', 'Agenda', 'Bloquear horarios da agenda'),
  ('agenda.configurar', 'Agenda', 'Alterar configuracoes da agenda'),
  ('paciente.ver', 'Pacientes', 'Visualizar pacientes dentro do escopo'),
  ('paciente.criar', 'Pacientes', 'Cadastrar paciente'),
  ('paciente.editar', 'Pacientes', 'Editar dados de paciente'),
  ('paciente.excluir', 'Pacientes', 'Excluir paciente via soft delete'),
  ('paciente.exportar', 'Pacientes', 'Exportar lista de pacientes'),
  ('paciente.ver_dados_sensiveis', 'Pacientes', 'Ver CPF completo, telefone e endereco'),
  ('clinico.ver_prontuario', 'Clinico', 'Acessar prontuario clinico'),
  ('clinico.ver_prontuario_proprios', 'Clinico', 'Acessar apenas prontuarios dos proprios pacientes'),
  ('clinico.preencher_prontuario', 'Clinico', 'Criar ou editar atendimento em rascunho'),
  ('clinico.finalizar_prontuario', 'Clinico', 'Finalizar atendimento de forma imutavel'),
  ('clinico.adicionar_adendo', 'Clinico', 'Adicionar adendo a atendimento finalizado'),
  ('clinico.prescrever', 'Clinico', 'Emitir prescricao'),
  ('clinico.solicitar_exame', 'Clinico', 'Emitir solicitacao de exame'),
  ('clinico.emitir_atestado', 'Clinico', 'Emitir atestado'),
  ('clinico.criar_template', 'Clinico', 'Criar templates de prontuario'),
  ('financeiro.ver_geral', 'Financeiro', 'Ver financeiro completo'),
  ('financeiro.ver_proprio_repasse', 'Financeiro', 'Ver apenas o proprio repasse'),
  ('financeiro.receber_pagamento', 'Financeiro', 'Registrar recebimento no caixa'),
  ('financeiro.gerenciar_contas_pagar', 'Financeiro', 'Gerenciar contas a pagar'),
  ('financeiro.conciliar', 'Financeiro', 'Executar conciliacao bancaria'),
  ('financeiro.emitir_nf', 'Financeiro', 'Emitir nota fiscal'),
  ('financeiro.tiss', 'Financeiro', 'Operar faturamento TISS'),
  ('crescimento.ver_campanhas', 'Crescimento', 'Ver campanhas'),
  ('crescimento.criar_campanha', 'Crescimento', 'Criar campanhas'),
  ('crescimento.disparar_campanha', 'Crescimento', 'Executar disparos de campanha'),
  ('automacao.ver', 'Automacao', 'Ver automacoes'),
  ('automacao.criar', 'Automacao', 'Criar automacoes'),
  ('automacao.ativar', 'Automacao', 'Ativar ou desativar automacoes'),
  ('relatorio.operacional', 'Relatorios', 'Acessar relatorios operacionais'),
  ('relatorio.financeiro', 'Relatorios', 'Acessar relatorios financeiros'),
  ('relatorio.clinico', 'Relatorios', 'Acessar relatorios clinicos'),
  ('relatorio.exportar', 'Relatorios', 'Exportar relatorios'),
  ('config.geral', 'Configuracoes', 'Gerenciar configuracoes gerais da clinica'),
  ('config.usuarios', 'Configuracoes', 'Gerenciar usuarios, perfis e escopos'),
  ('config.integracoes', 'Configuracoes', 'Gerenciar integracoes'),
  ('config.plano', 'Configuracoes', 'Visualizar e gerenciar plano e cobranca')
on conflict (code) do update set
  category = excluded.category,
  description = excluded.description;

insert into public.profiles (organization_id, name, description, is_system_default)
values
  (null, 'Administrador', 'Acesso administrativo completo da clinica', true),
  (null, 'Profissional', 'Profissional de saude com acesso clinico dentro do escopo', true),
  (null, 'Atendente', 'Recepcao com agenda, pacientes e caixa operacional', true),
  (null, 'Financeiro', 'Equipe financeira sem acesso ao conteudo clinico', true),
  (null, 'Tecnico', 'Tecnico ou auxiliar com acesso operacional clinico limitado', true)
on conflict do nothing;

with grants(profile_name, permission_code) as (
  values
    ('Administrador', 'agenda.ver'),
    ('Administrador', 'agenda.criar_agendamento'),
    ('Administrador', 'agenda.editar_agendamento'),
    ('Administrador', 'agenda.cancelar_agendamento'),
    ('Administrador', 'agenda.encaixar'),
    ('Administrador', 'agenda.bloquear_horario'),
    ('Administrador', 'agenda.configurar'),
    ('Administrador', 'paciente.ver'),
    ('Administrador', 'paciente.criar'),
    ('Administrador', 'paciente.editar'),
    ('Administrador', 'paciente.excluir'),
    ('Administrador', 'paciente.exportar'),
    ('Administrador', 'paciente.ver_dados_sensiveis'),
    ('Administrador', 'clinico.ver_prontuario'),
    ('Administrador', 'financeiro.ver_geral'),
    ('Administrador', 'financeiro.receber_pagamento'),
    ('Administrador', 'financeiro.gerenciar_contas_pagar'),
    ('Administrador', 'financeiro.conciliar'),
    ('Administrador', 'financeiro.emitir_nf'),
    ('Administrador', 'relatorio.operacional'),
    ('Administrador', 'relatorio.financeiro'),
    ('Administrador', 'relatorio.clinico'),
    ('Administrador', 'relatorio.exportar'),
    ('Administrador', 'config.geral'),
    ('Administrador', 'config.usuarios'),
    ('Administrador', 'config.integracoes'),
    ('Administrador', 'config.plano'),
    ('Profissional', 'agenda.ver'),
    ('Profissional', 'paciente.ver'),
    ('Profissional', 'paciente.ver_dados_sensiveis'),
    ('Profissional', 'clinico.ver_prontuario_proprios'),
    ('Profissional', 'clinico.preencher_prontuario'),
    ('Profissional', 'clinico.finalizar_prontuario'),
    ('Profissional', 'clinico.adicionar_adendo'),
    ('Profissional', 'clinico.prescrever'),
    ('Profissional', 'clinico.solicitar_exame'),
    ('Profissional', 'clinico.emitir_atestado'),
    ('Profissional', 'clinico.criar_template'),
    ('Profissional', 'financeiro.ver_proprio_repasse'),
    ('Atendente', 'agenda.ver'),
    ('Atendente', 'agenda.criar_agendamento'),
    ('Atendente', 'agenda.editar_agendamento'),
    ('Atendente', 'agenda.cancelar_agendamento'),
    ('Atendente', 'agenda.encaixar'),
    ('Atendente', 'paciente.ver'),
    ('Atendente', 'paciente.criar'),
    ('Atendente', 'paciente.editar'),
    ('Atendente', 'financeiro.receber_pagamento'),
    ('Financeiro', 'financeiro.ver_geral'),
    ('Financeiro', 'financeiro.receber_pagamento'),
    ('Financeiro', 'financeiro.gerenciar_contas_pagar'),
    ('Financeiro', 'financeiro.conciliar'),
    ('Financeiro', 'financeiro.emitir_nf'),
    ('Financeiro', 'financeiro.tiss'),
    ('Financeiro', 'relatorio.financeiro'),
    ('Financeiro', 'relatorio.exportar'),
    ('Tecnico', 'agenda.ver'),
    ('Tecnico', 'paciente.ver'),
    ('Tecnico', 'paciente.ver_dados_sensiveis'),
    ('Tecnico', 'clinico.ver_prontuario_proprios')
)
insert into public.profile_permissions (profile_id, permission_id)
select p.id, pe.id
from grants g
join public.profiles p
  on p.name = g.profile_name
 and p.organization_id is null
join public.permissions pe on pe.code = g.permission_code
on conflict do nothing;

