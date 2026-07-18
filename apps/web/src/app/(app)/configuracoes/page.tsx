import { redirect } from "next/navigation";
import {
  canAccessCompanyConfigurationRoute,
  companyConfigurationPaths,
  getConfigurationAccess,
  getFirstCompanyConfigurationPath,
  type CompanyConfigurationRoute,
} from "./_lib/server";
import { UnavailableConfigurationPage } from "./configuration-page";

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

  const params = await searchParams;
  const requestedTabValue = params.tab;
  const requestedTab = Array.isArray(requestedTabValue)
    ? requestedTabValue[0]
    : requestedTabValue;
  const requestedRoute = requestedTab
    ? legacyTabRoutes[requestedTab]
    : undefined;
  const route =
    requestedRoute && canAccessCompanyConfigurationRoute(access, requestedRoute)
      ? requestedRoute
      : undefined;
  const destination = route
    ? companyConfigurationPaths[route]
    : getFirstCompanyConfigurationPath(access);

  if (!destination) {
    return <UnavailableConfigurationPage />;
  }

  redirect(`${destination}${getPreservedSearch(params)}`);
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
