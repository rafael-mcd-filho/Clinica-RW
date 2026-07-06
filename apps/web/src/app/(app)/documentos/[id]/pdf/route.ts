import { notFound } from "next/navigation";
import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type DocumentRow = {
  id: string;
  organization_id: string;
  encounter_id: string;
  patient_id: string;
  professional_id: string;
  document_type:
    | "prescription"
    | "exam_request"
    | "medical_certificate"
    | "attendance_declaration";
  title: string;
  body: string;
  issued_at: string;
};

type PatientRow = {
  full_name: string;
  social_name: string | null;
  cpf: string | null;
  birth_date: string | null;
};

type ProfessionalRow = {
  name: string;
  council_type: string | null;
  council_number: string | null;
  council_state: string | null;
};

type ClinicRow = {
  trade_name: string;
  legal_name: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
};

const documentTypeLabels: Record<DocumentRow["document_type"], string> = {
  prescription: "Prescrição",
  exam_request: "Solicitação de exame",
  medical_certificate: "Atestado",
  attendance_declaration: "Declaração de comparecimento",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: document } = await supabase
    .from("clinical_documents")
    .select(
      "id, organization_id, encounter_id, patient_id, professional_id, document_type, title, body, issued_at",
    )
    .eq("id", id)
    .maybeSingle<DocumentRow>();

  if (!document) notFound();

  const [patientResult, professionalResult, clinicResult] = await Promise.all([
    supabase
      .from("patients")
      .select("full_name, social_name, cpf, birth_date")
      .eq("organization_id", document.organization_id)
      .eq("id", document.patient_id)
      .single<PatientRow>(),
    supabase
      .from("professionals")
      .select("name, council_type, council_number, council_state")
      .eq("organization_id", document.organization_id)
      .eq("id", document.professional_id)
      .single<ProfessionalRow>(),
    supabase
      .from("clinics")
      .select("trade_name, legal_name, document, phone, email, city, state")
      .eq("organization_id", document.organization_id)
      .maybeSingle<ClinicRow>(),
  ]);

  if (!patientResult.data || !professionalResult.data) notFound();

  const pdfBytes = await buildDocumentPdf({
    document,
    patient: patientResult.data,
    professional: professionalResult.data,
    clinic: clinicResult.data,
  });
  const filename = `${slug(document.title)}-${document.id.slice(0, 8)}.pdf`;

  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function buildDocumentPdf({
  document,
  patient,
  professional,
  clinic,
}: {
  document: DocumentRow;
  patient: PatientRow;
  professional: ProfessionalRow;
  clinic: ClinicRow | null;
}) {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 48;
  let page: PDFPage = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - margin;

  function startPage() {
    page = pdfDoc.addPage(pageSize);
    y = pageSize[1] - margin;
    drawHeader();
  }

  function ensureSpace(required: number) {
    if (y - required < margin + 24) startPage();
  }

  function drawTextLine(
    text: string,
    options: {
      size?: number;
      font?: PDFFont;
      color?: ReturnType<typeof rgb>;
    } = {},
  ) {
    const size = options.size ?? 10;
    const font = options.font ?? regular;
    ensureSpace(size + 6);
    page.drawText(safeText(text), {
      x: margin,
      y,
      size,
      font,
      color: options.color ?? rgb(0.1, 0.1, 0.1),
    });
    y -= size + 6;
  }

  function drawWrappedText(
    text: string,
    options: { size?: number; font?: PDFFont; lineHeight?: number } = {},
  ) {
    const size = options.size ?? 11;
    const font = options.font ?? regular;
    const lineHeight = options.lineHeight ?? size + 6;
    const maxWidth = pageSize[0] - margin * 2;
    const paragraphs = safeText(text).split(/\r?\n/);

    for (const paragraph of paragraphs) {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        y -= lineHeight;
        continue;
      }
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          line = candidate;
          continue;
        }
        ensureSpace(lineHeight);
        page.drawText(line, {
          x: margin,
          y,
          size,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= lineHeight;
        line = word;
      }
      if (line) {
        ensureSpace(lineHeight);
        page.drawText(line, {
          x: margin,
          y,
          size,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= lineHeight;
      }
      y -= 4;
    }
  }

  function drawHeader() {
    const clinicName = clinic?.trade_name ?? "Clínica";
    page.drawText(safeText(clinicName), {
      x: margin,
      y,
      size: 14,
      font: bold,
      color: rgb(0.06, 0.09, 0.16),
    });
    y -= 16;
    const details = [
      clinic?.legal_name,
      clinic?.document ? `CNPJ ${clinic.document}` : null,
      clinic?.phone,
      clinic?.email,
      [clinic?.city, clinic?.state].filter(Boolean).join(" - ") || null,
    ]
      .filter(Boolean)
      .join(" | ");
    if (details) {
      page.drawText(safeText(details), {
        x: margin,
        y,
        size: 8,
        font: regular,
        color: rgb(0.33, 0.38, 0.45),
      });
      y -= 14;
    }
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageSize[0] - margin, y },
      thickness: 1,
      color: rgb(0.84, 0.86, 0.9),
    });
    y -= 32;
  }

  drawHeader();

  const heading = safeText(
    document.title || documentTypeLabels[document.document_type],
  );
  const headingWidth = bold.widthOfTextAtSize(heading, 16);
  page.drawText(heading, {
    x: Math.max(margin, (pageSize[0] - headingWidth) / 2),
    y,
    size: 16,
    font: bold,
    color: rgb(0.04, 0.08, 0.18),
  });
  y -= 30;

  drawTextLine(`Tipo: ${documentTypeLabels[document.document_type]}`, {
    size: 10,
    font: bold,
  });
  drawTextLine(`Paciente: ${patient.social_name || patient.full_name}`);
  if (patient.cpf || patient.birth_date) {
    drawTextLine(
      [
        patient.cpf ? `CPF: ${patient.cpf}` : null,
        patient.birth_date
          ? `Nascimento: ${formatDate(patient.birth_date)}`
          : null,
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }
  drawTextLine(`Profissional: ${professional.name}`);
  const council = [
    professional.council_type,
    professional.council_number,
    professional.council_state,
  ]
    .filter(Boolean)
    .join(" ");
  if (council) drawTextLine(`Registro: ${council}`);
  drawTextLine(`Emitido em: ${formatDateTime(document.issued_at)}`);

  y -= 14;
  drawWrappedText(document.body, { size: 12, lineHeight: 18 });

  y -= 36;
  ensureSpace(80);
  page.drawLine({
    start: { x: pageSize[0] / 2 - 110, y },
    end: { x: pageSize[0] / 2 + 110, y },
    thickness: 1,
    color: rgb(0.25, 0.28, 0.34),
  });
  y -= 16;
  const signature = safeText(professional.name);
  const signatureWidth = regular.widthOfTextAtSize(signature, 10);
  page.drawText(signature, {
    x: (pageSize[0] - signatureWidth) / 2,
    y,
    size: 10,
    font: regular,
    color: rgb(0.1, 0.1, 0.1),
  });
  if (council) {
    y -= 13;
    const councilText = safeText(council);
    page.drawText(councilText, {
      x: (pageSize[0] - regular.widthOfTextAtSize(councilText, 9)) / 2,
      y,
      size: 9,
      font: regular,
      color: rgb(0.33, 0.38, 0.45),
    });
  }

  const footer = safeText(
    `Documento ${document.id} | Atendimento ${document.encounter_id}`,
  );
  page.drawText(footer, {
    x: margin,
    y: 28,
    size: 7,
    font: regular,
    color: rgb(0.45, 0.5, 0.56),
  });

  return pdfDoc.save();
}

function safeText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
}

function slug(value: string) {
  return (
    safeText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "documento"
  );
}
