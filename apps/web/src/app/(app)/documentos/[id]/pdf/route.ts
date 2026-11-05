import { notFound } from "next/navigation";
import { after } from "next/server";
import { getRequestContext } from "@/lib/auth/context";
import {
  logClinicalRecordAccess,
  requestOrigin,
} from "@/lib/audit/clinical-access";
import { loadConsentDetails } from "../../consent-actions";
import type { ConsentDetails } from "@/lib/clinical/consent";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DocumentRow } from "@/lib/pdf/clinical-document";
import { renderClinicalDocumentPdf } from "@/lib/pdf/render-clinical-document";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: document } = await supabase
    .from("clinical_documents")
    .select(
      "id, organization_id, encounter_id, patient_id, professional_id, document_type, title, body, metadata, issued_at",
    )
    .eq("id", id)
    .maybeSingle<DocumentRow>();

  if (!document) notFound();

  // Gerar ou abrir o PDF também é leitura de prontuário (Raio-X S6).
  const [requestContext, origin] = await Promise.all([
    getRequestContext(),
    requestOrigin(),
  ]);
  if (requestContext.organization || requestContext.isSuperAdmin) {
    after(() =>
      logClinicalRecordAccess({
        organizationId: document.organization_id,
        actorUserId: requestContext.actor?.id ?? null,
        effectiveUserId: requestContext.effectiveUser?.id ?? null,
        impersonationSessionId: requestContext.impersonation?.id ?? null,
        patientId: document.patient_id,
        encounterId: document.encounter_id,
        documentId: document.id,
        view: "document_pdf",
        origin,
      }),
    );
  }

  let consent: ConsentDetails | undefined;
  if (document.document_type === "informed_consent") {
    const result = await loadConsentDetails(document.id);
    if (!result.data)
      return new Response(
        "Não foi possível carregar a situação do termo. Tente novamente.",
        { status: 503, headers: { "Cache-Control": "private, no-store" } },
      );
    consent = result.data;
  }
  const rendered = await renderClinicalDocumentPdf(supabase, document, consent);
  if (!rendered) notFound();
  const pdfBytes = rendered.bytes;
  const filename = rendered.filename;

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      // ?download=1 baixa o arquivo (botão de download da ficha); sem ele
      // o PDF abre no navegador.
      "Content-Disposition": `${
        new URL(request.url).searchParams.get("download") === "1"
          ? "attachment"
          : "inline"
      }; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
