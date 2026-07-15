import { describe, expect, it } from "vitest";
import {
  clinicalTemplateSchema,
  cloneClinicalTemplateSchema,
  createSoapClinicalTemplateSchema,
  normalizeClinicalTemplateSchema,
  prepareClinicalTemplateSchemaForEditing,
  type ClinicalTemplateSchema,
} from "./template-schema";

const completeSchema: ClinicalTemplateSchema = {
  schemaVersion: 2,
  sections: [
    {
      id: "vitals",
      title: "Sinais vitais",
      fields: [
        {
          id: "weight",
          label: "Peso",
          type: "number",
          required: true,
          unit: "kg",
          min: 0,
          max: 500,
          step: 0.01,
        },
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
      ],
    },
  ],
};

describe("clinicalTemplateSchema", () => {
  it("accepts the supported typed fields", () => {
    expect(clinicalTemplateSchema.parse(completeSchema)).toEqual(
      completeSchema,
    );
  });

  it("rejects duplicate field identifiers and invalid numeric bounds", () => {
    const invalid = structuredClone(completeSchema);
    invalid.sections[0]!.fields.push({
      id: "weight",
      label: "Outro peso",
      type: "number",
      required: false,
      min: 10,
      max: 1,
    });

    const result = clinicalTemplateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Cada campo deve possuir um identificador único.",
          "O valor mínimo não pode ser maior que o máximo.",
        ]),
      );
    }
  });
});

describe("createSoapClinicalTemplateSchema", () => {
  it("creates a valid SOAP form with the four clinical reasoning stages", () => {
    let sequence = 0;
    const schema = createSoapClinicalTemplateSchema(() => `soap_${++sequence}`);

    expect(clinicalTemplateSchema.safeParse(schema).success).toBe(true);
    expect(schema.sections.map((section) => section.title)).toEqual([
      "Subjetivo",
      "Objetivo",
      "Avaliação",
      "Plano",
    ]);
    expect(schema.sections.map((section) => section.id)).toEqual([
      "soap_1",
      "soap_3",
      "soap_5",
      "soap_7",
    ]);
    expect(schema.sections.flatMap((section) => section.fields)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "soap_2",
          label: "Relato subjetivo",
          type: "textarea",
        }),
        expect.objectContaining({
          id: "soap_4",
          label: "Dados objetivos",
          type: "textarea",
        }),
        expect.objectContaining({
          id: "soap_6",
          label: "Avaliação clínica",
          type: "textarea",
        }),
        expect.objectContaining({
          id: "soap_8",
          label: "Plano de cuidado",
          type: "textarea",
        }),
      ]),
    );
    for (const section of schema.sections) {
      expect(section.description).toBeTruthy();
      expect(section.fields).toHaveLength(1);
      expect(section.fields[0]).toMatchObject({
        required: false,
        type: "textarea",
      });
      expect(section.fields[0]!.helpText).toBeTruthy();
      const field = section.fields[0]!;
      expect("placeholder" in field && field.placeholder).toBeTruthy();
    }
  });
});

describe("normalizeClinicalTemplateSchema", () => {
  it("normalizes legacy schemas while preserving their identifiers", () => {
    expect(
      normalizeClinicalTemplateSchema({
        sections: [
          {
            id: "anamnese",
            title: "Anamnese",
            fields: [
              { id: "complaint", label: "Queixa", required: true },
              { id: "notes", label: "Notas", type: "text" },
            ],
          },
        ],
      }),
    ).toEqual({
      schemaVersion: 2,
      sections: [
        {
          id: "anamnese",
          title: "Anamnese",
          fields: [
            {
              id: "complaint",
              label: "Queixa",
              type: "textarea",
              required: true,
            },
            {
              id: "notes",
              label: "Notas",
              type: "text",
              required: false,
            },
          ],
        },
      ],
    });
  });
});

describe("cloneClinicalTemplateSchema", () => {
  it("regenerates section, field and option ids without losing settings", () => {
    let sequence = 0;
    const clone = cloneClinicalTemplateSchema(
      completeSchema,
      () => `new_${++sequence}`,
    );

    expect(clone.sections[0]!.id).toBe("new_1");
    expect(clone.sections[0]!.fields[0]!.id).toBe("new_2");
    expect(clone.sections[0]!.fields[1]!.id).toBe("new_3");
    const choice = clone.sections[0]!.fields[1]!;
    expect(choice.type).toBe("multiselect");
    if (choice.type === "multiselect") {
      expect(choice.options.map((option) => option.id)).toEqual([
        "new_4",
        "new_5",
      ]);
    }
    expect(clone.sections[0]!.fields[0]).toMatchObject({
      label: "Peso",
      unit: "kg",
      min: 0,
      max: 500,
    });
  });
});

describe("prepareClinicalTemplateSchemaForEditing", () => {
  it("preserves valid ids and repairs only invalid or duplicate legacy ids", () => {
    let sequence = 0;
    const prepared = prepareClinicalTemplateSchemaForEditing(
      {
        sections: [
          {
            id: "anamnese",
            title: "Anamnese",
            fields: [
              { id: "123-invalido", label: "Queixa" },
              { id: "conduta", label: "Conduta" },
              { id: "conduta", label: "Outra conduta" },
            ],
          },
        ],
      },
      () => `fixed_${++sequence}`,
    );

    expect(prepared.sections[0]!.id).toBe("anamnese");
    expect(prepared.sections[0]!.fields.map((field) => field.id)).toEqual([
      "fixed_1",
      "conduta",
      "fixed_2",
    ]);
    expect(clinicalTemplateSchema.safeParse(prepared).success).toBe(true);
  });
});
