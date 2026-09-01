"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Prohibit as Ban,
  Cake as CakeSlice,
  CalendarDots as CalendarClock,
  CalendarDots as CalendarDays,
  CheckCircle as CheckCircle2,
  Clock as Clock3,
  CreditCard,
  GenderFemale,
  GenderMale,
  Stethoscope,
  TrendUp as TrendingUp,
  UsersThree as UsersRound,
  type Icon as LucideIcon,
} from "@phosphor-icons/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { categoricalColors } from "@/lib/colors";
import type { DashboardView } from "@/lib/dashboard/periods";

export type DashboardSlice = {
  label: string;
  value: number;
  color: string;
};

export type DashboardPoint = {
  label: string;
  value: number;
};

export type BirthdayPatient = {
  id: string;
  name: string;
  age: number | null;
};

export type CompanyDashboardChartsData = {
  view: DashboardView;
  patientDataAvailable: boolean;
  patients: {
    newCount: number;
    recurringCount: number;
    maleCount: number;
    femaleCount: number;
  };
  procedures: {
    total: number;
    slices: DashboardSlice[];
  };
  insurances: {
    total: number;
    slices: DashboardSlice[];
    breakdown: DashboardSlice[];
  };
  timing: {
    averageValue: number | null;
    byType: DashboardPoint[];
  };
  cancellations: {
    noShows: number;
    cancellations: number;
    noShowRate: number | null;
    cancellationRate: number | null;
  };
  periodAttendances: DashboardPoint[];
  ageDistribution: DashboardPoint[];
  birthdays: BirthdayPatient[];
  commercialSummary: {
    future: number;
    attended: number;
    open: number;
    losses: number;
  };
};

const chartTooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  boxShadow: "var(--shadow-soft)",
  color: "var(--foreground)",
  fontSize: "0.75rem",
};

export function CompanyDashboardCharts({
  data,
}: {
  data: CompanyDashboardChartsData;
}) {
  const isCommercial = data.view === "commercial";
  const patientChartTitle = isCommercial
    ? "Agendamentos por perfil do paciente"
    : "Agendamentos por perfil do paciente";
  const patientSlices: DashboardSlice[] = [
    { label: "Novos", value: data.patients.newCount, color: "var(--primary)" },
    {
      label: "Recorrentes",
      value: data.patients.recurringCount,
      color: categoricalColors.teal,
    },
  ];

  return (
    <div className="grid gap-4">
      <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,0.34fr)]">
        <div className="min-w-0">
          <AreaLineCard
            title={
              isCommercial
                ? "Atividade de agendamentos gerados"
                : "Atividade de agendamentos"
            }
            data={data.periodAttendances}
            heightClassName="h-72 lg:h-80"
            emptyIcon={CalendarDays}
          />
        </div>
        <div className="min-w-0">
          {data.patientDataAvailable ? (
            <PatientChartCard
              title={patientChartTitle}
              slices={patientSlices}
              maleCount={data.patients.maleCount}
              femaleCount={data.patients.femaleCount}
            />
          ) : (
            <UnavailableDataCard title={patientChartTitle} compact={false} />
          )}
        </div>
      </section>

      <section className="grid items-stretch gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <DonutMetricCard
            title={
              isCommercial
                ? "Agendamentos gerados por serviço"
                : "Tipo de serviço"
            }
            total={data.procedures.total}
            totalLabel="Agendamentos"
            slices={data.procedures.slices}
            emptyLabel="Nenhum agendamento no período."
            emptyIcon={Stethoscope}
          />
        </div>
        <div className="min-w-0">
          <InsuranceMetricCard data={data.insurances} view={data.view} />
        </div>
      </section>

      <section
        className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4"
        aria-label="Indicadores complementares"
      >
        <div className="min-w-0">
          <TimingCard data={data.timing} view={data.view} />
        </div>
        <div className="min-w-0">
          <CancellationRatesCard data={data.cancellations} view={data.view} />
        </div>
        <div className="min-w-0">
          {data.patientDataAvailable ? (
            <CompactAreaLineCard
              title="Distribuição etária"
              data={data.ageDistribution}
              emptyIcon={UsersRound}
            />
          ) : (
            <UnavailableDataCard title="Distribuição etária" compact />
          )}
        </div>
        <div className="min-w-0">
          {isCommercial ? (
            <CommercialSummaryCard data={data.commercialSummary} />
          ) : data.patientDataAvailable ? (
            <BirthdaysCard birthdays={data.birthdays} />
          ) : (
            <UnavailableDataCard title="Aniversariantes do dia" compact />
          )}
        </div>
      </section>
    </div>
  );
}

