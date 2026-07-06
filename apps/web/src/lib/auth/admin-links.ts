import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Generates a password recovery (set-password) link via the admin API. Works
 * without SMTP configured: the returned link can be copied and shared manually.
 */
export async function generatePasswordRecoveryLink(
  supabaseAdmin: AdminClient,
  email: string,
): Promise<{ link?: string; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appUrl}/auth/callback?next=/redefinir-senha` },
  });

  if (error || !data?.properties?.action_link) {
    return { error: "Não foi possível gerar o link de redefinição." };
  }

  return { link: data.properties.action_link };
}
