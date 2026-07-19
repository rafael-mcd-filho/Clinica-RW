import { cache } from "react";
import { getActiveImpersonation } from "@/lib/auth/impersonation";
import { getCurrentAppUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getRequestContext = cache(async function getRequestContext() {
  // O RPC de permissões resolve o usuário via auth.uid() no próprio
  // Postgres e não depende do resultado de getCurrentAppUser, então os
  // dois round-trips ao Supabase (~centenas de ms cada) correm em
  // paralelo. Nos caminhos de super admin/impersonação o resultado do
  // RPC próprio é simplesmente descartado.
  const [appUser, ownPermissionCodes] = await Promise.all([
    getCurrentAppUser(),
    createSupabaseServerClient().then((supabase) =>
      supabase.rpc("current_user_permission_codes"),
    ),
  ]);
  const impersonation = await getActiveImpersonation(appUser);

  if (impersonation && appUser) {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data: permissionCodes } = await supabaseAdmin.rpc(
      "user_permission_codes",
      {
        p_user_id: impersonation.targetUser.id,
      },
    );

    return {
      actor: appUser,
      effectiveUser: impersonation.targetUser,
      organization: impersonation.organization,
      impersonation,
      isSuperAdmin: false,
      permissionCodes: new Set<string>(
        (permissionCodes as string[] | null) ?? [],
      ),
    };
  }

  if (appUser?.is_super_admin) {
    return {
      actor: appUser,
      effectiveUser: appUser,
      organization: null,
      impersonation: null,
      isSuperAdmin: true,
      permissionCodes: new Set<string>(),
    };
  }

  return {
    actor: appUser,
    effectiveUser: appUser,
    organization: appUser?.organizations ?? null,
    impersonation: null,
    isSuperAdmin: false,
    permissionCodes: new Set<string>(
      appUser ? ((ownPermissionCodes.data as string[] | null) ?? []) : [],
    ),
  };
});

export function hasAnyPermission(
  permissionCodes: Set<string>,
  expectedCodes: string[],
) {
  return expectedCodes.some((permissionCode) =>
    permissionCodes.has(permissionCode),
  );
}
