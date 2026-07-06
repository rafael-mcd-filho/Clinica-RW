"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidCNPJ } from "@/lib/validation/br";

export type CompanyActionState = {
  error?: string;
  success?: string;
  ok?: boolean;
};

export type RegistrationKind =
  | "unit"
  | "room"
  | "equipment"
  | "specialty"
  | "professional"
  | "procedure"
  | "health_insurance"
  | "price_table"
  | "price_item";

const tableByKind: Record<RegistrationKind, string> = {
  unit: "units",
  room: "rooms",
  equipment: "equipment",
  specialty: "specialties",
  professional: "professionals",
  procedure: "procedures",
  health_insurance: "health_insurances",
  price_table: "price_tables",
  price_item: "price_table_items",
};

const optionalText = z.string().trim().optional();
const optionalUuid = z
  .union([z.string().uuid(), z.literal("")])
  .transform((value) => value || null);

function decimalValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  return normalized === "" ? undefined : Number(normalized);
}

const registrationSchemas: Record<
  RegistrationKind,
  z.ZodType<Record<string, unknown>>
> = {
  unit: z.object({
    name: z.string().trim().min(2, "Informe o nome da unidade."),
    code: optionalText,
    phone: optionalText,
    email: z
      .string()
      .trim()
      .email("E-mail da unidade inválido.")
      .optional()
      .or(z.literal("")),
    postal_code: optionalText,
    address_line: optionalText,
    address_number: optionalText,
    address_complement: optionalText,
    district: optionalText,
    city: optionalText,
    state: optionalText,
  }),
  room: z.object({
    unit_id: z.string().uuid("Selecione a unidade."),
    name: z.string().trim().min(2, "Informe o nome da sala."),
    description: optionalText,
  }),
  equipment: z.object({
    unit_id: optionalUuid,
    name: z.string().trim().min(2, "Informe o nome do equipamento."),
    description: optionalText,
  }),
  specialty: z.object({
    name: z.string().trim().min(2, "Informe a especialidade."),
    cbo_code: optionalText,
  }),
  professional: z.object({
    user_id: optionalUuid,
    specialty_id: optionalUuid,
    name: z.string().trim().min(2, "Informe o nome do profissional."),
    council_type: optionalText,
    council_number: optionalText,
    council_state: optionalText,
  }),
  procedure: z.object({
    name: z.string().trim().min(2, "Informe o procedimento."),
    code: optionalText,
    duration_minutes: z.coerce
      .number()
      .int()
      .min(5, "A duração mínima é 5 minutos.")
      .max(1440),
    base_price: z.preprocess(
      decimalValue,
      z.number().min(0, "O preço não pode ser negativo."),
    ),
  }),
  health_insurance: z
    .object({
      name: z.string().trim().min(2, "Informe o convênio."),
      document: optionalText,
    })
    .superRefine((data, context) => {
      if (data.document && !isValidCNPJ(data.document)) {
        context.addIssue({
          code: "custom",
          path: ["document"],
          message: "CNPJ do convênio inválido.",
        });
      }
    }),
  price_table: z.object({
    name: z.string().trim().min(2, "Informe o nome da tabela."),
    health_insurance_id: optionalUuid,
  }),
  price_item: z.object({
    price_table_id: z.string().uuid("Selecione a tabela de preço."),
    procedure_id: z.string().uuid("Selecione o procedimento."),
    price: z.preprocess(
      decimalValue,
      z.number().min(0, "O preço não pode ser negativo."),
    ),
  }),
};

const clinicSchema = z
  .object({
    trade_name: z.string().trim().min(2, "Informe o nome da clínica."),
    legal_name: optionalText,
    document: optionalText,
    phone: optionalText,
    email: z
      .string()
      .trim()
      .email("E-mail da clínica inválido.")
      .optional()
      .or(z.literal("")),
    postal_code: optionalText,
    address_line: optionalText,
    address_number: optionalText,
    address_complement: optionalText,
    district: optionalText,
    city: optionalText,
    state: optionalText,
    timezone: z.string().trim().min(1, "Informe o fuso horário."),
    locale: z.string().trim().min(1, "Informe o idioma."),
    automatic_mode: z.enum(["true", "false"]),
    manual_mode: z.enum(["solo", "clinic"]),
  })
  .superRefine((data, context) => {
    if (data.document && !isValidCNPJ(data.document)) {
      context.addIssue({
        code: "custom",
        path: ["document"],
        message: "CNPJ da clínica inválido.",
      });
    }
  });

const settingsTagSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da tag."),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida."),
});

const patientTagRuleSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome da regra."),
    tag_id: z.string().uuid("Selecione a tag."),
    trigger_type: z.enum(
      [
        "new_patient",
        "appointment_scheduled",
        "first_visit",
        "revenue_threshold",
      ],
      { message: "Selecione um gatilho válido." },
    ),
    duration_days: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.coerce
        .number()
        .int()
        .min(1, "A duração mínima é 1 dia.")
        .max(3650, "A duração máxima é 3650 dias.")
        .optional(),
    ),
    minimum_paid_amount: z.preprocess(
      decimalValue,
      z.number().min(0, "O valor mínimo não pode ser negativo.").optional(),
    ),
  })
  .superRefine((data, context) => {
    if (
      data.trigger_type === "revenue_threshold" &&
      data.minimum_paid_amount == null
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimum_paid_amount"],
        message: "Informe o faturamento mínimo para esta regra.",
      });
    }
  });

async function requireCompanyConfig() {
  const context = await getRequestContext();

  if (!context.organization || !context.permissionCodes.has("config.geral")) {
    return null;
  }

  return context;
}

function valuesFromFormData(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_")),
  );
}

function nullifyEmptyValues(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "string" && value.trim() === "" ? null : value,
    ]),
  );
}

function friendlyDatabaseError(message: string) {
  if (message.includes("duplicate key")) {
    return "Já existe um cadastro com estes dados.";
  }
  if (message.includes("foreign key")) {
    return "Um dos vínculos selecionados não pertence a esta empresa.";
  }
  return message;
}

function refreshCompanySettings() {
  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
}

