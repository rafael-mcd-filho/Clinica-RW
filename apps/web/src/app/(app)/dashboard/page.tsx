import {
  ArrowDown,
  ArrowUp,
  Buildings as Building2,
  CalendarCheck as CalendarCheck2,
  CalendarDots as CalendarClock,
  CalendarPlus,
  CheckCircle as CheckCircle2,
  ClipboardText as ClipboardCheck,
  ShieldWarning as ShieldAlert,
  TrendUp as TrendingUp,
  UserPlus,
  UsersThree as UsersRound,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as LucideIcon } from "@phosphor-icons/react";
import { formatInTimeZone } from "date-fns-tz";
import { DashboardFilters } from "./dashboard-filters";
import {
  CompanyOperationsPanel,
  type DashboardOnlineRequest,
  type DashboardWaitlistEntry,
} from "./company-operations-panel";
import {
  CompanyDashboardCharts,
  type CompanyDashboardChartsData,
  type DashboardSlice,
} from "./company-dashboard-charts";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryBarChart } from "@/components/ui/summary-chart";
import { getRequestContext } from "@/lib/auth/context";
import { categoricalColors, chartSeries } from "@/lib/colors";
import {
  buildAppointmentStats,
  buildCountTrend,
  buildRateTrend,
  type MetricTrend,
} from "@/lib/dashboard/metrics";
import {
  parseDashboardAggregatePayload,
  type DashboardAggregatePayload,
} from "@/lib/dashboard/aggregates";
import {
  buildDashboardPeriodPoints,
  containsInstant,
  dashboardDateField,
  defaultDashboardTimeZone,
  formatDashboardRange,
  isValidTimeZone,
  resolveDashboardFilterSelection,
  resolveDashboardPeriod,
  type DashboardRange,
  type DashboardView,
} from "@/lib/dashboard/periods";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type OrganizationMetric = {
  status: string;
};

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PatientMetric = {
  id: string;
  full_name: string;
  social_name: string | null;
  birth_date: string | null;
  sex_at_birth: string | null;
  status: string;
  deleted_at: string | null;
  created_at: string;
};

type AppointmentMetric = {
  id: string;
  patient_id: string;
  procedure_id: string;
  health_insurance_id: string | null;
  status: string;
  start_at: string;
  end_at: string;
  created_at: string;
};

type OrganizationSettingsMetric = {
  timezone: string;
};

type NamedMetric = {
  id: string;
  name: string;
};

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type DashboardRowsResult<T> = {
  data: T[] | null;
  error: unknown | null;
};

const dashboardQueryPageSize = 500;
const dashboardAppointmentColumns =
  "id, patient_id, procedure_id, health_insurance_id, status, start_at, end_at, created_at";

