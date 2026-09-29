"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import {
  Warning as AlertTriangle,
  ArrowRight,
  Money as Banknote,
  CalendarCheck,
  Clock as Clock3,
  FileText,
  Percent,
  Receipt,
  Stethoscope,
  UserCheck,
  UserMinus as UserX,
  UsersThree as UsersRound,
  Wallet as WalletCards,
  type Icon as LucideIcon,
} from "@phosphor-icons/react";
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
import type {
  OperationalProfessionalRow,
  ProfessionalReportRow,
  ReportBreakdown,
  ReportData,
  ReportPoint,
} from "@/lib/reports/phase13";
import { cn } from "@/lib/utils";

type MetricTone = "primary" | "success" | "warning" | "destructive" | "neutral";

export type ReportsPanelView =
  "overview" | "operational" | "financial" | "clinical" | "professionals";

// Tons -foreground nos ícones, como no painel: o verde e o vermelho base
// ficavam claros demais sobre o fundo suave.
const metricToneClass: Record<MetricTone, string> = {
  primary: "bg-primary-muted text-primary",
  success: "bg-success-muted text-success-foreground",
  warning: "bg-warning-muted text-warning-foreground",
  destructive: "bg-destructive-muted text-destructive-foreground",
  neutral: "bg-muted text-muted-foreground",
};

export function ReportsPanel({
  data,
  view,
}: {
  data: ReportData;
  view: ReportsPanelView;
}) {
  if (view === "overview") return <OverviewSection data={data} />;
  if (view === "operational") return <OperationalSection data={data} />;
  if (view === "financial") return <FinancialSection data={data} />;
  if (view === "clinical") return <ClinicalSection data={data} />;

  return <ProfessionalsSection data={data} />;
}

function OverviewSection({ data }: { data: ReportData }) {
  const cards = [
    data.operational
      ? {
          description:
            "Agenda, comparecimento, ocupação e perfil dos pacientes.",
          href: "/relatorios/atendimentos",
          icon: CalendarCheck,
          metrics: [
            ["Agendamentos", String(data.operational.totalAppointments)],
            ["Atendidos", String(data.operational.attended)],
            // Mesmo termo do painel ("Taxa de faltas"), no lugar de "No-show".
            ["Taxa de faltas", `${data.operational.noShowRate}%`],
          ] as Array<[string, string]>,
          title: "Atendimentos",
        }
      : null,
    data.financial
      ? {
          description: "Recebimentos, contas em aberto, despesas e resultado.",
          href: "/relatorios/financeiro",
          icon: Banknote,
          metrics: [
            ["Recebido", formatCurrency(data.financial.revenue)],
            ["A receber", formatCurrency(data.financial.openReceivable)],
            ["Resultado", formatCurrency(data.financial.netResult)],
          ] as Array<[string, string]>,
          title: "Financeiro",
        }
      : null,
    data.clinical
      ? {
          description:
            "Produção assistencial, prontuários e registros clínicos.",
          href: "/relatorios/clinico",
          icon: Stethoscope,
          metrics: [
            ["Atendimentos", String(data.clinical.totalEncounters)],
            ["Finalizados", String(data.clinical.finalizedEncounters)],
            ["Rascunhos", String(data.clinical.draftEncounters)],
          ] as Array<[string, string]>,
          title: "Clínico",
        }
      : null,
  ].filter((card): card is NonNullable<typeof card> => Boolean(card));

  if (!cards.length) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhum relatório disponível"
        description="Revise as permissões do usuário para liberar os relatórios."
      />
    );
  }

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 xl:grid-cols-3">
        {cards.map((card) => (
          <OverviewCard key={card.href} {...card} />
        ))}
      </section>

      <Card>
        {/* flex de verdade: com só `flex-row` o "Ver detalhes" caía embaixo
            da descrição. */}
        <CardHeader className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 className="font-semibold">Desempenho por profissional</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Compare produção, agenda e resultados conforme suas permissões.
            </p>
          </div>
          <Link
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline"
            href="/relatorios/profissionais"
          >
            Ver detalhes
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </CardHeader>
        <CardContent>
          <p className="text-display font-semibold tabular-nums">
            {data.professionals.length}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            profissionais com indicadores no período selecionado
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function OverviewCard({
  description,
  href,
  icon: Icon,
  metrics,
  title,
}: {
  description: string;
  href: string;
  icon: LucideIcon;
  metrics: Array<[string, string]>;
  title: string;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </div>
          <Link
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            href={href}
          >
            Abrir
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="mt-auto grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
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
          label="Taxa de faltas"
          value={`${report.noShowRate}%`}
          tone={report.noShowRate > 10 ? "warning" : "neutral"}
        />
        <MetricCard
          icon={Percent}
          label="Ocupação"
          value={
            report.occupancyRate == null
              ? "Sem escala"
              : `${report.occupancyRate}%`
          }
          tone="primary"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <BarChartCard
          title="Volume diário"
          data={report.dailyVolume}
          kind="time"
          seriesLabel="Agendamentos"
        />
        <BarChartCard
          title="Status da agenda"
          data={report.statusBreakdown}
          kind="category"
          seriesLabel="Agendamentos"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <BarChartCard
          title="Procedimentos realizados"
          data={report.procedureBreakdown.slice(0, 8)}
          kind="category"
          seriesLabel="Agendamentos"
        />
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Pacientes no período</h2>
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
                label="Tempo médio"
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
          label="Inadimplência"
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
          kind="category"
          seriesLabel="Recebido"
          currency
        />
        <BarChartCard
          title="Recebimentos por convênio"
          data={report.insuranceRevenue.slice(0, 8)}
          kind="category"
          seriesLabel="Recebido"
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
          label="Tempo até finalizar"
          value={formatHours(report.averageCompletionHours)}
          tone="neutral"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <BarChartCard
          title="CIDs mais atendidos"
          data={report.diagnoses.slice(0, 8)}
          kind="category"
          seriesLabel="Atendimentos"
        />
        <BarChartCard
          title="Procedimentos clínicos"
          data={report.procedures.slice(0, 8)}
          kind="category"
          seriesLabel="Atendimentos"
        />
      </section>
    </div>
  );
}

