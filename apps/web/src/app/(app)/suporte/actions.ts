"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  clearImpersonationCookie,
  getActiveImpersonation,
  setImpersonationCookie,
} from "@/lib/auth/impersonation";
import { getCurrentAppUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ImpersonationActionState = {
  error?: string;
};

const startImpersonationSchema = z.object({
  organization_id: z.string().uuid(),
  target_user_id: z.string().uuid("Selecione o usuário para o acesso."),
  reason: z.string().trim().optional(),
});

export async function startImpersonation(
  organizationId: string,
  _previousState: ImpersonationActionState,
  formData: FormData,
): Promise<ImpersonationActionState> {
  const appUser = await getCurrentAppUser();

  if (!appUser?.is_super_admin) {
    return { error: "Apenas Super Admin pode iniciar suporte impersonado." };
  }

  const parsed = startImpersonationSchema.safeParse({
    organization_id: organizationId,
    target_user_id: formData.get("target_user_id"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: sessionId, error } = await supabaseAdmin.rpc(
    "start_impersonation_session",
    {
      p_actor_user_id: appUser.id,
      p_organization_id: parsed.data.organization_id,
      p_target_user_id: parsed.data.target_user_id,
      p_reason: parsed.data.reason || null,
    },
  );

  if (error || !sessionId) {
    return { error: error?.message ?? "Não foi possível iniciar o suporte." };
  }

  await setImpersonationCookie(sessionId);
  redirect("/dashboard");
}

export async function endImpersonation() {
  const appUser = await getCurrentAppUser();
  const impersonation = await getActiveImpersonation(appUser);

  if (!appUser?.is_super_admin || !impersonation) {
    await clearImpersonationCookie();
    redirect("/dashboard");
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: organizationId } = await supabaseAdmin.rpc(
    "end_impersonation_session",
    {
      p_actor_user_id: appUser.id,
      p_session_id: impersonation.id,
    },
  );

  await clearImpersonationCookie();
  redirect(organizationId ? `/empresas/${organizationId}` : "/dashboard");
}