function PatientChartCard({
  title,
  slices,
  maleCount,
  femaleCount,
}: {
  title: string;
  slices: DashboardSlice[];
  maleCount: number;
  femaleCount: number;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const hasGenderData = maleCount + femaleCount > 0;
  const malePercent = percent(maleCount, maleCount + femaleCount);
  const femalePercent = percent(femaleCount, maleCount + femaleCount);

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="px-4 py-3">
        <h2 className="font-semibold text-foreground">{title}</h2>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="relative">
          <PieBlock
            slices={slices}
            innerRadius="61%"
            outerRadius="88%"
            heightClassName="h-44"
            emptyLabel="Nenhum agendamento no período."
            emptyIcon={UsersRound}
            ariaLabel={sliceChartLabel(title, slices)}
          />
          {total > 0 ? (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-hidden="true"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-primary-muted text-primary">
                <UsersRound className="size-6" />
              </span>
            </div>
          ) : null}
        </div>
        <Legend slices={slices} total={total} layout="stacked" />
        <div className="mt-4 grid grid-cols-2 divide-x divide-border border-t border-border pt-3">
          <GenderMetric
            label="Homens"
            value={malePercent}
            count={maleCount}
            icon={GenderMale}
            tone="bg-primary-muted text-primary"
            hasData={hasGenderData}
          />
          <GenderMetric
            label="Mulheres"
            value={femalePercent}
            count={femaleCount}
            icon={GenderFemale}
            tone="bg-warning-muted text-warning-foreground"
            hasData={hasGenderData}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DonutMetricCard({
  title,
  total,
  totalLabel,
  slices,
  emptyLabel,
  emptyIcon,
}: {
  title: string;
  total: number;
  totalLabel: string;
  slices: DashboardSlice[];
  emptyLabel: string;
  emptyIcon?: LucideIcon;
}) {
  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="px-4 py-3">
        <h2 className="font-semibold text-foreground">{title}</h2>
      </CardHeader>
      <CardContent className="grid flex-1 items-center gap-4 p-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="relative min-w-0">
          <PieBlock
            slices={slices}
            innerRadius="58%"
            outerRadius="86%"
            heightClassName="h-48"
            emptyLabel={emptyLabel}
            emptyIcon={emptyIcon}
            ariaLabel={sliceChartLabel(title, slices)}
          />
          {total > 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {total}
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  {totalLabel}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        <Legend slices={slices} total={total} layout="stacked" />
      </CardContent>
    </Card>
  );
}

function InsuranceMetricCard({
  data,
  view,
}: {
  data: CompanyDashboardChartsData["insurances"];
  view: DashboardView;
}) {
  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <CreditCard
            className="size-4 shrink-0 text-primary"
            aria-hidden="true"
          />
          <h2 className="truncate font-semibold text-foreground">
            Por convênio
          </h2>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {data.total} {view === "commercial" ? "gerados" : "agendamentos"}
        </span>
      </CardHeader>
      <CardContent className="grid flex-1 content-center p-4">
        {data.total > 0 ? (
          <MetricBars
            items={data.breakdown.slice(0, 5)}
            ariaLabel="Distribuição dos agendamentos por convênio"
          />
        ) : (
          <div className="flex min-h-48 items-center justify-center">
            <EmptyState
              icon={CreditCard}
              title="Nenhum agendamento no período."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CancellationRatesCard({
  data,
  view,
}: {
  data: CompanyDashboardChartsData["cancellations"];
  view: DashboardView;
}) {
  const items = [
    {
      label: "Faltas",
      value: data.noShowRate,
      count: data.noShows,
      tone: "text-warning-foreground bg-warning-muted",
    },
    {
      label: "Cancelamentos",
      value: data.cancellationRate,
      count: data.cancellations,
      tone: "text-destructive bg-destructive-muted",
    },
  ];

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="px-4 py-3">
        <h2 className="font-semibold text-foreground">
          {view === "commercial"
            ? "Perdas registradas até agora"
            : "Cancelamentos e faltas"}
        </h2>
      </CardHeader>
      <CardContent className="grid flex-1 grid-cols-2 content-center gap-3 p-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="grid min-w-0 justify-items-center gap-2 rounded-md bg-muted/35 p-3 text-center"
          >
            <span
              className={`flex size-9 items-center justify-center rounded-full ${item.tone}`}
            >
              <Ban className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums">
                {item.value == null ? "—" : `${item.value}%`}
              </p>
              <p className="truncate text-sm font-medium text-secondary-foreground">
                {item.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {item.count} registros
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TimingCard({
  data,
  view,
}: {
  data: CompanyDashboardChartsData["timing"];
  view: DashboardView;
}) {
  const isCommercial = view === "commercial";
  const maxValue = Math.max(...data.byType.map((item) => item.value), 1);

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="px-4 py-3">
        <h2 className="font-semibold text-foreground">
          {isCommercial ? "Antecedência do agendamento" : "Duração reservada"}
        </h2>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-3 rounded-md bg-primary-muted/55 p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-primary shadow-sm">
            <Clock3 className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Média do período</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {formatTiming(data.averageValue, view)}
            </p>
          </div>
        </div>
        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tipo de atendimento
        </h3>
        <div className="mt-3">
          {data.byType.some((item) => item.value > 0) ? (
            <div className="grid gap-3">
              {data.byType.map((item, index) => (
                <div key={item.label} className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-secondary-foreground">
                      {item.label}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatTiming(item.value, view)}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="meter"
                    aria-label={`${item.label}: ${formatTiming(item.value, view)}`}
                    aria-valuemin={0}
                    aria-valuemax={maxValue}
                    aria-valuenow={item.value}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(3, (item.value / maxValue) * 100)}%`,
                        backgroundColor:
                          index === 0
                            ? "var(--primary)"
                            : categoricalColors.teal,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              {isCommercial
                ? "Sem antecedência calculável no período."
                : "Sem duração reservada no período."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CommercialSummaryCard({
  data,
}: {
  data: CompanyDashboardChartsData["commercialSummary"];
}) {
  const items = [
    {
      label: "Agenda futura gerada",
      value: data.future,
      icon: CalendarClock,
      tone: "bg-primary-muted text-primary",
    },
    {
      label: "Atendimentos realizados",
      value: data.attended,
      icon: CheckCircle2,
      tone: "bg-success-muted text-success-foreground",
    },
    {
      label: "Em aberto ou atrasados",
      value: data.open,
      icon: Clock3,
      tone: "bg-warning-muted text-warning-foreground",
    },
    {
      label: "Cancelamentos e faltas",
      value: data.losses,
      icon: Ban,
      tone: "bg-destructive-muted text-destructive-foreground",
    },
  ];

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="px-4 py-3">
        <h2 className="font-semibold text-foreground">Situação comercial</h2>
      </CardHeader>
      <CardContent className="grid flex-1 grid-cols-2 content-center gap-3 p-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="grid min-w-0 gap-2 rounded-md bg-muted/35 p-3"
            >
              <span
                className={`flex size-8 items-center justify-center rounded-full ${item.tone}`}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {item.value}
                </p>
                <p className="text-xs leading-4 text-secondary-foreground">
                  {item.label}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AreaLineCard({
  title,
  data,
  heightClassName,
  emptyIcon,
}: {
  title: string;
  data: DashboardPoint[];
  heightClassName: string;
  emptyIcon?: LucideIcon;
}) {
  const gradientId = `chart-${title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()}`;
  const hasData = data.some((item) => item.value > 0);
  const summary = pointChartSummary(title, data);

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="flex items-center gap-2 px-4 py-3">
        <TrendingUp className="size-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold text-foreground">{title}</h2>
      </CardHeader>
      <CardContent className="flex-1 p-4">
        <p className="sr-only">{summary}</p>
        <div
          className={heightClassName}
          role={hasData ? "img" : undefined}
          aria-label={hasData ? summary : undefined}
        >
          {hasData ? (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart
                accessibilityLayer
                data={data}
                margin={{ bottom: 4, left: -8, right: 8, top: 8 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--primary)"
                      stopOpacity={0.22}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--primary)"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 4"
                  vertical={false}
                />
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  minTickGap={18}
                  tick={{
                    fill: "var(--muted-foreground)",
                    fontSize: 11,
                  }}
                  tickLine={false}
                  tickMargin={10}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tick={{
                    fill: "var(--muted-foreground)",
                    fontSize: 11,
                  }}
                  tickLine={false}
                  tickMargin={8}
                  width={38}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  cursor={{ stroke: "var(--border-strong)" }}
                  labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                  itemStyle={{ color: "var(--primary)" }}
                />
                <Area
                  dataKey="value"
                  activeDot={{
                    fill: "var(--card)",
                    r: 4,
                    stroke: "var(--primary)",
                    strokeWidth: 2,
                  }}
                  dot={false}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                  stroke="var(--primary)"
                  strokeWidth={2.25}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="Sem dados para o período." icon={emptyIcon} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CompactAreaLineCard({
  title,
  data,
  emptyIcon,
}: {
  title: string;
  data: DashboardPoint[];
  emptyIcon?: LucideIcon;
}) {
  const gradientId = `chart-${title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()}-compact`;
  const hasData = data.some((item) => item.value > 0);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const summary = pointChartSummary(title, data);

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="font-semibold text-foreground">{title}</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {total} pacientes
        </span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-4">
        <p className="sr-only">{summary}</p>
        <div
          className="h-40 min-w-0"
          role={hasData ? "img" : undefined}
          aria-label={hasData ? summary : undefined}
        >
          {hasData ? (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart
                accessibilityLayer
                data={data}
                margin={{ bottom: 2, left: -18, right: 4, top: 6 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={categoricalColors.teal}
                      stopOpacity={0.24}
                    />
                    <stop
                      offset="95%"
                      stopColor={categoricalColors.teal}
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 4"
                  vertical={false}
                />
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  minTickGap={16}
                  tick={{
                    fill: "var(--muted-foreground)",
                    fontSize: 10,
                  }}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tick={{
                    fill: "var(--muted-foreground)",
                    fontSize: 10,
                  }}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  cursor={{ stroke: "var(--border-strong)" }}
                  labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                  itemStyle={{ color: categoricalColors.teal }}
                />
                <Area
                  dataKey="value"
                  activeDot={{
                    fill: "var(--card)",
                    r: 3,
                    stroke: categoricalColors.teal,
                    strokeWidth: 2,
                  }}
                  dot={false}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                  stroke={categoricalColors.teal}
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="Sem dados para o período." icon={emptyIcon} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BirthdaysCard({ birthdays }: { birthdays: BirthdayPatient[] }) {
  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <CakeSlice
            className="size-4 shrink-0 text-warning-foreground"
            aria-hidden="true"
          />
          <h2 className="truncate font-semibold text-foreground">
            Aniversariantes do dia
          </h2>
        </div>
        <span className="flex min-w-6 items-center justify-center rounded-full bg-warning-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-warning-foreground">
          {birthdays.length}
        </span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-4">
        {birthdays.length ? (
          <div className="grid divide-y divide-border">
            {birthdays.slice(0, 5).map((patient) => (
              <div
                key={patient.id}
                className="flex min-w-0 items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning-muted text-warning-foreground">
                  <CakeSlice className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {patient.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {patient.age != null
                      ? `${patient.age} anos`
                      : "Idade não informada"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-40 flex-1 items-center justify-center">
            <EmptyState icon={CakeSlice} title="Nenhum aniversariante hoje" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UnavailableDataCard({
  title,
  compact,
}: {
  title: string;
  compact: boolean;
}) {
  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="px-4 py-3">
        <h2 className="font-semibold text-foreground">{title}</h2>
      </CardHeader>
      <CardContent
        className={`flex flex-1 items-center justify-center p-4 ${
          compact ? "min-h-40" : "min-h-72"
        }`}
      >
        <EmptyState
          icon={UsersRound}
          title="Dados de pacientes indisponíveis"
          description="Seu perfil não possui permissão para visualizar estes dados."
        />
      </CardContent>
    </Card>
  );
}

function PieBlock({
  slices,
  innerRadius,
  outerRadius,
  heightClassName,
  emptyLabel,
  emptyIcon,
  ariaLabel,
}: {
  slices: DashboardSlice[];
  innerRadius: number | string;
  outerRadius: number | string;
  heightClassName: string;
  emptyLabel: string;
  emptyIcon?: LucideIcon;
  ariaLabel: string;
}) {
  const hasData = slices.some((item) => item.value > 0);

  return (
    <div
      className={`${heightClassName} min-w-0`}
      role={hasData ? "img" : undefined}
      aria-label={hasData ? ariaLabel : undefined}
    >
      {hasData ? (
        <ResponsiveContainer height="100%" width="100%">
          <PieChart accessibilityLayer>
            <Pie
              data={slices}
              dataKey="value"
              isAnimationActive={false}
              nameKey="label"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={innerRadius ? 1 : 0}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {slices.map((slice) => (
                <Cell key={slice.label} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={chartTooltipStyle}
              labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart label={emptyLabel} icon={emptyIcon} />
      )}
    </div>
  );
}

function GenderMetric({
  label,
  value,
  count,
  icon: Icon,
  tone,
  hasData,
}: {
  label: string;
  value: number;
  count: number;
  icon: LucideIcon;
  tone: string;
  hasData: boolean;
}) {
  return (
    <div className="grid min-w-0 justify-items-center gap-1 px-2 text-center">
      <span
        className={`flex size-8 items-center justify-center rounded-full ${tone}`}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex items-baseline gap-1">
        <p className="text-lg font-semibold tabular-nums text-foreground">
          {count}
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {hasData ? `${value}%` : "—"}
        </span>
      </div>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function MetricBars({
  items,
  ariaLabel,
}: {
  items: DashboardSlice[];
  ariaLabel: string;
}) {
  return (
    <div className="grid gap-3" role="list" aria-label={ariaLabel}>
      {items.map((item) => {
        const value = Math.max(0, Math.min(100, item.value));
        return (
          <div key={item.label} className="grid gap-1.5" role="listitem">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium text-secondary-foreground">
                {item.label}
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {value}%
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-label={`${item.label}: ${value}%`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={value}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${value}%`,
                  backgroundColor: item.color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Legend({
  slices,
  total,
  layout,
}: {
  slices: DashboardSlice[];
  total: number;
  layout: "centered" | "stacked";
}) {
  if (!slices.length) {
    return null;
  }

  return (
    <div
      className={
        layout === "stacked"
          ? "grid gap-2 text-xs text-secondary-foreground"
          : "flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-secondary-foreground"
      }
      role="list"
      aria-label="Legenda do gráfico"
    >
      {slices.slice(0, 5).map((slice) => (
        <span
          key={slice.label}
          className="flex min-w-0 items-center justify-between gap-3"
          role="listitem"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <span className="truncate">{slice.label}</span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-foreground">
            {slice.value}
            {total > 0 ? ` (${percent(slice.value, total)}%)` : ""}
          </span>
        </span>
      ))}
    </div>
  );
}

function EmptyChart({ label, icon }: { label: string; icon?: LucideIcon }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <EmptyState icon={icon} title={label} />
    </div>
  );
}

function sliceChartLabel(title: string, slices: DashboardSlice[]) {
  const summary = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => `${slice.label}: ${slice.value}`)
    .join("; ");

  return summary ? `${title}. ${summary}.` : `${title}. Sem dados no período.`;
}

function pointChartSummary(title: string, data: DashboardPoint[]) {
  const populated = data.filter((item) => item.value > 0);
  if (!populated.length) {
    return `${title}. Sem dados no período.`;
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const peak = populated.reduce((highest, item) =>
    item.value > highest.value ? item : highest,
  );

  return `${title}. Total de ${total} registros em ${data.length} pontos. Maior valor: ${peak.value} em ${peak.label}.`;
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function formatTiming(value: number | null, view: DashboardView) {
  if (value == null || !Number.isFinite(value)) {
    return view === "commercial" ? "0 dias" : "0min";
  }

  const rounded = Math.round(value);
  if (view === "commercial") {
    return `${rounded} ${rounded === 1 ? "dia" : "dias"}`;
  }

  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;

  if (!hours) {
    return `${rest}min`;
  }

  return `${hours}h ${String(rest).padStart(2, "0")}min`;
}
