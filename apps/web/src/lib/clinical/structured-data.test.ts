import { describe, expect, it } from "vitest";
import {
  ClinicalStructuredDataError,
  isClinicalFieldValueEmpty,
  parseClinicalStructuredData,
} from "./structured-data";
import type { ClinicalTemplateSchema } from "./template-schema";

const schema: ClinicalTemplateSchema = {
  schemaVersion: 2,
  sections: [
    {
      id: "section",
      title: "Avaliação",
      fields: [
        { id: "notes", label: "Notas", type: "textarea", required: false },
        {
          id: "weight",
          label: "Peso",
          type: "number",
          required: true,
          min: 0,
          max: 500,
          step: 0.1,
        },
        { id: "fasting", label: "Jejum", type: "boolean", required: true },
        {
          id: "symptoms",
          label: "Sintomas",
          type: "multiselect",
          required: false,
          options: [
            { id: "fever", label: "Febre" },
            { id: "pain", label: "Dor" },
          ],
        },
        {
          id: "risk",
          label: "Risco",
          type: "select",
          required: false,
          options: [
            { id: "low", label: "Baixo" },
            { id: "high", label: "Alto" },
          ],
        },
      ],
    },
  ],
};

describe("parseClinicalStructuredData", () => {
  it("returns native typed values and preserves zero and false", () => {
    const formData = new FormData();
    formData.set("field:notes", "  Observação clínica  ");
    formData.set("field:weight", "0");
    formData.set("field:fasting", "false");
    formData.set("field:symptoms", JSON.stringify(["fever", "pain"]));
    formData.set("field:risk", "low");
    formData.set("field:unknown", "ignored");

    expect(parseClinicalStructuredData(formData, schema)).toEqual({
      notes: "Observação clínica",
      weight: 0,
      fasting: false,
      symptoms: ["fever", "pain"],
      risk: "low",
    });
  });

  it("omits blank strings and empty selections", () => {
    const formData = new FormData();
    formData.set("field:notes", "   ");
    formData.set("field:symptoms", "[]");

    expect(parseClinicalStructuredData(formData, schema)).toEqual({});
  });

  it("reports required fields only when requested", () => {
    const formData = new FormData();

    expect(parseClinicalStructuredData(formData, schema)).toEqual({});
    expect(() =>
      parseClinicalStructuredData(formData, schema, {
        enforceRequired: true,
      }),
    ).toThrow(ClinicalStructuredDataError);
  });

  it("rejects values outside numeric bounds and unknown choices", () => {
    const formData = new FormData();
    formData.set("field:weight", "501");
    formData.set("field:risk", "critical");

    try {
      parseClinicalStructuredData(formData, schema);
      throw new Error("Expected parser to reject invalid values.");
    } catch (error) {
      expect(error).toBeInstanceOf(ClinicalStructuredDataError);
      expect((error as ClinicalStructuredDataError).issues).toHaveLength(2);
    }
  });
});

describe("isClinicalFieldValueEmpty", () => {
  it("distinguishes empty values from zero and false", () => {
    expect(isClinicalFieldValueEmpty(undefined)).toBe(true);
    expect(isClinicalFieldValueEmpty("   ")).toBe(true);
    expect(isClinicalFieldValueEmpty([])).toBe(true);
    expect(isClinicalFieldValueEmpty(0)).toBe(false);
    expect(isClinicalFieldValueEmpty(false)).toBe(false);
  });
});
