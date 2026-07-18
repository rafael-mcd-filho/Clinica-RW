"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { provisionCompanyUserAccess } from "@/lib/auth/company-user-admin";
import { getRequestContext } from "@/lib/auth/context";
import {
  removeOrganizationLogo,
  uploadOrganizationLogo,
} from "@/lib/storage/branding";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  brazilianStateCodes,
  isValidCEP,
  isValidCNPJ,
  isValidPhoneBR,
} from "@/lib/validation/br";

export type CompanyActionState = {
  error?: string;
  success?: string;
  warning?: string;
  setupLink?: string;
  accessEmail?: string;
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

const formBoolean = z.preprocess(
  (value) => value === true || value === "true" || value === "on",
  z.boolean(),
);

const professionalRegistrationSchema = z
  .object({
    user_id: optionalUuid.optional(),
    specialty_id: optionalUuid,
    name: z.string().trim().min(2, "Informe o nome do profissional."),
    council_type: optionalText,
    council_number: optionalText,
    council_state: optionalText,
    grant_system_access: formBoolean,
    access_email: z
      .string()
      .trim()
      .email("Informe um e-mail válido para o acesso.")
      .transform((email) => email.toLowerCase())
      .optional()
      .or(z.literal("")),
  })
  .superRefine((data, context) => {
    if (data.grant_system_access && !data.access_email) {
      context.addIssue({
        code: "custom",
        path: ["access_email"],
        message: "Informe o e-mail do novo usuário.",
      });
    }
    if (data.grant_system_access && data.user_id) {
      context.addIssue({
        code: "custom",
        path: ["user_id"],
        message:
          "Escolha entre vincular um usuário existente ou criar um novo acesso.",
      });
    }
  });

type ProfessionalRegistrationInput = z.infer<
  typeof professionalRegistrationSchema
>;

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
  professional: professionalRegistrationSchema,
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
    state: z.enum(brazilianStateCodes).optional().or(z.literal("")),
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
    if (data.phone && !isValidPhoneBR(data.phone)) {
      context.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Telefone da clínica inválido.",
      });
    }
    if (data.postal_code && !isValidCEP(data.postal_code)) {
      context.addIssue({
        code: "custom",
        path: ["postal_code"],
        message: "CEP da clínica inválido.",
      });
    }
  });

const settingsTagSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da tag."),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida."),
});

const patientAutomationTriggerSchema = z.enum(
  [
    "new_patient",
    "appointment_scheduled",
    "first_visit",
    "revenue_threshold",
    "birthday",
    "appointment_before",
    "appointment_day",
    "appointment_completed",
  ],
  { message: "Selecione um gatilho válido." },
);

const patientAutomationActionSchema = z.enum(["add_tag", "remove_tag"], {
  message: "Selecione uma ação válida.",
});

const optionalAutomationDays = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.coerce
    .number()
    .int()
    .min(1, "Informe ao menos 1 dia.")
    .max(365, "O gatilho aceita no máximo 365 dias.")
    .optional(),
);

const optionalAutomationScopeId = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.string().uuid("Selecione uma opção válida.").optional(),
);

const appointmentAutomationTriggers = new Set([
  "appointment_scheduled",
  "appointment_before",
  "appointment_day",
  "appointment_completed",
  "first_visit",
]);

const patientTagRuleSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome da regra."),
    tag_id: z.string().uuid("Selecione a tag."),
    trigger_type: patientAutomationTriggerSchema,
    action_type: z.preprocess(
      (value) => (value === "" || value == null ? "add_tag" : value),
      patientAutomationActionSchema,
    ),
    // Aceitamos os dois nomes durante a transição da tela antiga.
    offset_days: optionalAutomationDays,
    days_offset: optionalAutomationDays,
    schedule_id: optionalAutomationScopeId,
    professional_id: optionalAutomationScopeId,
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
      z
        .number()
        .positive("O faturamento mínimo deve ser maior que zero.")
        .optional(),
    ),
    active: z.preprocess(
      (value) =>
        value == null || value === ""
          ? true
          : value === true || value === "true" || value === "on",
      z.boolean(),
    ),
  })
  .superRefine((data, context) => {
    const offsetDays = data.offset_days ?? data.days_offset;

    if (
      data.offset_days != null &&
      data.days_offset != null &&
      data.offset_days !== data.days_offset
    ) {
      context.addIssue({
        code: "custom",
        path: ["offset_days"],
        message: "O prazo antes do agendamento está inconsistente.",
      });
    }
    if (data.trigger_type === "appointment_before" && offsetDays == null) {
      context.addIssue({
        code: "custom",
        path: ["offset_days"],
        message: "Informe quantos dias antes do agendamento.",
      });
    }
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
    if (data.action_type === "remove_tag" && data.duration_days != null) {
      context.addIssue({
        code: "custom",
        path: ["duration_days"],
        message: "A duração se aplica apenas à ação de inserir tag.",
      });
    }
    if (
      (data.schedule_id || data.professional_id) &&
      !appointmentAutomationTriggers.has(data.trigger_type)
    ) {
      context.addIssue({
        code: "custom",
        path: ["schedule_id"],
        message:
          "Os filtros de agenda e profissional se aplicam apenas a gatilhos de agendamento.",
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
  const normalizedMessage = message.toLowerCase();

  if (message.includes("duplicate key")) {
    return "Já existe um cadastro com estes dados.";
  }
  if (message.includes("foreign key")) {
    return "Um dos vínculos selecionados não pertence a esta empresa.";
  }
  if (normalizedMessage.includes("support session")) {
    return "A sessão de suporte expirou. Encerre o suporte e inicie uma nova sessão.";
  }
  if (
    normalizedMessage.includes("insufficient permission") ||
    normalizedMessage.includes("permission denied")
  ) {
    return "Seu perfil não possui permissão para realizar esta alteração.";
  }
  if (
    normalizedMessage.includes("invalid patient automation") ||
    normalizedMessage.includes("invalid automation")
  ) {
    return "Revise o gatilho e a ação configurados para esta automação.";
  }
  return message;
}

function refreshCompanySettings() {
  revalidatePath("/configuracoes", "layout");
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
  const organizationId = context.organization.id;
  const uploadedLogo = await uploadOrganizationLogo(
    formData.get("logo"),
    organizationId,
  );

  if (uploadedLogo.error) {
    return { error: uploadedLogo.error };
  }

  const removeLogo = formData.get("remove_logo") === "true";
  const currentLogoUrl = context.organization.logo_url ?? null;
  const logoUrl = uploadedLogo.url ?? (removeLogo ? null : currentLogoUrl);
  const supabase = await createSupabaseServerClient();

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
    if (uploadedLogo.url) {
      await removeOrganizationLogo(uploadedLogo.url, organizationId);
    }
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
      logo_url: logoUrl,
      mode,
    })
    .eq("id", organizationId);

  if (organizationError) {
    if (uploadedLogo.url) {
      await removeOrganizationLogo(uploadedLogo.url, organizationId);
    }
    return { error: friendlyDatabaseError(organizationError.message) };
  }

  if (currentLogoUrl && currentLogoUrl !== logoUrl) {
    await removeOrganizationLogo(currentLogoUrl, organizationId);
  }

  await supabase.from("audit_logs").insert({
    organization_id: organizationId,
    actor_user_id: context.actor?.id ?? context.effectiveUser?.id,
    action: "organization.settings_updated",
    resource_type: "organization",
    resource_id: organizationId,
    metadata: {
      mode,
      automatic_mode: automatic_mode === "true",
      logo_updated: logoUrl !== currentLogoUrl,
    },
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

  const rawValues = valuesFromFormData(formData);
  const schema = registrationSchemas[kind];
  const parsed = schema.safeParse(rawValues);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (kind === "professional") {
    const effectiveUserId = context.effectiveUser?.id;
    if (!effectiveUserId) {
      return { error: "Não foi possível identificar o usuário responsável." };
    }

    return saveProfessionalRegistration({
      organizationId: context.organization.id,
      effectiveUserId,
      auditActorUserId: context.actor?.id ?? effectiveUserId,
      canManageUsers: context.permissionCodes.has("config.usuarios"),
      recordId,
      input: parsed.data as ProfessionalRegistrationInput,
      userFieldSubmitted: Object.hasOwn(rawValues, "user_id"),
    });
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

async function saveProfessionalRegistration({
  organizationId,
  effectiveUserId,
  auditActorUserId,
  canManageUsers,
  recordId,
  input,
  userFieldSubmitted,
}: {
  organizationId: string;
  effectiveUserId: string;
  auditActorUserId: string;
  canManageUsers: boolean;
  recordId: string | null;
  input: ProfessionalRegistrationInput;
  userFieldSubmitted: boolean;
}): Promise<CompanyActionState> {
  if (recordId && !z.string().uuid().safeParse(recordId).success) {
    return { error: "Profissional inválido." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: currentProfessional, error: currentProfessionalError } =
    recordId
      ? await supabase
          .from("professionals")
          .select("id, user_id, active")
          .eq("id", recordId)
          .eq("organization_id", organizationId)
          .maybeSingle<{
            id: string;
            user_id: string | null;
            active: boolean;
          }>()
      : { data: null, error: null };

  if (recordId && (currentProfessionalError || !currentProfessional)) {
    return { error: "Profissional não encontrado nesta empresa." };
  }

  const previousUserId = currentProfessional?.user_id ?? null;
  const requestedUserId = userFieldSubmitted
    ? (input.user_id ?? null)
    : previousUserId;
  const linkChanged = requestedUserId !== previousUserId;

  if (input.grant_system_access && previousUserId) {
    return {
      error:
        "Este profissional já possui acesso vinculado. Desvincule o usuário antes de criar outro acesso.",
    };
  }

  if ((input.grant_system_access || linkChanged) && !canManageUsers) {
    return {
      error:
        "Você pode alterar o cadastro profissional, mas precisa da permissão config.usuarios para modificar o acesso ao sistema.",
    };
  }

  if (
    currentProfessional &&
    !currentProfessional.active &&
    (input.grant_system_access || (linkChanged && requestedUserId))
  ) {
    return {
      error: "Reative o profissional antes de vincular ou criar um acesso.",
    };
  }

  let professionalProfileId: string | null = null;
  if (input.grant_system_access) {
    const { data: professionalProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("name", "Profissional")
      .eq("is_system_default", true)
      .maybeSingle<{ id: string }>();

    if (profileError || !professionalProfile) {
      return {
        error: "O perfil padrão Profissional não foi encontrado nesta empresa.",
      };
    }
    professionalProfileId = professionalProfile.id;
  }

  if (linkChanged && requestedUserId) {
    const [{ data: targetUser, error: targetUserError }, linkedProfessional] =
      await Promise.all([
        supabase
          .from("app_users")
          .select("id, status, is_super_admin")
          .eq("id", requestedUserId)
          .eq("organization_id", organizationId)
          .eq("is_super_admin", false)
          .maybeSingle<{
            id: string;
            status: "invited" | "active" | "suspended";
            is_super_admin: boolean;
          }>(),
        supabase
          .from("professionals")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("user_id", requestedUserId)
          .neq("id", recordId ?? "00000000-0000-0000-0000-000000000000")
          .limit(1)
          .maybeSingle<{ id: string }>(),
      ]);

    if (targetUserError || !targetUser || targetUser.status !== "active") {
      return { error: "O usuário selecionado não está ativo nesta empresa." };
    }
    if (linkedProfessional.error || linkedProfessional.data) {
      return {
        error: "O usuário selecionado já está vinculado a outro profissional.",
      };
    }
  }

  const grantSystemAccess = input.grant_system_access;
  const accessEmail = input.access_email;
  const professionalFields = {
    specialty_id: input.specialty_id,
    name: input.name,
    council_type: input.council_type,
    council_number: input.council_number,
    council_state: input.council_state,
  };
  const payload = {
    ...nullifyEmptyValues(professionalFields),
    user_id: grantSystemAccess ? null : requestedUserId,
    organization_id: organizationId,
  };
  let saveResult;
  if (recordId) {
    const updateQuery = supabase
      .from("professionals")
      .update(payload)
      .eq("id", recordId)
      .eq("organization_id", organizationId);
    const guardedUpdate = previousUserId
      ? updateQuery.eq("user_id", previousUserId)
      : updateQuery.is("user_id", null);
    saveResult = await guardedUpdate.select("id").maybeSingle<{ id: string }>();
  } else {
    saveResult = await supabase
      .from("professionals")
      .insert(payload)
      .select("id")
      .single<{ id: string }>();
  }

  if (saveResult.error || !saveResult.data) {
    return {
      error: saveResult.error
        ? friendlyDatabaseError(saveResult.error.message)
        : "O vínculo deste profissional foi alterado por outra pessoa. Recarregue a página e tente novamente.",
    };
  }

  const professionalId = saveResult.data.id;

  if (grantSystemAccess) {
    const accessResult = await provisionCompanyUserAccess({
      organizationId,
      actorUserId: effectiveUserId,
      auditActorUserId,
      name: input.name,
      email: accessEmail!,
      profileId: professionalProfileId!,
      professionalId,
      initialAgendaScope: "own",
    });

    refreshCompanySettings();
    if (!accessResult.ok) {
      return {
        success: accessResult.requiresManualReview
          ? "Profissional salvo; o acesso precisa de revisão manual."
          : recordId
            ? "Profissional atualizado sem alterar o acesso."
            : "Profissional cadastrado sem acesso ao sistema.",
        warning: accessResult.error,
      };
    }

    const { error: accessLinkAuditError } = await supabase
      .from("audit_logs")
      .insert({
        organization_id: organizationId,
        actor_user_id: auditActorUserId,
        action: "professional.user_link_changed",
        resource_type: "professional",
        resource_id: professionalId,
        metadata: {
          previous_user_id: null,
          user_id: accessResult.userId,
          access_created: true,
          effective_user_id: effectiveUserId,
        },
      });

    return {
      success: recordId
        ? "Profissional atualizado e acesso criado."
        : "Profissional cadastrado e acesso criado.",
      warning: accessLinkAuditError
        ? "O acesso foi criado, mas não foi possível registrar toda a auditoria do vínculo profissional."
        : undefined,
      setupLink: accessResult.setupLink,
      accessEmail,
    };
  }

  let linkAuditError: string | undefined;
  if (linkChanged) {
    const { error } = await supabase.from("audit_logs").insert({
      organization_id: organizationId,
      actor_user_id: auditActorUserId,
      action: "professional.user_link_changed",
      resource_type: "professional",
      resource_id: professionalId,
      metadata: {
        previous_user_id: previousUserId,
        user_id: requestedUserId,
        effective_user_id: effectiveUserId,
      },
    });
    if (error) {
      linkAuditError =
        "O vínculo foi salvo, mas não foi possível registrar sua auditoria.";
    }
  }

  refreshCompanySettings();
  return {
    success: recordId ? "Profissional atualizado." : "Profissional cadastrado.",
    warning: linkAuditError,
  };
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
  const { error } = await supabase.rpc("create_patient_tag", {
    p_name: parsed.data.name,
    p_color: parsed.data.color,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });

  if (error) {
    return { error: friendlyDatabaseError(error.message) };
  }

  refreshCompanySettings();
  return { success: "Tag criada." };
}

export async function createPatientAutomationRule(
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

  const {
    action_type,
    active,
    days_offset,
    duration_days,
    minimum_paid_amount,
    name,
    offset_days,
    professional_id,
    schedule_id,
    tag_id,
    trigger_type,
  } = parsed.data;
  const daysBefore = offset_days ?? days_offset;
  const triggerConfig: Record<string, number | string> =
    trigger_type === "appointment_before"
      ? { days_before: daysBefore! }
      : trigger_type === "revenue_threshold"
        ? { minimum_paid_amount: minimum_paid_amount! }
        : {};

  const supabase = await createSupabaseServerClient();
  const [scheduleResult, professionalResult] = await Promise.all([
    schedule_id
      ? supabase
          .from("schedules")
          .select("id, professional_id")
          .eq("id", schedule_id)
          .eq("organization_id", context.organization.id)
          .eq("active", true)
          .maybeSingle<{ id: string; professional_id: string | null }>()
      : Promise.resolve({ data: null, error: null }),
    professional_id
      ? supabase
          .from("professionals")
          .select("id")
          .eq("id", professional_id)
          .eq("organization_id", context.organization.id)
          .eq("active", true)
          .maybeSingle<{ id: string }>()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (schedule_id && (scheduleResult.error || !scheduleResult.data)) {
    return { error: "A agenda selecionada não está disponível." };
  }
  if (
    professional_id &&
    (professionalResult.error || !professionalResult.data)
  ) {
    return { error: "O profissional selecionado não está disponível." };
  }
  if (
    professional_id &&
    scheduleResult.data &&
    scheduleResult.data.professional_id !== professional_id
  ) {
    return { error: "A agenda não pertence ao profissional selecionado." };
  }

  if (schedule_id) {
    triggerConfig.schedule_id = schedule_id;
  }
  if (professional_id) {
    triggerConfig.professional_id = professional_id;
  }

  const actionConfig = {
    tag_id,
    duration_days: action_type === "add_tag" ? (duration_days ?? null) : null,
  };
  const { data: ruleId, error } = await supabase.rpc(
    "create_patient_automation_rule",
    {
      p_name: name,
      p_trigger_type: trigger_type,
      p_trigger_config: triggerConfig,
      p_action_type: action_type,
      p_action_config: actionConfig,
      p_active: active,
      p_impersonation_session_id: context.impersonation?.id ?? null,
    },
  );

  if (error || typeof ruleId !== "string") {
    return {
      error: friendlyDatabaseError(error?.message ?? "Falha ao criar regra."),
    };
  }

  refreshCompanySettings();
  return { success: "Automação criada." };
}

/** Compatibilidade com a tela anterior; novas telas podem usar o nome genérico. */
export async function createPatientTagRule(
  previousState: CompanyActionState,
  formData: FormData,
): Promise<CompanyActionState> {
  return createPatientAutomationRule(previousState, formData);
}

export async function setPatientAutomationRuleActive(
  ruleId: string,
  active: boolean,
): Promise<void> {
  const context = await requireCompanyConfig();
  if (!context?.organization || !z.string().uuid().safeParse(ruleId).success) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("set_patient_automation_rule_active", {
    p_rule_id: ruleId,
    p_active: active,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });

  refreshCompanySettings();
}

/** Compatibilidade com a tela anterior; novas telas podem usar o nome genérico. */
export async function setPatientTagRuleActive(
  ruleId: string,
  active: boolean,
): Promise<void> {
  return setPatientAutomationRuleActive(ruleId, active);
}

export async function deletePatientAutomationRule(
  ruleId: string,
): Promise<void> {
  const context = await requireCompanyConfig();
  if (!context?.organization || !z.string().uuid().safeParse(ruleId).success) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("delete_patient_automation_rule", {
    p_rule_id: ruleId,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });

  refreshCompanySettings();
}

/** Compatibilidade com a tela anterior; novas telas podem usar o nome genérico. */
export async function deletePatientTagRule(ruleId: string): Promise<void> {
  return deletePatientAutomationRule(ruleId);
}

export async function refreshPatientAutomationRule(
  ruleId: string,
): Promise<void> {
  const context = await requireCompanyConfig();
  if (!context?.organization || !z.string().uuid().safeParse(ruleId).success) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  await supabase.rpc("refresh_patient_automation_rule", {
    p_rule_id: ruleId,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });

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
    lunch_start_time: string | null;
    lunch_end_time: string | null;
    active: boolean;
  }> = [];

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    if (formData.get(`enabled_${weekday}`) !== "on") {
      continue;
    }

    const startTime = String(formData.get(`start_${weekday}`) ?? "");
    const endTime = String(formData.get(`end_${weekday}`) ?? "");
    const lunchEnabled = formData.get(`lunch_enabled_${weekday}`) === "on";
    const lunchStartTime = lunchEnabled
      ? String(formData.get(`lunch_start_${weekday}`) ?? "")
      : null;
    const lunchEndTime = lunchEnabled
      ? String(formData.get(`lunch_end_${weekday}`) ?? "")
      : null;

    if (
      !timePattern.test(startTime) ||
      !timePattern.test(endTime) ||
      startTime >= endTime
    ) {
      return { error: "Revise os horários de abertura e fechamento." };
    }

    if (
      lunchEnabled &&
      (!lunchStartTime ||
        !lunchEndTime ||
        !timePattern.test(lunchStartTime) ||
        !timePattern.test(lunchEndTime) ||
        lunchStartTime <= startTime ||
        lunchStartTime >= lunchEndTime ||
        lunchEndTime >= endTime)
    ) {
      return {
        error:
          "Revise a pausa para almoço. Ela deve ficar dentro do horário de funcionamento.",
      };
    }

    hours.push({
      organization_id: context.organization.id,
      unit_id: null,
      professional_id: null,
      weekday,
      start_time: startTime,
      end_time: endTime,
      lunch_start_time: lunchStartTime,
      lunch_end_time: lunchEndTime,
      active: true,
    });
  }

  if (!hours.length) {
    return { error: "Selecione ao menos um dia de funcionamento." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("replace_clinic_business_hours", {
    p_organization_id: context.organization.id,
    p_hours: hours.map(
      ({
        weekday,
        start_time,
        end_time,
        lunch_start_time,
        lunch_end_time,
      }) => ({
        weekday,
        start_time,
        end_time,
        lunch_start_time,
        lunch_end_time,
      }),
    ),
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
