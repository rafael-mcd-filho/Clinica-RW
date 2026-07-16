import { Pulse as Activity } from "@phosphor-icons/react/dist/ssr";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { getAuthenticatedUser } from "@/lib/auth/session";

export default async function LoginPage() {
  const authUser = await getAuthenticatedUser();

  if (authUser) {
    redirect("/dashboard");
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[0.95fr_1.05fr]">
      <section className="flex items-center justify-center border-b border-border bg-card px-6 py-10 lg:border-b-0 lg:border-r">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded bg-primary text-primary-foreground">
              <Activity className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Hi Clinic</h1>
              <p className="text-sm text-muted-foreground">Acesso interno</p>
            </div>
          </div>

          <LoginForm />
        </div>
      </section>

      <section className="hidden items-end bg-primary-muted px-10 py-10 lg:flex">
        <div className="max-w-xl">
          <p className="text-sm font-medium uppercase text-primary">
            Operação clínica
          </p>
          <p className="mt-4 text-4xl font-semibold leading-tight text-foreground">
            Agenda, paciente, atendimento e financeiro no mesmo fluxo.
          </p>
        </div>
      </section>
    </main>
  );
}
