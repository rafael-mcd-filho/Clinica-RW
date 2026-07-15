import { redirect } from "next/navigation";
import type { AgendaSettingsData } from "../agenda-settings";
import type {
  OnlineBookingProfileData,
  OnlineBookingSettingsData,
} from "../online-booking-settings";
import type { WeeklyAvailabilitySettingsData } from "../weekly-availability-settings";
import { normalizeAgendaTimeZone } from "@/lib/agenda/range";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const patientAutomationTriggerTypes = [
  "new_patient",
  "appointment_scheduled",
  "first_visit",
  "revenue_threshold",
  "birthday",
  "appointment_before",
  "appointment_day",
  "appointment_completed",
] as const;

export type PatientAutomationTriggerType =
  (typeof patientAutomationTriggerTypes)[number];
export type PatientAutomationActionType = "add_tag" | "remove_tag";

export type PatientTagSettingsData = {
  id: string;
  name: string;
  color: string;
};

export type PatientAutomationScheduleData = {
  id: string;
  name: string;
  professional_id: string | null;
};

export type PatientAutomationProfessionalData = {
  id: string;
  name: string;
};

export type PatientAutomationRuleData = {
  id: string;
  name: string;
  trigger_type: PatientAutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: PatientAutomationActionType;
  action_config: Record<string, unknown> & { tag_id: string };
  active: boolean;
  created_at: string;
  // Campos de leitura mantidos enquanto componentes antigos são migrados.
  tag_id: string;
  duration_days: number | null;
  config: Record<string, unknown>;
};

export type PatientTagAutomationData = {
  tags: PatientTagSettingsData[];
  rules: PatientAutomationRuleData[];
  schedules: PatientAutomationScheduleData[];
  professionals: PatientAutomationProfessionalData[];
};

type PatientAutomationRuleRow = {
  id: string;
  name: string;
  event_type: PatientAutomationTriggerType;
  conditions: unknown;
  action_type: PatientAutomationActionType;
  action_config: unknown;
  active: boolean;
  created_at: string;
};

export type CompanyConfigurationRoute =
  | "cadastros"
  | "agenda"
  | "agendamento-online"
  | "tags-automacoes"
  | "modelos-clinicos";

export const companyConfigurationPaths: Record<
  CompanyConfigurationRoute,
  string
> = {
  cadastros: "/configuracoes/cadastros",
  agenda: "/configuracoes/agenda",
  "agendamento-online": "/configuracoes/agendamento-online",
  "tags-automacoes": "/configuracoes/tags-automacoes",
  "modelos-clinicos": "/configuracoes/modelos-clinicos",
};

const configurationPermissionCodes = [
  "config.geral",
  "config.usuarios",
  "config.integracoes",
  "config.plano",
  "agenda.configurar",
  "agenda.bloquear_horario",
  "clinico.criar_template",
];

type RequestContext = Awaited<ReturnType<typeof getRequestContext>>;
type Organization = NonNullable<RequestContext["organization"]>;

export type CompanyConfigurationAccess = {
  kind: "company";
  organization: Organization;
  canManageCompany: boolean;
  canConfigureAgenda: boolean;
  canBlockAgenda: boolean;
  canManageOnlineBooking: boolean;
  canCreateClinicalTemplate: boolean;
};

type PlatformConfigurationAccess = {
  kind: "platform";
};

export type ConfigurationAccess =
  | CompanyConfigurationAccess
  | PlatformConfigurationAccess;

export async function getConfigurationAccess(): Promise<ConfigurationAccess> {
  const context = await getRequestContext();

  if (context.isSuperAdmin) {
    return { kind: "platform" };
  }

  if (
    !context.organization ||
    !hasAnyPermission(context.permissionCodes, configurationPermissionCodes)
  ) {
    redirect("/dashboard");
  }

  const canManageCompany = context.permissionCodes.has("config.geral");
  const canConfigureAgenda = context.permissionCodes.has("agenda.configurar");
  const canBlockAgenda = context.permissionCodes.has("agenda.bloquear_horario");

  return {
    kind: "company",
    organization: context.organization,
    canManageCompany,
    canConfigureAgenda,
    canBlockAgenda,
    canManageOnlineBooking: canManageCompany || canConfigureAgenda,
    canCreateClinicalTemplate: context.permissionCodes.has(
      "clinico.criar_template",
    ),
  };
}

export function getFirstCompanyConfigurationPath(
  access: CompanyConfigurationAccess,
) {
  if (access.canManageCompany) {
    return companyConfigurationPaths.cadastros;
  }
  if (access.canConfigureAgenda || access.canBlockAgenda) {
    return companyConfigurationPaths.agenda;
  }
  if (access.canManageOnlineBooking) {
    return companyConfigurationPaths["agendamento-online"];
  }
  if (access.canCreateClinicalTemplate) {
    return companyConfigurationPaths["modelos-clinicos"];
  }
  return null;
}

