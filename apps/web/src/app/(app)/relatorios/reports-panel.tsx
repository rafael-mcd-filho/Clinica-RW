"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  Banknote,
  CalendarCheck,
  Clock3,
  FileText,
  Percent,
  Receipt,
  Stethoscope,
  UserCheck,
  UserX,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs } from "@/components/ui/tabs";
import type {
  OperationalProfessionalRow,
  ProfessionalReportRow,
  ReportBreakdown,
  ReportData,
  ReportPoint,
} from "@/lib/reports/phase13";
import { cn } from "@/lib/utils";

type MetricTone = "primary" | "success" | "warning" | "destructive" | "neutral";

const metricToneClass: Record<MetricTone, string> = {
  primary: "bg-primary-muted text-primary",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning-foreground",
  destructive: "bg-destructive-muted text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

export function ReportsPanel({ data }: { data: ReportData }) {
  const items = [
    data.operational
      ? {
          id: "operacional",
          label: "Operacional",
          content: <OperationalSection data={data} />,
        }
      : null,
    data.financial
      ? {
          id: "financeiro",
          label: "Financeiro",
          content: <FinancialSection data={data} />,
        }
      : null,
    data.clinical
      ? {
          id: "clinico",
          label: "Clinico",
          content: <ClinicalSection data={data} />,
        }
      : null,
    {
      id: "profissionais",
      label: "Por profissional",
      content: <ProfessionalsSection rows={data.professionals} />,
    },
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (!items.length) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhum relatorio disponivel"
        description="Revise as permissoes do usuario para liberar os relatorios."
      />
    );
  }

  return <Tabs defaultTab={items[0]?.id} items={items} />;
}

function OperationalSection({ data }: { data: ReportData }) {
  const report = data.operational;
  if (!report) return null;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard
          icon={CalendarCheck}
          label="Agendamentos"
          value={String(report.totalAppointments)}
          tone="primary"
        />
        <MetricCard
          icon={UserCheck}
          label="Atendidos"
          value={String(report.attended)}
          tone="success"
        />
        <MetricCard
          icon={UserX}
          label="No-show"
          value={`${report.noShowRate}%`}
          tone={report.noShowRate > 10 ? "warning" : "neutral"}
        />
        <MetricCard
          icon={Percent}
          label="Ocupacao"
          value={
            report.occupancyRate == null
              ? "Sem escala"
              : `${report.occupancyRate}%`
          }
          tone="primary"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <BarChartCard title="Volume diario" data={report.dailyVolume} />
        <BarChartCard title="Status da agenda" data={report.statusBreakdown} />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <BarChartCard
          title="Procedimentos realizados"
          data={report.procedureBreakdown.slice(0, 8)}
        />
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Pacientes no periodo</h2>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <InlineMetric
                label="Novos"
                value={String(report.newPatients)}
                icon={UsersRound}
              />
              <InlineMetric
                label="Recorrentes"
                value={String(report.recurringPatients)}
                icon={UsersRound}
              />
              <InlineMetric
                label="Tempo medio"
                value={formatMinutes(report.averageDurationMinutes)}
                icon={Clock3}
              />
              <InlineMetric
                label="Cancelamentos"
                value={String(report.cancellations)}
                icon={AlertTriangle}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <OperationalProfessionalsTable rows={report.professionals} />
    </div>
  );
}

function FinancialSection({ data }: { data: ReportData }) {
  const report = data.financial;
  if (!report) return null;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard
          icon={WalletCards}
          label="Recebido"
          value={formatCurrency(report.revenue)}
          tone="success"
        />
        <MetricCard
          icon={Receipt}
          label="A receber"
          value={formatCurrency(report.openReceivable)}
          tone="warning"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Inadimplencia"
          value={formatCurrency(report.overdueReceivable)}
          tone={report.overdueReceivable > 0 ? "destructive" : "neutral"}
        />
        <MetricCard
          icon={Banknote}
          label="Resultado"
          value={formatCurrency(report.netResult)}
          tone={report.netResult >= 0 ? "success" : "destructive"}
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <BarChartCard
          title="Recebimentos por forma"
          data={report.paymentMethods.slice(0, 8)}
          currency
        />
        <BarChartCard
          title="Recebimentos por convenio"
          data={report.insuranceRevenue.slice(0, 8)}
          currency
        />
      </section>

      <FinancialDreTable report={report} />
    </div>
  );
}

function ClinicalSection({ data }: { data: ReportData }) {
  const report = data.clinical;
  if (!report) return null;

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard
          icon={Stethoscope}
          label="Atendimentos"
          value={String(report.totalEncounters)}
          tone="primary"
        />
        <MetricCard
          icon={UserCheck}
          label="Finalizados"
          value={String(report.finalizedEncounters)}
          tone="success"
        />
        <MetricCard
          icon={FileText}
          label="Rascunhos"
          value={String(report.draftEncounters)}
          tone={report.draftEncounters > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          icon={Clock3}
          label="Tempo ate finalizar"
          value={formatHours(report.averageCompletionHours)}
          tone="neutral"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <BarChartCard
          title="CIDs mais atendidos"
          data={report.diagnoses.slice(0, 8)}
        />
        <BarChartCard
          title="Procedimentos clinicos"
          data={report.procedures.slice(0, 8)}
        />
      </section>
    </div>
  );
}

