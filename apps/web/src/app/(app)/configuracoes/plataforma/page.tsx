import { Settings } from "lucide-react";
import { PlatformSettingsForm } from "../platform-settings-form";
import { requirePlatformConfigurationAccess } from "../_lib/server";
import { PageHeader } from "@/components/ui/page-header";
import { getPlatformSettings } from "@/lib/platform/settings";

export default async function PlataformaConfiguracoesPage() {
  await requirePlatformConfigurationAccess();
  const settings = await getPlatformSettings();

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={Settings}
        title="Configurações da plataforma"
        description="Marca, cores e canais de suporte da plataforma."
      />

      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Settings className="size-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold">Aparência e suporte</h2>
            <p className="text-sm text-muted-foreground">
              Estes dados serão usados nas páginas das empresas.
            </p>
          </div>
        </div>
        <div className="p-5">
          <PlatformSettingsForm settings={settings} />
        </div>
      </section>
    </div>
  );
}
