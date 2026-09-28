"use server";

import {
  clinicalDocumentTypes,
  documentTypePermissions,
  isClinicalDocumentType,
  documentFields,
} from "@/lib/clinical/document-types";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import {
  ClinicalStructuredDataError,
  parseClinicalStructuredData,
} from "@/lib/clinical/structured-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClinicalActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  updatedAt?: string;
};

async function requireClinicalPermission(code: string) {
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has(code)) return null;
  return context;
}

function friendlyError(message: string) {
  if (message.includes("duplicate key")) {
    return "Já existe um atendimento para este agendamento.";
  }
  if (message.includes("Clinical encounter is empty")) {
    return "Preencha ao menos um campo ou uma anotação antes de finalizar.";
  }
  if (message.includes("Required clinical fields are missing")) {
    return "Preencha todos os campos obrigatórios antes de finalizar.";
  }
  if (message.includes("Clinical encounter was updated by another user")) {
    return "Este prontuário foi alterado em outra sessão. Recarregue a página antes de continuar.";
  }
  if (message.includes("Appointment cannot start a clinical encounter")) {
    return "Este agendamento não pode iniciar um atendimento clínico no status atual.";
  }
  if (message.includes("Active patient or professional not found")) {
    return "O paciente ou o profissional não está ativo para iniciar o atendimento.";
  }
  if (message.includes("Clinical template version not found")) {
    return "Selecione uma ficha clínica ativa para iniciar o atendimento.";
  }
  if (message.includes("Not allowed to issue clinical document")) {
    return "Seu perfil não possui permissão para emitir este documento.";
  }
  if (message.includes("Clinical document title and body are required")) {
    return "Informe título e conteúdo do documento.";
  }
  return message;
}

export async function startClinicalEncounter(
  _state: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  void _state;
  const context = await requireClinicalPermission(
    "clinico.preencher_prontuario",
  );
  if (!context?.organization) return { error: "Acesso negado." };
  const parsed = z
    .object({
      patient_id: z.string().uuid(),
      professional_id: z.string().uuid(),
      template_version_id: z.string().uuid(),
      appointment_id: z.union([z.string().uuid(), z.literal("")]),
      from: z.enum(["paciente", "prontuario"]).default("paciente"),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Selecione o profissional e a ficha clínica." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_clinical_encounter_v2", {
    p_patient_id: parsed.data.patient_id,
    p_professional_id: parsed.data.professional_id,
    p_template_version_id: parsed.data.template_version_id,
    p_appointment_id: parsed.data.appointment_id || null,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });

  if (error || !data) {
    return {
      error: friendlyError(
        error?.message ?? "Não foi possível iniciar o atendimento.",
      ),
    };
  }

  revalidatePath("/prontuario");
  revalidatePath("/agenda");
  revalidatePath(`/pacientes/${parsed.data.patient_id}`);
  redirect(`/prontuario/${data}?from=${encodeURIComponent(parsed.data.from)}`);
}

export async function saveEncounterDraft(
  encounterId: string,
  _state: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const context = await requireClinicalPermission(
    "clinico.preencher_prontuario",
  );
  if (!context?.organization) return { error: "Acesso negado." };

  const supabase = await createSupabaseServerClient();
  let payload;
  try {
    payload = await encounterPayload(supabase, encounterId, formData);
  } catch (error) {
    return clinicalPayloadState(error);
  }
  const expectedUpdatedAt = String(
    formData.get("expected_updated_at") ?? "",
  ).trim();
  const { data: updatedAt, error } = await supabase.rpc(
    "save_clinical_encounter_draft_v2",
    {
      p_encounter_id: encounterId,
      p_structured_data: payload.structuredData,
      p_free_notes: payload.freeNotes,
      p_diagnoses: payload.diagnoses,
      p_expected_updated_at: expectedUpdatedAt || null,
      p_impersonation_session_id: context.impersonation?.id ?? null,
    },
  );
  if (error) return { error: friendlyError(error.message) };

  return {
    success: "Rascunho salvo.",
    updatedAt: typeof updatedAt === "string" ? updatedAt : undefined,
  };
}

export async function saveAndFinalizeEncounter(
  encounterId: string,
  _state: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const context = await requireClinicalPermission(
    "clinico.finalizar_prontuario",
  );
  if (!context?.organization) return { error: "Acesso negado." };

  // A única RPC salva o conteúdo e muda o status na mesma transação. Se a
  // validação da finalização falhar, nenhuma alteração parcial é persistida.
  const supabase = await createSupabaseServerClient();
  let payload;
  try {
    payload = await encounterPayload(supabase, encounterId, formData, true);
  } catch (error) {
    return clinicalPayloadState(error);
  }
  const expectedUpdatedAt = String(
    formData.get("expected_updated_at") ?? "",
  ).trim();
  const { error } = await supabase.rpc(
    "save_and_finalize_clinical_encounter_v2",
    {
      p_encounter_id: encounterId,
      p_structured_data: payload.structuredData,
      p_free_notes: payload.freeNotes,
      p_diagnoses: payload.diagnoses,
      p_expected_updated_at: expectedUpdatedAt || null,
      p_impersonation_session_id: context.impersonation?.id ?? null,
    },
  );
  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/prontuario/${encounterId}`);
  revalidatePath("/prontuario");
  revalidatePath("/agenda");
  return { success: "Alterações salvas e atendimento finalizado." };
}

export async function finalizeEncounter(
  encounterId: string,
  _state: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  void _state;
  const context = await requireClinicalPermission(
    "clinico.finalizar_prontuario",
  );
  if (!context?.organization) return { error: "Acesso negado." };
  const supabase = await createSupabaseServerClient();
  const expectedUpdatedAt = String(
    formData.get("expected_updated_at") ?? "",
  ).trim();
  const { error } = await supabase.rpc("finalize_clinical_encounter_v2", {
    p_encounter_id: encounterId,
    p_expected_updated_at: expectedUpdatedAt || null,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath(`/prontuario/${encounterId}`);
  revalidatePath("/prontuario");
  revalidatePath("/agenda");
  revalidatePath("/pacientes");
  return { success: "Atendimento finalizado." };
}

async function encounterPayload(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  encounterId: string,
  formData: FormData,
  enforceRequired = false,
) {
  const { data: entry, error } = await supabase
    .from("encounter_entries")
    .select("template_snapshot")
    .eq("encounter_id", encounterId)
    .maybeSingle<{ template_snapshot: { schema?: unknown } }>();
  if (error || !entry) {
    throw new Error("Não foi possível carregar a estrutura deste prontuário.");
  }

  const structuredData = parseClinicalStructuredData(
    formData,
    entry.template_snapshot.schema,
    { enforceRequired },
  );
  const diagnosisCodes = formData
    .getAll("diagnosis_code")
    .map((value) => String(value).trim().toUpperCase());
  const diagnosisDescriptions = formData
    .getAll("diagnosis_description")
    .map((value) => String(value).trim());
  const diagnosisKeys = formData
    .getAll("diagnosis_key")
    .map((value) => String(value));
  const primaryDiagnosisKey = String(
    formData.get("primary_diagnosis_key") ?? "",
  );
  const seenDiagnosisCodes = new Set<string>();
  const diagnoses = diagnosisCodes.flatMap((cidCode, index) => {
    if (!cidCode || seenDiagnosisCodes.has(cidCode)) return [];
    seenDiagnosisCodes.add(cidCode);
    return [
      {
        cid_code: cidCode,
        description: diagnosisDescriptions[index] ?? "",
        is_primary: diagnosisKeys[index] === primaryDiagnosisKey,
      },
    ];
  });

  if (
    diagnoses.length &&
    !diagnoses.some((diagnosis) => diagnosis.is_primary)
  ) {
    diagnoses[0]!.is_primary = true;
  }

  return {
    structuredData,
    freeNotes: String(formData.get("free_notes") ?? ""),
    diagnoses,
  };
}

function clinicalPayloadState(error: unknown): ClinicalActionState {
  if (error instanceof ClinicalStructuredDataError) {
    return {
      error:
        error.issues[0]?.message ?? "Revise os campos clínicos informados.",
      fieldErrors: Object.fromEntries(
        error.issues.map((issue) => [issue.fieldId, issue.message]),
      ),
    };
  }
  return {
    error:
      error instanceof Error
        ? error.message
        : "Não foi possível validar os dados clínicos.",
  };
}

export async function addEncounterAddendum(
  encounterId: string,
  _state: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const context = await requireClinicalPermission("clinico.adicionar_adendo");
  if (!context?.organization) return { error: "Acesso negado." };
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "Informe o conteúdo do adendo." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_clinical_encounter_addendum_v2", {
    p_encounter_id: encounterId,
    p_content: content,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/prontuario/${encounterId}`);
  return { success: "Adendo registrado." };
}