export async function saveClinicSettings(
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const context = await requireCompanyConfig();
  if (!context?.organization) {
    return { error: "Você não pode alterar as configurações desta empresa." };
  }

  const parsed = clinicSchema.safeParse(valuesFromFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { timezone, locale, automatic_mode, manual_mode, ...clinic } =
    parsed.data;
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;

  const [{ error: clinicError }, { error: settingsError }] = await Promise.all([
    supabase
      .from("clinics")
      .update(nullifyEmptyValues(clinic))
      .eq("organization_id", organizationId),
    supabase
      .from("organization_settings")
      .update({
        timezone,
        locale,
        automatic_mode: automatic_mode === "true",
      })
      .eq("organization_id", organizationId),
  ]);

  if (clinicError || settingsError) {
    return {
      error: friendlyDatabaseError(
        clinicError?.message ?? settingsError?.message ?? "Falha ao salvar.",
      ),
    };
  }

  const { count: activeProfessionals } = await supabase
    .from("professionals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("active", true);
  const mode =
    automatic_mode === "true"
      ? (activeProfessionals ?? 0) > 1
        ? "clinic"
        : "solo"
      : manual_mode;
  const { error: organizationError } = await supabase
    .from("organizations")
    .update({
      name: clinic.trade_name,
      legal_name: clinic.legal_name || null,
      document: clinic.document || null,
      phone: clinic.phone || null,
      email: clinic.email || null,
      mode,
    })
    .eq("id", organizationId);

  if (organizationError) {
    return { error: friendlyDatabaseError(organizationError.message) };
  }

  await supabase.from("audit_logs").insert({
    organization_id: organizationId,
    actor_user_id: context.actor?.id ?? context.effectiveUser?.id,
    action: "organization.settings_updated",
    resource_type: "organization",
    resource_id: organizationId,
    metadata: { mode, automatic_mode: automatic_mode === "true" },
  });

  refreshCompanySettings();
  return { success: "Dados da clínica salvos." };
}

export async function saveRegistration(
  kind: RegistrationKind,
  recordId: string | null,
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const context = await requireCompanyConfig();
  if (!context?.organization) {
    return { error: "Você não pode alterar estes cadastros." };
  }

  const schema = registrationSchemas[kind];
  const parsed = schema.safeParse(valuesFromFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const table = tableByKind[kind];
  const payload = {
    ...nullifyEmptyValues(parsed.data),
    organization_id: context.organization.id,
  };

  const query = recordId
    ? supabase
        .from(table)
        .update(payload)
        .eq("id", recordId)
        .eq("organization_id", context.organization.id)
    : supabase.from(table).insert(payload);

  const { error } = await query;
  if (error) {
    return { error: friendlyDatabaseError(error.message) };
  }

  refreshCompanySettings();
  return { success: recordId ? "Cadastro atualizado." : "Cadastro criado." };
}

export async function createSettingsTag(
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const context = await requireCompanyConfig();
  if (!context?.organization) {
    return { error: "Você não pode configurar tags desta empresa." };
  }

  const parsed = settingsTagSchema.safeParse(valuesFromFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("tags").insert({
    organization_id: context.organization.id,
    ...parsed.data,
  });

  if (error) {
    return { error: friendlyDatabaseError(error.message) };
  }

  refreshCompanySettings();
  return { success: "Tag criada." };
}

export async function createPatientTagRule(
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const context = await requireCompanyConfig();
  if (!context?.organization) {
    return { error: "Você não pode configurar regras de tag." };
  }

  const parsed = patientTagRuleSchema.safeParse(valuesFromFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { minimum_paid_amount, trigger_type, ...data } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const config =
    trigger_type === "revenue_threshold"
      ? { minimum_paid_amount }
      : trigger_type === "first_visit"
        ? { remove_on_first_finalized: true }
        : {};
  const { data: rule, error } = await supabase
    .from("patient_tag_rules")
    .insert({
      organization_id: context.organization.id,
      ...data,
      trigger_type,
      duration_days: data.duration_days ?? null,
      config,
      active: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !rule) {
    return {
      error: friendlyDatabaseError(error?.message ?? "Falha ao criar regra."),
    };
  }

  const { error: refreshError } = await supabase.rpc(
    "refresh_patient_tag_rule",
    { p_rule_id: rule.id },
  );

  if (refreshError) {
    return {
      error: friendlyDatabaseError(refreshError.message),
    };
  }

  refreshCompanySettings();
  return { success: "Regra de tag criada." };
}

export async function setPatientTagRuleActive(
  ruleId: string,
  active: boolean,
): Promise<void> {
  const context = await requireCompanyConfig();
  if (!context?.organization) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("patient_tag_rules")
    .update({ active })
    .eq("id", ruleId)
    .eq("organization_id", context.organization.id);

  if (!error) {
    if (active) {
      await supabase.rpc("refresh_patient_tag_rule", { p_rule_id: ruleId });
    } else {
      await supabase
        .from("patient_tags")
        .delete()
        .eq("organization_id", context.organization.id)
        .eq("automation_rule_id", ruleId);
    }
  }

  refreshCompanySettings();
}

export async function deletePatientTagRule(ruleId: string): Promise<void> {
  const context = await requireCompanyConfig();
  if (!context?.organization) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("patient_tag_rules")
    .delete()
    .eq("id", ruleId)
    .eq("organization_id", context.organization.id);

  refreshCompanySettings();
}

export async function setRegistrationActive(
  kind: Exclude<RegistrationKind, "price_item">,
  recordId: string,
  active: boolean,
): Promise<void> {
  const context = await requireCompanyConfig();
  if (!context?.organization) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase
    .from(tableByKind[kind])
    .update({ active })
    .eq("id", recordId)
    .eq("organization_id", context.organization.id);

  refreshCompanySettings();
}

export async function deletePriceItem(recordId: string): Promise<void> {
  const context = await requireCompanyConfig();
  if (!context?.organization) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("price_table_items")
    .delete()
    .eq("id", recordId)
    .eq("organization_id", context.organization.id);

  refreshCompanySettings();
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveBusinessHours(
  _previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  const context = await requireCompanyConfig();
  if (!context?.organization) {
    return { error: "Você não pode alterar os horários desta empresa." };
  }

  const hours: Array<{
    organization_id: string;
    unit_id: null;
    professional_id: null;
    weekday: number;
    start_time: string;
    end_time: string;
    active: boolean;
  }> = [];

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    if (formData.get(`enabled_${weekday}`) !== "on") {
      continue;
    }

    const startTime = String(formData.get(`start_${weekday}`) ?? "");
    const endTime = String(formData.get(`end_${weekday}`) ?? "");

    if (
      !timePattern.test(startTime) ||
      !timePattern.test(endTime) ||
      startTime >= endTime
    ) {
      return { error: "Revise os horários de abertura e fechamento." };
    }

    hours.push({
      organization_id: context.organization.id,
      unit_id: null,
      professional_id: null,
      weekday,
      start_time: startTime,
      end_time: endTime,
      active: true,
    });
  }

  if (!hours.length) {
    return { error: "Selecione ao menos um dia de funcionamento." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("replace_clinic_business_hours", {
    p_organization_id: context.organization.id,
    p_hours: hours.map(({ weekday, start_time, end_time }) => ({
      weekday,
      start_time,
      end_time,
    })),
  });
  if (error) {
    return { error: friendlyDatabaseError(error.message) };
  }

  refreshCompanySettings();
  return { success: "Horários de funcionamento salvos." };
}

export async function completeOnboarding(
  _previousState: CompanyActionState,
  _formData: FormData,
): Promise<CompanyActionState> {
  void _previousState;
  void _formData;

  const context = await requireCompanyConfig();
  if (!context?.organization) {
    return { error: "Você não pode concluir este onboarding." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_organization_onboarding", {
    p_organization_id: context.organization.id,
  });

  if (error) {
    if (error.code === "23514") {
      return {
        error:
          "Complete clínica, unidade, profissional, procedimento e horários antes de concluir.",
      };
    }
    return { error: friendlyDatabaseError(error.message) };
  }

  refreshCompanySettings();
  return { success: "Configuração inicial concluída.", ok: true };
}
