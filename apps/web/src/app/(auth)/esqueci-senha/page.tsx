import { Pulse as Activity } from "@phosphor-icons/react/dist/ssr";
import { getPlatformSettings } from "@/lib/platform/settings";
import { PasswordResetRequestForm } from "./password-reset-request-form";

export default async function EsqueciSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const settings = await getPlatformSettings();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center overflow-hidden rounded bg-primary text-primary-foreground">
            {settings.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logo_url}
                alt=""
                className="size-full object-contain"
              />
            ) : (
              <Activity className="size-5" aria-hidden="true" />
            )}
          </div>
          <div>
            <h1 className="text-heading font-semibold">Redefinir senha</h1>
            <p className="text-sm text-muted-foreground">
              Receba um link seguro por e-mail.
            </p>
          </div>
        </div>

        {erro === "link-invalido" ? (
          <p
            role="alert"
            className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            O link é inválido ou expirou. Solicite um novo e-mail para redefinir
            sua senha.
          </p>
        ) : null}

        <PasswordResetRequestForm />
      </section>
    </main>
  );
}