export async function issueClinicalDocument(
  encounterId: string,
  _state: ClinicalActionState,
  formData: FormData,
): Promise<ClinicalActionState> {
  const documentType = String(formData.get("document_type") ?? "").trim();
  const permission = isClinicalDocumentType(documentType)
    ? documentTypePermissions[documentType]
    : null;
  if (!permission) return { error: "Tipo de documento inválido." };

  const context = await requireClinicalPermission(permission);
  if (!context?.organization) return { error: "Acesso negado." };

  const parsed = z
    .object({
      document_type: z.enum(clinicalDocumentTypes),
      template_id: z.union([z.string().uuid(), z.literal("")]),
      template_version_id: z.union([z.string().uuid(), z.literal("")]),
      title: z.string().trim().min(3).max(300),
      body: z.string().trim().min(3).max(30_000),
    })
    .refine(
      (value) =>
        Boolean(value.template_id) === Boolean(value.template_version_id),
      { message: "A versão do modelo selecionado é inválida." },
    )
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "Informe tipo, título e conteúdo do documento." };
  }

  const supabase = await createSupabaseServerClient();
  const fields: Record<string, string> = {};
  for (const field of documentFields[parsed.data.document_type] ?? []) {
    const value = String(formData.get("detail:" + field.key) ?? "").trim();
    if (value.length < 3 || value.length > 1000)
      return {
        error:
          "Preencha " + field.label.toLowerCase() + " (3 a 1.000 caracteres).",
      };
    fields[field.key] = value;
  }
  const { error } = await supabase.rpc("issue_clinical_document_v2", {
    p_encounter_id: encounterId,
    p_document_type: parsed.data.document_type,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_template_id: parsed.data.template_id || null,
    p_template_version_id: parsed.data.template_version_id || null,
    p_metadata: {
      issued_from: "encounter_page",
      fields,
    },
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/prontuario/${encounterId}`);
  revalidatePath("/pacientes", "layout");
  return {
    success:
      parsed.data.document_type === "informed_consent"
        ? "Termo preparado. Abra o termo para coletar a assinatura."
        : "Documento emitido.",
  };
}
