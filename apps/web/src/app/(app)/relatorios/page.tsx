import { redirect } from "next/navigation";
import { requireCompanyPermission } from "@/lib/authz/guards";

type RelatoriosPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const reportPermissions = [
  "relatorio.operacional",
  "relatorio.financeiro",
  "relatorio.clinico",
];

export default async function RelatoriosPage({
  searchParams,
}: RelatoriosPageProps) {
  const [params, context] = await Promise.all([
    searchParams ?? Promise.resolve({}),
    requireCompanyPermission(reportPermissions),
  ]);
  const destination = resolveDestination(params, context.permissionCodes);

  redirect(withSearchParams(destination, params));
}

function resolveDestination(
  params: Record<string, string | string[] | undefined>,
  permissionCodes: Set<string>,
) {
  const requestedReport = firstValue(params.report);
  const legacyDestination =
    requestedReport === "operacional"
      ? "/relatorios/atendimentos"
      : requestedReport === "financeiro"
        ? "/relatorios/financeiro"
        : requestedReport === "clinico"
          ? "/relatorios/clinico"
          : requestedReport === "profissionais"
            ? "/relatorios/profissionais"
            : null;

  if (
    legacyDestination &&
    canAccessDestination(legacyDestination, permissionCodes)
  ) {
    return legacyDestination;
  }

  const available = [
    permissionCodes.has("relatorio.operacional")
      ? "/relatorios/atendimentos"
      : null,
    permissionCodes.has("relatorio.financeiro")
      ? "/relatorios/financeiro"
      : null,
    permissionCodes.has("relatorio.clinico") ? "/relatorios/clinico" : null,
  ].filter((href): href is string => Boolean(href));

  return available.length === 1 ? available[0] : "/relatorios/visao-geral";
}

function canAccessDestination(href: string, permissionCodes: Set<string>) {
  if (href === "/relatorios/atendimentos") {
    return permissionCodes.has("relatorio.operacional");
  }
  if (href === "/relatorios/financeiro") {
    return permissionCodes.has("relatorio.financeiro");
  }
  if (href === "/relatorios/clinico") {
    return permissionCodes.has("relatorio.clinico");
  }

  return reportPermissions.some((permission) =>
    permissionCodes.has(permission),
  );
}

function withSearchParams(
  href: string,
  params: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams();

  for (const [key, input] of Object.entries(params)) {
    if (key === "report" || input == null) continue;
    const values = Array.isArray(input) ? input : [input];
    for (const value of values) query.append(key, value);
  }

  const suffix = query.toString();
  return suffix ? `${href}?${suffix}` : href;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
