"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
  Ban,
  CakeSlice,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Stethoscope,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
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
      color: categoricalColors.blueSoft,
    },
  ];

  return (
    <div className="grid gap-5">
      <section className="grid items-stretch gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="h-full min-w-0">
          {data.patientDataAvailable ? (
            <PatientChartCard
              title={patientChartTitle}
              slices={patientSlices}
              maleCount={data.patients.maleCount}
              femaleCount={data.patients.femaleCount}
            />
          ) : (
            <UnavailableDataCard title={patientChartTitle} />
          )}
        </div>
        <div className="h-full min-w-0">
          <DonutMetricCard
            title={
              isCommercial
                ? "Agendamentos gerados por serviço"
                : "Agendamentos por tipo de serviço"
            }
            total={data.procedures.total}
            totalLabel="Agendamentos"
            slices={data.procedures.slices}
            emptyLabel="Nenhum agendamento no periodo."
            emptyIcon={Stethoscope}
          />
        </div>
        <div className="h-full min-w-0">
          <InsuranceMetricCard data={data.insurances} view={data.view} />
        </div>
        <div className="h-full min-w-0">
          <CancellationRatesCard data={data.cancellations} view={data.view} />
        </div>
        <div className="h-full min-w-0">
          <TimingCard data={data.timing} view={data.view} />
        </div>
      </section>

      <div className="min-w-0">
        <AreaLineCard
          title={
            isCommercial
              ? "Agendamentos gerados no período"
              : "Agendamentos no período"
          }
          data={data.periodAttendances}
          heightClassName="h-64"
          emptyIcon={CalendarDays}
        />
      </div>

      <section className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="h-full min-w-0">
          {data.patientDataAvailable ? (
            <AreaLineCard
              title="Distribuição etária no período"
              data={data.ageDistribution}
              heightClassName="h-64"
              emptyIcon={UsersRound}
            />
          ) : (
            <UnavailableDataCard title="Distribuição etária no período" />
          )}
        </div>
        <div className="h-full min-w-0">
          {isCommercial ? (
            <CommercialSummaryCard data={data.commercialSummary} />
          ) : data.patientDataAvailable ? (
            <BirthdaysCard birthdays={data.birthdays} />
          ) : (
            <UnavailableDataCard title="Aniversariantes do dia" />
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
  const hasGenderData = maleCount + femaleCount > 0;
  const malePercent = percent(maleCount, maleCount + femaleCount);
  const femalePercent = percent(femaleCount, maleCount + femaleCount);

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="flex min-h-20 items-center">
        <h2 className="font-semibold text-primary">{title}</h2>
      </CardHeader>
      <CardContent className="flex-1">
        <PieBlock
          slices={slices}
          innerRadius={0}
          outerRadius="86%"
          emptyLabel="Nenhuma consulta no periodo."
          emptyIcon={UsersRound}
        />
        <Legend slices={slices} />
        <div className="mt-6 grid grid-cols-2 gap-4 divide-x divide-border">
          <MiniDonut
            label="Homens"
            value={malePercent}
            totalLabel={`Total: ${maleCount}`}
            color="var(--primary)"
            hasData={hasGenderData}
          />
          <MiniDonut
            label="Mulheres"
            value={femalePercent}
            totalLabel={`Total: ${femaleCount}`}
            color={categoricalColors.violet}
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
      <CardHeader className="flex min-h-20 items-center">
        <h2 className="font-semibold text-primary">{title}</h2>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="relative">
          <PieBlock
            slices={slices}
            innerRadius="58%"
            outerRadius="86%"
            emptyLabel={emptyLabel}
            emptyIcon={emptyIcon}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-display font-bold tabular-nums text-foreground">
                {total}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {totalLabel}
              </p>
            </div>
          </div>
        </div>
        <Legend slices={slices} />
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
      <CardHeader className="flex min-h-20 items-center">
        <h2 className="font-semibold text-primary">
          {view === "commercial"
            ? "Agendamentos gerados por convênio"
            : "Agendamentos por convênio"}
        </h2>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="relative">
          <PieBlock
            slices={data.slices}
            innerRadius="58%"
            outerRadius="86%"
            emptyLabel="Nenhum agendamento no periodo."
            emptyIcon={CreditCard}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-display font-bold tabular-nums text-foreground">
                {data.total}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                Agendamentos
              </p>
            </div>
          </div>
        </div>
        <Legend slices={data.slices} />
        {data.breakdown.length ? (
          <div className="mt-4 grid gap-2">
            {data.breakdown.slice(0, 4).map((slice) => (
              <div key={slice.label} className="grid gap-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-secondary-foreground">
                    {slice.label}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {slice.value}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${slice.value}%`,
                      backgroundColor: slice.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
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
      <CardHeader className="flex min-h-20 items-center">
        <h2 className="font-semibold text-primary">
          {view === "commercial"
            ? "Perdas registradas até agora"
            : "Cancelamentos e faltas"}
        </h2>
      </CardHeader>
      <CardContent className="grid flex-1 content-center gap-5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-md ${item.tone}`}
            >
              <Ban className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {item.value == null ? "—" : `${item.value}%`}
              </p>
              <p className="text-sm text-secondary-foreground">{item.label}</p>
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

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="flex min-h-20 items-center">
        <h2 className="font-semibold text-primary">
          {isCommercial ? "Antecedência do agendamento" : "Duração reservada"}
        </h2>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="flex items-center gap-3">
          <Clock3 className="size-5 text-muted-foreground" aria-hidden />
          <p className="text-3xl font-light italic text-foreground">
            {formatTiming(data.averageValue, view)}
          </p>
        </div>
        <h3 className="mt-8 text-sm font-semibold text-primary">
          Tipo de atendimento
        </h3>
        <div className="mt-4 h-52">
          {data.byType.some((item) => item.value > 0) ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={data.byType} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} />
                <YAxis allowDecimals={false} tickLine={false} width={34} />
                <Tooltip cursor={{ fill: "rgba(148, 163, 184, 0.14)" }} />
                <Bar
                  dataKey="value"
                  fill={categoricalColors.blueSoft}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart
              label={
                isCommercial
                  ? "Sem antecedência calculável no período."
                  : "Sem duração reservada no período."
              }
              icon={isCommercial ? CalendarClock : Clock3}
            />
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
      <CardHeader>
        <h2 className="font-semibold text-primary">
          Situação atual dos agendamentos gerados
        </h2>
      </CardHeader>
      <CardContent className="grid flex-1 content-center gap-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center gap-3">
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-md ${item.tone}`}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {item.value}
                </p>
                <p className="text-sm text-secondary-foreground">
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

  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader>
        <h2 className="font-semibold text-primary">{title}</h2>
      </CardHeader>
      <CardContent className="flex-1">
        <div className={heightClassName}>
          {data.some((item) => item.value > 0) ? (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart data={data} margin={{ left: 0, right: 10, top: 8 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--primary)"
                      stopOpacity={0.24}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--primary)"
                      stopOpacity={0.03}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} />
                <YAxis allowDecimals={false} tickLine={false} width={36} />
                <Tooltip cursor={{ stroke: "var(--border-strong)" }} />
                <Area
                  dataKey="value"
                  fill={`url(#${gradientId})`}
                  stroke="var(--primary)"
                  strokeWidth={2}
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
      <CardHeader>
        <h2 className="font-semibold text-primary">Aniversariantes do dia</h2>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {birthdays.length ? (
          <div className="grid gap-3">
            {birthdays.slice(0, 5).map((patient) => (
              <div
                key={patient.id}
                className="rounded-md border border-border bg-background p-3"
              >
                <p className="truncate text-sm font-semibold">{patient.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {patient.age != null
                    ? `${patient.age} anos`
                    : "Idade não informada"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-48 flex-1 items-center justify-center">
            <EmptyState icon={CakeSlice} title="Nenhum aniversariante hoje" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UnavailableDataCard({ title }: { title: string }) {
  return (
    <Card className="flex h-full min-w-0 flex-col">
      <CardHeader className="flex min-h-20 items-center">
        <h2 className="font-semibold text-primary">{title}</h2>
      </CardHeader>
      <CardContent className="flex min-h-52 flex-1 items-center justify-center">
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
  emptyLabel,
  emptyIcon,
}: {
  slices: DashboardSlice[];
  innerRadius: number | string;
  outerRadius: number | string;
  emptyLabel: string;
  emptyIcon?: LucideIcon;
}) {
  const hasData = slices.some((item) => item.value > 0);

  return (
    <div className="h-52 min-w-0">
      {hasData ? (
        <ResponsiveContainer height="100%" width="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={innerRadius ? 1 : 0}
            >
              {slices.map((slice) => (
                <Cell key={slice.label} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <EmptyChart label={emptyLabel} icon={emptyIcon} />
      )}
    </div>
  );
}

function MiniDonut({
  label,
  value,
  totalLabel,
  color,
  hasData,
}: {
  label: string;
  value: number;
  totalLabel: string;
  color: string;
  hasData: boolean;
}) {
  const data = [
    { label, value, color },
    {
      label: "Outros",
      value: Math.max(0, 100 - value),
      color: "var(--border)",
    },
  ];

  return (
    <div className="grid justify-items-center gap-1 px-2 text-center">
      <div className="relative h-14 w-14">
        {hasData ? (
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={18}
                outerRadius={26}
                startAngle={90}
                endAngle={-270}
              >
                {data.map((item) => (
                  <Cell key={item.label} fill={item.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-border" />
        )}
        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-primary">
          {hasData ? `${value}%` : "—"}
        </span>
      </div>
      <p className="text-sm font-semibold text-primary">{label}</p>
      <p className="text-xs text-muted-foreground">{totalLabel}</p>
    </div>
  );
}

function Legend({ slices }: { slices: DashboardSlice[] }) {
  if (!slices.length) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-secondary-foreground">
      {slices.slice(0, 5).map((slice) => (
        <span key={slice.label} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: slice.color }}
          />
          <span className="max-w-24 truncate">{slice.label}</span>
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
