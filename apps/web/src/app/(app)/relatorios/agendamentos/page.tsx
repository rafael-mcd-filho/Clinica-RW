import Link from "next/link";
import { CalendarDays, Download, Filter, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { requireCompanyPermission } from "@/lib/authz/guards";
import {
  appointmentStatusOptions,
  buildAppointmentSummaryData,
  createAppointmentSummaryQueryString,
  paymentStatusOptions,
  resolveAppointmentSummaryFilters,
  type AppointmentSummaryRow,
} from "@/lib/reports/appointments-summary";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AppointmentSummaryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AppointmentSummaryPage({
  searchParams,
}: AppointmentSummaryPageProps) {
  const params = await searchParams;
  const context = await requireCompanyPermission(["relatorio.operacional"]);
  const filters = resolveAppointmentSummaryFilters(params);
  const supabase = await createSupabaseServerClient();
  const data = await buildAppointmentSummaryData({
    filters,
    organizationId: context.organization.id,
    supabase,
  });
  const exportQuery = createAppointmentSummaryQueryString(filters);
  const canExport = context.permissionCodes.has("relatorio.exportar");

  return (
    <div className="grid gap-5">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary">
            <CalendarDays className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Resumo dos agendamentos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Consultas, servicos, convenio, pagamento e estado no periodo.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/relatorios">BI geral</Link>
          </Button>
          {canExport ? (
            <Button asChild variant="secondary">
              <Link href={`/relatorios/agendamentos/exportar?${exportQuery}`}>
                <Download className="size-4" aria-hidden="true" />
                Exportar dados
              </Link>
            </Button>
          ) : null}
        </div>
      </section>

      <Card>
        <CardContent>
          <form className="grid gap-3 lg:grid-cols-[10rem_10rem_minmax(12rem,1fr)_12rem_12rem_12rem_auto]">
            <label className="grid gap-2 text-sm font-medium">
              De
              <Input name="from" type="date" defaultValue={filters.from} />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Ate
              <Input name="to" type="date" defaultValue={filters.to} />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Paciente
              <Input
                name="patient"
                defaultValue={filters.patientQuery}
                placeholder="Nome do paciente"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Endereco
              <Select name="unit_id" defaultValue={filters.unitId}>
                <option value="">Todos</option>
                {data.options.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
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
                {data.options.healthInsurances.map((insurance) => (
                  <option key={insurance.id} value={insurance.id}>
                    {insurance.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Servico
              <Select name="procedure_id" defaultValue={filters.procedureId}>
                <option value="">Todos</option>
                {data.options.procedures.map((procedure) => (
                  <option key={procedure.id} value={procedure.id}>
                    {procedure.name}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-end gap-2">
              <details className="relative">
                <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium shadow-[var(--shadow-soft)] marker:hidden">
                  Mais
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-lg)]">
                  <FilterGroup
                    title="Estado"
                    name="status"
                    options={appointmentStatusOptions}
                    selected={filters.statuses}
                  />
                  <FilterGroup
                    title="Situacao do pagamento"
                    name="payment_status"
                    options={paymentStatusOptions}
                    selected={filters.paymentStatuses}
                    className="mt-5"
                  />
                </div>
              </details>
              <Button type="submit">
                <Filter className="size-4" aria-hidden="true" />
                Filtrar
              </Button>
              <Button asChild type="button" variant="ghost">
                <Link href="/relatorios/agendamentos">
                  <RotateCcw className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-4">
        <SummaryMetric label="Agendamentos" value={data.totals.appointments} />
        <SummaryMetric
          label="Total previsto"
          value={formatCurrency(data.totals.amount)}
        />
        <SummaryMetric label="Pago" value={formatCurrency(data.totals.paid)} />
        <SummaryMetric
          label="Pendente/parcial"
          value={formatCurrency(data.totals.pending)}
        />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <Th>Data</Th>
                <Th>Paciente</Th>
                <Th>Servicos</Th>
                <Th>Convenio</Th>
                <Th>Preco</Th>
                <Th>Fonte da consulta</Th>
                <Th>Estado</Th>
                <Th>Pagamento</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length ? (
                data.rows.map((row) => (
                  <AppointmentRowItem key={row.id} row={row} />
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    Nenhum agendamento encontrado para os filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FilterGroup({
  title,
  name,
  options,
  selected,
  className,
}: {
  title: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      <div className="grid gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-start gap-2 text-sm text-secondary-foreground"
          >
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={
                !selected.length || selected.includes(option.value)
              }
              className="mt-0.5 size-4 rounded border-border accent-primary"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function AppointmentRowItem({ row }: { row: AppointmentSummaryRow }) {
  return (
    <tr className="border-t border-border">
      <Td>
        <p className="font-medium tabular-nums">{row.date}</p>
        <p className="text-xs text-muted-foreground">{row.time}</p>
      </Td>
      <Td>
        <p className="max-w-64 truncate font-semibold">{row.patientName}</p>
        <p className="text-xs text-muted-foreground">{row.unitName}</p>
      </Td>
      <Td>{row.serviceName}</Td>
      <Td>{row.insuranceName}</Td>
      <Td>
        {row.price == null ? "Adicionar preco" : formatCurrency(row.price)}
      </Td>
      <Td>{row.source}</Td>
      <Td>
        <StatusBadge status={row.status} label={row.statusLabel} />
      </Td>
      <Td>
        <div className="grid gap-1">
          <StatusBadge
            status={row.paymentStatus}
            label={row.paymentStatusLabel}
          />
          <span className="text-xs text-muted-foreground">
            {row.paymentMethodName}
          </span>
        </div>
      </Td>
    </tr>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const variant =
    status === "attended" || status === "paid"
      ? "success"
      : status === "cancelled" || status === "no_show"
        ? "destructive"
        : status === "pending" || status === "partial"
          ? "warning"
          : "neutral";
  return <Badge variant={variant}>{label}</Badge>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}
