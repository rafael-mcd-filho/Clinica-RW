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
