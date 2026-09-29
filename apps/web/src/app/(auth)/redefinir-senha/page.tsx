import { Pulse as Activity } from "@phosphor-icons/react/dist/ssr";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/lib/platform/settings";
import { PasswordUpdateForm } from "./password-update-form";

export default async function RedefinirSenhaPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/esqueci-senha?erro=link-invalido");
  }

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
            <h1 className="text-heading font-semibold">Nova senha</h1>
            <p className="text-sm text-muted-foreground">
              Defina uma nova credencial de acesso.
            </p>
          </div>
        </div>

        <PasswordUpdateForm />
      </section>
    </main>
  );
}