type MetricTone = "primary" | "success" | "warning" | "destructive" | "neutral";
const metricToneClass: Record<MetricTone, string> = {
  primary: "bg-primary-muted text-primary",
  success: "bg-success-muted text-success",
  warning: "bg-warning-muted text-warning-foreground",
  destructive: "bg-destructive-muted text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

function DashboardMetricCard({
  icon: Icon,
  label,
  value,
  status,
  tone,
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  status: string;
  tone: MetricTone;
  trend?: MetricTrend;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:border-border-strong hover:shadow-[var(--shadow-hover)]">
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-md",
            metricToneClass[tone],
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <Badge variant="neutral">{status}</Badge>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {trend ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold",
              trend.sentiment === "positive"
                ? "text-success-foreground"
                : trend.sentiment === "negative"
                  ? "text-destructive-foreground"
                  : "text-muted-foreground",
            )}
          >
            {trend.direction === "up" ? (
              <ArrowUp className="size-3" aria-hidden="true" />
            ) : trend.direction === "down" ? (
              <ArrowDown className="size-3" aria-hidden="true" />
            ) : null}
            {trend.value}{" "}
            <span className="font-normal text-muted-foreground">
              {trend.label}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DashboardUnavailable({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <ShieldAlert
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = (await searchParams) ?? {};
  const now = new Date();
  const context = await getRequestContext();

  if (!context.isSuperAdmin) {
    return (
      <CompanyDashboard
        organization={context.organization}
        canViewPatients={context.permissionCodes.has("paciente.ver")}
        canViewAgenda={context.permissionCodes.has("agenda.ver")}
        canManageOnlineRequests={
          context.permissionCodes.has("agenda.criar_agendamento") &&
          context.permissionCodes.has("paciente.criar")
        }
        canRejectOnlineRequests={
          context.permissionCodes.has("agenda.criar_agendamento") ||
          context.permissionCodes.has("agenda.editar_agendamento")
        }
        searchParams={params}
        now={now}
      />
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: organizationRows } = await supabase
    .from("organizations")
    .select("status")
    .returns<OrganizationMetric[]>();
  const organizations = organizationRows ?? [];

  const totalCompanies = organizations.length;
  const activeCompanies = organizations.filter(
    (organization) => organization.status === "active",
  ).length;
  const trialCompanies = organizations.filter(
    (organization) => organization.status === "trial",
  ).length;
  const suspendedCompanies = organizations.filter(
    (organization) => organization.status === "suspended",
  ).length;

  const platformCards: Array<{
    label: string;
    value: string;
    icon: LucideIcon;
    status: string;
    tone: MetricTone;
  }> = [
    {
      label: "Empresas",
      value: String(totalCompanies),
      icon: Building2,
      status: "total",
      tone: "primary",
    },
    {
      label: "Empresas ativas",
      value: String(activeCompanies),
      icon: TrendingUp,
      status: "operação",
      tone: "success",
    },
    {
      label: "Trials",
      value: String(trialCompanies),
      icon: ClipboardCheck,
      status: "onboarding",
      tone: "warning",
    },
    {
      label: "Suspensas",
      value: String(suspendedCompanies),
      icon: ShieldAlert,
      status: "risco",
      tone: "destructive",
    },
  ];

  return (
    <div className="grid gap-6">
      {!context.actor ? (
        <section className="rounded border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <div className="flex items-start gap-3">
            <ShieldAlert
              className="mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <h1 className="text-base font-semibold">
                Conta autenticada sem usuário interno
              </h1>
              <p className="mt-1 text-sm leading-6">
                Crie um registro em `app_users` vinculado ao usuário do Supabase
                Auth para liberar menus, permissões e dados da empresa.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        {platformCards.map((card) => (
          <DashboardMetricCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            status={card.status}
            tone={card.tone}
          />
        ))}
      </section>

      <SummaryBarChart
        title="Empresas por status"
        data={[
          { label: "Ativas", value: activeCompanies },
          { label: "Trials", value: trialCompanies },
          { label: "Suspensas", value: suspendedCompanies },
        ]}
      />

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold">Próxima entrega</h2>
          <p className="text-sm text-muted-foreground">
            Cadastros e configurações para iniciar a operação das empresas.
          </p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          {[
            "Configurar unidades",
            "Cadastrar profissionais",
            "Definir serviços e horários",
          ].map((item) => (
            <div
              key={item}
              className="flex min-h-20 items-center gap-3 rounded-lg border border-border bg-background p-4"
            >
              <ClipboardCheck
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function buildCompanyDashboardCharts({
  view,
  patientDataAvailable,
  patients,
  appointments,
  procedures,
  insurances,
  period,
  timeZone,
  now,
}: {
  view: DashboardView;
  patientDataAvailable: boolean;
  patients: PatientMetric[];
  appointments: AppointmentMetric[];
  procedures: Map<string, string>;
  insurances: Map<string, string>;
  period: DashboardRange;
  timeZone: string;
  now: Date;
}): CompanyDashboardChartsData {
  const nonCancelledAppointments = appointments.filter(
    (appointment) => appointment.status !== "cancelled",
  );
  const mixAppointments =
    view === "commercial" ? appointments : nonCancelledAppointments;
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const newAppointmentCount = mixAppointments.filter((appointment) => {
    const patient = patientById.get(appointment.patient_id);
    return patient ? containsInstant(period, patient.created_at) : false;
  }).length;
  const recurringAppointmentCount = mixAppointments.filter((appointment) => {
    const patient = patientById.get(appointment.patient_id);
    return patient ? !containsInstant(period, patient.created_at) : false;
  }).length;
  const cohortPatientIds = new Set(
    mixAppointments.map((appointment) => appointment.patient_id),
  );
  const cohortPatients = patients.filter((patient) =>
    cohortPatientIds.has(patient.id),
  );
  const procedureCounts = countBy(
    mixAppointments,
    (appointment) =>
      procedures.get(appointment.procedure_id) ?? "Sem procedimento",
  );
  const insuranceAppointments = mixAppointments.filter(
    (appointment) => appointment.health_insurance_id,
  );
  const insuranceNameCounts = countBy(
    insuranceAppointments,
    (appointment) =>
      insurances.get(appointment.health_insurance_id ?? "") ?? "Convenio",
  );
  const insuranceStatusCounts = new Map<string, number>([
    ["Sem convenio", mixAppointments.length - insuranceAppointments.length],
    ["Com convenio", insuranceAppointments.length],
  ]);
  const noShows = appointments.filter(
    (appointment) => appointment.status === "no_show",
  ).length;
  const cancelledAppointments = appointments.filter(
    (appointment) => appointment.status === "cancelled",
  );
  const completedForAttendanceRate = appointments.filter((appointment) =>
    ["attended", "no_show"].includes(appointment.status),
  ).length;

  const timingAppointments =
    view === "commercial" ? appointments : nonCancelledAppointments;
  const timingValues = timingAppointments
    .map((appointment) => appointmentTimingValue(appointment, view))
    .filter((value): value is number => value != null && value >= 0);
  const particularTiming = timingAppointments
    .filter((appointment) => !appointment.health_insurance_id)
    .map((appointment) => appointmentTimingValue(appointment, view))
    .filter((value): value is number => value != null && value >= 0);
  const insuranceTiming = timingAppointments
    .filter((appointment) => appointment.health_insurance_id)
    .map((appointment) => appointmentTimingValue(appointment, view))
    .filter((value): value is number => value != null && value >= 0);
  const referenceDateKey = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const dateField = dashboardDateField(view);

  return {
    view,
    patientDataAvailable,
    patients: {
      newCount: newAppointmentCount,
      recurringCount: recurringAppointmentCount,
      maleCount: cohortPatients.filter(
        (patient) => patient.sex_at_birth === "male",
      ).length,
      femaleCount: cohortPatients.filter(
        (patient) => patient.sex_at_birth === "female",
      ).length,
    },
    procedures: {
      total: mixAppointments.length,
      slices: toSlices(procedureCounts, chartSeries),
    },
    insurances: {
      total: mixAppointments.length,
      slices: toSlices(insuranceStatusCounts, chartSeries),
      breakdown: toPercentageSlices(
        insuranceNameCounts,
        Math.max(1, insuranceAppointments.length),
        chartSeries,
      ),
    },
    timing: {
      averageValue: average(timingValues),
      byType: [
        {
          label: "Particular",
          value: Math.round(average(particularTiming) ?? 0),
        },
        {
          label: "Convênio",
          value: Math.round(average(insuranceTiming) ?? 0),
        },
      ],
    },
    cancellations: {
      noShows,
      cancellations: cancelledAppointments.length,
      noShowRate: completedForAttendanceRate
        ? percent(noShows, completedForAttendanceRate)
        : null,
      cancellationRate: appointments.length
        ? percent(cancelledAppointments.length, appointments.length)
        : null,
    },
    periodAttendances: buildDashboardPeriodPoints(
      period,
      appointments.map((appointment) => appointment[dateField]),
      timeZone,
    ),
    ageDistribution: buildAgeDistribution(cohortPatients, referenceDateKey),
    birthdays: buildBirthdays(patients, referenceDateKey),
    commercialSummary: {
      future: appointments.filter(
        (appointment) =>
          !["attended", "cancelled", "no_show"].includes(appointment.status) &&
          new Date(appointment.start_at) > now,
      ).length,
      attended: appointments.filter(
        (appointment) => appointment.status === "attended",
      ).length,
      open: appointments.filter(
        (appointment) =>
          !["attended", "cancelled", "no_show"].includes(appointment.status) &&
          new Date(appointment.start_at) <= now,
      ).length,
      losses: noShows + cancelledAppointments.length,
    },
  };
}

function countBy<T>(items: T[], resolveLabel: (item: T) => string) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const label = resolveLabel(item);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return counts;
}

function toSlices(
  counts: Map<string, number>,
  colors: string[],
): DashboardSlice[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value], index) => ({
      label,
      value,
      color: colors[index % colors.length] ?? categoricalColors.blue,
    }));
}

function toPercentageSlices(
  counts: Map<string, number>,
  total: number,
  colors: string[],
): DashboardSlice[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value], index) => ({
      label,
      value: percent(value, total),
      color: colors[index % colors.length] ?? categoricalColors.blue,
    }));
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function appointmentTimingValue(
  appointment: AppointmentMetric,
  view: DashboardView,
) {
  const start = new Date(appointment.start_at).getTime();
  const reference = new Date(
    view === "commercial" ? appointment.created_at : appointment.end_at,
  ).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(reference)) {
    return null;
  }

  const difference =
    view === "commercial" ? start - reference : reference - start;
  if (difference < 0) return null;
  return difference / (view === "commercial" ? 86_400_000 : 60_000);
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatAverageDays(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded} ${rounded === 1 ? "dia" : "dias"}`;
}

function buildAgeDistribution(patients: PatientMetric[], todayKey: string) {
  const counts = new Map<string, number>();

  for (const patient of patients) {
    const age = calculateAge(patient.birth_date, todayKey);
    if (age == null) continue;
    counts.set(String(age), (counts.get(String(age)) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([label, value]) => ({ label, value }));
}

function buildBirthdays(patients: PatientMetric[], todayKey: string) {
  const [, month, day] = todayKey.split("-").map(Number);

  return patients
    .filter((patient) => {
      if (patient.deleted_at || patient.status !== "active") return false;
      if (!patient.birth_date) return false;
      const [, birthMonth, birthDay] = patient.birth_date
        .split("-")
        .map(Number);
      return birthMonth === month && birthDay === day;
    })
    .map((patient) => ({
      id: patient.id,
      name: patient.social_name || patient.full_name,
      age: calculateAge(patient.birth_date, todayKey),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function calculateAge(birthDate: string | null, todayKey: string) {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = todayKey.split("-").map(Number);
  if (!year || !month || !day) return null;

  let age = todayYear - year;
  const hadBirthday =
    todayMonth > month || (todayMonth === month && todayDay >= day);
  if (!hadBirthday) age -= 1;

  return age;
}

async function fetchDashboardAggregates(
  supabase: SupabaseServerClient,
  organizationId: string,
  view: DashboardView,
  current: DashboardRange,
  comparison: DashboardRange,
  timeZone: string,
  now: Date,
  includePatientData: boolean,
) {
  const result = await supabase.rpc("dashboard_company_aggregates", {
    p_organization_id: organizationId,
    p_view: view,
    p_current_start: current.startInclusive.toISOString(),
    p_current_end: current.endExclusive.toISOString(),
    p_comparison_start: comparison.startInclusive.toISOString(),
    p_comparison_end: comparison.endExclusive.toISOString(),
    p_timezone: timeZone,
    p_now: now.toISOString(),
    p_include_patient_data: includePatientData,
  });

  if (result.error) return null;
  return parseDashboardAggregatePayload(result.data);
}

function buildCompanyDashboardChartsFromAggregate(
  aggregate: DashboardAggregatePayload,
  view: DashboardView,
): CompanyDashboardChartsData {
  const insuranceTotal =
    aggregate.charts.insurance_status.with_insurance +
    aggregate.charts.insurance_status.without_insurance;
  const insuranceStatusCounts = new Map<string, number>([
    ["Sem convenio", aggregate.charts.insurance_status.without_insurance],
    ["Com convenio", aggregate.charts.insurance_status.with_insurance],
  ]);

  return {
    view,
    patientDataAvailable: aggregate.patient_data_available,
    patients: {
      newCount: aggregate.charts.patients.new_count,
      recurringCount: aggregate.charts.patients.recurring_count,
      maleCount: aggregate.charts.patients.male_count,
      femaleCount: aggregate.charts.patients.female_count,
    },
    procedures: {
      total: insuranceTotal,
      slices: aggregate.charts.procedures.map((slice, index) => ({
        ...slice,
        color:
          chartSeries[index % chartSeries.length] ?? categoricalColors.blue,
      })),
    },
    insurances: {
      total: insuranceTotal,
      slices: toSlices(insuranceStatusCounts, chartSeries),
      breakdown: aggregate.charts.insurance_breakdown.map((slice, index) => ({
        label: slice.label,
        value: percent(
          slice.value,
          Math.max(1, aggregate.charts.insurance_status.with_insurance),
        ),
        color:
          chartSeries[index % chartSeries.length] ?? categoricalColors.blue,
      })),
    },
    timing: {
      averageValue: aggregate.charts.timing.average_value,
      byType: [
        {
          label: "Particular",
          value: Math.round(aggregate.charts.timing.particular_value ?? 0),
        },
        {
          label: "Convênio",
          value: Math.round(aggregate.charts.timing.insurance_value ?? 0),
        },
      ],
    },
    cancellations: {
      noShows: aggregate.charts.cancellations.no_shows,
      cancellations: aggregate.charts.cancellations.cancellations,
      noShowRate: aggregate.charts.cancellations.no_show_rate,
      cancellationRate: aggregate.charts.cancellations.cancellation_rate,
    },
    periodAttendances: aggregate.charts.period_points.map((point) => ({
      label: formatAggregateDate(point.date),
      value: point.value,
    })),
    ageDistribution: aggregate.charts.age_distribution.map((point) => ({
      label: String(point.age),
      value: point.value,
    })),
    birthdays: aggregate.charts.birthdays,
    commercialSummary: aggregate.charts.commercial_summary,
  };
}

function appointmentStatsFromAggregate(
  stats: DashboardAggregatePayload["current_stats"],
) {
  return {
    total: stats.total,
    valid: stats.valid,
    attended: stats.attended,
    uniquePatients: stats.unique_patients,
    noShowRate: stats.no_show_rate,
    cancellationRate: stats.cancellation_rate,
  };
}

function formatAggregateDate(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

async function fetchAllDashboardPatients(
  supabase: SupabaseServerClient,
  organizationId: string,
): Promise<DashboardRowsResult<PatientMetric>> {
  const data: PatientMetric[] = [];

  for (let offset = 0; ; offset += dashboardQueryPageSize) {
    const result = await supabase
      .from("patients")
      .select(
        "id, full_name, social_name, birth_date, sex_at_birth, status, deleted_at, created_at",
      )
      .eq("organization_id", organizationId)
      .order("id")
      .range(offset, offset + dashboardQueryPageSize - 1)
      .returns<PatientMetric[]>();

    if (result.error) return { data, error: result.error };
    const page = result.data ?? [];
    data.push(...page);
    if (page.length < dashboardQueryPageSize) break;
  }

  return { data, error: null };
}

async function fetchAllDashboardAppointments(
  supabase: SupabaseServerClient,
  organizationId: string,
  dateField: "start_at" | "created_at",
  range: DashboardRange,
): Promise<DashboardRowsResult<AppointmentMetric>> {
  const data: AppointmentMetric[] = [];

  for (let offset = 0; ; offset += dashboardQueryPageSize) {
    const result = await supabase
      .from("appointments")
      .select(dashboardAppointmentColumns)
      .eq("organization_id", organizationId)
      .gte(dateField, range.startInclusive.toISOString())
      .lt(dateField, range.endExclusive.toISOString())
      .order(dateField)
      .order("id")
      .range(offset, offset + dashboardQueryPageSize - 1)
      .returns<AppointmentMetric[]>();

    if (result.error) return { data, error: result.error };
    const page = result.data ?? [];
    data.push(...page);
    if (page.length < dashboardQueryPageSize) break;
  }

  return { data, error: null };
}

function emptyDashboardRows<T>(): DashboardRowsResult<T> {
  return { data: [], error: null };
}

async function CompanyDashboard({
  organization,
  canViewPatients,
  canViewAgenda,
  canManageOnlineRequests,
  canRejectOnlineRequests,
  searchParams,
  now,
}: {
  organization: { id: string; name: string } | null;
  canViewPatients: boolean;
  canViewAgenda: boolean;
  canManageOnlineRequests: boolean;
  canRejectOnlineRequests: boolean;
  searchParams: Record<string, string | string[] | undefined>;
  now: Date;
}) {
  const supabase = await createSupabaseServerClient();
  const settingsResult = organization
    ? await supabase
        .from("organization_settings")
        .select("timezone")
        .eq("organization_id", organization.id)
        .maybeSingle<OrganizationSettingsMetric>()
    : { data: null as OrganizationSettingsMetric | null, error: null };
  const configuredTimeZone = settingsResult.data?.timezone;
  const timeZone = isValidTimeZone(configuredTimeZone)
    ? configuredTimeZone!
    : defaultDashboardTimeZone;
  const selection = resolveDashboardFilterSelection(searchParams, {
    now,
    timeZone,
  });
  const dashboardPeriod = resolveDashboardPeriod(selection, {
    now,
    timeZone,
  });
  const dateField = dashboardDateField(selection.view);
  const [dashboardAggregate, onlineRequestsResult, waitlistResult] =
    organization
      ? await Promise.all([
          canViewAgenda
            ? fetchDashboardAggregates(
                supabase,
                organization.id,
                selection.view,
                dashboardPeriod.current,
                dashboardPeriod.comparison,
                timeZone,
                now,
                canViewPatients,
              )
            : Promise.resolve(null),
          canViewAgenda && selection.view === "operational"
            ? supabase
                .from("online_booking_requests")
                .select(
                  "id, requested_start_at, requested_end_at, patient_name, patient_email, patient_phone, patient_notes, procedures(name), professionals(name), units(name), health_insurances(name)",
                )
                .eq("organization_id", organization.id)
                .eq("status", "requested")
                .order("requested_start_at")
                .returns<DashboardOnlineRequest[]>()
            : Promise.resolve(emptyDashboardRows<DashboardOnlineRequest>()),
          canViewAgenda && selection.view === "operational"
            ? supabase
                .from("waitlist_entries")
                .select(
                  "id, preferred_period, notes, created_at, patients(full_name, social_name), procedures(name), professionals(name)",
                )
                .eq("organization_id", organization.id)
                .in("status", ["waiting", "contacted"])
                .order("created_at")
                .returns<DashboardWaitlistEntry[]>()
            : Promise.resolve(emptyDashboardRows<DashboardWaitlistEntry>()),
        ])
      : [
          null,
          emptyDashboardRows<DashboardOnlineRequest>(),
          emptyDashboardRows<DashboardWaitlistEntry>(),
        ];

  let patientsResult: DashboardRowsResult<PatientMetric> = emptyDashboardRows();
  let currentAppointmentsResult: DashboardRowsResult<AppointmentMetric> =
    emptyDashboardRows();
  let comparisonAppointmentsResult: DashboardRowsResult<AppointmentMetric> =
    emptyDashboardRows();
  let proceduresResult: DashboardRowsResult<NamedMetric> = emptyDashboardRows();
  let insurancesResult: DashboardRowsResult<NamedMetric> = emptyDashboardRows();

  if (organization && canViewAgenda && !dashboardAggregate) {
    [
      patientsResult,
      currentAppointmentsResult,
      comparisonAppointmentsResult,
      proceduresResult,
      insurancesResult,
    ] = await Promise.all([
      canViewPatients
        ? fetchAllDashboardPatients(supabase, organization.id)
        : Promise.resolve(emptyDashboardRows<PatientMetric>()),
      fetchAllDashboardAppointments(
        supabase,
        organization.id,
        dateField,
        dashboardPeriod.current,
      ),
      fetchAllDashboardAppointments(
        supabase,
        organization.id,
        dateField,
        dashboardPeriod.comparison,
      ),
      supabase
        .from("procedures")
        .select("id, name")
        .eq("organization_id", organization.id)
        .returns<NamedMetric[]>(),
      supabase
        .from("health_insurances")
        .select("id, name")
        .eq("organization_id", organization.id)
        .returns<NamedMetric[]>(),
    ]);
  }

  const dashboardDataError = Boolean(
    settingsResult.error ||
    (!dashboardAggregate &&
      (currentAppointmentsResult.error ||
        comparisonAppointmentsResult.error ||
        proceduresResult.error ||
        insurancesResult.error)),
  );
  const patientDataAvailable = dashboardAggregate
    ? dashboardAggregate.patient_data_available
    : canViewPatients && !Boolean(patientsResult.error);
  const operationsDataError = Boolean(
    onlineRequestsResult.error || waitlistResult.error,
  );
  const patients = patientsResult.data ?? [];
  const currentAppointments = currentAppointmentsResult.data ?? [];
  const comparisonAppointments = comparisonAppointmentsResult.data ?? [];
  const procedures = new Map(
    (proceduresResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const insurances = new Map(
    (insurancesResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const dashboardCharts = dashboardAggregate
    ? buildCompanyDashboardChartsFromAggregate(
        dashboardAggregate,
        selection.view,
      )
    : buildCompanyDashboardCharts({
        view: selection.view,
        patientDataAvailable,
        patients,
        appointments: currentAppointments,
        procedures,
        insurances,
        period: dashboardPeriod.current,
        timeZone,
        now,
      });
  const currentStats = dashboardAggregate
    ? appointmentStatsFromAggregate(dashboardAggregate.current_stats)
    : buildAppointmentStats(currentAppointments);
  const comparisonStats = dashboardAggregate
    ? appointmentStatsFromAggregate(dashboardAggregate.comparison_stats)
    : buildAppointmentStats(comparisonAppointments);
  const currentNewPatients = dashboardAggregate
    ? dashboardAggregate.current_new_patients
    : patients.filter((patient) =>
        containsInstant(dashboardPeriod.current, patient.created_at),
      ).length;
  const comparisonNewPatients = dashboardAggregate
    ? dashboardAggregate.comparison_new_patients
    : patients.filter((patient) =>
        containsInstant(dashboardPeriod.comparison, patient.created_at),
      ).length;
  const currentAverageLeadDays = dashboardAggregate
    ? dashboardAggregate.average_lead_days
    : average(
        currentAppointments
          .map((appointment) =>
            appointmentTimingValue(appointment, "commercial"),
          )
          .filter((value): value is number => value != null && value >= 0),
      );

  const cards: Array<{
    label: string;
    value: string;
    icon: LucideIcon;
    status: string;
    tone: MetricTone;
    trend?: MetricTrend;
  }> =
    selection.view === "commercial"
      ? [
          {
            label: "Agendamentos gerados",
            value: String(currentStats.total),
            icon: CalendarPlus,
            status: "comercial",
            tone: "primary",
            trend: buildCountTrend(currentStats.total, comparisonStats.total),
          },
          patientDataAvailable
            ? {
                label: "Novos pacientes",
                value: String(currentNewPatients),
                icon: UserPlus,
                status: "aquisição",
                tone: "success",
                trend: buildCountTrend(
                  currentNewPatients,
                  comparisonNewPatients,
                ),
              }
            : {
                label: "Agendamentos válidos",
                value: String(currentStats.valid),
                icon: CalendarCheck2,
                status: "carteira",
                tone: "success",
                trend: buildCountTrend(
                  currentStats.valid,
                  comparisonStats.valid,
                ),
              },
          {
            label: "Pacientes agendados",
            value: String(currentStats.uniquePatients),
            icon: UsersRound,
            status: "alcance",
            tone: "neutral",
            trend: buildCountTrend(
              currentStats.uniquePatients,
              comparisonStats.uniquePatients,
            ),
          },
          {
            label: "Antecedência média",
            value: formatAverageDays(currentAverageLeadDays),
            icon: CalendarClock,
            status: "planejamento",
            tone: "neutral",
          },
        ]
      : [
          {
            label: "Agendamentos do período",
            value: String(currentStats.total),
            icon: CalendarCheck2,
            status: "agenda",
            tone: "primary",
            trend: buildCountTrend(currentStats.total, comparisonStats.total),
          },
          {
            label: "Atendimentos realizados",
            value: String(currentStats.attended),
            icon: CheckCircle2,
            status: "produção",
            tone: "success",
            trend: buildCountTrend(
              currentStats.attended,
              comparisonStats.attended,
            ),
          },
          {
            label: "Taxa de faltas",
            value:
              currentStats.noShowRate == null
                ? "—"
                : `${currentStats.noShowRate}%`,
            icon: UsersRound,
            status: "comparecimento",
            tone: "warning",
            trend:
              currentStats.noShowRate != null &&
              comparisonStats.noShowRate != null
                ? buildRateTrend(
                    currentStats.noShowRate,
                    comparisonStats.noShowRate,
                    "lower",
                  )
                : undefined,
          },
          {
            label: "Taxa de cancelamento",
            value:
              currentStats.cancellationRate == null
                ? "—"
                : `${currentStats.cancellationRate}%`,
            icon: ShieldAlert,
            status: "perdas",
            tone: "destructive",
            trend:
              currentStats.cancellationRate != null &&
              comparisonStats.cancellationRate != null
                ? buildRateTrend(
                    currentStats.cancellationRate,
                    comparisonStats.cancellationRate,
                    "lower",
                  )
                : undefined,
          },
        ];
  const viewLabel =
    selection.view === "commercial" ? "comercial" : "operacional";

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Painel"
        description={`Visão ${viewLabel} de ${organization?.name ?? "sua empresa"}.`}
      />

      <DashboardFilters
        key={`${selection.view}:${selection.period}:${selection.from ?? ""}:${selection.to ?? ""}`}
        selection={selection}
        currentRangeLabel={formatDashboardRange(dashboardPeriod.current)}
        comparisonRangeLabel={formatDashboardRange(
          dashboardPeriod.comparison,
          "até o mesmo horário",
        )}
        today={formatInTimeZone(now, timeZone, "yyyy-MM-dd")}
      />

      {canViewAgenda ? (
        dashboardDataError ? (
          <DashboardUnavailable
            title="Não foi possível carregar os indicadores"
            description="Os dados não foram substituídos por zeros. Tente atualizar a página em alguns instantes."
          />
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              {cards.map((card) => (
                <DashboardMetricCard
                  key={card.label}
                  icon={card.icon}
                  label={card.label}
                  value={card.value}
                  status={card.status}
                  tone={card.tone}
                  trend={card.trend}
                />
              ))}
            </section>

            <CompanyDashboardCharts data={dashboardCharts} />

            {selection.view === "operational" ? (
              operationsDataError ? (
                <DashboardUnavailable
                  title="Operação em tempo real indisponível"
                  description="Não foi possível carregar solicitações online e fila de espera agora."
                />
              ) : (
                <CompanyOperationsPanel
                  onlineRequests={onlineRequestsResult.data ?? []}
                  waitlist={waitlistResult.data ?? []}
                  canConfirmOnlineRequests={canManageOnlineRequests}
                  canRejectOnlineRequests={canRejectOnlineRequests}
                />
              )
            ) : null}
          </>
        )
      ) : (
        <DashboardUnavailable
          title="Indicadores indisponíveis"
          description="Seu perfil não possui permissão para visualizar os dados da agenda."
        />
      )}
    </div>
  );
}
