"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { formatCidCode } from "@/lib/clinical/cid10";
import { databaseErrorMessage } from "@/lib/errors/database";
import {
  CLINICAL_ATTACHMENTS_BUCKET,
  attachmentObjectName,
  isAttachmentCategory,
  patientAttachmentFolder,
  validateAttachment,
} from "@/lib/storage/clinical-attachments";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OverviewActionResult = { error?: string; success?: string };

const uuid = z.string().uuid();

/**
 * Confere, com a sessão da pessoa, que o paciente é da empresa dela (as
 * regras de patients decidem) e que o perfil tem a permissão pedida.
 * Diagnósticos e anexos da ficha são tabelas só do servidor: é este o
 * portão de acesso a elas.
 */
async function requirePatientAccess(
  patientId: string,
  mode: "clinical-read" | "clinical-write" | "notes-write",
) {
  const context = await getRequestContext();
  if (!context.organization || !uuid.safeParse(patientId).success) {
    return { error: "Paciente não encontrado." } as const;
  }
  const codes = context.permissionCodes;
  const canReadClinical = hasAnyPermission(codes, [
    "clinico.ver_prontuario",
    "clinico.ver_prontuario_proprios",
  ]);
  const allowed =
    mode === "notes-write"
      ? codes.has("paciente.editar") &&
        codes.has("paciente.ver_dados_sensiveis")
      : mode === "clinical-write"
        ? canReadClinical && codes.has("clinico.preencher_prontuario")
        : canReadClinical;
  if (!allowed) {
    return {
      error:
        mode === "notes-write"
          ? "Seu perfil não pode editar as observações deste paciente."
          : "Seu perfil não pode alterar o prontuário deste paciente.",
    } as const;
  }

  const supabase = await createSupabaseServerClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("id, organization_id")
    .eq("id", patientId)
    .eq("organization_id", context.organization.id)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (!patient) return { error: "Paciente não encontrado." } as const;

  return {
    context,
    organizationId: patient.organization_id,
    userId: context.effectiveUser?.id ?? context.actor?.id ?? null,
    actorId: context.actor?.id ?? null,
  } as const;
}

async function audit(
  access: {
    organizationId: string;
    actorId: string | null;
    userId: string | null;
  },
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown>,
) {
  await createSupabaseAdminClient()
    .from("audit_logs")
    .insert({
      organization_id: access.organizationId,
      actor_user_id: access.actorId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata: { ...metadata, effective_user_id: access.userId },
    });
}

// Diagnósticos do paciente --------------------------------------------------

const diagnosisSchema = z.object({
  cidCode: z.string().trim().min(2).max(10),
  description: z.string().trim().max(300).optional(),
  isPrimary: z.boolean().default(false),
});

function diagnosisError(
  error: { code?: string | null; message?: string | null } | null,
) {
  if (error?.code === "23505") {
    return (error.message ?? "").includes("single_primary")
      ? "Outro diagnóstico acabou de virar o principal. Atualize a página e tente de novo."
      : "Este CID já está na lista do paciente.";
  }
  return databaseErrorMessage(error, "Não foi possível salvar o diagnóstico.");
}

