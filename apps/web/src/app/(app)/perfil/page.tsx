import { redirect } from "next/navigation";
import { ProfileEditor } from "./profile-editor";
import { normalizeAgendaTimeZone } from "@/lib/agenda/range";
import { getRequestContext } from "@/lib/auth/context";
import { resolveUserRoleLabel } from "@/lib/auth/role-label";
import type { CurrentAppUser } from "@/lib/auth/session";
import { loadReportTimeZone } from "@/lib/reports/time-zone";
import { loadUserAvatarUrls } from "@/lib/storage/user-avatars";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PerfilPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const [context, params] = await Promise.all([
    getRequestContext(),
    searchParams ?? Promise.resolve({} as SearchParams),
  ]);
  const user = context.actor;
  if (!user) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const [authResult, detailsResult, professionalResult, avatarUrls, timeZone] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("app_users")
        .select("phone")
        .eq("id", user.id)
        .maybeSingle<{ phone: string | null }>(),
      user.organization_id
        ? supabase
            .from("professionals")
            .select("name")
            .eq("organization_id", user.organization_id)
            .eq("user_id", user.id)
            .maybeSingle<{ name: string }>()
        : Promise.resolve({ data: null }),
      loadUserAvatarUrls([user.id]),
      user.organization_id
        ? loadReportTimeZone(supabase, user.organization_id)
        : Promise.resolve(normalizeAgendaTimeZone(null)),
    ]);
  const authUser = authResult.data.user;
  if (!authUser) redirect("/login");

  // Durante o suporte a sessão é do super admin, mas ele está "dentro" de
  // outra conta: o perfil mostra a conta dele e fica só para leitura.
  const readOnly = Boolean(context.impersonation);
  const email =
    !readOnly && authUser.email
      ? await reconcileLoginEmail(user, authUser.email)
      : user.email;
  const emailParam = Array.isArray(params.email)
    ? params.email[0]
    : params.email;

  return (
    <ProfileEditor
      readOnly={readOnly}
      supportTargetName={context.impersonation?.targetUser.name ?? null}
      emailJustConfirmed={emailParam === "confirmado" && !authUser.new_email}
      profile={{
        name: user.name,
        phone: detailsResult.data?.phone ?? "",
        email,
        pendingEmail: authUser.new_email ?? null,
        pendingEmailSentAt: formatDateTime(
          authUser.email_change_sent_at,
          timeZone,
        ),
        lastSignInAt: formatDateTime(authUser.last_sign_in_at, timeZone),
        avatarUrl: avatarUrls.get(user.id) ?? null,
        roleLabel: user.is_super_admin
          ? "Super administrador"
          : resolveUserRoleLabel(context.permissionCodes),
        organizationName: user.organizations?.name ?? "Plataforma Hi Clinic",
        professionalName: professionalResult.data?.name ?? null,
      }}
    />
  );
}

/**
 * O e-mail de login vive no Supabase Auth; a ficha interna guarda uma cópia.
 * Depois da confirmação, a trigger do banco atualiza a cópia — isto cobre o
 * caso de a trigger ainda não existir (migração pendente) ou ter falhado.
 */
async function reconcileLoginEmail(user: CurrentAppUser, authEmail: string) {
  if (authEmail.toLowerCase() === user.email.toLowerCase()) return user.email;

  const admin = createSupabaseAdminClient();
  let duplicateQuery = admin
    .from("app_users")
    .select("id")
    .eq("email", authEmail)
    .neq("id", user.id)
    .limit(1);
  duplicateQuery = user.organization_id
    ? duplicateQuery.eq("organization_id", user.organization_id)
    : duplicateQuery.is("organization_id", null);
  const { data: duplicate } = await duplicateQuery;
  if (duplicate?.length) return user.email;

  const { error } = await admin
    .from("app_users")
    .update({ email: authEmail })
    .eq("id", user.id);
  return error ? user.email : authEmail;
}

function formatDateTime(value: string | null | undefined, timeZone: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  })
    .format(date)
    .replace(",", " às");
}
