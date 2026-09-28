import { notFound } from "next/navigation";
import { loadConsentDetails } from "../../consent-actions";
import type { ConsentDetails } from "@/lib/clinical/consent";
import { normalizeDocumentTemplateLayout } from "@/lib/clinical/document-templates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildDocumentPdf,
  buildRenderContext,
  slug,
  asRecord,
  type DocumentRow,
  type PatientRow,
  type ProfessionalRow,
  type ClinicRow,
  type OrganizationRow,
} from "@/lib/pdf/clinical-document";
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

  const [patientResult, professionalResult, clinicResult, organizationResult] =
    await Promise.all([
      supabase
        .from("patients")
        .select("full_name, social_name, cpf, rg, birth_date")
        .eq("organization_id", document.organization_id)
        .eq("id", document.patient_id)
        .maybeSingle<PatientRow>(),
      supabase
        .from("professionals")
        .select("name, council_type, council_number, council_state")
        .eq("organization_id", document.organization_id)
        .eq("id", document.professional_id)
        .maybeSingle<ProfessionalRow>(),
      supabase
        .from("clinics")
        .select(
          "trade_name, legal_name, document, phone, email, address_line, address_number, address_complement, district, city, state",
        )
        .eq("organization_id", document.organization_id)
        .maybeSingle<ClinicRow>(),
      supabase
        .from("organizations")
        .select("name, logo_url")
        .eq("id", document.organization_id)
        .maybeSingle<OrganizationRow>(),
    ]);

  const metadata = asRecord(document.metadata);
  const templateSnapshot = asRecord(metadata.template);
  const renderSnapshot = asRecord(metadata.render);
  const layout = normalizeDocumentTemplateLayout(
    templateSnapshot.layout_schema ?? templateSnapshot.layoutSchema,
  );
  const context = buildRenderContext({
    renderSnapshot,
    patient: patientResult.data,
    professional: professionalResult.data,
    clinic: clinicResult.data,
    organization: organizationResult.data,
  });

  if (!context.patient.displayName || !context.professional.name) notFound();

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
  const pdfBytes = await buildDocumentPdf({
    document,
    context,
    layout,
    consent,
  });
  const filename = `${slug(document.title)}-${document.id.slice(0, 8)}.pdf`;

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
