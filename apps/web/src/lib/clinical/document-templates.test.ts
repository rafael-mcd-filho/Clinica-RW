import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_TEMPLATE_LAYOUT,
  DOCUMENT_TEMPLATE_VARIABLE_KEYS,
  documentTemplateLayoutSchema,
  inspectDocumentTemplateVariables,
  normalizeDocumentTemplateLayout,
  resolveDocumentTemplate,
  sanitizeDocumentTemplateText,
} from "./document-templates";

describe("document template layout", () => {
  it("normalizes unknown and partial layout values with safe defaults", () => {
    expect(
      normalizeDocumentTemplateLayout({
        paperSize: "LETTER",
        header: { enabled: false, logoPosition: "right", fontSize: "huge" },
        footer: { showPageNumber: false, fontSize: "large" },
      }),
    ).toEqual({
      paperSize: "LETTER",
      header: {
        enabled: false,
        showLogo: true,
        logoPosition: "right",
        showClinicDetails: true,
        fontSize: "medium",
      },
      body: { fontSize: "medium", showPatientSummary: true },
      signature: { enabled: true, showCouncil: true },
      footer: {
        enabled: true,
        showPatientName: true,
        showPageNumber: false,
        fontSize: "large",
      },
    });
  });

  it("exposes a strict schema and a valid default layout", () => {
    expect(
      documentTemplateLayoutSchema.safeParse(DEFAULT_DOCUMENT_TEMPLATE_LAYOUT)
        .success,
    ).toBe(true);
    expect(
      documentTemplateLayoutSchema.safeParse({
        ...DEFAULT_DOCUMENT_TEMPLATE_LAYOUT,
        unexpected: true,
      }).success,
    ).toBe(false);
  });
});

describe("document template variables", () => {
  it("publishes the complete allowlist without duplicates", () => {
    expect(DOCUMENT_TEMPLATE_VARIABLE_KEYS).toHaveLength(36);
    expect(new Set(DOCUMENT_TEMPLATE_VARIABLE_KEYS).size).toBe(
      DOCUMENT_TEMPLATE_VARIABLE_KEYS.length,
    );
    expect(DOCUMENT_TEMPLATE_VARIABLE_KEYS).toContain("paciente.documento");
    expect(DOCUMENT_TEMPLATE_VARIABLE_KEYS).toContain("documento.hora_emissao");
  });

  it("inspects known and unknown variables across title and body", () => {
    expect(
      inspectDocumentTemplateVariables(
        "Declaração de {{ paciente.nome_completo }}",
        "Emitida em {{documento.data_emissao}} por {{sistema.usuario}}.",
      ),
    ).toEqual({
      variables: ["paciente.nome_completo", "documento.data_emissao"],
      unknownVariables: ["sistema.usuario"],
    });
  });

  it("resolves allowlisted variables once and preserves missing tokens", () => {
    const result = resolveDocumentTemplate(
      "{{paciente.nome}} - {{paciente.rg}} - {{clinica.nome}}",
      {
        "paciente.nome": "Maria {{profissional.nome}}",
        "clinica.nome": "Hi Clinic",
      },
    );

    expect(result.value).toBe(
      "Maria {{profissional.nome}} - {{paciente.rg}} - Hi Clinic",
    );
    expect(result.missingVariables).toEqual(["paciente.rg"]);
    expect(result.unknownVariables).toEqual([]);
  });

  it("never interprets HTML or code contained in template values", () => {
    const result = resolveDocumentTemplate("Olá, {{paciente.nome}}", {
      "paciente.nome": '<img src=x onerror="alert(1)">',
    });

    expect(result.value).toBe('Olá, <img src=x onerror="alert(1)">');
    expect(result.value).not.toContain("undefined");
  });

  it("removes unsafe control characters but preserves line breaks", () => {
    expect(sanitizeDocumentTemplateText("linha 1\u0000\nlinha 2\tvalor")).toBe(
      "linha 1\nlinha 2\tvalor",
    );
  });
});
