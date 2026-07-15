import Link from "next/link";
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  FileDown,
  FileSpreadsheet,
  Stethoscope,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { ReportsFilters } from "./reports-filters";
import { ReportsPanel, type ReportsPanelView } from "./reports-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireCompanyPermission } from "@/lib/authz/guards";
import {
  buildPhase13ReportData,
  createReportQueryString,
  resolveReportFilters,
  resolveReportPermissions,
  type ReportPermissions,
} from "@/lib/reports/phase13";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ReportsSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

type ReportRouteView = ReportsPanelView;

const allReportPermissions = [
  "relatorio.operacional",
  "relatorio.financeiro",
  "relatorio.clinico",
];

const pageConfig: Record<
  ReportRouteView,
  {
    description: string;
    href: string;
    icon: LucideIcon;
    permissionCodes: string[];
    title: string;
  }
> = {
  overview: {
    description:
      "Resumo dos indicadores disponíveis para o seu perfil de acesso.",
    href: "/relatorios/visao-geral",
    icon: BarChart3,
    permissionCodes: allReportPermissions,
    title: "Visão geral",
  },
  operational: {
    description:
      "Volume da agenda, comparecimento, ocupação e comportamento dos pacientes.",
    href: "/relatorios/atendimentos",
    icon: CalendarCheck,
    permissionCodes: ["relatorio.operacional"],
    title: "Atendimentos",
  },
  financial: {
    description:
      "Recebimentos, valores em aberto, despesas, repasses e resultado do período.",
    href: "/relatorios/financeiro",
    icon: WalletCards,
    permissionCodes: ["relatorio.financeiro"],
    title: "Financeiro",
  },
  clinical: {
    description:
      "Produção clínica, conclusão de prontuários, diagnósticos e procedimentos.",
    href: "/relatorios/clinico",
    icon: Stethoscope,
    permissionCodes: ["relatorio.clinico"],
    title: "Clínico",
  },
  professionals: {
    description:
      "Indicadores consolidados por profissional conforme suas permissões.",
    href: "/relatorios/profissionais",
    icon: UsersRound,
    permissionCodes: allReportPermissions,
    title: "Por profissional",
  },
};

export async function ReportPage({
  searchParams,
  view,
}: {
  searchParams?: ReportsSearchParams;
  view: ReportRouteView;
}) {
  const config = pageConfig[view];
  const [params, context] = await Promise.all([
    searchParams ?? Promise.resolve({}),
    requireCompanyPermission(config.permissionCodes),
  ]);
  const filters = resolveReportFilters(params);
  const availablePermissions = resolveReportPermissions(
    context.permissionCodes,
  );
  const permissions = scopePermissions(view, availablePermissions);
  const supabase = await createSupabaseServerClient();
  const data = await buildPhase13ReportData({
    filters,
    organizationId: context.organization.id,
    permissions,
    supabase,
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={config.icon}
        title={config.title}
        description={config.description}
        actions={reportActions({ filters, permissions, view })}
      />

      <Card>
        <CardContent>
          <ReportsFilters
            filters={filters}
            options={data.options}
            resetHref={config.href}
          />
        </CardContent>
      </Card>

      <ReportsPanel data={data} view={view} />
    </div>
  );
}

function scopePermissions(
  view: ReportRouteView,
  permissions: ReportPermissions,
): ReportPermissions {
  if (view === "operational") {
    return { ...permissions, clinical: false, financial: false };
  }
  if (view === "financial") {
    return { ...permissions, clinical: false, operational: false };
  }
  if (view === "clinical") {
    return { ...permissions, financial: false, operational: false };
  }

  return permissions;
}

function reportActions({
  filters,
  permissions,
  view,
}: {
  filters: ReturnType<typeof resolveReportFilters>;
  permissions: ReportPermissions;
  view: ReportRouteView;
}) {
  if (view === "operational") {
    return (
      <Button asChild variant="secondary">
        <Link href="/relatorios/agendamentos">
          <CalendarDays className="size-4" aria-hidden="true" />
          Lista de agendamentos
        </Link>
      </Button>
    );
  }

  if (view !== "overview" || !permissions.export) return undefined;

  const xlsQuery = createReportQueryString(filters, { format: "xls" });
  const pdfQuery = createReportQueryString(filters, { format: "pdf" });

  return (
    <>
      <Button asChild variant="secondary">
        <Link href={`/relatorios/exportar?${xlsQuery}`}>
          <FileSpreadsheet className="size-4" aria-hidden="true" />
          Excel
        </Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href={`/relatorios/exportar?${pdfQuery}`} target="_blank">
          <FileDown className="size-4" aria-hidden="true" />
          PDF
        </Link>
      </Button>
    </>
  );
}
