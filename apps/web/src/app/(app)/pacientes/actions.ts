"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import {
  deletePatientPhoto,
  uploadPatientPhoto,
} from "@/lib/storage/patient-photos";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidCPF, onlyDigits } from "@/lib/validation/br";

export type PatientActionState = {
  error?: string;
  success?: string;
  ok?: boolean;
};

const optionalText = z.string().trim().optional();
const optionalEmail = z
  .string()
  .trim()
  .email("E-mail inválido.")
  .optional()
  .or(z.literal(""));

const patientSchema = z
  .object({
    full_name: z.string().trim().min(3, "Informe o nome completo."),
    social_name: optionalText,
    birth_date: z.string().optional(),
    sex_at_birth: z.enum(["female", "male", "intersex", "not_informed", ""]),
    cpf: optionalText,
    rg: optionalText,
    email: optionalEmail,
    phone: optionalText,
    whatsapp: optionalText,
    preferred_contact: z.enum(["whatsapp", "phone", "email", "none"]),
    allow_whatsapp: z.boolean(),
    allow_email: z.boolean(),
    allow_sms: z.boolean(),
    source: optionalText,
    postal_code: optionalText,
    address_line: optionalText,
    address_number: optionalText,
    address_complement: optionalText,
    district: optionalText,
    city: optionalText,
    state: optionalText,
  })
  .superRefine((data, context) => {
    if (data.cpf && !isValidCPF(data.cpf)) {
      context.addIssue({
        code: "custom",
        path: ["cpf"],
        message: "CPF inválido.",
      });
    }
  });

const clinicalSchema = z.object({
  allergies: optionalText,
  comorbidities: optionalText,
  medications: optionalText,
  medical_history: optionalText,
  family_history: optionalText,
  habits: optionalText,
  emergency_contact_name: optionalText,
  emergency_contact_phone: optionalText,
  emergency_contact_relationship: optionalText,
});

async function requirePatientContext(permission: string) {
  const context = await getRequestContext();

  if (!context.organization || !context.permissionCodes.has(permission)) {
    return null;
  }

  return context;
}

function formValues(formData: FormData) {
  return {
    full_name: formData.get("full_name"),
    social_name: formData.get("social_name") || undefined,
    birth_date: String(formData.get("birth_date") ?? ""),
    sex_at_birth: String(formData.get("sex_at_birth") ?? ""),
    cpf: formData.get("cpf") || undefined,
    rg: formData.get("rg") || undefined,
    email: formData.get("email") ?? "",
    phone: formData.get("phone") || undefined,
    whatsapp: formData.get("whatsapp") || undefined,
    preferred_contact: formData.get("preferred_contact"),
    allow_whatsapp: formData.get("allow_whatsapp") === "on",
    allow_email: formData.get("allow_email") === "on",
    allow_sms: formData.get("allow_sms") === "on",
    source: formData.get("source") || undefined,
    postal_code: formData.get("postal_code") || undefined,
    address_line: formData.get("address_line") || undefined,
    address_number: formData.get("address_number") || undefined,
    address_complement: formData.get("address_complement") || undefined,
    district: formData.get("district") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
  };
}

