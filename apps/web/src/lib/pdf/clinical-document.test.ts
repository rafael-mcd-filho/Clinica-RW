import { beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildDocumentPdf,
  renderClinicalDocument,
  type RenderContext,
} from "./clinical-document";
import {
  normalizeDocumentTemplateLayout,
  resolveDocumentTemplate,
} from "../clinical/document-templates";
import { clinicalDocumentTypes } from "../clinical/document-types";
import { documentPreviewInput } from "../clinical/document-preview";

const context: RenderContext = {
  timezone: "America/Sao_Paulo",
  clinic: {
    name: "Clínica de Demonstração",
    legalName: null,
    document: null,
    phone: "(11) 99999-0000",
    email: null,
    address: "Rua Exemplo, 100",
    city: "São Paulo",
    state: "SP",
    logoUrl: null,
  },
  unit: { name: null, address: null, city: null, state: null },
  patient: {
    displayName: "Maria de Souza",
    fullName: "Maria de Souza",
    cpf: "12345678901",
    rg: null,
    birthDate: "1990-04-12",
  },
  professional: {
    name: "Dra. Helena Teste",
    councilType: "CRM",
    councilNumber: "12345",
    councilState: "SP",
    registry: "CRM 12345 SP",
  },
};
function input(body = "Conteúdo clínico revisado.") {
  return documentPreviewInput({
    title: "Documento de demonstração",
    body,
    type: "prescription",
    layout: normalizeDocumentTemplateLayout(null),
    context,
    issuedAt: "2026-09-27T14:00:00Z",
  });
}
let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
beforeAll(async () => {
  const canvas = await import("@napi-rs/canvas");
  Object.assign(globalThis, {
    DOMMatrix: canvas.DOMMatrix,
    ImageData: canvas.ImageData,
    Path2D: canvas.Path2D,
  });
  pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
});
async function read(bytes: Uint8Array) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  }).promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const { items } = await page.getTextContent();
    pages.push({
      width: page.view[2],
      height: page.view[3],
      lines: items.filter(
        (item): item is import("pdfjs-dist/types/src/display/api").TextItem =>
          "str" in item,
      ),
    });
  }
  await doc.destroy();
  return pages;
}

