import { verifyDocumentShareToken } from "@/lib/clinical/document-share";
import { renderClinicalDocumentPdf } from "@/lib/pdf/render-clinical-document";
import type { DocumentRow } from "@/lib/pdf/clinical-document";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function notAvailable() {
  return new Response(
    "Este link expirou ou não é válido. Peça um novo à clínica.",
    {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    },
  );
}

/**
 * Documento enviado ao paciente pelo WhatsApp (Raio-X E7). Sem login: vale
 * o token assinado com prazo. Cada abertura fica registrada na auditoria.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const share = verifyDocumentShareToken(token);
  if (!share) return notAvailable();

  const admin = createSupabaseAdminClient();
  const { data: document } = await admin
    .from("clinical_documents")
    .select(
      "id, organization_id, encounter_id, patient_id, professional_id, document_type, title, body, metadata, issued_at",
    )
    .eq("id", share.documentId)
    .eq("organization_id", share.organizationId)
    .maybeSingle<DocumentRow>();
  if (!document || document.document_type === "informed_consent") {
    return notAvailable();
  }

  const rendered = await renderClinicalDocumentPdf(admin, document);
  if (!rendered) return notAvailable();

  await admin.from("audit_logs").insert({
    organization_id: document.organization_id,
    actor_user_id: null,
    action: "clinical_document.link_opened",
    resource_type: "clinical_document",
    resource_id: document.id,
    user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    metadata: { patient_id: document.patient_id, via: "whatsapp_link" },
  });

  return new Response(Buffer.from(rendered.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${rendered.filename}"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