export function canAccessCompanyConfigurationRoute(
  access: CompanyConfigurationAccess,
  route: CompanyConfigurationRoute,
) {
  switch (route) {
    case "cadastros":
    case "tags-automacoes":
      return access.canManageCompany;
    case "agenda":
      return access.canConfigureAgenda || access.canBlockAgenda;
    case "agendamento-online":
      return access.canManageOnlineBooking;
    case "modelos-clinicos":
      return access.canCreateClinicalTemplate;
  }
}

export async function requireCompanyConfigurationAccess(
  route: CompanyConfigurationRoute,
) {
  const access = await getConfigurationAccess();

  if (access.kind === "platform") {
    redirect("/configuracoes/plataforma");
  }

  if (!canAccessCompanyConfigurationRoute(access, route)) {
    redirect(getFirstCompanyConfigurationPath(access) ?? "/configuracoes");
  }

  return access;
}

export async function requirePlatformConfigurationAccess() {
  const access = await getConfigurationAccess();

  if (access.kind === "company") {
    redirect(getFirstCompanyConfigurationPath(access) ?? "/configuracoes");
  }

  return access;
}

export async function getAgendaSettingsData(
  organizationId: string,
): Promise<AgendaSettingsData> {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const [
    schedules,
    professionals,
    units,
    availabilities,
    blocks,
    organizationSettings,
    onlineScheduleSettings,
    onlineScheduleProcedures,
    procedures,
  ] = await Promise.all([
    supabase
      .from("schedules")
      .select("id, professional_id, unit_id, name, color, active")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("name")
      .returns<
        Array<
          Pick<
            AgendaSettingsData["schedules"][number],
            "id" | "professional_id" | "unit_id" | "name" | "color" | "active"
          >
        >
      >(),
    supabase
      .from("professionals")
      .select("id, name, active")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("name")
      .returns<AgendaSettingsData["professionals"]>(),
    supabase
      .from("units")
      .select("id, name, active")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("name")
      .returns<AgendaSettingsData["units"]>(),
    supabase
      .from("schedule_availability")
      .select("id, schedule_id, weekday, start_time, end_time, slot_minutes")
      .eq("organization_id", organizationId)
      .order("weekday")
      .order("start_time"),
    supabase
      .from("schedule_blocks")
      .select("id, schedule_id, start_at, end_at, reason")
      .eq("organization_id", organizationId)
      .gte("end_at", now)
      .order("start_at")
      .limit(100),
    supabase
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle<{ timezone: string | null }>(),
    supabase
      .from("schedule_online_booking_settings")
      .select(
        "schedule_id, enabled, min_notice_hours, max_days_ahead, cancellation_notice_hours",
      )
      .eq("organization_id", organizationId)
      .returns<
        Array<{
          schedule_id: string;
          enabled: boolean;
          min_notice_hours: number;
          max_days_ahead: number;
          cancellation_notice_hours: number;
        }>
      >(),
    supabase
      .from("schedule_online_booking_procedures")
      .select("schedule_id, procedure_id")
      .eq("organization_id", organizationId)
      .returns<AgendaSettingsData["procedureAssignments"]>(),
    supabase
      .from("procedures")
      .select("id, name, duration_minutes")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .returns<AgendaSettingsData["procedures"]>(),
  ]);

  const settingsBySchedule = new Map(
    (onlineScheduleSettings.data ?? []).map((settings) => [
      settings.schedule_id,
      settings,
    ]),
  );
  const availabilityRows =
    (availabilities.data as AgendaSettingsData["availabilities"] | null) ?? [];
  const slotBySchedule = new Map<string, number>();
  for (const schedule of schedules.data ?? []) {
    const counts = new Map<number, number>();
    for (const row of availabilityRows) {
      if (row.schedule_id !== schedule.id) continue;
      counts.set(row.slot_minutes, (counts.get(row.slot_minutes) ?? 0) + 1);
    }
    const mostCommon = [...counts.entries()].sort(
      ([slotA, countA], [slotB, countB]) => countB - countA || slotA - slotB,
    )[0]?.[0];
    slotBySchedule.set(schedule.id, mostCommon ?? 30);
  }

  return {
    timeZone: normalizeAgendaTimeZone(organizationSettings.data?.timezone),
    schedules: (schedules.data ?? []).map((schedule) => {
      const settings = settingsBySchedule.get(schedule.id);
      return {
        ...schedule,
        online_enabled: settings?.enabled ?? false,
        min_notice_hours: settings?.min_notice_hours ?? 24,
        max_days_ahead: settings?.max_days_ahead ?? 30,
        cancellation_notice_hours: settings?.cancellation_notice_hours ?? 24,
        slot_minutes: slotBySchedule.get(schedule.id) ?? 30,
      };
    }),
    professionals: professionals.data ?? [],
    units: units.data ?? [],
    procedures: procedures.data ?? [],
    procedureAssignments: onlineScheduleProcedures.data ?? [],
    availabilities: availabilityRows,
    blocks: blocks.data ?? [],
  } satisfies AgendaSettingsData;
}