function emptyToNull(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

function patientPayload(data: z.infer<typeof patientSchema>) {
  return {
    full_name: data.full_name,
    social_name: emptyToNull(data.social_name),
    birth_date: data.birth_date || null,
    sex_at_birth: data.sex_at_birth || null,
    cpf: data.cpf ? onlyDigits(data.cpf) : null,
    rg: emptyToNull(data.rg),
    email: emptyToNull(data.email),
    phone: data.phone ? onlyDigits(data.phone) : null,
    whatsapp: data.whatsapp ? onlyDigits(data.whatsapp) : null,
    preferred_contact: data.preferred_contact,
    allow_whatsapp: data.allow_whatsapp,
    allow_email: data.allow_email,
    allow_sms: data.allow_sms,
    source: emptyToNull(data.source),
  };
}

function addressPayload(data: z.infer<typeof patientSchema>) {
  return {
    postal_code: data.postal_code ? onlyDigits(data.postal_code) : null,
    address_line: emptyToNull(data.address_line),
    address_number: emptyToNull(data.address_number),
    address_complement: emptyToNull(data.address_complement),
    district: emptyToNull(data.district),
    city: emptyToNull(data.city),
    state: data.state?.trim().toUpperCase() || null,
  };
}

function friendlyError(message: string) {
  if (message.includes("patients_organization_cpf_active_key")) {
    return "Já existe um paciente ativo com este CPF.";
  }
  if (message.includes("duplicate key")) {
    return "Já existe um registro ativo com estes dados.";
  }
  return message;
}

export async function createPatient(
  _previousState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const context = await requirePatientContext("paciente.criar");
  if (!context?.organization) {
    return { error: "Você não pode cadastrar pacientes." };
  }

  const parsed = patientSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const { data: patient, error } = await supabase
    .from("patients")
    .insert({ organization_id: organizationId, ...patientPayload(parsed.data) })
    .select("id")
    .single<{ id: string }>();

  if (error || !patient) {
    return {
      error: friendlyError(error?.message ?? "Falha ao cadastrar paciente."),
    };
  }

  const address = addressPayload(parsed.data);
  if (Object.values(address).some(Boolean)) {
    const { error: addressError } = await supabase
      .from("patient_addresses")
      .insert({
        organization_id: organizationId,
        patient_id: patient.id,
        ...address,
      });

    if (addressError) {
      return { error: friendlyError(addressError.message) };
    }
  }

  if (formData.get("lgpd_consent") === "on") {
    const { error: consentError } = await supabase
      .from("patient_consents")
      .insert({
        organization_id: organizationId,
        patient_id: patient.id,
        consent_type: "privacy_notice",
        version: "1.0",
        accepted_at: new Date().toISOString(),
        recorded_by_user_id: context.effectiveUser?.id ?? null,
      });

    if (consentError) {
      return { error: friendlyError(consentError.message) };
    }
  }

  revalidatePath("/pacientes");
  redirect(`/pacientes/${patient.id}`);
}

export async function updatePatient(
  patientId: string,
  _previousState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const context = await requirePatientContext("paciente.editar");
  if (
    !context?.organization ||
    !z.string().uuid().safeParse(patientId).success
  ) {
    return { error: "Paciente inválido ou acesso negado." };
  }

  const parsed = patientSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const { error } = await supabase
    .from("patients")
    .update(patientPayload(parsed.data))
    .eq("id", patientId)
    .eq("organization_id", organizationId);

  if (error) return { error: friendlyError(error.message) };

  if (context.permissionCodes.has("paciente.ver_dados_sensiveis")) {
    const address = addressPayload(parsed.data);
    const { error: addressError } = await supabase
      .from("patient_addresses")
      .upsert(
        {
          organization_id: organizationId,
          patient_id: patientId,
          ...address,
        },
        { onConflict: "organization_id,patient_id" },
      );

    if (addressError) return { error: friendlyError(addressError.message) };
  }

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath(`/pacientes/${patientId}/editar`);
  return { success: "Dados pessoais atualizados." };
}

export async function updateClinicalSummary(
  patientId: string,
  _previousState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const context = await requirePatientContext("paciente.ver_dados_sensiveis");
  if (
    !context?.organization ||
    !z.string().uuid().safeParse(patientId).success
  ) {
    return { error: "Acesso aos dados clínicos negado." };
  }

  const parsed = clinicalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const payload = Object.fromEntries(
    Object.entries(parsed.data).map(([key, value]) => [
      key,
      emptyToNull(value),
    ]),
  );
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("patient_clinical_summaries").upsert(
    {
      organization_id: context.organization.id,
      patient_id: patientId,
      ...payload,
    },
    { onConflict: "organization_id,patient_id" },
  );

  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/pacientes/${patientId}`);
  return { success: "Resumo clínico atualizado." };
}

export async function addPatientConsent(
  patientId: string,
  _previousState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const context = await requirePatientContext("paciente.editar");
  if (!context?.organization) return { error: "Acesso negado." };

  const parsed = z
    .object({
      consent_type: z.enum(["privacy_notice", "whatsapp", "email", "sms"]),
      version: z.string().trim().min(1).max(20),
    })
    .safeParse({
      consent_type: formData.get("consent_type"),
      version: formData.get("version"),
    });

  if (!parsed.success) return { error: "Consentimento inválido." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("patient_consents").insert({
    organization_id: context.organization.id,
    patient_id: patientId,
    ...parsed.data,
    accepted_at: new Date().toISOString(),
    recorded_by_user_id: context.effectiveUser?.id ?? null,
  });

  if (error) return { error: friendlyError(error.message) };
  revalidatePath(`/pacientes/${patientId}`);
  return { success: "Consentimento registrado." };
}

export async function revokePatientConsent(
  patientId: string,
  consentId: string,
): Promise<void> {
  const context = await requirePatientContext("paciente.editar");
  if (!context?.organization) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("patient_consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", consentId)
    .eq("patient_id", patientId)
    .eq("organization_id", context.organization.id)
    .is("revoked_at", null);
  revalidatePath(`/pacientes/${patientId}`);
}

export async function createPatientTag(
  _previousState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const context = await requirePatientContext("paciente.editar");
  if (!context?.organization) return { error: "Acesso negado." };

  const parsed = z
    .object({
      name: z.string().trim().min(2, "Informe o nome da tag."),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida."),
    })
    .safeParse({ name: formData.get("name"), color: formData.get("color") });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("tags").insert({
    organization_id: context.organization.id,
    ...parsed.data,
  });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/pacientes", "layout");
  return { success: "Tag criada." };
}

export async function setPatientTag(
  patientId: string,
  tagId: string,
  selected: boolean,
): Promise<void> {
  const context = await requirePatientContext("paciente.editar");
  if (!context?.organization) return;

  const supabase = await createSupabaseServerClient();
  if (selected) {
    await supabase.from("patient_tags").upsert(
      {
        organization_id: context.organization.id,
        patient_id: patientId,
        tag_id: tagId,
        source: "manual",
        automation_rule_id: null,
        expires_at: null,
      },
      { onConflict: "patient_id,tag_id" },
    );
  } else {
    await supabase
      .from("patient_tags")
      .delete()
      .eq("organization_id", context.organization.id)
      .eq("patient_id", patientId)
      .eq("tag_id", tagId);
  }
  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
}

export async function updatePatientPhoto(
  patientId: string,
  _previousState: PatientActionState,
  formData: FormData,
): Promise<PatientActionState> {
  const context = await requirePatientContext("paciente.editar");
  if (
    !context?.organization ||
    !z.string().uuid().safeParse(patientId).success
  ) {
    return { error: "Paciente inválido ou acesso negado." };
  }

  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, photo_path")
    .eq("id", patientId)
    .eq("organization_id", organizationId)
    .maybeSingle<{ id: string; photo_path: string | null }>();

  if (patientError || !patient) {
    return { error: "Paciente não encontrado." };
  }

  if (formData.get("remove_photo") === "true") {
    const { error } = await supabase
      .from("patients")
      .update({ photo_path: null })
      .eq("id", patientId)
      .eq("organization_id", organizationId);

    if (error) return { error: friendlyError(error.message) };

    await deletePatientPhoto(patient.photo_path);
    revalidatePath("/pacientes");
    revalidatePath(`/pacientes/${patientId}`);
    revalidatePath(`/pacientes/${patientId}/editar`);
    return { success: "Foto removida." };
  }

  const upload = await uploadPatientPhoto({
    file: formData.get("photo"),
    organizationId,
    patientId,
    previousPath: patient.photo_path,
  });

  if (upload.error || !upload.path) {
    return { error: upload.error ?? "Não foi possível enviar a foto." };
  }

  const { error } = await supabase
    .from("patients")
    .update({ photo_path: upload.path })
    .eq("id", patientId)
    .eq("organization_id", organizationId);

  if (error) {
    await deletePatientPhoto(upload.path);
    return { error: friendlyError(error.message) };
  }

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath(`/pacientes/${patientId}/editar`);
  return { success: "Foto do paciente atualizada." };
}

export async function setPatientArchived(
  patientId: string,
  archived: boolean,
): Promise<void> {
  const context = await requirePatientContext("paciente.excluir");
  if (!context?.organization) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("patients")
    .update({
      status: archived ? "inactive" : "active",
      deleted_at: archived ? new Date().toISOString() : null,
    })
    .eq("id", patientId)
    .eq("organization_id", context.organization.id);
  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
}
