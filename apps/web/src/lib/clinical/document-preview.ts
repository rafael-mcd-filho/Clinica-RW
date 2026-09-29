import type {
  DocumentRenderInput,
  RenderContext,
} from "../pdf/clinical-document";
import type { ClinicalDocumentType } from "./document-types";
import type { DocumentTemplateLayout } from "./document-templates";

export function documentPreviewInput({
  title,
  body,
  type,
  fields = {},
  context,
  layout,
  issuedAt,
}: {
  title: string;
  body: string;
  type: ClinicalDocumentType;
  fields?: Record<string, string>;
  context: RenderContext;
  layout: DocumentTemplateLayout;
  issuedAt: string;
}): DocumentRenderInput {
  const document = {
    id: "previa",
    organization_id: "",
    encounter_id: "",
    patient_id: "",
    professional_id: "",
    document_type: type,
    title: title.trim(),
    body: body.trim(),
    metadata: { fields },
    issued_at: issuedAt,
  };
  return {
    document,
    context,
    layout,
    consent:
      type === "informed_consent"
        ? {
            id: document.id,
            encounterId: "",
            patientId: "",
            title: document.title,
            body: document.body,
            issuedAt,
            procedure: fields.procedure ?? "",
            patientName: context.patient.fullName,
            timeZone: context.timezone,
            canManage: false,
            events: [],
          }
        : undefined,
  };
}
