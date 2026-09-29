import {
  documentTypeLabels,
  describeDocumentFields,
} from "../clinical/document-types";
import type { ConsentDetails } from "../clinical/consent";
import { appendConsentEvidence } from "./consent-evidence";
import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import {
  type ClinicalDocumentType,
  type DocumentTemplateLayout,
} from "../clinical/document-templates";

type JsonRecord = Record<string, unknown>;

type DocumentRow = {
  id: string;
  organization_id: string;
  encounter_id: string;
  patient_id: string;
  professional_id: string;
  document_type: ClinicalDocumentType;
  title: string;
  body: string;
  metadata: unknown;
  issued_at: string;
};

type PatientRow = {
  full_name: string;
  social_name: string | null;
  cpf: string | null;
  rg: string | null;
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
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

type OrganizationRow = {
  name: string;
  logo_url: string | null;
};

type RenderContext = {
  timezone: string;
  clinic: {
    name: string;
    legalName: string | null;
    document: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    logoUrl: string | null;
  };
  unit: {
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  patient: {
    displayName: string;
    fullName: string;
    cpf: string | null;
    rg: string | null;
    birthDate: string | null;
  };
  professional: {
    name: string;
    councilType: string | null;
    councilNumber: string | null;
    councilState: string | null;
    registry: string | null;
  };
};

const paperSizes: Record<
  DocumentTemplateLayout["paperSize"],
  [number, number]
> = {
  A4: [595.28, 841.89],
  LETTER: [612, 792],
};

export type DocumentMeasurement = {
  documentPages: number;
  totalPages: number;
  bodyLines: number;
  firstPageCapacity: number;
  remainingFirstPageLines: number;
  signatureOnSeparatePage: boolean;
};

type DocumentRenderInput = {
  document: DocumentRow;
  context: RenderContext;
  layout: DocumentTemplateLayout;
  consent?: ConsentDetails;
};

async function buildDocumentPdf(input: DocumentRenderInput) {
  return (await renderClinicalDocument(input)).bytes;
}

export async function renderClinicalDocument({
  document,
  context,
  layout,
  consent,
}: DocumentRenderInput) {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const logo =
    layout.header.enabled && layout.header.showLogo
      ? await embedSafeLogo(pdfDoc, context.clinic.logoUrl)
      : null;
  const pageSize = paperSizes[layout.paperSize];
  const margin = 48;
  const footerHeight = layout.footer.enabled
    ? fontSize(layout.footer.fontSize, "footer") + 26
    : 0;
  const bodySize = fontSize(layout.body.fontSize, "body");
  const bodyLineHeight = bodySize * 1.48;
  let page: PDFPage;
  let y = 0;
  let bodyLines = 0;

  function startPage() {
    page = pdfDoc.addPage(pageSize);
    y = pageSize[1] - margin;
    drawHeader();
  }

  function ensureSpace(required: number) {
    if (y - required < margin + footerHeight) startPage();
  }

  function drawHeader() {
    if (!layout.header.enabled) return;

    const nameSize = fontSize(layout.header.fontSize, "header");
    const detailSize = Math.max(7, nameSize - 5);
    const logoBox = logo ? 42 : 0;
    const gap = logo ? 12 : 0;
    const availableTextWidth = pageSize[0] - margin * 2 - logoBox - gap;
    const logoOnRight = layout.header.logoPosition === "right";
    const logoX = logoOnRight ? pageSize[0] - margin - logoBox : margin;
    const textX = logoOnRight ? margin : margin + logoBox + gap;
    const blockTop = y;
    let textY = y - nameSize;

    if (logo)
      drawContainedImage(page, logo, logoX, y - logoBox, logoBox, logoBox);

    const clinicName = safeText(context.clinic.name || "Clínica");
    const clinicNameLines = wrapText(
      clinicName,
      bold,
      nameSize,
      availableTextWidth,
    );
    for (const line of clinicNameLines) {
      page.drawText(line, {
        x: textX,
        y: textY,
        size: nameSize,
        font: bold,
        color: rgb(0.04, 0.08, 0.18),
      });
      textY -= nameSize + 3;
    }

    if (layout.header.showClinicDetails) {
      const details = clinicDetails(context);
      for (const line of wrapText(
        safeText(details),
        regular,
        detailSize,
        availableTextWidth,
      )) {
        page.drawText(line, {
          x: textX,
          y: textY,
          size: detailSize,
          font: regular,
          color: rgb(0.33, 0.38, 0.45),
        });
        textY -= detailSize + 2;
      }
    }

    const textHeight = blockTop - textY;
    const headerHeight = Math.max(logoBox, textHeight, nameSize + 4);
    y = blockTop - headerHeight - 10;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageSize[0] - margin, y },
      thickness: 1,
      color: rgb(0.84, 0.86, 0.9),
    });
    y -= 24;
  }

  function drawCenteredHeading(text: string) {
    const size = bodySize + 4;
    const maxWidth = pageSize[0] - margin * 2;
    const lines = wrapText(safeText(text), bold, size, maxWidth);
    ensureSpace(lines.length * (size + 5) + 8);

    for (const line of lines) {
      const width = bold.widthOfTextAtSize(line, size);
      page.drawText(line, {
        x: Math.max(margin, (pageSize[0] - width) / 2),
        y,
        size,
        font: bold,
        color: rgb(0.04, 0.08, 0.18),
      });
      y -= size + 5;
    }
    y -= 10;
  }

  function drawPatientSummary() {
    if (!layout.body.showPatientSummary) return;

    const size = Math.max(8, bodySize - 2);
    const lineHeight = size + 5;
    const lines = [
      `Paciente: ${context.patient.displayName}`,
      [
        context.patient.cpf ? `CPF: ${context.patient.cpf}` : null,
        context.patient.rg ? `RG: ${context.patient.rg}` : null,
        context.patient.birthDate
          ? `Nascimento: ${formatDate(context.patient.birthDate)}`
          : null,
      ]
        .filter(Boolean)
        .join(" | "),
      `Profissional: ${context.professional.name}${
        context.professional.registry
          ? ` | ${context.professional.registry}`
          : ""
      }`,
      `${consent ? "Preparado" : "Emitido"} em: ${formatDateTime(document.issued_at, context.timezone)}`,
    ].filter(Boolean);
    const wrappedLines = lines.flatMap((line) =>
      wrapText(safeText(line), regular, size, pageSize[0] - margin * 2 - 16),
    );
    const height = wrappedLines.length * lineHeight + 16;
    ensureSpace(height + 10);

    page.drawRectangle({
      x: margin,
      y: y - height + 6,
      width: pageSize[0] - margin * 2,
      height,
      color: rgb(0.97, 0.975, 0.985),
      borderColor: rgb(0.87, 0.89, 0.92),
      borderWidth: 0.7,
    });
    y -= 6;
    for (const line of wrappedLines) {
      page.drawText(line, {
        x: margin + 8,
        y,
        size,
        font: regular,
        color: rgb(0.18, 0.21, 0.27),
      });
      y -= lineHeight;
    }
    y -= 24;
  }

  function drawBody(text: string, countLines = false) {
    const maxWidth = pageSize[0] - margin * 2;
    const paragraphs = safeText(text).split(/\r?\n/);

    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) {
        if (countLines) bodyLines++;
        ensureSpace(bodyLineHeight);
        y -= bodyLineHeight;
        continue;
      }

      for (const line of wrapText(paragraph, regular, bodySize, maxWidth)) {
        if (countLines) bodyLines++;
        ensureSpace(bodyLineHeight);
        page.drawText(line, {
          x: margin,
          y,
          size: bodySize,
          font: regular,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= bodyLineHeight;
      }
    }
  }

  const signatureSize = Math.max(9, bodySize - 1);
  const signatureNameLines = wrapText(
    safeText(context.professional.name),
    regular,
    signatureSize,
    pageSize[0] - margin * 2,
  );
  const signatureRegistryLines =
    layout.signature.showCouncil && context.professional.registry
      ? wrapText(
          safeText(context.professional.registry),
          regular,
          Math.max(8, signatureSize - 1),
          pageSize[0] - margin * 2,
        )
      : [];
  const signatureHeight = layout.signature.enabled
    ? 35 +
      signatureNameLines.length * (signatureSize + 5) +
      signatureRegistryLines.length * (signatureSize + 2) +
      10
    : 0;

  function drawSignature() {
    if (!layout.signature.enabled) return;

    ensureSpace(signatureHeight);
    y -= 35;
    page.drawLine({
      start: { x: pageSize[0] / 2 - 110, y },
      end: { x: pageSize[0] / 2 + 110, y },
      thickness: 1,
      color: rgb(0.25, 0.28, 0.34),
    });
    for (const line of signatureNameLines) {
      y -= signatureSize + 5;
      drawCenteredLine(line, regular, signatureSize);
    }
    for (const line of signatureRegistryLines) {
      y -= signatureSize + 2;
      drawCenteredLine(
        line,
        regular,
        Math.max(8, signatureSize - 1),
        rgb(0.33, 0.38, 0.45),
      );
    }
  }

  function drawCenteredLine(
    value: string,
    font: PDFFont,
    size: number,
    color = rgb(0.1, 0.1, 0.1),
  ) {
    const text = safeText(value);
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: Math.max(margin, (pageSize[0] - width) / 2),
      y,
      size,
      font,
      color,
    });
  }

  startPage();
  drawCenteredHeading(
    document.title || documentTypeLabels[document.document_type],
  );
  drawPatientSummary();
  const purposeFields = asRecord(asRecord(document.metadata).fields);
  const fieldText = describeDocumentFields(
    document.document_type,
    Object.fromEntries(
      Object.entries(purposeFields).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  );
  if (fieldText) drawBody(fieldText + "\n");
  if (consent) {
    const latest = [...consent.events].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )[0];
    drawBody(
      latest?.event_type === "revoked"
        ? "CONSENTIMENTO REVOGADO - consulte o registro anexo.\n"
        : latest?.event_type === "cancelled"
          ? "TERMO CANCELADO - consulte o registro anexo.\n"
          : latest?.event_type === "signed"
            ? "Assinatura presencial registrada - consulte o registro anexo.\n"
            : "AGUARDANDO ASSINATURA\n",
    );
  }
  const firstPageCapacity =
    pdfDoc.getPageCount() === 1
      ? Math.max(
          0,
          Math.floor(
            (y - margin - footerHeight - signatureHeight) / bodyLineHeight,
          ),
        )
      : 0;
  drawBody(document.body.trim(), true);
  const pagesBeforeSignature = pdfDoc.getPageCount();
  drawSignature();
  const documentPages = pdfDoc.getPageCount();
  const signatureOnSeparatePage = documentPages > pagesBeforeSignature;

  if (layout.footer.enabled) {
    const pages = pdfDoc.getPages();
    const footerSize = fontSize(layout.footer.fontSize, "footer");

    pages.forEach((currentPage, index) => {
      const lineY = 39;
      currentPage.drawLine({
        start: { x: margin, y: lineY },
        end: { x: pageSize[0] - margin, y: lineY },
        thickness: 0.7,
        color: rgb(0.84, 0.86, 0.9),
      });
      const textY = 25;

      if (layout.footer.showPatientName) {
        const patientLabelWidth = pageSize[0] / 2 - margin - 80;
        const patientLabel = fitText(
          safeText(context.patient.displayName),
          regular,
          footerSize,
          patientLabelWidth,
        );
        currentPage.drawText(patientLabel, {
          x: margin,
          y: textY,
          size: footerSize,
          font: regular,
          color: rgb(0.4, 0.44, 0.5),
        });
      }

      const identifier = safeText(`Documento ${document.id.slice(0, 8)}`);
      const identifierWidth = regular.widthOfTextAtSize(identifier, footerSize);
      currentPage.drawText(identifier, {
        x: (pageSize[0] - identifierWidth) / 2,
        y: textY,
        size: footerSize,
        font: regular,
        color: rgb(0.48, 0.51, 0.56),
      });

      if (layout.footer.showPageNumber) {
        const pageNumber = safeText(
          `${consent ? "Termo · " : ""}Página ${index + 1} de ${pages.length}`,
        );
        const pageNumberWidth = regular.widthOfTextAtSize(
          pageNumber,
          footerSize,
        );
        currentPage.drawText(pageNumber, {
          x: pageSize[0] - margin - pageNumberWidth,
          y: textY,
          size: footerSize,
          font: regular,
          color: rgb(0.4, 0.44, 0.5),
        });
      }
    });
  }

  if (consent) await appendConsentEvidence(pdfDoc, consent, pageSize);
  return {
    bytes: await pdfDoc.save(),
    measurement: {
      documentPages,
      totalPages: pdfDoc.getPageCount(),
      bodyLines,
      firstPageCapacity,
      remainingFirstPageLines: Math.max(0, firstPageCapacity - bodyLines),
      signatureOnSeparatePage,
    } satisfies DocumentMeasurement,
  };
}

