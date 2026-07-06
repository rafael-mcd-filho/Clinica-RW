import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CurrentAppUser } from "@/lib/auth/session";

const impersonationCookieName = "hi-clinic-impersonation";

type ImpersonationSessionRow = {
  id: string;
  organization_id: string;
  target_user_id: string | null;
  reason: string;
  started_at: string;
  ended_at: string | null;
};

type TargetUserRow = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  status: CurrentAppUser["status"];
};

type OrganizationRow = {
  id: string;
  name: string;
  status: string;
  mode: string;
  logo_url: string | null;
};

export type ActiveImpersonation = {
  id: string;
  reason: string;
  started_at: string;
  organization: OrganizationRow;
  targetUser: TargetUserRow;
};

export async function getActiveImpersonation(
  appUser: CurrentAppUser | null,
): Promise<ActiveImpersonation | null> {
  if (!appUser?.is_super_admin) {
    return null;
  }

  const sessionId = (await cookies()).get(impersonationCookieName)?.value;

  if (!sessionId) {
    return null;
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: session } = await supabaseAdmin
    .from("impersonation_sessions")
    .select("id, organization_id, target_user_id, reason, started_at, ended_at")
    .eq("id", sessionId)
    .eq("super_admin_user_id", appUser.id)
    .is("ended_at", null)
    .maybeSingle<ImpersonationSessionRow>();

  if (!session?.target_user_id) {
    return null;
  }

  const [{ data: organization }, { data: targetUser }] = await Promise.all([
    supabaseAdmin
      .from("organizations")
      .select("id, name, status, mode, logo_url")
      .eq("id", session.organization_id)
      .maybeSingle<OrganizationRow>(),
    supabaseAdmin
      .from("app_users")
      .select("id, organization_id, name, email, status")
      .eq("id", session.target_user_id)
      .eq("organization_id", session.organization_id)
      .maybeSingle<TargetUserRow>(),
  ]);

  if (!organization || !targetUser) {
    return null;
  }

  return {
    id: session.id,
    reason: session.reason,
    started_at: session.started_at,
    organization,
    targetUser,
  };
}

export async function setImpersonationCookie(sessionId: string) {
  (await cookies()).set(impersonationCookieName, sessionId, {
    httpOnly: true,
    maxAge: 60 * 60 * 4,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearImpersonationCookie() {
  (await cookies()).delete(impersonationCookieName);
}
