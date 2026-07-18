import { AccessManager } from "./access-manager";
import { loadCompanyAccessData } from "./data";
import { CompanyConfigurationPage } from "../configuration-page";
import { requireCompanyConfigurationAccess } from "../_lib/server";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function UsuariosAcessosPage() {
  const access = await requireCompanyConfigurationAccess("usuarios-acessos");
  const context = await getRequestContext();
  const currentUserId = context.effectiveUser?.id;
  if (!currentUserId) return null;

  const data = await loadCompanyAccessData(
    access.organization.id,
    currentUserId,
  );

  // Permission and tenant were checked above before the service-role client is
  // used to read Auth-only sign-in metadata.
  const admin = createSupabaseAdminClient();
  data.users = await Promise.all(
    data.users.map(async (user) => {
      if (!user.authUserId) return user;
      const { data: authData } = await admin.auth.admin.getUserById(
        user.authUserId,
      );
      return {
        ...user,
        lastSignInAt: authData.user?.last_sign_in_at ?? null,
      };
    }),
  );

  return (
    <CompanyConfigurationPage access={access} route="usuarios-acessos">
      <AccessManager data={data} />
    </CompanyConfigurationPage>
  );
}
