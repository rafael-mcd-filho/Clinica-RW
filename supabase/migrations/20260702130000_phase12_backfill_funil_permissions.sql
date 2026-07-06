-- Phase 12 fix: the previous migration granted funil.* permissions only to
-- the null-organization_id template profiles, matching the identity seed
-- migration's syntax instead of Phase 9's (correct) pattern of granting to
-- every profile with a matching name regardless of organization_id. Existing
-- tenants created before this migration never received the new permissions
-- on their own per-organization profile copies. Backfill them here.

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
join public.profiles on profiles.name = grants.profile_name
join public.permissions on permissions.code = grants.permission_code
on conflict (profile_id, permission_id) do nothing;
