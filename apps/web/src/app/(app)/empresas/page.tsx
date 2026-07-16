import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { EmpresasTable, type EmpresaRow } from "./empresas-table";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OrganizationRow = {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  status: string;
  created_at: string;
};

type UserRow = {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  status: string;
};

export default async function EmpresasPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, legal_name, document, status, created_at")
    .order("created_at", { ascending: false })
    .returns<OrganizationRow[]>();

  const organizationIds = data?.map((organization) => organization.id) ?? [];
  const { data: users } = organizationIds.length
    ? await supabase
        .from("app_users")
        .select("id, organization_id, name, email, status")
        .eq("is_super_admin", false)
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: true })
        .returns<UserRow[]>()
    : { data: [] as UserRow[] };

  const usersByOrganization = new Map<string, EmpresaRow["users"]>();

  users?.forEach((user) => {
    const list = usersByOrganization.get(user.organization_id) ?? [];
    list.push({
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
    });
    usersByOrganization.set(user.organization_id, list);
  });

  const organizations: EmpresaRow[] = (data ?? []).map((organization) => ({
    ...organization,
    users: usersByOrganization.get(organization.id) ?? [],
  }));

  return (
    <div className="grid gap-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-semibold">Empresas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clientes que utilizam a plataforma Hi Clinic.
          </p>
        </div>
        <Button asChild>
          <Link href="/empresas/nova">
            <Plus className="size-4" aria-hidden="true" />
            Nova empresa
          </Link>
        </Button>
      </section>

      {error ? (
        <div className="rounded-lg border border-border bg-card px-5 py-8 text-sm text-destructive shadow-[var(--shadow-soft)]">
          {error.message}
        </div>
      ) : (
        <EmpresasTable organizations={organizations} />
      )}
    </div>
  );
}
