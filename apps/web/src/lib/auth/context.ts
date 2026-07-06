import { getActiveImpersonation } from "@/lib/auth/impersonation";
import { getCurrentAppUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getRequestContext() {
  const appUser = await getCurrentAppUser();
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

  const supabase = await createSupabaseServerClient();
  const { data: permissionCodes } = appUser
    ? await supabase.rpc("current_user_permission_codes")
    : { data: [] as string[] };

  return {
    actor: appUser,
    effectiveUser: appUser,
    organization: appUser?.organizations ?? null,
    impersonation: null,
    isSuperAdmin: false,
    permissionCodes: new Set<string>(
      (permissionCodes as string[] | null) ?? [],
    ),
  };
}

export function hasAnyPermission(
  permissionCodes: Set<string>,
  expectedCodes: string[],
) {
  return expectedCodes.some((permissionCode) =>
    permissionCodes.has(permissionCode),
  );
}
