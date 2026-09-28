"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  consentEvidenceSchema,
  type ConsentDetails,
} from "@/lib/clinical/consent";

function errorMessage(code?: string) {
  if (code === "42501")
    return "Seu perfil não tem permissão para esta ação neste prontuário.";
  if (code === "P0002") return "Termo não encontrado.";
  if (code === "40001" || code === "23505")
    return "A situação do termo mudou. Atualize os detalhes antes de continuar.";
  if (code === "22023")
    return "Confira a identificação, a assinatura e a confirmação de leitura.";
  return "Não foi possível concluir a operação. Tente novamente.";
}
export async function loadConsentDetails(
  documentId: string,
): Promise<{ data?: ConsentDetails; error?: string }> {
  if (!z.string().uuid().safeParse(documentId).success)
    return { error: "Termo inválido." };
  const context = await getRequestContext();
  if (!context.organization || !context.effectiveUser)
    return { error: "Acesso negado." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_clinical_document_consent", {
    p_document_id: documentId,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });
  if (error || !data) return { error: errorMessage(error?.code) };
  return { data: data as ConsentDetails };
}

export async function recordConsentEvent(
  documentId: string,
  eventType: "signed" | "cancelled" | "revoked",
  evidence: unknown,
): Promise<{ success?: boolean; error?: string }> {
  if (
    !z.string().uuid().safeParse(documentId).success ||
    !z.enum(["signed", "cancelled", "revoked"]).safeParse(eventType).success
  )
    return { error: "Termo ou ação inválida." };
  const context = await getRequestContext();
  if (
    !context.organization ||
    !context.effectiveUser ||
    !context.permissionCodes.has("clinico.gerenciar_consentimento")
  )
    return {
      error: "Seu perfil não tem permissão para registrar consentimentos.",
    };
  const parsed =
    eventType === "signed"
      ? consentEvidenceSchema.safeParse(evidence)
      : z
          .object({ reason: z.string().trim().min(5).max(2000) })
          .strict()
          .safeParse(evidence);
  if (!parsed.success)
    return {
      error:
        eventType === "signed"
          ? "Confira a identificação, a assinatura e a confirmação de leitura."
          : "Informe o motivo (5 a 2.000 caracteres).",
    };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_clinical_document_consent", {
    p_document_id: documentId,
    p_event_type: eventType,
    p_evidence: parsed.data,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });
  if (error) return { error: errorMessage(error.code) };
  revalidatePath("/prontuario", "layout");
  revalidatePath("/pacientes", "layout");
  return { success: true };
}
