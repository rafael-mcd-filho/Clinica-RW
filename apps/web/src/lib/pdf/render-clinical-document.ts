import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentDetails } from "@/lib/clinical/consent";
import { normalizeDocumentTemplateLayout } from "@/lib/clinical/document-templates";
import {
  asRecord,
  buildDocumentPdf,
  buildRenderContext,
  slug,
  type ClinicRow,
  type DocumentRow,
  type OrganizationRow,
  type PatientRow,
  type ProfessionalRow,
} from "@/lib/pdf/clinical-document";

/**
 * Gera o PDF de um documento clínico já carregado. Usado pela rota interna
 * (cliente do usuário, RLS) e pelo link enviado ao paciente (service role,
 * depois de conferir o token).
 */
export async function renderClinicalDocumentPdf(
  supabase: SupabaseClient,
  document: DocumentRow,
  consent?: ConsentDetails,
) {
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
  if (!context.patient.displayName || !context.professional.name) return null;

  const bytes = await buildDocumentPdf({ document, context, layout, consent });
  return {
    bytes,
    filename: `${slug(document.title)}-${document.id.slice(0, 8)}.pdf`,
  };
}
