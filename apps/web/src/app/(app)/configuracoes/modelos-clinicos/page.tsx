import {
  ClipboardText as ClipboardList,
  FileText,
} from "@phosphor-icons/react/dist/ssr";
import {
  DocumentTemplateManager,
  type DocumentClinicBranding,
  type ClinicalDocumentTemplateSummary,
} from "./document-template-manager";
import { CompanyConfigurationPage } from "../configuration-page";
import { requireCompanyConfigurationAccess } from "../_lib/server";
import {
  TemplateBuilderForm,
  type ClinicalTemplateSummary,
} from "../../prontuario/template-builder-form";
import { Tabs } from "@/components/ui/tabs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ClinicalTemplateRow = Omit<ClinicalTemplateSummary, "versions">;
type ClinicalTemplateVersionRow =
  ClinicalTemplateSummary["versions"][number] & {
    template_id: string;
  };
type DocumentTemplateRow = Omit<ClinicalDocumentTemplateSummary, "versions">;
type DocumentTemplateVersionRow =
  ClinicalDocumentTemplateSummary["versions"][number] & {
    template_id: string;
  };
type ClinicBrandingRow = {
  trade_name: string;
  legal_name: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

export default async function ModelosClinicosConfiguracoesPage() {
  const access = await requireCompanyConfigurationAccess("modelos-clinicos");
  const supabase = await createSupabaseServerClient();
  const organizationId = access.organization.id;

  const [
    clinicalTemplatesResult,
    clinicalVersionsResult,
    documentTemplatesResult,
    documentVersionsResult,
    clinicResult,
  ] = await Promise.all([
    supabase
      .from("clinical_templates")
      .select("id, name, description, status, is_default")
      .eq("organization_id", organizationId)
      .order("is_default", { ascending: false })
      .order("name")
      .returns<ClinicalTemplateRow[]>(),
    supabase
      .from("clinical_template_versions")
      .select("id, template_id, version_number, schema, published_at")
      .eq("organization_id", organizationId)
      .order("version_number", { ascending: false })
      .returns<ClinicalTemplateVersionRow[]>(),
    supabase
      .from("clinical_document_templates")
      .select("id, document_type, name, description, active")
      .eq("organization_id", organizationId)
      .order("active", { ascending: false })
      .order("document_type")
      .order("name")
      .returns<DocumentTemplateRow[]>(),
    supabase
      .from("clinical_document_template_versions")
      .select(
        "id, template_id, version_number, title_template, body_template, layout_schema, published_at",
      )
      .eq("organization_id", organizationId)
      .order("version_number", { ascending: false })
      .returns<DocumentTemplateVersionRow[]>(),
    supabase
      .from("clinics")
      .select(
        "trade_name, legal_name, document, phone, email, address_line, address_number, address_complement, district, city, state",
      )
      .eq("organization_id", organizationId)
      .maybeSingle<ClinicBrandingRow>(),
  ]);

  const clinicalVersionsByTemplate = groupByTemplate(
    clinicalVersionsResult.data ?? [],
  );
  const documentVersionsByTemplate = groupByTemplate(
    documentVersionsResult.data ?? [],
  );
  const clinicalTemplates = (clinicalTemplatesResult.data ?? []).map(
    (template) => ({
      ...template,
      versions: clinicalVersionsByTemplate.get(template.id) ?? [],
    }),
  );
  const documentTemplates = (documentTemplatesResult.data ?? []).map(
    (template) => ({
      ...template,
      versions: documentVersionsByTemplate.get(template.id) ?? [],
    }),
  );
  const clinic = clinicResult.data;
  const clinicBranding: DocumentClinicBranding = {
    name:
      clinic?.trade_name ||
      clinic?.legal_name ||
      access.organization.name ||
      "Clínica",
    legalName: clinic?.legal_name ?? null,
    document: clinic?.document ?? null,
    phone: clinic?.phone ?? null,
    email: clinic?.email ?? null,
    address: formatAddress(clinic),
    city: clinic?.city ?? null,
    state: clinic?.state ?? null,
    logoUrl: access.organization.logo_url ?? null,
  };

  return (
    <CompanyConfigurationPage access={access} route="modelos-clinicos">
      <Tabs
        ariaLabel="Tipos de modelos clínicos"
        defaultTab="atendimento"
        urlParam="tipo"
        items={[
          {
            id: "atendimento",
            label: "Fichas de atendimento",
            icon: <ClipboardList />,
            content: <TemplateBuilderForm templates={clinicalTemplates} />,
          },
          {
            id: "documentos",
            label: "Modelos de documentos",
            icon: <FileText />,
            content: (
              <DocumentTemplateManager
                templates={documentTemplates}
                clinicBranding={clinicBranding}
              />
            ),
          },
        ]}
      />
    </CompanyConfigurationPage>
  );
}

function formatAddress(clinic: ClinicBrandingRow | null) {
  if (!clinic) return null;

  const street = joinNonEmpty(
    [clinic.address_line, clinic.address_number],
    ", ",
  );
  const cityAndState = joinNonEmpty([clinic.city, clinic.state], " - ");

  return (
    joinNonEmpty(
      [street, clinic.address_complement, clinic.district, cityAndState],
      ", ",
    ) || null
  );
}

function joinNonEmpty(
  values: Array<string | null | undefined>,
  separator: string,
) {
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .join(separator);
}

function groupByTemplate<Row extends { template_id: string }>(rows: Row[]) {
  const grouped = new Map<string, Array<Omit<Row, "template_id">>>();
  for (const row of rows) {
    const { template_id: templateId, ...version } = row;
    const versions = grouped.get(templateId) ?? [];
    versions.push(version);
    grouped.set(templateId, versions);
  }
  return grouped;
}
