"use server";

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
  success?: string;
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
  if (message.includes("Not allowed to issue clinical document")) {
    return "Seu perfil não possui permissão para emitir este documento.";
  }
  if (message.includes("Clinical document title and body are required")) {
    return "Informe título e conteúdo do documento.";
  }
  return message;
}

function documentPermission(documentType: string) {
  switch (documentType) {
    case "prescription":
      return "clinico.prescrever";
    case "exam_request":
      return "clinico.solicitar_exame";
    case "medical_certificate":
    case "attendance_declaration":
      return "clinico.emitir_atestado";
    default:
      return null;
  }
}

export async function createEncounter(formData: FormData) {
  const context = await requireClinicalPermission(
    "clinico.preencher_prontuario",
  );
  if (!context?.organization) redirect("/dashboard");
  const parsed = z
    .object({
      patient_id: z.string().uuid(),
      professional_id: z.string().uuid(),
      template_version_id: z.string().uuid(),
      appointment_id: z.union([z.string().uuid(), z.literal("")]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/prontuario?erro=dados-invalidos");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_clinical_encounter", {
    p_patient_id: parsed.data.patient_id,
    p_professional_id: parsed.data.professional_id,
    p_template_version_id: parsed.data.template_version_id,
    p_appointment_id: parsed.data.appointment_id || null,
  });

  if (error || !data) {
    redirect(
      `/prontuario?erro=${encodeURIComponent(error?.message ?? "erro")}`,
    );
  }

  revalidatePath("/prontuario");
  redirect(`/prontuario/${data}`);
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
    return { error: clinicalPayloadError(error) };
  }
  const { error } = await supabase.rpc("save_clinical_encounter_draft", {
    p_encounter_id: encounterId,
    p_structured_data: payload.structuredData,
    p_free_notes: payload.freeNotes,
    p_diagnoses: payload.diagnoses,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/prontuario/${encounterId}`);
  return { success: "Rascunho salvo." };
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
    payload = await encounterPayload(supabase, encounterId, formData);
  } catch (error) {
    return { error: clinicalPayloadError(error) };
  }
  const { error } = await supabase.rpc("save_and_finalize_clinical_encounter", {
    p_encounter_id: encounterId,
    p_structured_data: payload.structuredData,
    p_free_notes: payload.freeNotes,
    p_diagnoses: payload.diagnoses,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/prontuario/${encounterId}`);
  revalidatePath("/prontuario");
  revalidatePath("/agenda");
  return { success: "Alterações salvas e atendimento finalizado." };
}

export async function finalizeEncounter(
  encounterId: string,
  _state: ClinicalActionState,
): Promise<ClinicalActionState> {
  void _state;
  const context = await requireClinicalPermission(
    "clinico.finalizar_prontuario",
  );
  if (!context?.organization) return { error: "Acesso negado." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("finalize_clinical_encounter", {
    p_encounter_id: encounterId,
  });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath(`/prontuario/${encounterId}`);
  revalidatePath("/prontuario");
  return { success: "Atendimento finalizado." };
}

async function encounterPayload(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  encounterId: string,
  formData: FormData,
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
  );
  const cidCode = String(formData.get("cid_code") ?? "")
    .trim()
    .toUpperCase();
  const cidDescription = String(formData.get("cid_description") ?? "").trim();

  return {
    structuredData,
    freeNotes: String(formData.get("free_notes") ?? ""),
    diagnoses: cidCode
      ? [{ cid_code: cidCode, description: cidDescription, is_primary: true }]
      : [],
  };
}

function clinicalPayloadError(error: unknown) {
  if (error instanceof ClinicalStructuredDataError) {
    return error.issues[0]?.message ?? "Revise os campos clínicos informados.";
  }
  return error instanceof Error
    ? error.message
    : "Não foi possível validar os dados clínicos.";
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
  const { error } = await supabase.rpc("add_clinical_encounter_addendum", {
    p_encounter_id: encounterId,
    p_content: content,
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
  const permission = documentPermission(documentType);
  if (!permission) return { error: "Tipo de documento inválido." };

  const context = await requireClinicalPermission(permission);
  if (!context?.organization) return { error: "Acesso negado." };

  const parsed = z
    .object({
      document_type: z.enum([
        "prescription",
        "exam_request",
        "medical_certificate",
        "attendance_declaration",
      ]),
      template_id: z.union([z.string().uuid(), z.literal("")]),
      template_version_id: z.union([z.string().uuid(), z.literal("")]),
      title: z.string().trim().min(3),
      body: z.string().trim().min(3),
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
  const { error } = await supabase.rpc("issue_clinical_document_v2", {
    p_encounter_id: encounterId,
    p_document_type: parsed.data.document_type,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_template_id: parsed.data.template_id || null,
    p_template_version_id: parsed.data.template_version_id || null,
    p_metadata: {
      issued_from: "encounter_page",
    },
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath(`/prontuario/${encounterId}`);
  return { success: "Documento emitido." };
}