describe("shared document pagination", () => {
  it("adds pages without losing lines or covering margins", async () => {
    const body = Array.from(
      { length: 130 },
      (_, i) => `LINHA${String(i).padStart(3, "0")} - texto de conferência.`,
    ).join("\n");
    const result = await renderClinicalDocument(input(body));
    const pages = await read(result.bytes);
    expect(pages.length).toBe(result.measurement.documentPages);
    expect(pages.length).toBeGreaterThan(2);
    const allText = pages
      .flatMap((page) => page.lines.map((line) => line.str))
      .join(" ");
    for (let i = 0; i < 130; i++)
      expect(
        allText.match(new RegExp(`LINHA${String(i).padStart(3, "0")}`, "g")),
      ).toHaveLength(1);
    for (const page of pages)
      for (const line of page.lines) {
        if (!line.str.trim()) continue;
        expect(line.transform[4]).toBeGreaterThanOrEqual(47);
        expect(line.transform[4] + line.width).toBeLessThanOrEqual(
          page.width - 47,
        );
        expect(line.transform[5]).toBeGreaterThanOrEqual(24);
        expect(line.transform[5] + line.height).toBeLessThanOrEqual(
          page.height - 30,
        );
        if (line.str.includes("LINHA"))
          expect(line.transform[5]).toBeGreaterThan(80);
      }
  });
  it("detects the exact first-page boundary including signature", async () => {
    const baseline = await renderClinicalDocument(input());
    const capacity = baseline.measurement.firstPageCapacity;
    expect(capacity).toBeGreaterThan(10);
    const fits = await renderClinicalDocument(
      input(Array(capacity).fill("Linha.").join("\n")),
    );
    const spills = await renderClinicalDocument(
      input(
        Array(capacity + 1)
          .fill("Linha.")
          .join("\n"),
      ),
    );
    expect(fits.measurement.documentPages).toBe(1);
    expect(fits.measurement.remainingFirstPageLines).toBe(0);
    expect(spills.measurement.documentPages).toBe(2);
    expect(spills.measurement.signatureOnSeparatePage).toBe(true);
  });
  it("reclaims space when header, footer, patient summary or signature is hidden", async () => {
    const baseline = (await renderClinicalDocument(input())).measurement
      .firstPageCapacity;
    for (const section of ["header", "footer", "signature"] as const) {
      const value = input();
      value.layout[section].enabled = false;
      expect(
        (await renderClinicalDocument(value)).measurement.firstPageCapacity,
      ).toBeGreaterThan(baseline);
    }
    const value = input();
    value.layout.body.showPatientSummary = false;
    expect(
      (await renderClinicalDocument(value)).measurement.firstPageCapacity,
    ).toBeGreaterThan(baseline);
  });
  it("recalculates capacity for paper size and font size", async () => {
    const baseline = (await renderClinicalDocument(input())).measurement
      .firstPageCapacity;
    const letter = input();
    letter.layout.paperSize = "LETTER";
    expect(
      (await renderClinicalDocument(letter)).measurement.firstPageCapacity,
    ).toBeLessThan(baseline);
    const large = input();
    large.layout.body.fontSize = "large";
    expect(
      (await renderClinicalDocument(large)).measurement.firstPageCapacity,
    ).toBeLessThan(baseline);
    const small = input();
    small.layout.body.fontSize = "small";
    expect(
      (await renderClinicalDocument(small)).measurement.firstPageCapacity,
    ).toBeGreaterThan(baseline);
  });
  it("measures variable expansion, paragraphs and unbroken words", async () => {
    const short = resolveDocumentTemplate("{{paciente.nome_completo}}", {
      "paciente.nome_completo": "Ana",
    }).value;
    const long = resolveDocumentTemplate("{{paciente.nome_completo}}", {
      "paciente.nome_completo": "Nome muito extenso ".repeat(25),
    }).value;
    expect(
      (await renderClinicalDocument(input(long))).measurement.bodyLines,
    ).toBeGreaterThan(
      (await renderClinicalDocument(input(short))).measurement.bodyLines,
    );
    const data = await renderClinicalDocument(
      input("W".repeat(450) + "\n\nFim do documento."),
    );
    expect(data.measurement.bodyLines).toBeGreaterThan(4);
    const pages = await read(data.bytes);
    expect(pages.flatMap((p) => p.lines.map((l) => l.str)).join("")).toContain(
      "W".repeat(450),
    );
    for (const page of pages)
      for (const line of page.lines)
        expect(line.transform[4] + line.width).toBeLessThanOrEqual(
          page.width - 47,
        );
  });
  it.each(clinicalDocumentTypes)(
    "uses the same pages for preview and download: %s",
    async (type) => {
      const value = documentPreviewInput({
        title: "Documento",
        body: "Texto de teste.\n".repeat(70),
        type,
        fields: {
          procedure: "Procedimento",
          destination: "Especialidade",
          reason: "Acompanhamento",
          purpose: "Continuidade",
          care: "Consulta",
        },
        context,
        layout: normalizeDocumentTemplateLayout(null),
        issuedAt: "2026-09-27T14:00:00Z",
      });
      const result = await renderClinicalDocument(value);
      const download = await PDFDocument.load(await buildDocumentPdf(value));
      expect(download.getPageCount()).toBe(result.measurement.totalPages);
      expect(
        result.measurement.totalPages - result.measurement.documentPages,
      ).toBe(type === "informed_consent" ? 1 : 0);
    },
  );
  it("wraps long clinic and professional names instead of clipping them", async () => {
    const value = input();
    value.context = structuredClone(context);
    value.context.clinic.name = "Clínica especializada com nome longo ".repeat(
      8,
    );
    value.context.professional.name =
      "Dra. Profissional com sobrenome extenso ".repeat(6);
    const pages = await read((await renderClinicalDocument(value)).bytes);
    for (const page of pages)
      for (const line of page.lines)
        expect(line.transform[4] + line.width).toBeLessThanOrEqual(
          page.width - 47,
        );
    expect(pages.flatMap((p) => p.lines.map((l) => l.str)).join(" ")).toContain(
      "sobrenome extenso",
    );
  });
});