async function getOnlineBookingProfileData(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
): Promise<OnlineBookingProfileData> {
  const [healthInsurances, paymentMethods, reviews] = await Promise.all([
    supabase
      .from("health_insurances")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .returns<OnlineBookingProfileData["healthInsurances"]>(),
    supabase
      .from("payment_methods")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .returns<OnlineBookingProfileData["paymentMethods"]>(),
    supabase
      .from("online_booking_reviews")
      .select(
        "id, patient_display_name, rating, title, body, tags, source_label, verified, highlighted, active, review_date, professional_response",
      )
      .eq("organization_id", organizationId)
      .order("review_date", { ascending: false })
      .limit(20)
      .returns<OnlineBookingProfileData["reviews"]>(),
  ]);

  return {
    healthInsurances: healthInsurances.data ?? [],
    paymentMethods: paymentMethods.data ?? [],
    reviews: reviews.data ?? [],
  };
}

export async function getOnlineBookingSettingsData(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const [onlineSettings, profile, schedules, availabilities] =
    await Promise.all([
      supabase
        .from("online_booking_settings")
        .select(
          "id, public_slug, enabled, min_notice_hours, max_days_ahead, cancellation_notice_hours, max_requests_per_contact_day, max_no_shows_180_days, require_contact_verification, contact_verification_ttl_minutes, public_instructions, cancellation_policy, profile_headline, profile_summary, experience_text, education_count, accepted_plan_count, excellence_badge_year, treated_conditions, patient_groups, consultation_formats, profile_highlights, accepted_health_insurance_ids, accepted_payment_method_ids, accepted_plan_notes",
        )
        .eq("organization_id", organizationId)
        .maybeSingle<OnlineBookingSettingsData>(),
      getOnlineBookingProfileData(supabase, organizationId),
      supabase
        .from("schedules")
        .select("id, name, active")
        .eq("organization_id", organizationId)
        .order("active", { ascending: false })
        .order("name")
        .returns<WeeklyAvailabilitySettingsData["schedules"]>(),
      supabase
        .from("schedule_availability")
        .select("id, schedule_id, weekday, start_time, end_time, slot_minutes")
        .eq("organization_id", organizationId)
        .order("weekday")
        .order("start_time")
        .returns<WeeklyAvailabilitySettingsData["availabilities"]>(),
    ]);

  return {
    settings: onlineSettings.data ?? null,
    healthInsurances: profile.healthInsurances,
    paymentMethods: profile.paymentMethods,
    reviews: profile.reviews,
    availability: {
      schedules: schedules.data ?? [],
      availabilities: availabilities.data ?? [],
    },
  };
}

export async function getPatientTagAutomationData(
  organizationId: string,
): Promise<PatientTagAutomationData> {
  const supabase = await createSupabaseServerClient();
  const [tagsResult, rulesResult, schedulesResult, professionalsResult] =
    await Promise.all([
      supabase
        .from("tags")
        .select("id, name, color")
        .eq("organization_id", organizationId)
        .order("name")
        .returns<PatientTagSettingsData[]>(),
      supabase
        .from("automation_rules")
        .select(
          "id, name, event_type, conditions, action_type, action_config, active, created_at",
        )
        .eq("organization_id", organizationId)
        .in("action_type", ["add_tag", "remove_tag"])
        .order("created_at", { ascending: false })
        .returns<PatientAutomationRuleRow[]>(),
      supabase
        .from("schedules")
        .select("id, name, professional_id")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name")
        .returns<PatientAutomationScheduleData[]>(),
      supabase
        .from("professionals")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name")
        .returns<PatientAutomationProfessionalData[]>(),
    ]);

  return {
    tags: tagsResult.data ?? [],
    rules: (rulesResult.data ?? []).map(normalizePatientAutomationRule),
    schedules: schedulesResult.data ?? [],
    professionals: professionalsResult.data ?? [],
  };
}

function normalizePatientAutomationRule(
  row: PatientAutomationRuleRow,
): PatientAutomationRuleData {
  const triggerConfig = asObject(row.conditions);
  const actionConfig = asObject(row.action_config);
  const tagId =
    typeof actionConfig.tag_id === "string" ? actionConfig.tag_id : "";
  const durationDays = nullableNumber(actionConfig.duration_days);
  const daysBefore = nullableNumber(triggerConfig.days_before);
  const legacyConfig: Record<string, unknown> = { ...triggerConfig };

  if (daysBefore != null) {
    legacyConfig.days_before = daysBefore;
    legacyConfig.days_offset = daysBefore;
  }

  return {
    id: row.id,
    name: row.name,
    trigger_type: row.event_type,
    trigger_config: triggerConfig,
    action_type: row.action_type,
    action_config: { ...actionConfig, tag_id: tagId },
    active: row.active,
    created_at: row.created_at,
    tag_id: tagId,
    duration_days: durationDays,
    config: legacyConfig,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
