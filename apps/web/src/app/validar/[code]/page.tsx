import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { Phone, SealCheck, SealWarning } from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent } from "@/components/ui/card";
import { verifyDocumentVerificationCode } from "@/lib/clinical/document-verification";
import {
  documentTypeLabels,
  type ClinicalDocumentType,
} from "@/lib/clinical/document-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatPhoneBR } from "@/lib/validation/br";

export const metadata: Metadata = {
  title: "Verificação de documento",
  robots: { index: false, follow: false },
};

type DocumentRow = {
  id: string;
  organization_id: string;
  patient_id: string;
  professional_id: string;
  document_type: ClinicalDocumentType;
  issued_at: string;
  metadata: { render?: { timezone?: unknown; time_zone?: unknown } } | null;
};

/** Mesmo fuso do PDF: o gravado na emissão, senão o padrão do sistema. */
function documentTimeZone(metadata: DocumentRow["metadata"]) {
  const value = metadata?.render?.timezone ?? metadata?.render?.time_zone;
  if (typeof value === "string" && value) {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: value });
      return value;
    } catch {
      // cai no padrão
    }
  }
  return "America/Fortaleza";
}

const nameConnectors = new Set(["da", "das", "de", "do", "dos", "e"]);

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((part) => part && !nameConnectors.has(part.toLowerCase()))
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(" ");
}

function NotFoundCard() {
  return (
    <Card>
      <CardContent className="grid justify-items-center gap-3 py-10 text-center">
        <SealWarning className="size-10 text-warning" aria-hidden="true" />
        <h1 className="text-heading font-semibold">
          Não encontramos este documento
        </h1>
        <p className="max-w-md text-body-sm text-muted-foreground">
          O código não confere com nenhum documento emitido pelo Hi Clinic.
          Confira se o endereço foi digitado inteiro ou aponte a câmera de novo
          para o QR Code. Na dúvida, procure a clínica que emitiu.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Raio-X E5: página pública que confirma a emissão de um documento clínico
 * pelo QR Code do PDF. Mostra só o necessário para conferir o papel, sem o
 * conteúdo clínico.
 */
export default async function VerifyDocumentPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const documentId = verifyDocumentVerificationCode(code);
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;

  let content = <NotFoundCard />;
  if (documentId) {
    const admin = createSupabaseAdminClient();
    const { data: document } = await admin
      .from("clinical_documents")
      .select(
        "id, organization_id, patient_id, professional_id, document_type, issued_at, metadata",
      )
      .eq("id", documentId)
      .maybeSingle<DocumentRow>();

    if (document && document.document_type !== "informed_consent") {
      const [professional, clinic, patient] = await Promise.all([
        admin
          .from("professionals")
          .select("name, council_type, council_number, council_state")
          .eq("organization_id", document.organization_id)
          .eq("id", document.professional_id)
          .maybeSingle<{
            name: string;
            council_type: string | null;
            council_number: string | null;
            council_state: string | null;
          }>(),
        admin
          .from("clinics")
          .select("trade_name, phone, city, state")
          .eq("organization_id", document.organization_id)
          .maybeSingle<{
            trade_name: string;
            phone: string | null;
            city: string | null;
            state: string | null;
          }>(),
        admin
          .from("patients")
          .select("full_name, social_name")
          .eq("organization_id", document.organization_id)
          .eq("id", document.patient_id)
          .maybeSingle<{ full_name: string; social_name: string | null }>(),
      ]);

      const timeZone = documentTimeZone(document.metadata);
      const issuedAt = new Intl.DateTimeFormat("pt-BR", {
        timeZone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(document.issued_at));
      const registry = [
        professional.data?.council_type,
        professional.data?.council_number,
        professional.data?.council_state,
      ]
        .filter(Boolean)
        .join(" ");
      const patientName =
        patient.data?.social_name || patient.data?.full_name || "";
      const clinicPlace = [clinic.data?.city, clinic.data?.state]
        .filter(Boolean)
        .join(" - ");

      const rows: Array<[string, string]> = [
        ["Documento", documentTypeLabels[document.document_type]],
        ["Emitido em", issuedAt.replace(",", " às")],
        [
          "Profissional",
          [professional.data?.name, registry].filter(Boolean).join(" · ") ||
            "—",
        ],
        ["Paciente", patientName ? initials(patientName) : "—"],
        [
          "Clínica",
          [clinic.data?.trade_name, clinicPlace].filter(Boolean).join(" · ") ||
            "—",
        ],
        ["Código", document.id.slice(0, 8).toUpperCase()],
      ];

      content = (
        <Card>
          <CardContent className="grid gap-5 py-8">
            <div className="grid justify-items-center gap-2 text-center">
              <SealCheck
                className="size-10 text-success"
                weight="fill"
                aria-hidden="true"
              />
              <h1 className="text-heading font-semibold">
                Documento emitido pela clínica
              </h1>
              <p className="max-w-md text-body-sm text-muted-foreground">
                Este QR Code corresponde a um documento registrado no Hi Clinic.
                Confira se os dados abaixo batem com o papel.
              </p>
            </div>
            <dl className="grid gap-3 rounded-lg border border-border p-4">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3"
                >
                  <dt className="text-caption text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="text-body-sm font-medium break-words">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-caption text-muted-foreground">
              O código aparece também no rodapé do documento (&quot;Documento{" "}
              {document.id.slice(0, 8)}&quot;). Esta página confirma a emissão,
              mas não o conteúdo: se algo no papel parecer alterado, confirme
              com a clínica.
            </p>
            {clinic.data?.phone ? (
              <a
                href={`tel:${clinic.data.phone}`}
                className="inline-flex items-center gap-2 justify-self-start text-body-sm font-medium text-primary hover:underline"
              >
                <Phone className="size-4" aria-hidden="true" />
                {formatPhoneBR(clinic.data.phone)}
              </a>
            ) : null}
          </CardContent>
        </Card>
      );

      after(async () => {
        await admin.from("audit_logs").insert({
          organization_id: document.organization_id,
          actor_user_id: null,
          action: "clinical_document.verified",
          resource_type: "clinical_document",
          resource_id: document.id,
          user_agent: userAgent,
          metadata: { patient_id: document.patient_id, via: "qr_code" },
        });
      });
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-xl gap-4 px-4 py-8 md:py-12">
        <p className="text-center text-label font-semibold text-muted-foreground">
          Hi Clinic · Verificação de documento
        </p>
        {content}
      </div>
    </main>
  );
}
