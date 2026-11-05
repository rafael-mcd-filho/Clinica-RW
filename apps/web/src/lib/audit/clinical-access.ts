import "server-only";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** IP e navegador da requisição, lidos antes de `after()` (lá dentro as
    APIs de requisição não estão disponíveis em Server Components). */
export async function requestOrigin() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded && ipPattern.test(forwarded) ? forwarded : null,
    userAgent: headerList.get("user-agent")?.slice(0, 300) ?? null,
  };
}

/** Uma visita por pessoa e registro a cada 15 minutos: o salvamento
    automático re-renderiza a página e geraria dezenas de linhas iguais. */
const dedupeWindowMinutes = 15;

const ipPattern = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]+)$/i;

/**
 * Registra quem abriu conteúdo clínico (Raio-X S6): leitura não deixava
 * rastro, só alteração. Grava na mesma `audit_logs` das alterações, com o
 * usuário real (no suporte, o super admin) e o efetivo. Falha de registro
 * nunca impede o atendimento.
 */
export async function logClinicalRecordAccess(input: {
  organizationId: string;
  actorUserId: string | null;
  effectiveUserId: string | null;
  impersonationSessionId: string | null;
  patientId: string;
  encounterId?: string | null;
  documentId?: string | null;
  view: "encounter" | "patient_record" | "document_pdf";
  origin: { ip: string | null; userAgent: string | null };
}) {
  try {
    const admin = createSupabaseAdminClient();
    const resourceType = input.documentId
      ? "clinical_document"
      : input.encounterId
        ? "encounter"
        : "patient";
    const resourceId = input.documentId ?? input.encounterId ?? input.patientId;
    const since = new Date(
      Date.now() - dedupeWindowMinutes * 60_000,
    ).toISOString();

    let recent = admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", input.organizationId)
      .eq("action", "clinical_record.viewed")
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .gte("created_at", since);
    recent = input.actorUserId
      ? recent.eq("actor_user_id", input.actorUserId)
      : recent.is("actor_user_id", null);
    const { count } = await recent;
    if ((count ?? 0) > 0) return;

    await admin.from("audit_logs").insert({
      organization_id: input.organizationId,
      actor_user_id: input.actorUserId,
      action: "clinical_record.viewed",
      resource_type: resourceType,
      resource_id: resourceId,
      ip_address: input.origin.ip,
      user_agent: input.origin.userAgent,
      metadata: {
        patient_id: input.patientId,
        encounter_id: input.encounterId ?? null,
        document_id: input.documentId ?? null,
        view: input.view,
        effective_user_id: input.effectiveUserId,
        impersonation_session_id: input.impersonationSessionId,
      },
    });
  } catch (error) {
    console.error("[auditoria] falha ao registrar acesso clínico", error);
  }
}
