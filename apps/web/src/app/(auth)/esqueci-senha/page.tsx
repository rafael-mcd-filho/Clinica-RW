import { Pulse as Activity } from "@phosphor-icons/react/dist/ssr";
import { PasswordResetRequestForm } from "./password-reset-request-form";

export default function EsqueciSenhaPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded bg-primary text-primary-foreground">
            <Activity className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-semibold">Redefinir senha</h1>
            <p className="text-sm text-muted-foreground">
              Receba um link seguro por e-mail.
            </p>
          </div>
        </div>

        <PasswordResetRequestForm />
      </section>
    </main>
  );
}