function buildRenderContext({
  renderSnapshot,
  patient,
  professional,
  clinic,
  organization,
}: {
  renderSnapshot: JsonRecord;
  patient: PatientRow | null;
  professional: ProfessionalRow | null;
  clinic: ClinicRow | null;
  organization: OrganizationRow | null;
}): RenderContext {
  const snapshotClinic = asRecord(renderSnapshot.clinic);
  const snapshotAppointment = asRecord(renderSnapshot.appointment);
  const explicitSnapshotUnit = asRecord(renderSnapshot.unit);
  const nestedAppointmentUnit = asRecord(snapshotAppointment.unit);
  const snapshotUnit = hasRecordData(explicitSnapshotUnit)
    ? explicitSnapshotUnit
    : nestedAppointmentUnit;
  const snapshotPatient = asRecord(renderSnapshot.patient);
  const snapshotProfessional = asRecord(renderSnapshot.professional);
  const snapshotOrganization = asRecord(renderSnapshot.organization);
  const livePatient = hasRecordData(snapshotPatient) ? null : patient;
  const liveProfessional = hasRecordData(snapshotProfessional)
    ? null
    : professional;
  const liveClinic = hasRecordData(snapshotClinic) ? null : clinic;
  const liveOrganization =
    hasRecordData(snapshotClinic) || hasRecordData(snapshotOrganization)
      ? null
      : organization;

  const patientFullName =
    firstString(snapshotPatient, "full_name", "fullName", "nome_completo") ??
    livePatient?.full_name ??
    "";
  const patientSocialName =
    firstString(snapshotPatient, "social_name", "socialName", "nome_social") ??
    livePatient?.social_name ??
    null;
  const clinicAddress =
    firstString(snapshotClinic, "address", "endereco") ??
    formatAddress({
      line: firstString(snapshotClinic, "address_line", "addressLine"),
      number: firstString(snapshotClinic, "address_number", "addressNumber"),
      complement: firstString(
        snapshotClinic,
        "address_complement",
        "addressComplement",
      ),
      district: firstString(snapshotClinic, "district", "bairro"),
      city: firstString(snapshotClinic, "city", "cidade"),
      state: firstString(snapshotClinic, "state", "uf"),
    }) ??
    (liveClinic
      ? formatAddress({
          line: liveClinic.address_line,
          number: liveClinic.address_number,
          complement: liveClinic.address_complement,
          district: liveClinic.district,
          city: liveClinic.city,
          state: liveClinic.state,
        })
      : null);
  const unitAddress =
    firstString(snapshotUnit, "address", "endereco") ??
    formatAddress({
      line: firstString(snapshotUnit, "address_line", "addressLine"),
      number: firstString(snapshotUnit, "address_number", "addressNumber"),
      complement: firstString(
        snapshotUnit,
        "address_complement",
        "addressComplement",
      ),
      district: firstString(snapshotUnit, "district", "bairro"),
      city: firstString(snapshotUnit, "city", "cidade"),
      state: firstString(snapshotUnit, "state", "uf"),
    });
  const councilType =
    firstString(
      snapshotProfessional,
      "council_type",
      "councilType",
      "conselho",
    ) ??
    liveProfessional?.council_type ??
    null;
  const councilNumber =
    firstString(
      snapshotProfessional,
      "council_number",
      "councilNumber",
      "numero_conselho",
    ) ??
    liveProfessional?.council_number ??
    null;
  const councilState =
    firstString(
      snapshotProfessional,
      "council_state",
      "councilState",
      "uf_conselho",
    ) ??
    liveProfessional?.council_state ??
    null;
  const registry =
    firstString(snapshotProfessional, "registry", "registro") ??
    joinNonEmpty([councilType, councilNumber, councilState], " ");

  return {
    timezone: validTimeZone(
      firstString(renderSnapshot, "timezone", "time_zone") ??
        "America/Fortaleza",
    ),
    clinic: {
      name:
        firstString(
          snapshotClinic,
          "name",
          "trade_name",
          "tradeName",
          "nome",
        ) ??
        liveClinic?.trade_name ??
        liveOrganization?.name ??
        "Clínica",
      legalName:
        firstString(
          snapshotClinic,
          "legal_name",
          "legalName",
          "razao_social",
        ) ??
        liveClinic?.legal_name ??
        null,
      document:
        firstString(snapshotClinic, "document", "cnpj") ??
        liveClinic?.document ??
        null,
      phone:
        firstString(snapshotClinic, "phone", "telefone") ??
        liveClinic?.phone ??
        null,
      email: firstString(snapshotClinic, "email") ?? liveClinic?.email ?? null,
      address: clinicAddress,
      city:
        firstString(snapshotClinic, "city", "cidade") ??
        liveClinic?.city ??
        null,
      state:
        firstString(snapshotClinic, "state", "uf") ?? liveClinic?.state ?? null,
      logoUrl:
        firstString(snapshotClinic, "logo_url", "logoUrl") ??
        firstString(snapshotOrganization, "logo_url", "logoUrl") ??
        liveOrganization?.logo_url ??
        null,
    },
    unit: {
      name:
        firstString(snapshotUnit, "name", "nome") ??
        firstString(snapshotAppointment, "unit_name", "unitName"),
      address: unitAddress,
      city: firstString(snapshotUnit, "city", "cidade"),
      state: firstString(snapshotUnit, "state", "uf"),
    },
    patient: {
      displayName:
        firstString(snapshotPatient, "display_name", "displayName", "nome") ??
        patientSocialName ??
        patientFullName,
      fullName: patientFullName,
      cpf: firstString(snapshotPatient, "cpf") ?? livePatient?.cpf ?? null,
      rg: firstString(snapshotPatient, "rg") ?? livePatient?.rg ?? null,
      birthDate:
        firstString(
          snapshotPatient,
          "birth_date",
          "birthDate",
          "data_nascimento",
        ) ??
        livePatient?.birth_date ??
        null,
    },
    professional: {
      name:
        firstString(snapshotProfessional, "name", "nome") ??
        liveProfessional?.name ??
        "",
      councilType,
      councilNumber,
      councilState,
      registry,
    },
  };
}

