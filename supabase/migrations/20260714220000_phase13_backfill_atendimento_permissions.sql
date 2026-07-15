-- Phase 13 fix: the previous migration granted atendimento.* permissions only
-- to the null-organization_id template profiles, the same mistake Phase 12
-- made for funil.*. Existing tenants created before this migration never
-- received the new permissions on their own per-organization profile copies.
-- Backfill them here.

with grants(profile_name, permission_code) as (
  values
    ('Administrador', 'atendimento.ver'),
    ('Administrador', 'atendimento.atender'),
    ('Administrador', 'atendimento.configurar'),
    ('Profissional', 'atendimento.ver'),
    ('Profissional', 'atendimento.atender'),
    ('Atendente', 'atendimento.ver'),
    ('Atendente', 'atendimento.atender'),
    ('Financeiro', 'atendimento.ver'),
    ('Tecnico', 'atendimento.ver')
)
insert into public.profile_permissions (profile_id, permission_id)
select profiles.id, permissions.id
from grants
join public.profiles on profiles.name = grants.profile_name
join public.permissions on permissions.code = grants.permission_code
on conflict (profile_id, permission_id) do nothing;
