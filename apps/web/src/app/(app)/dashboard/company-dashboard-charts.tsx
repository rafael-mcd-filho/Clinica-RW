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
  CalendarDays,
  Clock3,
  CreditCard,
  Stethoscope,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { FadeInDiv } from "@/components/ui/animated";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { categoricalColors } from "@/lib/colors";

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
  duration: {
    averageMinutes: number | null;
    byType: DashboardPoint[];
  };
  cancellations: {
    noShows: number;
    clinicCancellations: number;
    patientCancellations: number;
    noShowRate: number;
    clinicCancellationRate: number;
    patientCancellationRate: number;
  };
  periodAttendances: DashboardPoint[];
  ageDistribution: DashboardPoint[];
  birthdays: BirthdayPatient[];
};

export function CompanyDashboardCharts({
  data,
}: {
  data: CompanyDashboardChartsData;
}) {
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
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <FadeInDiv delay={0 * 0.05}>
          <PatientChartCard
            slices={patientSlices}
            maleCount={data.patients.maleCount}
            femaleCount={data.patients.femaleCount}
          />
        </FadeInDiv>
        <FadeInDiv delay={1 * 0.05}>
          <DonutMetricCard
            title="Agendamentos por tipo de servico"
            total={data.procedures.total}
            totalLabel="Agendamentos"
            slices={data.procedures.slices}
            emptyLabel="Nenhum agendamento no periodo."
            emptyIcon={Stethoscope}
          />
        </FadeInDiv>
        <FadeInDiv delay={2 * 0.05}>
          <InsuranceMetricCard data={data.insurances} />
        </FadeInDiv>
        <FadeInDiv delay={3 * 0.05}>
          <CancellationRatesCard data={data.cancellations} />
        </FadeInDiv>
        <FadeInDiv delay={4 * 0.05}>
          <DurationCard data={data.duration} />
        </FadeInDiv>
      </section>

      <FadeInDiv delay={5 * 0.05}>
        <AreaLineCard
          title="Atendimentos no período"
          data={data.periodAttendances}
          heightClassName="h-72"
          emptyIcon={CalendarDays}
        />
      </FadeInDiv>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <FadeInDiv delay={6 * 0.05}>
          <AreaLineCard
            title="Distribuição etária"
            data={data.ageDistribution}
            heightClassName="h-64"
            emptyIcon={UsersRound}
          />
        </FadeInDiv>
        <FadeInDiv delay={7 * 0.05}>
          <BirthdaysCard birthdays={data.birthdays} />
        </FadeInDiv>
      </section>
    </div>
  );
}

function PatientChartCard({
  slices,
  maleCount,
  femaleCount,
}: {
  slices: DashboardSlice[];
  maleCount: number;
  femaleCount: number;
}) {
  const hasGenderData = maleCount + femaleCount > 0;
  const malePercent = percent(maleCount, maleCount + femaleCount);
  const femalePercent = percent(femaleCount, maleCount + femaleCount);

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-primary">
          Consultas por tipo de paciente
        </h2>
      </CardHeader>
      <CardContent>
        <PieBlock
          slices={slices}
          innerRadius={0}
          outerRadius={88}
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
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-primary">{title}</h2>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <PieBlock
            slices={slices}
            innerRadius={68}
            outerRadius={100}
            emptyLabel={emptyLabel}
            emptyIcon={emptyIcon}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-5xl font-bold tabular-nums text-foreground">
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
}: {
  data: CompanyDashboardChartsData["insurances"];
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-primary">
          Agendamentos por convenio
        </h2>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <PieBlock
            slices={data.slices}
            innerRadius={68}
            outerRadius={100}
            emptyLabel="Nenhum agendamento no periodo."
            emptyIcon={CreditCard}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-5xl font-bold tabular-nums text-foreground">
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
}: {
  data: CompanyDashboardChartsData["cancellations"];
}) {
  const items = [
    {
      label: "Faltas",
      value: data.noShowRate,
      count: data.noShows,
      tone: "text-warning-foreground bg-warning-muted",
    },
    {
      label: "Cancelamentos pela clinica",
      value: data.clinicCancellationRate,
      count: data.clinicCancellations,
      tone: "text-destructive bg-destructive-muted",
    },
    {
      label: "Cancelamentos pelo paciente",
      value: data.patientCancellationRate,
      count: data.patientCancellations,
      tone: "text-destructive bg-destructive-muted",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-primary">Cancelamentos e faltas</h2>
      </CardHeader>
      <CardContent className="grid gap-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-md ${item.tone}`}
            >
              <Ban className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xl font-semibold tabular-nums">
                {item.value}%
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

function DurationCard({
  data,
}: {
  data: CompanyDashboardChartsData["duration"];
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-primary">Duração do atendimento</h2>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Clock3 className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-3xl font-light italic text-foreground">
            {formatDuration(data.averageMinutes)}
          </p>
        </div>
        <h3 className="mt-8 text-sm font-semibold text-primary">
          Tipo de atendimento
        </h3>
        <div className="mt-4 h-48">
          {data.byType.some((item) => item.value > 0) ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={data.byType} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} />
                <YAxis allowDecimals={false} tickLine={false} width={34} />
                <Tooltip cursor={{ fill: "rgba(148, 163, 184, 0.14)" }} />
                <Bar dataKey="value" fill={categoricalColors.blueSoft} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart
              label="Sem duração registrada no período."
              icon={Clock3}
            />
          )}
        </div>
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
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-primary">{title}</h2>
      </CardHeader>
      <CardContent>
        <div className={heightClassName}>
          {data.some((item) => item.value > 0) ? (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart data={data} margin={{ left: 0, right: 10, top: 8 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.03} />
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
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-primary">Aniversariantes do dia</h2>
      </CardHeader>
      <CardContent>
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
          <div className="flex h-48 items-center justify-center">
            <EmptyState icon={CakeSlice} title="Nenhum aniversariante hoje" />
          </div>
        )}
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
  innerRadius: number;
  outerRadius: number;
  emptyLabel: string;
  emptyIcon?: LucideIcon;
}) {
  const hasData = slices.some((item) => item.value > 0);

  return (
    <div className="h-56">
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
    { label: "Outros", value: Math.max(0, 100 - value), color: "var(--border)" },
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

function formatDuration(minutes: number | null) {
  if (minutes == null || !Number.isFinite(minutes)) {
    return "0min";
  }

  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;

  if (!hours) {
    return `${rest}min`;
  }

  return `${hours}h ${String(rest).padStart(2, "0")}min`;
}
