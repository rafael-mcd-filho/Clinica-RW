import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  FileDown,
  FileSpreadsheet,
  Filter,
} from "lucide-react";
import { ReportsPanel } from "./reports-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { requireCompanyPermission } from "@/lib/authz/guards";
import {
  buildPhase13ReportData,
  createReportQueryString,
  resolveReportFilters,
  resolveReportPermissions,
} from "@/lib/reports/phase13";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RelatoriosPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RelatoriosPage({
  searchParams,
}: RelatoriosPageProps) {
  const params = await searchParams;
  const context = await requireCompanyPermission([
    "relatorio.operacional",
    "relatorio.financeiro",
    "relatorio.clinico",
  ]);
  const filters = resolveReportFilters(params);
  const permissions = resolveReportPermissions(context.permissionCodes);
  const supabase = await createSupabaseServerClient();
  const data = await buildPhase13ReportData({
    filters,
    organizationId: context.organization.id,
    permissions,
    supabase,
  });
  const xlsQuery = createReportQueryString(filters, { format: "xls" });
  const pdfQuery = createReportQueryString(filters, { format: "pdf" });

  return (
    <div className="grid gap-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary">
            <BarChart3 className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Relatorios</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              BI inicial com indicadores operacionais, financeiros, clinicos e
              por profissional.
            </p>
          </div>
        </div>

        {permissions.operational || permissions.export ? (
          <div className="flex flex-wrap gap-2">
            {permissions.operational ? (
              <Button asChild variant="secondary">
                <Link href="/relatorios/agendamentos">
                  <CalendarDays className="size-4" aria-hidden="true" />
                  Resumo dos agendamentos
                </Link>
              </Button>
            ) : null}
            {permissions.export ? (
              <>
                <Button asChild variant="secondary">
                  <Link href={`/relatorios/exportar?${xlsQuery}`}>
                    <FileSpreadsheet className="size-4" aria-hidden="true" />
                    Excel
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link
                    href={`/relatorios/exportar?${pdfQuery}`}
                    target="_blank"
                  >
                    <FileDown className="size-4" aria-hidden="true" />
                    PDF
                  </Link>
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <Card>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <label className="grid gap-2 text-sm font-medium">
              De
              <Input name="from" type="date" defaultValue={filters.from} />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Ate
              <Input name="to" type="date" defaultValue={filters.to} />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Profissional
              <Select
                name="professional_id"
                defaultValue={filters.professionalId}
              >
                <option value="">Todos</option>
                {data.options.professionals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Unidade
              <Select name="unit_id" defaultValue={filters.unitId}>
                <option value="">Todas</option>
                {data.options.units.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Convenio
              <Select
                name="health_insurance_id"
                defaultValue={filters.healthInsuranceId}
              >
                <option value="">Todos</option>
                {data.options.healthInsurances.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Procedimento
              <Select name="procedure_id" defaultValue={filters.procedureId}>
                <option value="">Todos</option>
                {data.options.procedures.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-end md:col-span-3 xl:col-span-6">
              <Button type="submit">
                <Filter className="size-4" aria-hidden="true" />
                Aplicar filtros
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ReportsPanel data={data} />
    </div>
  );
}
