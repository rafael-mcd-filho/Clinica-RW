"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { databaseErrorMessage } from "@/lib/errors/database";
import {
  CLINICAL_ATTACHMENTS_BUCKET,
  attachmentFolder,
  attachmentObjectName,
  validateAttachment,
} from "@/lib/storage/clinical-attachments";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AttachmentActionResult = { error?: string; success?: string };

const fileSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  sizeBytes: z.number().int().positive(),
  contentType: z.string().trim().min(3).max(100),
});

/**
 * Confere, com a sessão da pessoa, se ela enxerga o atendimento (as regras de
 * encounters decidem, inclusive "só os próprios"). Para enviar ou remover,
 * exige também poder preencher prontuário.
 */
async function requireEncounterAccess(encounterId: string, write: boolean) {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !z.string().uuid().safeParse(encounterId).success
  ) {
    return { error: "Atendimento não encontrado." } as const;
  }
  const canView = hasAnyPermission(context.permissionCodes, [
    "clinico.ver_prontuario",
    "clinico.ver_prontuario_proprios",
  ]);
  const canWrite = context.permissionCodes.has("clinico.preencher_prontuario");
  if (!canView || (write && !canWrite)) {
    return {
      error: "Seu perfil não pode enviar arquivos para este atendimento.",
    } as const;
  }

  const supabase = await createSupabaseServerClient();
  const { data: encounter } = await supabase
    .from("encounters")
    .select("id, organization_id, patient_id")
    .eq("id", encounterId)
    .maybeSingle<{ id: string; organization_id: string; patient_id: string }>();
  if (!encounter || encounter.organization_id !== context.organization.id) {
    return { error: "Atendimento não encontrado." } as const;
  }
  return { context, encounter } as const;
}

/** Gera o link de envio direto ao Storage (arquivos de até 20 MB). */
export async function prepareAttachmentUpload(
  encounterId: string,
  input: { fileName: string; sizeBytes: number; contentType: string },
): Promise<{ error?: string; path?: string; token?: string }> {
  const access = await requireEncounterAccess(encounterId, true);
  if ("error" in access) return { error: access.error };

  const parsed = fileSchema.safeParse(input);
  const invalid = parsed.success
    ? validateAttachment(parsed.data)
    : "Arquivo inválido.";
  if (invalid) return { error: invalid };

  const path = `${attachmentFolder({
    organizationId: access.encounter.organization_id,
    patientId: access.encounter.patient_id,
    encounterId,
  })}${attachmentObjectName(input.fileName)}`;
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(CLINICAL_ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return {
      error: /bucket/i.test(error?.message ?? "")
        ? "O envio de exames entra com a próxima atualização do sistema."
        : "Não foi possível preparar o envio. Tente de novo.",
    };
  }
  return { path, token: data.token };
}

/** Registra o arquivo já enviado ao Storage. */
export async function confirmAttachmentUpload(
  encounterId: string,
  input: {
    path: string;
    fileName: string;
    sizeBytes: number;
    contentType: string;
  },
): Promise<AttachmentActionResult> {
  const access = await requireEncounterAccess(encounterId, true);
  if ("error" in access) return { error: access.error };

  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return { error: "Arquivo inválido." };
  const folder = attachmentFolder({
    organizationId: access.encounter.organization_id,
    patientId: access.encounter.patient_id,
    encounterId,
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

  const uploaderId =
    access.context.effectiveUser?.id ?? access.context.actor?.id ?? null;
  const { data: row, error } = await admin
    .from("encounter_attachments")
    .insert({
      organization_id: access.encounter.organization_id,
      encounter_id: encounterId,
      patient_id: access.encounter.patient_id,
      storage_path: input.path,
      file_name: parsed.data.fileName,
      content_type: parsed.data.contentType,
      size_bytes: parsed.data.sizeBytes,
      uploaded_by: uploaderId,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !row) {
    await admin.storage.from(CLINICAL_ATTACHMENTS_BUCKET).remove([input.path]);
    return {
      error: databaseErrorMessage(error, "Não foi possível salvar o arquivo."),
    };
  }

  await admin.from("audit_logs").insert({
    organization_id: access.encounter.organization_id,
    actor_user_id: access.context.actor?.id ?? null,
    action: "encounter_attachments.uploaded",
    resource_type: "encounter_attachment",
    resource_id: row.id,
    metadata: {
      encounter_id: encounterId,
      file_name: parsed.data.fileName,
      size_bytes: parsed.data.sizeBytes,
      effective_user_id: uploaderId,
    },
  });

  revalidatePath(`/prontuario/${encounterId}`);
  revalidatePath(`/pacientes/${access.encounter.patient_id}`);
  return { success: `${parsed.data.fileName} anexado.` };
}

/**
 * "Remove" sem apagar: o arquivo some das listas, mas continua guardado (o
 * prontuário precisa ser preservado) e a remoção fica na auditoria.
 */
export async function removeAttachment(
  attachmentId: string,
): Promise<AttachmentActionResult> {
  if (!z.string().uuid().safeParse(attachmentId).success) {
    return { error: "Arquivo não encontrado." };
  }
  const admin = createSupabaseAdminClient();
  const { data: attachment } = await admin
    .from("encounter_attachments")
    .select("id, encounter_id, file_name")
    .eq("id", attachmentId)
    .is("removed_at", null)
    .maybeSingle<{ id: string; encounter_id: string; file_name: string }>();
  if (!attachment) return { error: "Arquivo não encontrado." };

  const access = await requireEncounterAccess(attachment.encounter_id, true);
  if ("error" in access) return { error: access.error };

  const removerId =
    access.context.effectiveUser?.id ?? access.context.actor?.id ?? null;
  const { error } = await admin
    .from("encounter_attachments")
    .update({ removed_at: new Date().toISOString(), removed_by: removerId })
    .eq("id", attachment.id)
    .eq("organization_id", access.encounter.organization_id);
  if (error) {
    return { error: databaseErrorMessage(error, "Não foi possível remover.") };
  }

  await admin.from("audit_logs").insert({
    organization_id: access.encounter.organization_id,
    actor_user_id: access.context.actor?.id ?? null,
    action: "encounter_attachments.removed",
    resource_type: "encounter_attachment",
    resource_id: attachment.id,
    metadata: {
      encounter_id: attachment.encounter_id,
      file_name: attachment.file_name,
      effective_user_id: removerId,
    },
  });

  revalidatePath(`/prontuario/${attachment.encounter_id}`);
  revalidatePath(`/pacientes/${access.encounter.patient_id}`);
  return { success: `${attachment.file_name} removido da lista.` };
}