function ProfessionalsSection({ rows }: { rows: ProfessionalReportRow[] }) {
  const columns = useMemo<ColumnDef<ProfessionalReportRow>[]>(
    () => [
      {
        accessorKey: "professionalName",
        header: "Profissional",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.professionalName}</span>
        ),
      },
      {
        accessorKey: "appointments",
        header: "Consultas",
        cell: ({ row }) => row.original.appointments,
      },
      {
        accessorKey: "attended",
        header: "Atendidas",
        cell: ({ row }) => row.original.attended,
      },
      {
        accessorKey: "noShowRate",
        header: "No-show",
        cell: ({ row }) => `${row.original.noShowRate}%`,
      },
      {
        accessorKey: "revenue",
        header: "Faturamento",
        cell: ({ row }) => formatCurrency(row.original.revenue),
      },
      {
        accessorKey: "finalizedEncounters",
        header: "Prontuarios",
        cell: ({ row }) => row.original.finalizedEncounters,
      },
    ],
    [],
  );

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold">Desempenho por profissional</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Consulta, faturamento e producao clinica conforme as permissoes do
          usuario.
        </p>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        pageSize={8}
        emptyTitle="Nenhum dado por profissional"
        emptyDescription="Os indicadores aparecem quando ha dados nos relatorios liberados."
      />
    </section>
  );
}

function OperationalProfessionalsTable({
  rows,
}: {
  rows: OperationalProfessionalRow[];
}) {
  const columns = useMemo<ColumnDef<OperationalProfessionalRow>[]>(
    () => [
      {
        accessorKey: "professionalName",
        header: "Profissional",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.professionalName}</span>
        ),
      },
      {
        accessorKey: "appointments",
        header: "Agendamentos",
        cell: ({ row }) => row.original.appointments,
      },
      {
        accessorKey: "attended",
        header: "Atendidos",
        cell: ({ row }) => row.original.attended,
      },
      {
        accessorKey: "noShows",
        header: "No-show",
        cell: ({ row }) => row.original.noShows,
      },
      {
        accessorKey: "occupiedMinutes",
        header: "Tempo ocupado",
        cell: ({ row }) => formatMinutes(row.original.occupiedMinutes),
      },
      {
        accessorKey: "occupancyRate",
        header: "Ocupacao",
        cell: ({ row }) =>
          row.original.occupancyRate == null
            ? "Sem escala"
            : `${row.original.occupancyRate}%`,
      },
    ],
    [],
  );

  return (
    <section className="grid gap-3">
      <h2 className="text-base font-semibold">Agenda por profissional</h2>
      <DataTable
        columns={columns}
        data={rows}
        pageSize={8}
        emptyTitle="Nenhum agendamento no periodo"
        emptyDescription="Ajuste os filtros para analisar outro intervalo."
      />
    </section>
  );
}

function FinancialDreTable({
  report,
}: {
  report: NonNullable<ReportData["financial"]>;
}) {
  const rows = [
    { label: "Receita recebida", value: report.revenue },
    { label: "Contas a receber geradas", value: report.receivable },
    { label: "Saldo aberto a receber", value: report.openReceivable },
    { label: "Inadimplencia", value: report.overdueReceivable },
    { label: "Despesas pagas", value: -report.expenses },
    { label: "Repasses pendentes", value: -report.pendingPayouts },
    { label: "Resultado do periodo", value: report.netResult },
  ];
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(
    () => [
      {
        accessorKey: "label",
        header: "Linha",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.label}</span>
        ),
      },
      {
        accessorKey: "value",
        header: "Valor",
        cell: ({ row }) => (
          <span
            className={cn(
              "font-semibold tabular-nums",
              row.original.value < 0
                ? "text-destructive-foreground"
                : "text-success-foreground",
            )}
          >
            {formatCurrency(row.original.value)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <section className="grid gap-3">
      <h2 className="text-base font-semibold">DRE simplificada</h2>
      <DataTable columns={columns} data={rows} pageSize={8} />
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone: MetricTone;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-md",
            metricToneClass[tone],
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function InlineMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-md border border-border bg-background p-3">
      <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function BarChartCard({
  currency,
  data,
  title,
}: {
  currency?: boolean;
  data: Array<ReportPoint | ReportBreakdown>;
  title: string;
}) {
  const hasData = data.some((item) => item.value > 0);

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">{title}</h2>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          {hasData ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  interval={0}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: string) =>
                    value.length > 12 ? `${value.slice(0, 12)}...` : value
                  }
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  tickFormatter={(value: number) =>
                    currency ? compactCurrency(value) : String(value)
                  }
                  width={currency ? 58 : 36}
                />
                <Tooltip
                  cursor={{ fill: "rgba(148, 163, 184, 0.14)" }}
                  formatter={(value) =>
                    currency ? formatCurrency(Number(value)) : Number(value)
                  }
                />
                <Bar
                  dataKey="value"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Sem dados para o periodo" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(Number(value) || 0);
}

function formatMinutes(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "0min";
  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return hours
    ? `${hours}h ${String(minutes).padStart(2, "0")}min`
    : `${minutes}min`;
}

function formatHours(value: number | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "0h";
  return `${Math.round(value * 10) / 10}h`;
}
