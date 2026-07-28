import Link from "next/link";
import { redirect } from "next/navigation";
import { CaretRight, GearSix } from "@phosphor-icons/react/dist/ssr";
import {
  canAccessCompanyConfigurationRoute,
  companyConfigurationPaths,
  getConfigurationAccess,
  type CompanyConfigurationRoute,
} from "./_lib/server";
import { UnavailableConfigurationPage } from "./configuration-page";
import { PageHeader } from "@/components/ui/page-header";
import {
  configurationSectionRoutes,
  configurationSections,
} from "./_lib/sections";

const legacyTabRoutes: Record<string, CompanyConfigurationRoute> = {
  cadastros: "cadastros",
  usuarios: "usuarios-acessos",
  "usuarios-acessos": "usuarios-acessos",
  agenda: "agenda",
  "agendamento-online": "agendamento-online",
  whatsapp: "whatsapp",
  tags: "tags-automacoes",
  "tags-automacoes": "tags-automacoes",
  "modelos-clinicos": "modelos-clinicos",
};

type ConfigurationSearchParams = Record<string, string | string[] | undefined>;

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<ConfigurationSearchParams>;
}) {
  const access = await getConfigurationAccess();

  if (access.kind === "platform") {
    redirect("/configuracoes/plataforma");
  }

  // Links legados (?tab=...) continuam levando direto à seção.
  const params = await searchParams;
  const requestedTabValue = params.tab;
  const requestedTab = Array.isArray(requestedTabValue)
    ? requestedTabValue[0]
    : requestedTabValue;
  const requestedRoute = requestedTab
    ? legacyTabRoutes[requestedTab]
    : undefined;
  if (
    requestedRoute &&
    canAccessCompanyConfigurationRoute(access, requestedRoute)
  ) {
    redirect(
      `${companyConfigurationPaths[requestedRoute]}${getPreservedSearch(params)}`,
    );
  }

  const visibleSections = configurationSectionRoutes.filter((route) =>
    canAccessCompanyConfigurationRoute(access, route),
  );

  if (!visibleSections.length) {
    return <UnavailableConfigurationPage />;
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={GearSix}
        title="Configurações"
        description={`Preferências e cadastros de ${access.organization.name}.`}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleSections.map((route) => {
          const section = configurationSections[route];
          return (
            <Link
              key={route}
              href={companyConfigurationPaths[route]}
              className="group flex items-start gap-4 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:border-primary/40 hover:shadow-[var(--shadow-hover)]"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary">
                <section.icon
                  className="size-5"
                  weight="duotone"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between gap-2 text-heading-sm font-semibold">
                  {section.title}
                  <CaretRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </p>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  {section.cardDescription}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function getPreservedSearch(params: ConfigurationSearchParams) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "tab" || value === undefined) continue;

    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, item));
    } else {
      search.set(key, value);
    }
  }

  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}
