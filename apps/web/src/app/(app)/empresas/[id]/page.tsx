import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, History, UserRound, UsersRound } from "lucide-react";
import { EmpresaDetailsForm } from "./empresa-details-form";
import { OwnerDetailsForm } from "./owner-details-form";
import { ImpersonateButton } from "./impersonate-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getCurrentAppUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OrganizationRow = {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  status: string;
  created_at: string;
};

type CompanyUserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  name: string;
  description: string | null;
  is_system_default: boolean;
};

type UserProfileRow = {
  user_id: string;
  profile_id: string;
};

type ProfilePermissionRow = {
  profile_id: string;
};

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  created_at: string;
};

type ActorRow = {
  id: string;
  name: string;
};

const userStatusLabel: Record<string, string> = {
  invited: "Convidado",
  active: "Ativo",
  suspended: "Suspenso",
};

const statusVariant: Record<
  string,
  "neutral" | "success" | "warning" | "destructive"
> = {
  invited: "warning",
  active: "success",
  suspended: "destructive",
};

const auditLabel: Record<string, string> = {
  "organization.created": "Empresa criada",
  "organization.updated": "Cadastro da empresa atualizado",
  "appointments.status_changed": "Status do agendamento alterado",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function EmpresaDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const appUser = await getCurrentAppUser();

  if (!appUser?.is_super_admin) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: organization, error } = await supabase
    .from("organizations")
    .select(
      "id, name, legal_name, document, email, phone, logo_url, status, created_at",
    )
    .eq("id", id)
    .maybeSingle<OrganizationRow>();

  if (error || !organization) {
    notFound();
  }

  const [{ data: users }, { data: profiles }, { data: auditRows }] =
    await Promise.all([
      supabase
        .from("app_users")
        .select("id, name, email, phone, status, created_at")
        .eq("organization_id", organization.id)
        .eq("is_super_admin", false)
        .order("created_at", { ascending: true })
        .returns<CompanyUserRow[]>(),
      supabase
        .from("profiles")
        .select("id, name, description, is_system_default")
        .eq("organization_id", organization.id)
        .order("name")
        .returns<ProfileRow[]>(),
      supabase
        .from("audit_logs")
        .select("id, actor_user_id, action, created_at")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(8)
        .returns<AuditRow[]>(),
    ]);

  const orgUsers = users ?? [];
  const orgProfiles = profiles ?? [];
  const owner = orgUsers[0] ?? null;
  const userIds = orgUsers.map((user) => user.id);
  const profileIds = orgProfiles.map((profile) => profile.id);

  const [{ data: userProfiles }, { data: profilePermissions }] =
    await Promise.all([
      userIds.length
        ? supabase
            .from("user_profiles")
            .select("user_id, profile_id")
            .in("user_id", userIds)
            .returns<UserProfileRow[]>()
        : Promise.resolve({ data: [] as UserProfileRow[] }),
      profileIds.length
        ? supabase
            .from("profile_permissions")
            .select("profile_id")
            .in("profile_id", profileIds)
            .returns<ProfilePermissionRow[]>()
        : Promise.resolve({ data: [] as ProfilePermissionRow[] }),
    ]);

  const actorIds = [
    ...new Set(
      (auditRows ?? [])
        .map((audit) => audit.actor_user_id)
        .filter((actorId): actorId is string => Boolean(actorId)),
    ),
  ];
  const { data: actors } = actorIds.length
    ? await supabase
        .from("app_users")
        .select("id, name")
        .in("id", actorIds)
        .returns<ActorRow[]>()
    : { data: [] as ActorRow[] };
  const actorNames = new Map(
    (actors ?? []).map((actor) => [actor.id, actor.name]),
  );
  const profileById = new Map(
    orgProfiles.map((profile) => [profile.id, profile]),
  );
  const profileNamesByUser = new Map<string, string[]>();
  const usersByProfile = new Map<string, CompanyUserRow[]>();

  for (const link of userProfiles ?? []) {
    const profile = profileById.get(link.profile_id);
    const user = orgUsers.find((item) => item.id === link.user_id);
    if (!profile || !user) continue;

    profileNamesByUser.set(link.user_id, [
      ...(profileNamesByUser.get(link.user_id) ?? []),
      profile.name,
    ]);
    usersByProfile.set(link.profile_id, [
      ...(usersByProfile.get(link.profile_id) ?? []),
      user,
    ]);
  }

  const permissionCountByProfile = new Map<string, number>();
  for (const permission of profilePermissions ?? []) {
    permissionCountByProfile.set(
      permission.profile_id,
      (permissionCountByProfile.get(permission.profile_id) ?? 0) + 1,
    );
  }

  return (
    <div className="grid gap-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild variant="secondary" size="icon">
            <Link href="/empresas" aria-label="Voltar para empresas">
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">
              {organization.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastro e operacao da empresa cliente.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Criada em {formatDate(organization.created_at)}
            </p>
          </div>
        </div>
        <ImpersonateButton
          organizationId={organization.id}
          organizationName={organization.name}
          users={orgUsers}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card className="animate-panel-enter">
          <CardHeader>
            <h2 className="text-base font-semibold">Dados da empresa</h2>
            <p className="text-sm text-muted-foreground">
              Atualize cadastro e estado operacional.
            </p>
          </CardHeader>
          <CardContent>
            <EmpresaDetailsForm organization={organization} />
          </CardContent>
        </Card>

        <Card className="animate-panel-enter">
          <CardHeader>
            <h2 className="text-base font-semibold">Responsavel</h2>
            <p className="text-sm text-muted-foreground">
              Dados de contato do responsavel pela empresa.
            </p>
          </CardHeader>
          <CardContent>
            <OwnerDetailsForm
              organizationId={organization.id}
              owner={
                owner
                  ? {
                      id: owner.id,
                      name: owner.name,
                      email: owner.email,
                      phone: owner.phone,
                    }
                  : null
              }
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="animate-panel-enter">
          <CardHeader className="flex items-center gap-3">
            <UsersRound className="size-5 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold">Usuarios</h2>
              <p className="text-sm text-muted-foreground">
                Contas vinculadas a esta empresa.
              </p>
            </div>
          </CardHeader>
          {orgUsers.length ? (
            <div className="divide-y divide-border">
              {orgUsers.map((user) => {
                const profilesForUser = profileNamesByUser.get(user.id) ?? [];
                return (
                  <div
                    key={user.id}
                    className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_auto] md:items-start"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {user.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {profilesForUser.length
                          ? profilesForUser.join(", ")
                          : "Sem perfil vinculado"}
                      </p>
                    </div>
                    <Badge
                      variant={statusVariant[user.status] ?? "neutral"}
                      className="justify-self-start md:justify-self-end"
                    >
                      {userStatusLabel[user.status] ?? user.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nenhum usuario vinculado.
            </div>
          )}
        </Card>

        <Card className="animate-panel-enter">
          <CardHeader className="flex items-center gap-3">
            <UserRound className="size-5 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold">Perfis</h2>
              <p className="text-sm text-muted-foreground">
                Grupos de permissao disponiveis na empresa.
              </p>
            </div>
          </CardHeader>
          {orgProfiles.length ? (
            <div className="divide-y divide-border">
              {orgProfiles.map((profile) => {
                const linkedUsers = usersByProfile.get(profile.id) ?? [];
                return (
                  <div key={profile.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{profile.name}</p>
                      {profile.is_system_default ? (
                        <Badge variant="primary">Padrao</Badge>
                      ) : null}
                    </div>
                    {profile.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {profile.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{linkedUsers.length} usuario(s)</span>
                      <span>|</span>
                      <span>
                        {permissionCountByProfile.get(profile.id) ?? 0}{" "}
                        permissao(oes)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nenhum perfil vinculado.
            </div>
          )}
        </Card>
      </section>

      <Card className="animate-panel-enter">
        <CardHeader className="flex items-center gap-3">
          <History className="size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold">Auditoria recente</h2>
            <p className="text-sm text-muted-foreground">
              Ultimas alteracoes registradas nesta empresa.
            </p>
          </div>
        </CardHeader>

        {auditRows?.length ? (
          <div className="divide-y divide-border">
            {auditRows.map((audit) => (
              <div
                key={audit.id}
                className="flex flex-col justify-between gap-1 px-5 py-4 transition-colors duration-[var(--motion-fast)] hover:bg-background md:flex-row md:items-center"
              >
                <div>
                  <p className="text-sm font-medium">
                    {auditLabel[audit.action] ?? audit.action}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {audit.actor_user_id
                      ? (actorNames.get(audit.actor_user_id) ??
                        "Usuario da plataforma")
                      : "Sistema"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(audit.created_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhum evento registrado.
          </div>
        )}
      </Card>
    </div>
  );
}
