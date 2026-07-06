import {
  Archive,
  ArrowDown,
  ArrowUp,
  Building2,
  ClipboardCheck,
  PhoneOff,
  ShieldAlert,
  TrendingUp,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
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
import { FadeInDiv } from "@/components/ui/animated";
import { Badge } from "@/components/ui/badge";
import { SummaryBarChart } from "@/components/ui/summary-chart";
import { getRequestContext } from "@/lib/auth/context";
import { categoricalColors, chartSeries } from "@/lib/colors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type OrganizationMetric = {
  status: string;
};

type PatientMetric = {
  id: string;
  full_name: string;
  social_name: string | null;
  birth_date: string | null;
  sex_at_birth: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
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
  cancellation_reason: string | null;
};

type AppointmentStatusEventMetric = {
  appointment_id: string;
  actor_user_id: string | null;
};

type NamedMetric = {
  id: string;
  name: string;
};

type MetricTone = "primary" | "success" | "warning" | "destructive" | "neutral";
type MetricTrend = { delta: number; label: string };

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
  delay,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  status: string;
  tone: MetricTone;
  trend?: MetricTrend;
  delay: number;
}) {
  return (
    <FadeInDiv
      delay={delay}
      className="animate-panel-enter rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:border-border-strong hover:shadow-[var(--shadow-hover)]"
      style={{ animationDelay: `${delay * 1000}ms` }}
    >
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
              trend.delta > 0
                ? "text-success-foreground"
                : trend.delta < 0
                  ? "text-destructive-foreground"
                  : "text-muted-foreground",
            )}
          >
            {trend.delta > 0 ? (
              <ArrowUp className="size-3" aria-hidden="true" />
            ) : trend.delta < 0 ? (
              <ArrowDown className="size-3" aria-hidden="true" />
            ) : null}
            {trend.delta > 0 ? `+${trend.delta}` : trend.delta}{" "}
            <span className="font-normal text-muted-foreground">
              {trend.label}
            </span>
          </span>
        ) : null}
      </div>
    </FadeInDiv>
  );
}