function clinicDetails(context: RenderContext) {
  const location = context.unit.name
    ? joinNonEmpty(
        [
          context.unit.name,
          context.unit.address ??
            joinNonEmpty([context.unit.city, context.unit.state], " - "),
        ],
        " | ",
      )
    : (context.clinic.address ??
      joinNonEmpty([context.clinic.city, context.clinic.state], " - "));

  return joinNonEmpty(
    [
      context.clinic.legalName,
      context.clinic.document ? `CNPJ ${context.clinic.document}` : null,
      location,
      context.clinic.phone,
      context.clinic.email,
    ],
    " | ",
  );
}

async function embedSafeLogo(pdfDoc: PDFDocument, value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url.protocol !== "https:" || !supabaseBase) return null;

    const allowedOrigin = new URL(supabaseBase).origin;
    if (url.origin !== allowedOrigin) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_500);
    let response: Response;
    try {
      response = await fetch(url, {
        cache: typeof window === "undefined" ? "no-store" : "force-cache",
        redirect: "error",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return null;
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > 2_000_000) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 2_000_000) return null;
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    let image: PDFImage;

    if (contentType.includes("image/png") || isPng(bytes)) {
      image = await pdfDoc.embedPng(bytes);
    } else if (
      contentType.includes("image/jpeg") ||
      contentType.includes("image/jpg") ||
      isJpeg(bytes)
    ) {
      image = await pdfDoc.embedJpg(bytes);
    } else {
      return null;
    }

    if (image.width > 4_096 || image.height > 4_096) return null;
    return image;
  } catch {
    return null;
  }
}