export async function addPatientDiagnosis(
  patientId: string,
  input: { cidCode: string; description?: string; isPrimary?: boolean },
): Promise<OverviewActionResult> {
  const access = await requirePatientAccess(patientId, "clinical-write");
  if ("error" in access) return { error: access.error };

  const parsed = diagnosisSchema.safeParse(input);
  const code = parsed.success ? formatCidCode(parsed.data.cidCode) : null;
  if (!parsed.success || !code) {
    return { error: "Informe um CID válido (ex.: I10 ou E78.0)." };
  }

  const admin = createSupabaseAdminClient();
  // Só um principal: o novo principal tira a marca do anterior.
  if (parsed.data.isPrimary) {
    const { error } = await admin
      .from("patient_diagnoses")
      .update({ is_primary: false })
      .eq("organization_id", access.organizationId)
      .eq("patient_id", patientId)
      .eq("is_primary", true)
      .is("removed_at", null);
    if (error) return { error: diagnosisError(error) };
  }

  const { data: row, error } = await admin
    .from("patient_diagnoses")
    .insert({
      organization_id: access.organizationId,
      patient_id: patientId,
      cid_code: code,
      description: parsed.data.description || null,
      is_primary: parsed.data.isPrimary,
      created_by: access.userId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !row) return { error: diagnosisError(error) };

  await audit(access, "patient_diagnoses.added", "patient_diagnosis", row.id, {
    patient_id: patientId,
    cid_code: code,
    is_primary: parsed.data.isPrimary,
  });
  revalidatePath(`/pacientes/${patientId}`);
  return { success: `${code} adicionado aos diagnósticos.` };
}

async function loadActiveDiagnosis(
  organizationId: string,
  patientId: string,
  diagnosisId: string,
) {
  if (!uuid.safeParse(diagnosisId).success) return null;
  const { data } = await createSupabaseAdminClient()
    .from("patient_diagnoses")
    .select("id, cid_code, is_primary")
    .eq("id", diagnosisId)
    .eq("organization_id", organizationId)
    .eq("patient_id", patientId)
    .is("removed_at", null)
    .maybeSingle<{ id: string; cid_code: string; is_primary: boolean }>();
  return data;
}

export async function setPrimaryPatientDiagnosis(
  patientId: string,
  diagnosisId: string,
): Promise<OverviewActionResult> {
  const access = await requirePatientAccess(patientId, "clinical-write");
  if ("error" in access) return { error: access.error };
  const diagnosis = await loadActiveDiagnosis(
    access.organizationId,
    patientId,
    diagnosisId,
  );
  if (!diagnosis) return { error: "Diagnóstico não encontrado." };
  if (diagnosis.is_primary) return { success: "Já é o diagnóstico principal." };

  const admin = createSupabaseAdminClient();
  const cleared = await admin
    .from("patient_diagnoses")
    .update({ is_primary: false })
    .eq("organization_id", access.organizationId)
    .eq("patient_id", patientId)
    .eq("is_primary", true)
    .is("removed_at", null);
  if (cleared.error) return { error: diagnosisError(cleared.error) };
  const { error } = await admin
    .from("patient_diagnoses")
    .update({ is_primary: true })
    .eq("id", diagnosis.id)
    .eq("organization_id", access.organizationId);
  if (error) return { error: diagnosisError(error) };

  await audit(
    access,
    "patient_diagnoses.primary_changed",
    "patient_diagnosis",
    diagnosis.id,
    { patient_id: patientId, cid_code: diagnosis.cid_code },
  );
  revalidatePath(`/pacientes/${patientId}`);
  return { success: `${diagnosis.cid_code} agora é o diagnóstico principal.` };
}

/** "Remove" sem apagar: some da ficha e a remoção fica na auditoria. */
export async function removePatientDiagnosis(
  patientId: string,
  diagnosisId: string,
): Promise<OverviewActionResult> {
  const access = await requirePatientAccess(patientId, "clinical-write");
  if ("error" in access) return { error: access.error };
  const diagnosis = await loadActiveDiagnosis(
    access.organizationId,
    patientId,
    diagnosisId,
  );
  if (!diagnosis) return { error: "Diagnóstico não encontrado." };

  const { error } = await createSupabaseAdminClient()
    .from("patient_diagnoses")
    .update({
      removed_at: new Date().toISOString(),
      removed_by: access.userId,
      is_primary: false,
    })
    .eq("id", diagnosis.id)
    .eq("organization_id", access.organizationId);
  if (error) return { error: diagnosisError(error) };

  await audit(
    access,
    "patient_diagnoses.removed",
    "patient_diagnosis",
    diagnosis.id,
    { patient_id: patientId, cid_code: diagnosis.cid_code },
  );
  revalidatePath(`/pacientes/${patientId}`);
  return { success: `${diagnosis.cid_code} removido da lista.` };
}

// Arquivos enviados direto na ficha ----------------------------------------

const fileSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive(),
  contentType: z.string().trim().min(3).max(100),
});

/** Gera o link de envio direto ao Storage (arquivos de até 20 MB). */
export async function preparePatientAttachmentUpload(
  patientId: string,
  input: { fileName: string; sizeBytes: number; contentType: string },
): Promise<{ error?: string; path?: string; token?: string }> {
  const access = await requirePatientAccess(patientId, "clinical-write");
  if ("error" in access) return { error: access.error };

  const parsed = fileSchema.safeParse(input);
  const invalid = parsed.success
    ? validateAttachment(parsed.data)
    : "Arquivo inválido.";
  if (invalid) return { error: invalid };

  const path = `${patientAttachmentFolder({
    organizationId: access.organizationId,
    patientId,
  })}${attachmentObjectName(input.fileName)}`;
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(CLINICAL_ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { error: "Não foi possível preparar o envio. Tente de novo." };
  }
  return { path, token: data.token };
}