export default async function DashboardPage() {
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
        {platformCards.map((card, index) => (
          <DashboardMetricCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            status={card.status}
            tone={card.tone}
            delay={index * 0.05}
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
  patients,
  appointments,
  cancellationEvents,
  procedures,
  insurances,
  periodStart,
  periodEnd,
}: {
  patients: PatientMetric[];
  appointments: AppointmentMetric[];
  cancellationEvents: AppointmentStatusEventMetric[];
  procedures: Map<string, string>;
  insurances: Map<string, string>;
  periodStart: Date;
  periodEnd: Date;
}): CompanyDashboardChartsData {
  const activeAppointments = appointments.filter(
    (appointment) => !["cancelled", "no_show"].includes(appointment.status),
  );
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const newAppointmentCount = activeAppointments.filter((appointment) => {
    const patient = patientById.get(appointment.patient_id);
    return patient ? new Date(patient.created_at) >= periodStart : false;
  }).length;
  const cancellationEventByAppointment = new Map(
    cancellationEvents.map((event) => [event.appointment_id, event]),
  );
  const procedureCounts = countBy(
    activeAppointments,
    (appointment) =>
      procedures.get(appointment.procedure_id) ?? "Sem procedimento",
  );
  const insuranceAppointments = activeAppointments.filter(
    (appointment) => appointment.health_insurance_id,
  );
  const insuranceNameCounts = countBy(
    insuranceAppointments,
    (appointment) =>
      insurances.get(appointment.health_insurance_id ?? "") ?? "Convenio",
  );
  const insuranceStatusCounts = new Map<string, number>([
    ["Sem convenio", activeAppointments.length - insuranceAppointments.length],
    ["Com convenio", insuranceAppointments.length],
  ]);
  const noShows = appointments.filter(
    (appointment) => appointment.status === "no_show",
  ).length;
  const cancelledAppointments = appointments.filter(
    (appointment) => appointment.status === "cancelled",
  );
  const patientCancellations = cancelledAppointments.filter((appointment) => {
    const reason = appointment.cancellation_reason?.toLowerCase() ?? "";
    const event = cancellationEventByAppointment.get(appointment.id);
    return (
      !event?.actor_user_id ||
      reason.includes("paciente") ||
      reason.includes("online")
    );
  }).length;
  const clinicCancellations = Math.max(
    0,
    cancelledAppointments.length - patientCancellations,
  );

  const durationValues = activeAppointments
    .map((appointment) => appointmentDurationMinutes(appointment))
    .filter((value): value is number => value != null && value > 0);
  const particularDurations = activeAppointments
    .filter((appointment) => !appointment.health_insurance_id)
    .map((appointment) => appointmentDurationMinutes(appointment))
    .filter((value): value is number => value != null && value > 0);
  const insuranceDurations = activeAppointments
    .filter((appointment) => appointment.health_insurance_id)
    .map((appointment) => appointmentDurationMinutes(appointment))
    .filter((value): value is number => value != null && value > 0);

  return {
    patients: {
      newCount: newAppointmentCount,
      recurringCount: Math.max(
        0,
        activeAppointments.length - newAppointmentCount,
      ),
      maleCount: patients.filter((patient) => patient.sex_at_birth === "male")
        .length,
      femaleCount: patients.filter(
        (patient) => patient.sex_at_birth === "female",
      ).length,
    },
    procedures: {
      total: activeAppointments.length,
      slices: toSlices(procedureCounts, chartSeries),
    },
    insurances: {
      total: activeAppointments.length,
      slices: toSlices(insuranceStatusCounts, chartSeries),
      breakdown: toPercentageSlices(
        insuranceNameCounts,
        Math.max(1, insuranceAppointments.length),
        chartSeries,
      ),
    },
    duration: {
      averageMinutes: average(durationValues),
      byType: [
        {
          label: "Particular",
          value: Math.round(average(particularDurations) ?? 0),
        },
        {
          label: "Convênio",
          value: Math.round(average(insuranceDurations) ?? 0),
        },
      ],
    },
    cancellations: {
      noShows,
      clinicCancellations,
      patientCancellations,
      noShowRate: percent(noShows, appointments.length),
      clinicCancellationRate: percent(clinicCancellations, appointments.length),
      patientCancellationRate: percent(
        patientCancellations,
        appointments.length,
      ),
    },
    periodAttendances: buildPeriodPoints(
      periodStart,
      periodEnd,
      activeAppointments.map((appointment) => appointment.start_at),
    ),
    ageDistribution: buildAgeDistribution(patients, periodEnd),
    birthdays: buildBirthdays(patients, periodEnd),
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

function appointmentDurationMinutes(appointment: AppointmentMetric) {
  const start = new Date(appointment.start_at).getTime();
  const end = new Date(appointment.end_at).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  return Math.round((end - start) / 60000);
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildPeriodPoints(
  periodStart: Date,
  periodEnd: Date,
  dates: string[],
) {
  const counts = new Map<string, number>();

  for (const value of dates) {
    const key = dateKey(new Date(value));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points = [];
  const cursor = new Date(periodStart);

  while (cursor <= periodEnd) {
    const key = dateKey(cursor);
    points.push({
      label: formatShortDate(cursor),
      value: counts.get(key) ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
}

function buildAgeDistribution(patients: PatientMetric[], today: Date) {
  const counts = new Map<string, number>();

  for (const patient of patients) {
    const age = calculateAge(patient.birth_date, today);
    if (age == null) continue;
    counts.set(String(age), (counts.get(String(age)) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([label, value]) => ({ label, value }));
}

function buildBirthdays(patients: PatientMetric[], today: Date) {
  const month = today.getMonth() + 1;
  const day = today.getDate();

  return patients
    .filter((patient) => {
      if (!patient.birth_date) return false;
      const [, birthMonth, birthDay] = patient.birth_date
        .split("-")
        .map(Number);
      return birthMonth === month && birthDay === day;
    })
    .map((patient) => ({
      id: patient.id,
      name: patient.social_name || patient.full_name,
      age: calculateAge(patient.birth_date, today),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function calculateAge(birthDate: string | null, today: Date) {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || !month || !day) return null;

  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hadBirthday) age -= 1;

  return age;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

async function CompanyDashboard({
  organization,
  canViewPatients,
  canViewAgenda,
  canManageOnlineRequests,
  canRejectOnlineRequests,
}: {
  organization: { id: string; name: string } | null;
  canViewPatients: boolean;
  canViewAgenda: boolean;
  canManageOnlineRequests: boolean;
  canRejectOnlineRequests: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 30);
  periodStart.setHours(0, 0, 0, 0);
  const [
    patientsResult,
    onlineRequestsResult,
    waitlistResult,
    appointmentsResult,
    proceduresResult,
    insurancesResult,
  ] = organization
    ? await Promise.all([
        canViewPatients
          ? supabase
              .from("patients")
              .select(
                "id, full_name, social_name, birth_date, sex_at_birth, phone, whatsapp, email, deleted_at, created_at",
              )
              .eq("organization_id", organization.id)
              .returns<PatientMetric[]>()
          : Promise.resolve({ data: [] as PatientMetric[] }),
        canViewAgenda
          ? supabase
              .from("online_booking_requests")
              .select(
                "id, requested_start_at, requested_end_at, patient_name, patient_email, patient_phone, patient_notes, procedures(name), professionals(name), units(name), health_insurances(name)",
              )
              .eq("organization_id", organization.id)
              .eq("status", "requested")
              .order("requested_start_at")
              .returns<DashboardOnlineRequest[]>()
          : Promise.resolve({ data: [] as DashboardOnlineRequest[] }),
        canViewAgenda
          ? supabase
              .from("waitlist_entries")
              .select(
                "id, preferred_period, notes, created_at, patients(full_name, social_name), procedures(name), professionals(name)",
              )
              .eq("organization_id", organization.id)
              .in("status", ["waiting", "contacted"])
              .order("created_at")
              .returns<DashboardWaitlistEntry[]>()
          : Promise.resolve({ data: [] as DashboardWaitlistEntry[] }),
        canViewAgenda
          ? supabase
              .from("appointments")
              .select(
                "id, patient_id, procedure_id, health_insurance_id, status, start_at, end_at, cancellation_reason",
              )
              .eq("organization_id", organization.id)
              .gte("start_at", periodStart.toISOString())
              .lte("start_at", periodEnd.toISOString())
              .order("start_at")
              .returns<AppointmentMetric[]>()
          : Promise.resolve({ data: [] as AppointmentMetric[] }),
        canViewAgenda
          ? supabase
              .from("procedures")
              .select("id, name")
              .eq("organization_id", organization.id)
              .returns<NamedMetric[]>()
          : Promise.resolve({ data: [] as NamedMetric[] }),
        canViewAgenda
          ? supabase
              .from("health_insurances")
              .select("id, name")
              .eq("organization_id", organization.id)
              .returns<NamedMetric[]>()
          : Promise.resolve({ data: [] as NamedMetric[] }),
      ])
    : [
        { data: [] as PatientMetric[] },
        { data: [] as DashboardOnlineRequest[] },
        { data: [] as DashboardWaitlistEntry[] },
        { data: [] as AppointmentMetric[] },
        { data: [] as NamedMetric[] },
        { data: [] as NamedMetric[] },
      ];
  const patients = patientsResult.data ?? [];
  const activePatients = patients.filter((patient) => !patient.deleted_at);
  const appointments = appointmentsResult.data ?? [];
  const procedures = new Map(
    (proceduresResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const insurances = new Map(
    (insurancesResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const appointmentIds = appointments.map((appointment) => appointment.id);
  const cancellationEventsResult =
    canViewAgenda && organization && appointmentIds.length
      ? await supabase
          .from("appointment_status_events")
          .select("appointment_id, actor_user_id")
          .eq("organization_id", organization.id)
          .eq("to_status", "cancelled")
          .in("appointment_id", appointmentIds)
          .order("created_at", { ascending: true })
          .returns<AppointmentStatusEventMetric[]>()
      : { data: [] as AppointmentStatusEventMetric[] };
  const dashboardCharts = buildCompanyDashboardCharts({
    patients: activePatients,
    appointments,
    cancellationEvents: cancellationEventsResult.data ?? [],
    procedures,
    insurances,
    periodStart,
    periodEnd,
  });
  const previousPeriodStart = new Date(periodStart);
  previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);
  const newPatientsCount = activePatients.filter(
    (patient) => new Date(patient.created_at) >= periodStart,
  ).length;
  const previousNewPatientsCount = activePatients.filter((patient) => {
    const createdAt = new Date(patient.created_at);
    return createdAt >= previousPeriodStart && createdAt < periodStart;
  }).length;

  const cards: Array<{
    label: string;
    value: string;
    icon: LucideIcon;
    status: string;
    tone: MetricTone;
    trend?: MetricTrend;
  }> = [
    {
      label: "Pacientes ativos",
      value: String(activePatients.length),
      icon: UsersRound,
      status: "cadastro",
      tone: "primary",
    },
    {
      label: "Novos em 30 dias",
      value: String(newPatientsCount),
      icon: UserPlus,
      status: "crescimento",
      tone: "success",
      trend: {
        delta: newPatientsCount - previousNewPatientsCount,
        label: "vs. período anterior",
      },
    },
    {
      label: "Sem contato",
      value: String(
        activePatients.filter(
          (patient) => !patient.phone && !patient.whatsapp && !patient.email,
        ).length,
      ),
      icon: PhoneOff,
      status: "atenção",
      tone: "warning",
    },
    {
      label: "Arquivados",
      value: String(patients.length - activePatients.length),
      icon: Archive,
      status: "histórico",
      tone: "neutral",
    },
  ];

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-xl font-semibold">Painel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão inicial da operação de {organization?.name ?? "sua empresa"}.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {cards.map((card, index) => (
          <DashboardMetricCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            status={card.status}
            tone={card.tone}
            trend={card.trend}
            delay={index * 0.05}
          />
        ))}
      </section>

      <CompanyDashboardCharts data={dashboardCharts} />

      {canViewAgenda ? (
        <CompanyOperationsPanel
          onlineRequests={onlineRequestsResult.data ?? []}
          waitlist={waitlistResult.data ?? []}
          canConfirmOnlineRequests={canManageOnlineRequests}
          canRejectOnlineRequests={canRejectOnlineRequests}
        />
      ) : null}
    </div>
  );
}