function drawContainedImage(
  page: PDFPage,
  image: PDFImage,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: x + (maxWidth - width) / 2,
    y: y + (maxHeight - height) / 2,
    width,
    height,
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = "";

  for (const rawWord of words) {
    const chunks = breakLongWord(rawWord, font, size, maxWidth);
    for (const word of chunks) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
  }

  if (line) lines.push(line);
  return lines;
}

function breakLongWord(
  word: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const chunks: string[] = [];
  let chunk = "";

  for (const character of word) {
    const candidate = `${chunk}${character}`;
    if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

function fontSize(
  value: "small" | "medium" | "large",
  area: "header" | "body" | "footer",
) {
  const sizes = {
    header: { small: 11, medium: 14, large: 17 },
    body: { small: 10, medium: 12, large: 14 },
    footer: { small: 7, medium: 8, large: 9 },
  } as const;
  return sizes[area][value];
}

export function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function hasRecordData(value: JsonRecord) {
  return Object.keys(value).length > 0;
}

function firstString(source: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function formatAddress({
  line,
  number,
  complement,
  district,
  city,
  state,
}: {
  line: string | null | undefined;
  number: string | null | undefined;
  complement: string | null | undefined;
  district: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
}) {
  const street = joinNonEmpty([line, number], ", ");
  const cityState = joinNonEmpty([city, state], " - ");
  const result = joinNonEmpty([street, complement, district, cityState], ", ");
  return result || null;
}

function joinNonEmpty(
  values: Array<string | null | undefined>,
  separator: string,
) {
  return values
    .filter((value): value is string => Boolean(value?.trim()))
    .join(separator);
}

function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "America/Fortaleza";
  }
}

function safeText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function formatDate(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00Z`
    : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpeg(bytes: Uint8Array) {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
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

function fitText(text: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let result = text;
  while (result && font.widthOfTextAtSize(result + "...", size) > width)
    result = result.slice(0, -1);
  return result + "...";
}

export { buildDocumentPdf, buildRenderContext, slug };
export type {
  DocumentRow,
  PatientRow,
  ProfessionalRow,
  ClinicRow,
  OrganizationRow,
  RenderContext,
  DocumentRenderInput,
};