function ProfessionalsSection({ data }: { data: ReportData }) {
  const columns = useMemo<ColumnDef<ProfessionalReportRow>[]>(() => {
    const availableColumns: ColumnDef<ProfessionalReportRow>[] = [
      {
        accessorKey: "professionalName",
        header: "Profissional",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.professionalName}</span>
        ),
      },
    ];

    if (data.permissions.operational) {
      availableColumns.push(
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
          header: "Taxa de faltas",
          cell: ({ row }) => `${row.original.noShowRate}%`,
        },
      );
    }

    if (data.permissions.financial) {
      availableColumns.push(
        {
          accessorKey: "revenue",
          header: "Faturamento",
          cell: ({ row }) => formatCurrency(row.original.revenue),
        },
        {
          accessorKey: "receivable",
          header: "A receber",
          cell: ({ row }) => formatCurrency(row.original.receivable),
        },
      );
    }

    if (data.permissions.clinical) {
      availableColumns.push({
        accessorKey: "finalizedEncounters",
        header: "Prontuários",
        cell: ({ row }) => row.original.finalizedEncounters,
      });
    }

    return availableColumns;
  }, [
    data.permissions.clinical,
    data.permissions.financial,
    data.permissions.operational,
  ]);

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-heading-sm font-semibold">
          Desempenho por profissional
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Consultas, faturamento e produção clínica conforme as permissões do
          usuário.
        </p>
      </div>
      <DataTable
        ariaLabel="Desempenho por profissional"
        columns={columns}
        data={data.professionals}
        pageSize={8}
        emptyTitle="Nenhum dado por profissional"
        emptyDescription="Os indicadores aparecem quando há dados nos relatórios liberados."
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
        header: "Faltas",
        cell: ({ row }) => row.original.noShows,
      },
      {
        accessorKey: "occupiedMinutes",
        header: "Tempo ocupado",
        cell: ({ row }) => formatMinutes(row.original.occupiedMinutes),
      },
      {
        accessorKey: "occupancyRate",
        header: "Ocupação",
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
      <h2 className="text-heading-sm font-semibold">Agenda por profissional</h2>
      <DataTable
        ariaLabel="Agenda por profissional"
        columns={columns}
        data={rows}
        pageSize={8}
        emptyTitle="Nenhum agendamento no período"
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
  // Cor só onde ela diz algo: saída em vermelho e o resultado pelo sinal.
  // Antes toda linha positiva saía verde, inclusive a inadimplência.
  const rows = [
    { label: "Receita recebida", value: report.revenue },
    { label: "Contas a receber geradas", value: report.receivable },
    { label: "Saldo aberto a receber", value: report.openReceivable },
    { label: "Inadimplência", value: report.overdueReceivable },
    { label: "Despesas pagas", value: -report.expenses },
    { label: "Repasses pendentes", value: -report.pendingPayouts },
    { label: "Resultado do período", value: report.netResult, total: true },
  ];
  const columns = useMemo<ColumnDef<(typeof rows)[number]>[]>(
    () => [
      {
        accessorKey: "label",
        header: "Linha",
        cell: ({ row }) => (
          <span
            className={cn(row.original.total ? "font-semibold" : "font-medium")}
          >
            {row.original.label}
          </span>
        ),
      },
      {
        accessorKey: "value",
        header: "Valor",
        cell: ({ row }) => (
          <span
            className={cn(
              "tabular-nums",
              row.original.total ? "font-semibold" : "font-medium",
              row.original.value < 0
                ? "text-destructive-foreground"
                : row.original.total && row.original.value > 0
                  ? "text-success-foreground"
                  : "text-foreground",
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
      <h2 className="text-heading-sm font-semibold">DRE simplificada</h2>
      {/* A ordem das linhas é a da DRE: ordenar por coluna não faz sentido. */}
      <DataTable
        ariaLabel="DRE simplificada"
        columns={columns}
        data={rows}
        pageSize={8}
        enableSorting={false}
      />
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
        <p className="mt-1 text-display font-semibold tabular-nums">{value}</p>
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
        <p className="mt-1 text-heading font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

const chartTick = {
  fill: "var(--muted-foreground)",
  fontSize: "var(--text-caption)",
};

const chartTooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  boxShadow: "var(--shadow-soft)",
  color: "var(--foreground)",
  fontSize: "var(--text-body)",
};

/**
 * Uma série, uma cor. Duas formas conforme o dado:
 * - "time": série diária em colunas; o eixo mostra só as datas que cabem
 *   (com todas forçadas, 31 rótulos viravam "01/0702/0703/07...");
 * - "category": categorias em barras horizontais, com o nome inteiro no
 *   eixo. Em colunas, nomes longos se atropelavam ("CardiologiaExame de").
 */
function BarChartCard({
  currency,
  data,
  kind,
  seriesLabel,
  title,
}: {
  currency?: boolean;
  data: Array<ReportPoint | ReportBreakdown>;
  kind: "time" | "category";
  /** Nome da série no tooltip; sem ele o Recharts mostra a chave "value". */
  seriesLabel: string;
  title: string;
}) {
  const hasData = data.some((item) => item.value > 0);
  const horizontal = kind === "category";
  const formatValue = (value: number) =>
    currency ? compactCurrency(value) : String(value);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <h2 className="font-semibold">{title}</h2>
      </CardHeader>
      <CardContent>
        <div
          className={horizontal ? "min-h-40" : "h-64"}
          // Barras horizontais crescem com o número de categorias, para
          // cada nome ter sua linha sem espremer as outras.
          style={
            horizontal && hasData
              ? { height: Math.max(160, data.length * 36 + 36) }
              : undefined
          }
        >
          {hasData ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                accessibilityLayer
                data={data}
                layout={horizontal ? "vertical" : "horizontal"}
                margin={{ bottom: 4, left: 0, right: 12, top: 8 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  horizontal={!horizontal}
                  vertical={horizontal}
                />
                {horizontal ? (
                  <>
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      axisLine={false}
                      tick={chartTick}
                      tickFormatter={formatValue}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      axisLine={false}
                      tick={chartTick}
                      tickFormatter={(value: string) =>
                        value.length > 20 ? `${value.slice(0, 19)}…` : value
                      }
                      tickLine={false}
                      width={140}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey="label"
                      interval="preserveStartEnd"
                      minTickGap={16}
                      tick={chartTick}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tick={chartTick}
                      tickFormatter={formatValue}
                      tickLine={false}
                      width={currency ? 64 : 36}
                    />
                  </>
                )}
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  cursor={{
                    fill: "color-mix(in srgb, var(--muted-foreground) 10%, transparent)",
                  }}
                  formatter={(value) =>
                    currency ? formatCurrency(Number(value)) : Number(value)
                  }
                  labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                />
                {/* Sem animação, como no Painel: as barras cresciam por 400ms
                    a cada "Aplicar", em dado que a pessoa está lendo. */}
                <Bar
                  dataKey="value"
                  name={seriesLabel}
                  fill="var(--primary)"
                  maxBarSize={horizontal ? 20 : 32}
                  radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState title="Sem dados para o período" />
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

// Sem amostra é "—", não zero: "0min" e "0h" pareciam medições reais (o
// "Tempo até finalizar" mostrava 0h com nenhum prontuário finalizado).
function formatMinutes(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value <= 0) return "0min";
  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return hours
    ? `${hours}h ${String(minutes).padStart(2, "0")}min`
    : `${minutes}min`;
}

function formatHours(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value <= 0) return "0h";
  return `${Math.round(value * 10) / 10}h`;
}
