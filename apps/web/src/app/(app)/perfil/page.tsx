import { Building2, Mail, ShieldCheck, UserRound } from "lucide-react";
import {
  getCurrentAppUser,
  requireAuthenticatedUser,
} from "@/lib/auth/session";

export default async function PerfilPage() {
  const authUser = await requireAuthenticatedUser();
  const appUser = await getCurrentAppUser();
  const sessionLabel = appUser?.is_super_admin
    ? "Super Admin"
    : (appUser?.organizations?.name ?? "Conta sem vínculo interno");

  const profileRows = [
    {
      label: "Nome",
      value: appUser?.name ?? authUser.email ?? "Usuário",
      icon: UserRound,
    },
    {
      label: "E-mail",
      value: appUser?.email ?? authUser.email ?? "-",
      icon: Mail,
    },
    {
      label: "Sessão atual",
      value: sessionLabel,
      icon: ShieldCheck,
    },
    {
      label: "Empresa",
      value: appUser?.organizations?.name ?? "Plataforma Hi Clinic",
      icon: Building2,
    },
  ];

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-xl font-semibold">Meu perfil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dados da conta autenticada na plataforma.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex size-10 items-center justify-center rounded bg-primary-muted text-primary">
            <UserRound className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {appUser?.name ?? authUser.email ?? "Usuário"}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {sessionLabel}
            </p>
          </div>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-2">
          {profileRows.map((row) => (
            <div
              key={row.label}
              className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background p-4"
            >
              <row.icon
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {row.label}
                </p>
                <p className="mt-1 truncate text-sm font-medium">{row.value}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