/** Registra o arquivo já enviado ao Storage, com a categoria escolhida. */
export async function confirmPatientAttachmentUpload(
  patientId: string,
  input: {
    path: string;
    fileName: string;
    sizeBytes: number;
    contentType: string;
    category: string;
  },
): Promise<OverviewActionResult> {
  const access = await requirePatientAccess(patientId, "clinical-write");
  if ("error" in access) return { error: access.error };

  const parsed = fileSchema.safeParse(input);
  if (!parsed.success || !isAttachmentCategory(input.category)) {
    return { error: "Arquivo inválido." };
  }
  const folder = patientAttachmentFolder({
    organizationId: access.organizationId,
    patientId,
  });
  const objectName = input.path.slice(folder.length);
  if (
    !input.path.startsWith(folder) ||
    !objectName ||
    objectName.includes("/")
  ) {
    return { error: "Arquivo inválido." };
  }

  const admin = createSupabaseAdminClient();
  // O arquivo precisa mesmo ter chegado ao Storage antes de virar registro.
  const { data: objects } = await admin.storage
    .from(CLINICAL_ATTACHMENTS_BUCKET)
    .list(folder.slice(0, -1), { search: objectName, limit: 1 });
  if (!objects?.some((object) => object.name === objectName)) {
    return { error: "O arquivo não chegou. Tente enviar de novo." };
  }

  const { data: row, error } = await admin
    .from("encounter_attachments")
    .insert({
      organization_id: access.organizationId,
      encounter_id: null,
      patient_id: patientId,
      category: input.category,
      storage_path: input.path,
      file_name: parsed.data.fileName,
      content_type: parsed.data.contentType,
      size_bytes: parsed.data.sizeBytes,
      uploaded_by: access.userId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !row) {
    await admin.storage.from(CLINICAL_ATTACHMENTS_BUCKET).remove([input.path]);
    return {
      error: databaseErrorMessage(error, "Não foi possível salvar o arquivo."),
    };
  }

  await audit(
    access,
    "encounter_attachments.uploaded",
    "encounter_attachment",
    row.id,
    {
      patient_id: patientId,
      category: input.category,
      file_name: parsed.data.fileName,
      size_bytes: parsed.data.sizeBytes,
    },
  );
  revalidatePath(`/pacientes/${patientId}`);
  return { success: `${parsed.data.fileName} adicionado aos documentos.` };
}

/**
 * Tira um arquivo da ficha sem apagar (o prontuário precisa ser guardado).
 * Serve para os enviados na ficha e para os dos atendimentos — nesse caso a
 * pessoa precisa enxergar o atendimento, como na tela do prontuário.
 */
export async function removePatientAttachment(
  patientId: string,
  attachmentId: string,
): Promise<OverviewActionResult> {
  const access = await requirePatientAccess(patientId, "clinical-write");
  if ("error" in access) return { error: access.error };
  if (!uuid.safeParse(attachmentId).success) {
    return { error: "Arquivo não encontrado." };
  }

  const admin = createSupabaseAdminClient();
  const { data: attachment } = await admin
    .from("encounter_attachments")
    .select("id, encounter_id, file_name")
    .eq("id", attachmentId)
    .eq("organization_id", access.organizationId)
    .eq("patient_id", patientId)
    .is("removed_at", null)
    .maybeSingle<{
      id: string;
      encounter_id: string | null;
      file_name: string;
    }>();
  if (!attachment) return { error: "Arquivo não encontrado." };

  if (attachment.encounter_id) {
    const supabase = await createSupabaseServerClient();
    const { data: encounter } = await supabase
      .from("encounters")
      .select("id")
      .eq("id", attachment.encounter_id)
      .maybeSingle<{ id: string }>();
    if (!encounter) {
      return { error: "Seu perfil não enxerga o atendimento deste arquivo." };
    }
  }

  const { error } = await admin
    .from("encounter_attachments")
    .update({ removed_at: new Date().toISOString(), removed_by: access.userId })
    .eq("id", attachment.id)
    .eq("organization_id", access.organizationId);
  if (error) {
    return { error: databaseErrorMessage(error, "Não foi possível remover.") };
  }

  await audit(
    access,
    "encounter_attachments.removed",
    "encounter_attachment",
    attachment.id,
    {
      patient_id: patientId,
      encounter_id: attachment.encounter_id,
      file_name: attachment.file_name,
    },
  );
  revalidatePath(`/pacientes/${patientId}`);
  if (attachment.encounter_id) {
    revalidatePath(`/prontuario/${attachment.encounter_id}`);
  }
  return { success: `${attachment.file_name} removido da lista.` };
}

// Observações gerais -------------------------------------------------------

export async function updatePatientGeneralNotes(
  patientId: string,
  notes: string,
): Promise<OverviewActionResult> {
  const access = await requirePatientAccess(patientId, "notes-write");
  if ("error" in access) return { error: access.error };

  const text = notes.trim();
  if (text.length > 4000) {
    return { error: "As observações passam de 4.000 caracteres." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("patient_clinical_summaries").upsert(
    {
      organization_id: access.organizationId,
      patient_id: patientId,
      general_notes: text || null,
    },
    { onConflict: "organization_id,patient_id" },
  );
  if (error) {
    return {
      error: databaseErrorMessage(
        error,
        "Não foi possível salvar as observações.",
      ),
    };
  }

  revalidatePath(`/pacientes/${patientId}`);
  return { success: text ? "Observações salvas." : "Observações removidas." };
}
