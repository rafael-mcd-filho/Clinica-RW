"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import {
  createQuickPatient,
  type QuickPatientActionState,
} from "@/lib/patients/quick-create";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AgendaActionState = {
  error?: string;
  success?: string;
  ok?: boolean;
};

async function requireAgendaPermission(code: string) {
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has(code)) return null;
  return context;
}

function friendlyError(message: string, code?: string) {
  if (code === "23P01" || message.includes("exclusion constraint")) {
    return "Este horário conflita com outro agendamento do profissional ou da sala.";
  }
  if (message.includes("slot is not available")) {
    return "Este horário não está mais disponível.";
  }
  if (message.includes("request limit")) {
    return "Este contato atingiu o limite de solicitações nas últimas 24 horas.";
  }
  if (message.includes("no-show history")) {
    return "O agendamento online foi bloqueado por histórico recente de faltas.";
  }
  if (message.includes("outside schedule availability")) {
    return "Este horário está fora da disponibilidade configurada.";
  }
  if (message.includes("schedule block")) {
    return "Este horário está bloqueado na agenda.";
  }
  if (
    message.includes("created_by_user_id") ||
    message.includes("reviewed_by_user_id")
  ) {
    return "Não foi possível vincular o usuário revisor. Aplique as migrations mais recentes e tente novamente.";
  }
  if (message.includes("health_insurance")) {
    return "O convênio da solicitação não está mais disponível.";
  }
  if (message.includes("schedule_id")) {
    return "A agenda vinculada à solicitação não está mais disponível.";
  }
  if (message.includes("procedure_id")) {
    return "O procedimento vinculado à solicitação não está mais disponível.";
  }
  if (message.includes("professional_id")) {
    return "O profissional vinculado à solicitação não está mais disponível.";
  }
  if (message.includes("unit_id")) {
    return "A unidade vinculada à solicitação não está mais disponível.";
  }
  if (
    message.includes("appointments_payment_method_fk") ||
    message.includes("payment_method_id")
  ) {
    return "Forma de pagamento invalida.";
  }
  if (message.includes("foreign key")) {
    return "Um dos cadastros vinculados à solicitação é inválido.";
  }
  if (message.includes("Not allowed to create clinical encounter")) {
    return "Seu perfil nao possui permissao para iniciar atendimento clinico.";
  }
  if (message.includes("Professional scope denied")) {
    return "Seu perfil so pode iniciar atendimentos do proprio profissional.";
  }
  return message;
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function parseLocalDateTime(value: string) {
  const parsed = new Date(`${value}:00-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function listFromText(value: string | undefined, limit = 24) {
  return (value ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

export async function createQuickPatientFromAgenda(
  state: QuickPatientActionState,
  formData: FormData,
): Promise<QuickPatientActionState> {
  const result = await createQuickPatient("agenda", state, formData);
  if (result.success) revalidatePath("/agenda");
  return result;
}

export async function createSchedule(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const context = await requireAgendaPermission("agenda.configurar");
  if (!context?.organization) return { error: "Acesso negado." };
  const parsed = z
    .object({
      professional_id: z.string().uuid(),
      unit_id: z.string().uuid(),
      name: z.string().trim().min(2),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: "Preencha profissional, unidade e nome da agenda." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("schedules").insert({
    organization_id: context.organization.id,
    ...parsed.data,
  });
  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/agenda");
  revalidatePath("/configuracoes");
  return { success: "Agenda criada." };
}

export async function updateOnlineBookingSettings(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !(
      context.permissionCodes.has("agenda.configurar") ||
      context.permissionCodes.has("config.geral")
    )
  ) {
    return { error: "Acesso negado." };
  }

  const parsed = z
    .object({
      enabled: z.boolean(),
      public_slug: z
        .string()
        .trim()
        .min(3)
        .max(64)
        .transform(normalizeSlug)
        .pipe(z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/)),
      min_notice_hours: z.coerce.number().int().min(0).max(720),
      max_days_ahead: z.coerce.number().int().min(1).max(365),
      cancellation_notice_hours: z.coerce.number().int().min(0).max(720),
      max_requests_per_contact_day: z.coerce.number().int().min(1).max(20),
      max_no_shows_180_days: z.coerce.number().int().min(0).max(20),
      require_contact_verification: z.boolean(),
      contact_verification_ttl_minutes: z.coerce.number().int().min(5).max(120),
      public_instructions: z.string().trim().max(700).optional(),
      cancellation_policy: z.string().trim().max(700).optional(),
      profile_headline: z.string().trim().max(140).optional(),
      profile_summary: z.string().trim().max(500).optional(),
      experience_text: z.string().trim().max(1500).optional(),
      accepted_plan_notes: z.string().trim().max(500).optional(),
      education_count: z.coerce.number().int().min(0).max(99),
      accepted_plan_count: z.coerce.number().int().min(0).max(999),
      excellence_badge_year: z.union([
        z.coerce.number().int().min(1900).max(3000),
        z.literal(""),
      ]),
    })
    .safeParse({
      enabled: formData.get("enabled") === "on",
      public_slug: formData.get("public_slug"),
      min_notice_hours: formData.get("min_notice_hours"),
      max_days_ahead: formData.get("max_days_ahead"),
      cancellation_notice_hours: formData.get("cancellation_notice_hours"),
      max_requests_per_contact_day: formData.get(
        "max_requests_per_contact_day",
      ),
      max_no_shows_180_days: formData.get("max_no_shows_180_days"),
      require_contact_verification:
        formData.get("require_contact_verification") === "on",
      contact_verification_ttl_minutes: formData.get(
        "contact_verification_ttl_minutes",
      ),
      public_instructions: formData.get("public_instructions") || undefined,
      cancellation_policy: formData.get("cancellation_policy") || undefined,
      profile_headline: formData.get("profile_headline") || undefined,
      profile_summary: formData.get("profile_summary") || undefined,
      experience_text: formData.get("experience_text") || undefined,
      accepted_plan_notes: formData.get("accepted_plan_notes") || undefined,
      education_count: formData.get("education_count") || 0,
      accepted_plan_count: formData.get("accepted_plan_count") || 0,
      excellence_badge_year: formData.get("excellence_badge_year") || "",
    });

  if (!parsed.success) {
    return { error: "Revise link publico, janela e politica de agenda." };
  }

  const acceptedHealthInsuranceIds = formData
    .getAll("accepted_health_insurance_ids")
    .filter((value): value is string => typeof value === "string");
  const acceptedPaymentMethodIds = formData
    .getAll("accepted_payment_method_ids")
    .filter((value): value is string => typeof value === "string");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("online_booking_settings")
    .update({
      enabled: parsed.data.enabled,
      public_slug: parsed.data.public_slug,
      min_notice_hours: parsed.data.min_notice_hours,
      max_days_ahead: parsed.data.max_days_ahead,
      cancellation_notice_hours: parsed.data.cancellation_notice_hours,
      max_requests_per_contact_day: parsed.data.max_requests_per_contact_day,
      max_no_shows_180_days: parsed.data.max_no_shows_180_days,
      require_contact_verification: parsed.data.require_contact_verification,
      contact_verification_ttl_minutes:
        parsed.data.contact_verification_ttl_minutes,
      public_instructions: parsed.data.public_instructions || null,
      cancellation_policy: parsed.data.cancellation_policy || null,
      profile_headline: parsed.data.profile_headline || null,
      profile_summary: parsed.data.profile_summary || null,
      experience_text: parsed.data.experience_text || null,
      accepted_plan_notes: parsed.data.accepted_plan_notes || null,
      education_count: parsed.data.education_count,
      accepted_plan_count: parsed.data.accepted_plan_count,
      excellence_badge_year: parsed.data.excellence_badge_year || null,
      treated_conditions: listFromText(
        String(formData.get("treated_conditions") ?? ""),
      ),
      patient_groups: listFromText(
        String(formData.get("patient_groups") ?? ""),
      ),
      consultation_formats: listFromText(
        String(formData.get("consultation_formats") ?? ""),
      ),
      profile_highlights: listFromText(
        String(formData.get("profile_highlights") ?? ""),
      ),
      accepted_health_insurance_ids: acceptedHealthInsuranceIds,
      accepted_payment_method_ids: acceptedPaymentMethodIds,
    })
    .eq("organization_id", context.organization.id);

  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/agenda");
  revalidatePath("/configuracoes");
  revalidatePath(`/agendar/${parsed.data.public_slug}`);
  return { success: "Agendamento online atualizado." };
}

export async function createOnlineBookingReview(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !(
      context.permissionCodes.has("agenda.configurar") ||
      context.permissionCodes.has("config.geral")
    )
  ) {
    return { error: "Acesso negado." };
  }

  const parsed = z
    .object({
      patient_display_name: z.string().trim().min(2).max(120),
      rating: z.coerce.number().int().min(1).max(5),
      title: z.string().trim().max(120).optional(),
      body: z.string().trim().min(10).max(2000),
      source_label: z.string().trim().max(120).optional(),
      review_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      professional_response: z.string().trim().max(1200).optional(),
      highlighted: z.boolean(),
      active: z.boolean(),
    })
    .safeParse({
      patient_display_name: formData.get("patient_display_name"),
      rating: formData.get("rating"),
      title: formData.get("title") || undefined,
      body: formData.get("body"),
      source_label: formData.get("source_label") || undefined,
      review_date: formData.get("review_date"),
      professional_response: formData.get("professional_response") || undefined,
      highlighted: formData.get("highlighted") === "on",
      active: formData.get("active") !== "off",
    });

  if (!parsed.success) {
    return { error: "Preencha nome, nota, data e depoimento." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase
    .from("online_booking_settings")
    .select("public_slug")
    .eq("organization_id", context.organization.id)
    .maybeSingle<{ public_slug: string }>();
  const { error } = await supabase.from("online_booking_reviews").insert({
    organization_id: context.organization.id,
    patient_display_name: parsed.data.patient_display_name,
    rating: parsed.data.rating,
    title: parsed.data.title || null,
    body: parsed.data.body,
    tags: listFromText(String(formData.get("tags") ?? ""), 12),
    source_label: parsed.data.source_label || null,
    verified: true,
    highlighted: parsed.data.highlighted,
    active: parsed.data.active,
    review_date: parsed.data.review_date,
    professional_response: parsed.data.professional_response || null,
    responded_at: parsed.data.professional_response
      ? new Date().toISOString()
      : null,
  });

  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/configuracoes");
  if (settings?.public_slug) revalidatePath(`/agendar/${settings.public_slug}`);
  return { success: "Avaliação cadastrada." };
}

export async function updateOnlineBookingReview(
  reviewId: string,
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !(
      context.permissionCodes.has("agenda.configurar") ||
      context.permissionCodes.has("config.geral")
    )
  ) {
    return { error: "Acesso negado." };
  }

  const parsed = z
    .object({
      professional_response: z.string().trim().max(1200).optional(),
      highlighted: z.boolean(),
      active: z.boolean(),
    })
    .safeParse({
      professional_response: formData.get("professional_response") || undefined,
      highlighted: formData.get("highlighted") === "on",
      active: formData.get("active") === "on",
    });

  if (!parsed.success) return { error: "Revise a resposta da avaliação." };

  const supabase = await createSupabaseServerClient();
  const { data: settings } = await supabase
    .from("online_booking_settings")
    .select("public_slug")
    .eq("organization_id", context.organization.id)
    .maybeSingle<{ public_slug: string }>();
  const { error } = await supabase
    .from("online_booking_reviews")
    .update({
      professional_response: parsed.data.professional_response || null,
      responded_at: parsed.data.professional_response
        ? new Date().toISOString()
        : null,
      highlighted: parsed.data.highlighted,
      active: parsed.data.active,
    })
    .eq("organization_id", context.organization.id)
    .eq("id", reviewId);

  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/configuracoes");
  if (settings?.public_slug) revalidatePath(`/agendar/${settings.public_slug}`);
  return { success: "Avaliação atualizada." };
}

export async function createScheduleAvailability(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const context = await requireAgendaPermission("agenda.configurar");
  if (!context?.organization) return { error: "Acesso negado." };
  const parsed = z
    .object({
      schedule_id: z.string().uuid(),
      weekday: z.coerce.number().int().min(0).max(6),
      start_time: z.string().regex(/^\d{2}:\d{2}$/),
      end_time: z.string().regex(/^\d{2}:\d{2}$/),
      slot_minutes: z.coerce.number().int().min(5).max(480),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.start_time >= parsed.data.end_time) {
    return { error: "Preencha um período de disponibilidade válido." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("schedule_availability").insert({
    organization_id: context.organization.id,
    ...parsed.data,
  });
  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/agenda");
  revalidatePath("/configuracoes");
  return { success: "Disponibilidade adicionada." };
}

export async function createScheduleBlock(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const context = await requireAgendaPermission("agenda.bloquear_horario");
  if (!context?.organization) return { error: "Acesso negado." };
  const parsed = z
    .object({
      schedule_id: z.string().uuid(),
      start_at: z.string().min(16),
      end_at: z.string().min(16),
      reason: z.string().trim().max(300).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Preencha agenda, início e fim." };
  const startAt = parseLocalDateTime(parsed.data.start_at);
  const endAt = parseLocalDateTime(parsed.data.end_at);
  if (!startAt || !endAt || startAt >= endAt) {
    return { error: "O fim do bloqueio deve ser posterior ao início." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("schedule_blocks").insert({
    organization_id: context.organization.id,
    schedule_id: parsed.data.schedule_id,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    reason: parsed.data.reason || null,
    created_by_user_id: context.effectiveUser?.id ?? null,
  });
  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/agenda");
  revalidatePath("/configuracoes");
  return { success: "Horário bloqueado." };
}

export async function createWaitlistEntry(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !(
      context.permissionCodes.has("agenda.criar_agendamento") ||
      context.permissionCodes.has("agenda.editar_agendamento")
    )
  ) {
    return { error: "Acesso negado." };
  }
  const parsed = z
    .object({
      patient_id: z.string().uuid(),
      procedure_id: z.union([z.string().uuid(), z.literal("")]),
      professional_id: z.union([z.string().uuid(), z.literal("")]),
      preferred_period: z.enum(["morning", "afternoon", "evening", "any"]),
      notes: z.string().trim().max(500).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Selecione o paciente e o período." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("waitlist_entries").insert({
    organization_id: context.organization.id,
    patient_id: parsed.data.patient_id,
    procedure_id: parsed.data.procedure_id || null,
    professional_id: parsed.data.professional_id || null,
    preferred_period: parsed.data.preferred_period,
    notes: parsed.data.notes || null,
  });
  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { success: "Paciente adicionado à fila de espera." };
}

export async function createAppointment(
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const context = await requireAgendaPermission("agenda.criar_agendamento");
  if (!context?.organization) return { error: "Acesso negado." };
  const parsed = z
    .object({
      patient_id: z.string().uuid(),
      schedule_id: z.string().uuid(),
      procedure_id: z.string().uuid(),
      room_id: z.union([z.string().uuid(), z.literal("")]),
      health_insurance_id: z.union([z.string().uuid(), z.literal("")]),
      payment_method_id: z.union([z.string().uuid(), z.literal("")]),
      start_at: z.string().min(16),
      notes: z.string().trim().optional(),
      is_extra: z.boolean(),
    })
    .safeParse({
      patient_id: formData.get("patient_id"),
      schedule_id: formData.get("schedule_id"),
      procedure_id: formData.get("procedure_id"),
      room_id: formData.get("room_id") ?? "",
      health_insurance_id: formData.get("health_insurance_id") ?? "",
      payment_method_id: formData.get("payment_method_id") ?? "",
      start_at: formData.get("start_at"),
      notes: formData.get("notes") || undefined,
      is_extra: formData.get("is_extra") === "on",
    });
  if (!parsed.success)
    return { error: "Preencha paciente, agenda, procedimento e horário." };
  if (parsed.data.is_extra && !context.permissionCodes.has("agenda.encaixar")) {
    return { error: "Seu perfil não permite encaixes." };
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: schedule }, { data: procedure }] = await Promise.all([
    supabase
      .from("schedules")
      .select("professional_id, unit_id")
      .eq("id", parsed.data.schedule_id)
      .eq("organization_id", context.organization.id)
      .single<{ professional_id: string; unit_id: string }>(),
    supabase
      .from("procedures")
      .select("duration_minutes")
      .eq("id", parsed.data.procedure_id)
      .eq("organization_id", context.organization.id)
      .single<{ duration_minutes: number }>(),
  ]);
  if (!schedule || !procedure)
    return { error: "Agenda ou procedimento inválido." };

  const startAt = parseLocalDateTime(parsed.data.start_at);
  if (!startAt) return { error: "Horário inválido." };
  const endAt = new Date(
    startAt.getTime() + procedure.duration_minutes * 60_000,
  );
  const { error } = await supabase.from("appointments").insert({
    organization_id: context.organization.id,
    patient_id: parsed.data.patient_id,
    professional_id: schedule.professional_id,
    unit_id: schedule.unit_id,
    schedule_id: parsed.data.schedule_id,
    procedure_id: parsed.data.procedure_id,
    room_id: parsed.data.room_id || null,
    health_insurance_id: parsed.data.health_insurance_id || null,
    payment_method_id: parsed.data.payment_method_id || null,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    notes: parsed.data.notes || null,
    is_extra: parsed.data.is_extra,
    created_by_user_id: context.effectiveUser?.id ?? null,
  });
  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  revalidatePath("/relatorios/agendamentos");
  return { success: "Agendamento criado." };
}

export async function updateAppointmentPaymentMethod(
  appointmentId: string,
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const context = await requireAgendaPermission("agenda.editar_agendamento");
  if (!context?.organization) return { error: "Acesso negado." };
  const parsed = z
    .object({
      payment_method_id: z.union([z.string().uuid(), z.literal("")]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Selecione uma forma de pagamento valida." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("appointments")
    .update({ payment_method_id: parsed.data.payment_method_id || null })
    .eq("id", appointmentId)
    .eq("organization_id", context.organization.id);

  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  revalidatePath("/relatorios/agendamentos");
  return { success: "Forma de pagamento atualizada." };
}

export async function rescheduleAppointment(
  appointmentId: string,
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const context = await requireAgendaPermission("agenda.editar_agendamento");
  if (!context?.organization) return { error: "Acesso negado." };
  const parsed = z
    .object({ start_at: z.string().min(16) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Informe a nova data e hora." };
  const startAt = parseLocalDateTime(parsed.data.start_at);
  if (!startAt) return { error: "Data e hora inválidas." };

  const supabase = await createSupabaseServerClient();
  const { data: appointment } = await supabase
    .from("appointments")
    .select("procedure_id")
    .eq("id", appointmentId)
    .eq("organization_id", context.organization.id)
    .single<{ procedure_id: string }>();
  if (!appointment) return { error: "Agendamento não encontrado." };

  const { data: procedure } = await supabase
    .from("procedures")
    .select("duration_minutes")
    .eq("id", appointment.procedure_id)
    .eq("organization_id", context.organization.id)
    .single<{ duration_minutes: number }>();
  if (!procedure) return { error: "Procedimento não encontrado." };

  const endAt = new Date(
    startAt.getTime() + procedure.duration_minutes * 60_000,
  );
  const { error } = await supabase
    .from("appointments")
    .update({ start_at: startAt.toISOString(), end_at: endAt.toISOString() })
    .eq("id", appointmentId)
    .eq("organization_id", context.organization.id);
  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  revalidatePath("/relatorios/agendamentos");
  return { success: "Agendamento remarcado." };
}

export async function changeAppointmentStatus(
  appointmentId: string,
  nextStatus: string,
): Promise<void> {
  const context = await requireAgendaPermission("agenda.editar_agendamento");
  if (!context?.organization) return;
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("transition_appointment_status", {
    p_appointment_id: appointmentId,
    p_to_status: nextStatus,
    p_reason: nextStatus === "cancelled" ? "Cancelado pela agenda" : null,
  });
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  revalidatePath("/relatorios/agendamentos");
}

export async function startAppointmentEncounter(
  appointmentId: string,
  _state: AgendaActionState,
  _formData: FormData,
): Promise<AgendaActionState> {
  void _state;
  void _formData;

  const context = await getRequestContext();
  const canOpenClinicalRecord =
    context.permissionCodes.has("clinico.ver_prontuario") ||
    context.permissionCodes.has("clinico.ver_prontuario_proprios");
  if (
    !context.organization ||
    !context.permissionCodes.has("clinico.preencher_prontuario") ||
    !canOpenClinicalRecord
  ) {
    return { error: "Acesso negado." };
  }

  const supabase = createSupabaseAdminClient();
  const { data: appointment } = await supabase
    .from("appointments")
    .select("id, patient_id, professional_id, status")
    .eq("id", appointmentId)
    .eq("organization_id", context.organization.id)
    .maybeSingle<{
      id: string;
      patient_id: string;
      professional_id: string;
      status: string;
    }>();
  if (!appointment) return { error: "Agendamento não encontrado." };

  const { data: professional } = await supabase
    .from("professionals")
    .select("id, user_id")
    .eq("id", appointment.professional_id)
    .eq("organization_id", context.organization.id)
    .eq("active", true)
    .maybeSingle<{ id: string; user_id: string | null }>();
  if (!professional) return { error: "Profissional nao encontrado." };

  if (
    !context.permissionCodes.has("clinico.ver_prontuario") &&
    professional.user_id !== context.effectiveUser?.id
  ) {
    return {
      error: "Seu perfil so pode iniciar atendimentos do proprio profissional.",
    };
  }

  const { data: existingEncounter } = await supabase
    .from("encounters")
    .select("id")
    .eq("appointment_id", appointment.id)
    .eq("organization_id", context.organization.id)
    .maybeSingle<{ id: string }>();

  if (existingEncounter?.id) {
    await markAppointmentInProgressIfPossible(
      appointment.id,
      appointment.status,
    );
    revalidatePath("/agenda");
    redirect(`/prontuario/${existingEncounter.id}`);
  }

  const { data: template } = await supabase
    .from("clinical_templates")
    .select("id, name")
    .eq("organization_id", context.organization.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; name: string }>();
  if (!template) {
    return { error: "Nenhum template clínico ativo foi encontrado." };
  }

  const { data: templateVersion } = await supabase
    .from("clinical_template_versions")
    .select("id, version_number, schema")
    .eq("organization_id", context.organization.id)
    .eq("template_id", template.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; version_number: number; schema: unknown }>();
  if (!templateVersion) {
    return { error: "Nenhuma versão de template clínico foi encontrada." };
  }

  const { data: encounter, error } = await supabase
    .from("encounters")
    .insert({
      organization_id: context.organization.id,
      patient_id: appointment.patient_id,
      professional_id: appointment.professional_id,
      appointment_id: appointment.id,
      template_version_id: templateVersion.id,
      created_by_user_id: context.effectiveUser?.id ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !encounter) {
    const { data: duplicate } = await supabase
      .from("encounters")
      .select("id")
      .eq("appointment_id", appointment.id)
      .eq("organization_id", context.organization.id)
      .maybeSingle<{ id: string }>();

    if (duplicate?.id) {
      await markAppointmentInProgressIfPossible(
        appointment.id,
        appointment.status,
      );
      revalidatePath("/agenda");
      redirect(`/prontuario/${duplicate.id}`);
    }

    return {
      error: friendlyError(
        error?.message ?? "Não foi possível iniciar o atendimento.",
        error?.code,
      ),
    };
  }

  const { error: entryError } = await supabase
    .from("encounter_entries")
    .insert({
      organization_id: context.organization.id,
      encounter_id: encounter.id,
      template_snapshot: {
        template_id: template.id,
        template_version_id: templateVersion.id,
        name: template.name,
        version_number: templateVersion.version_number,
        schema: templateVersion.schema,
      },
    });

  if (entryError) {
    await supabase
      .from("encounters")
      .delete()
      .eq("id", encounter.id)
      .eq("organization_id", context.organization.id);

    return {
      error: friendlyError(
        entryError.message ?? "Nao foi possivel iniciar o atendimento.",
        entryError.code,
      ),
    };
  }

  await markAppointmentInProgressIfPossible(appointment.id, appointment.status);
  revalidatePath("/agenda");
  revalidatePath("/prontuario");
  redirect(`/prontuario/${encounter.id}`);
}

async function markAppointmentInProgressIfPossible(
  appointmentId: string,
  currentStatus: string,
) {
  const context = await requireAgendaPermission("agenda.editar_agendamento");
  if (!context?.organization) return;
  if (!["scheduled", "confirmed", "waiting"].includes(currentStatus)) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const transitions =
    currentStatus === "scheduled"
      ? ["waiting", "in_progress"]
      : currentStatus === "confirmed"
        ? ["waiting", "in_progress"]
        : ["in_progress"];

  for (const nextStatus of transitions) {
    const { error } = await supabase.rpc("transition_appointment_status", {
      p_appointment_id: appointmentId,
      p_to_status: nextStatus,
      p_reason: "Atendimento iniciado pela agenda",
    });
    if (error) return;
  }
}

export async function confirmOnlineBookingRequest(
  requestId: string,
  _state: AgendaActionState,
  _formData: FormData,
): Promise<AgendaActionState> {
  void _state;
  void _formData;
  const context = await requireAgendaPermission("agenda.criar_agendamento");
  if (
    !context?.organization ||
    !context.permissionCodes.has("paciente.criar")
  ) {
    return { error: "Acesso negado." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("confirm_online_booking_request", {
    p_request_id: requestId,
  });

  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { success: "Solicitação confirmada e agendamento criado." };
}

export async function rejectOnlineBookingRequest(
  requestId: string,
  _state: AgendaActionState,
  formData: FormData,
): Promise<AgendaActionState> {
  const context = await requireAgendaPermission("agenda.criar_agendamento");
  if (!context?.organization) return { error: "Acesso negado." };

  const parsed = z
    .object({ reason: z.string().trim().max(300).optional() })
    .safeParse(Object.fromEntries(formData));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reject_online_booking_request", {
    p_request_id: requestId,
    p_reason: parsed.success ? parsed.data.reason || null : null,
  });

  if (error) return { error: friendlyError(error.message, error.code) };
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return { success: "Solicitação rejeitada." };
}
