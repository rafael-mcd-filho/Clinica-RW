export type PermissionOverride = {
  code: string;
  granted: boolean;
};

export function resolveEffectivePermissions(
  profilePermissions: string[],
  overrides: PermissionOverride[] = [],
) {
  const permissions = new Set(profilePermissions);

  for (const override of overrides) {
    if (override.granted) {
      permissions.add(override.code);
    } else {
      permissions.delete(override.code);
    }
  }

  return permissions;
}

export function hasPermission(
  profilePermissions: string[],
  permissionCode: string,
  overrides: PermissionOverride[] = [],
) {
  return resolveEffectivePermissions(profilePermissions, overrides).has(
    permissionCode,
  );
}

/**
 * Resumo clínico permanente (alergias, medicações, comorbidades).
 *
 * Tem permissão própria (`clinico.ver_resumo_clinico`, migração
 * 20261105130000). Até a migração ser aplicada vale a permissão antiga de
 * dados sensíveis; quem decide o que de fato aparece é a RLS do banco.
 */
export function canAccessClinicalSummary(codes: ReadonlySet<string>) {
  return (
    codes.has("clinico.ver_resumo_clinico") ||
    codes.has("paciente.ver_dados_sensiveis")
  );
}
