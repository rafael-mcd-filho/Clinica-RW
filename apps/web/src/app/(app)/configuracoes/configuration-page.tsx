import { GearSix as Settings } from "@phosphor-icons/react/dist/ssr";
import type {
  CompanyConfigurationAccess,
  CompanyConfigurationRoute,
} from "./_lib/server";
import { PageHeader } from "@/components/ui/page-header";
import { configurationSections } from "./_lib/sections";

export function CompanyConfigurationPage({
  access,
  children,
  route,
}: {
  access: CompanyConfigurationAccess;
  children: React.ReactNode;
  route: CompanyConfigurationRoute;
}) {
  const metadata = configurationSections[route];

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeader
        icon={metadata.icon}
        title={metadata.title}
        description={metadata.pageDescription(access.organization.name)}
      />
      {children}
    </div>
  );
}

export function UnavailableConfigurationPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        icon={Settings}
        title="Configurações"
        description="Seu perfil não permite alterar configurações disponíveis nesta tela."
      />
    </div>
  );
}
