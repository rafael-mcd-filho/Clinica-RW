import { redirect } from "next/navigation";
import { UsuariosTable, type UsuarioRow } from "./usuarios-table";
import { getCurrentAppUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  organization_id: string | null;
};

type OrganizationRow = { id: string; name: string };
type RoleRow = { name: string };
type UserProfileRow = { user_id: string; profiles: { name: string } | null };

export default async function UsuariosPage() {
  const appUser = await getCurrentAppUser();

  if (!appUser?.is_super_admin) {
    redirect("/dashboard");
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: users }, { data: organizations }, { data: roles }] =
    await Promise.all([
      supabase
        .from("app_users")
        .select("id, name, email, phone, status, organization_id")
        .eq("is_super_admin", false)
        .order("created_at", { ascending: false })
        .returns<UserRow[]>(),
      supabase
        .from("organizations")
        .select("id, name")
        .order("name", { ascending: true })
        .returns<OrganizationRow[]>(),
      supabase
        .from("profiles")
        .select("name")
        .is("organization_id", null)
        .order("name", { ascending: true })
        .returns<RoleRow[]>(),
    ]);

  const userIds = (users ?? []).map((user) => user.id);
  const { data: userProfiles } = userIds.length
    ? await supabase
        .from("user_profiles")
        .select("user_id, profiles(name)")
        .in("user_id", userIds)
        .returns<UserProfileRow[]>()
    : { data: [] as UserProfileRow[] };

  const orgNames = new Map(
    (organizations ?? []).map((organization) => [
      organization.id,
      organization.name,
    ]),
  );

  const profileNamesByUser = new Map<string, string[]>();
  (userProfiles ?? []).forEach((row) => {
    if (!row.profiles?.name) {
      return;
    }
    const list = profileNamesByUser.get(row.user_id) ?? [];
    list.push(row.profiles.name);
    profileNamesByUser.set(row.user_id, list);
  });

  const rows: UsuarioRow[] = (users ?? []).map((user) => ({
    ...user,
    organizationName: user.organization_id
      ? (orgNames.get(user.organization_id) ?? "—")
      : "—",
    profileNames: profileNamesByUser.get(user.id) ?? [],
  }));

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-xl font-semibold">Usuários</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todos os usuários das empresas que utilizam a plataforma.
        </p>
      </section>

      <UsuariosTable
        users={rows}
        organizations={(organizations ?? []).map((organization) => ({
          id: organization.id,
          name: organization.name,
        }))}
        roleNames={(roles ?? []).map((role) => role.name)}
      />
    </div>
  );
}
