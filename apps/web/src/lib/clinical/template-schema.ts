import { z } from "zod";

export const CLINICAL_TEMPLATE_SCHEMA_VERSION = 2 as const;

export const clinicalFieldTypes = [
  "text",
  "textarea",
  "number",
  "date",
  "time",
  "boolean",
  "select",
  "multiselect",
] as const;

export type ClinicalFieldType = (typeof clinicalFieldTypes)[number];

const clinicalIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, {
    message:
      "O identificador deve começar com uma letra e usar apenas letras minúsculas, números ou sublinhado.",
  });
const optionIdentifierSchema = z.string().trim().min(1).max(120);
const labelSchema = z.string().trim().min(1).max(160);
const sectionTitleSchema = z.string().trim().min(1).max(120);
const optionalTextSchema = z.string().trim().max(500).optional();

export const clinicalOptionSchema = z
  .object({
    id: optionIdentifierSchema,
    label: labelSchema,
  })
  .strict();

const clinicalFieldBaseSchema = z.object({
  id: clinicalIdentifierSchema,
  label: labelSchema,
  required: z.boolean().default(false),
  helpText: optionalTextSchema,
});

const textFieldSchema = clinicalFieldBaseSchema
  .extend({
    type: z.literal("text"),
    placeholder: optionalTextSchema,
  })
  .strict();

const textareaFieldSchema = clinicalFieldBaseSchema
  .extend({
    type: z.literal("textarea"),
    placeholder: optionalTextSchema,
  })
  .strict();

const numberFieldSchema = clinicalFieldBaseSchema
  .extend({
    type: z.literal("number"),
    placeholder: optionalTextSchema,
    unit: z.string().trim().max(40).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    step: z.number().finite().positive().optional(),
  })
  .strict()
  .superRefine((field, context) => {
    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    ) {
      context.addIssue({
        code: "custom",
        message: "O valor mínimo não pode ser maior que o máximo.",
        path: ["min"],
      });
    }
  });

const dateFieldSchema = clinicalFieldBaseSchema
  .extend({
    type: z.literal("date"),
    placeholder: optionalTextSchema,
  })
  .strict();

const timeFieldSchema = clinicalFieldBaseSchema
  .extend({
    type: z.literal("time"),
    placeholder: optionalTextSchema,
  })
  .strict();

const booleanFieldSchema = clinicalFieldBaseSchema
  .extend({ type: z.literal("boolean") })
  .strict();

function choiceFieldSchema<const Type extends "select" | "multiselect">(
  type: Type,
) {
  return clinicalFieldBaseSchema
    .extend({
      type: z.literal(type),
      placeholder: optionalTextSchema,
      options: z.array(clinicalOptionSchema).min(1).max(100),
    })
    .strict()
    .superRefine((field, context) => {
      const optionIds = new Set<string>();
      for (const [index, option] of field.options.entries()) {
        if (optionIds.has(option.id)) {
          context.addIssue({
            code: "custom",
            message: "Cada opção deve possuir um identificador único.",
            path: ["options", index, "id"],
          });
        }
        optionIds.add(option.id);
      }
    });
}

export const clinicalFieldSchema = z.union([
  textFieldSchema,
  textareaFieldSchema,
  numberFieldSchema,
  dateFieldSchema,
  timeFieldSchema,
  booleanFieldSchema,
  choiceFieldSchema("select"),
  choiceFieldSchema("multiselect"),
]);

export const clinicalSectionSchema = z
  .object({
    id: clinicalIdentifierSchema,
    title: sectionTitleSchema,
    description: optionalTextSchema,
    fields: z.array(clinicalFieldSchema).min(1).max(100),
  })
  .strict();

export const clinicalTemplateSchema = z
  .object({
    schemaVersion: z.literal(CLINICAL_TEMPLATE_SCHEMA_VERSION),
    sections: z.array(clinicalSectionSchema).min(1).max(30),
  })
  .strict()
  .superRefine((schema, context) => {
    const sectionIds = new Set<string>();
    const fieldIds = new Set<string>();
    let fieldCount = 0;

    for (const [sectionIndex, section] of schema.sections.entries()) {
      if (sectionIds.has(section.id)) {
        context.addIssue({
          code: "custom",
          message: "Cada seção deve possuir um identificador único.",
          path: ["sections", sectionIndex, "id"],
        });
      }
      sectionIds.add(section.id);

      for (const [fieldIndex, field] of section.fields.entries()) {
        fieldCount += 1;
        if (fieldIds.has(field.id)) {
          context.addIssue({
            code: "custom",
            message: "Cada campo deve possuir um identificador único.",
            path: ["sections", sectionIndex, "fields", fieldIndex, "id"],
          });
        }
        fieldIds.add(field.id);
      }
    }

    if (fieldCount > 200) {
      context.addIssue({
        code: "custom",
        message: "O modelo pode possuir no máximo 200 campos.",
        path: ["sections"],
      });
    }
  });

export type ClinicalOption = z.infer<typeof clinicalOptionSchema>;
export type ClinicalField = z.infer<typeof clinicalFieldSchema>;
export type ClinicalSection = z.infer<typeof clinicalSectionSchema>;
export type ClinicalTemplateSchema = z.infer<typeof clinicalTemplateSchema>;
export type ClinicalFieldValue = string | number | boolean | string[];
export type ClinicalStructuredData = Record<string, ClinicalFieldValue>;

type IdFactory = () => string;

export function createClinicalId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `id_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
  }

  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function createClinicalField(
  type: ClinicalFieldType = "textarea",
  label = "Novo campo",
  idFactory: IdFactory = createClinicalId,
): ClinicalField {
  const base = {
    id: idFactory(),
    label,
    required: false,
  };

  if (type === "number") {
    return { ...base, type, step: 0.01 };
  }
  if (type === "select" || type === "multiselect") {
    return {
      ...base,
      type,
      options: [
        { id: idFactory(), label: "Opção 1" },
        { id: idFactory(), label: "Opção 2" },
      ],
    };
  }
  return { ...base, type };
}

export function createClinicalSection(
  title = "Nova seção",
  idFactory: IdFactory = createClinicalId,
): ClinicalSection {
  return {
    id: idFactory(),
    title,
    fields: [createClinicalField("textarea", "Novo campo", idFactory)],
  };
}

export function createDefaultClinicalTemplateSchema(
  idFactory: IdFactory = createClinicalId,
): ClinicalTemplateSchema {
  return {
    schemaVersion: CLINICAL_TEMPLATE_SCHEMA_VERSION,
    sections: [
      {
        id: idFactory(),
        title: "Evolução",
        fields: [
          createClinicalField("textarea", "Queixa principal", idFactory),
          createClinicalField("textarea", "Exame físico", idFactory),
          createClinicalField("textarea", "Conduta", idFactory),
        ],
      },
    ],
  };
}

export function createSoapClinicalTemplateSchema(
  idFactory: IdFactory = createClinicalId,
): ClinicalTemplateSchema {
  return {
    schemaVersion: CLINICAL_TEMPLATE_SCHEMA_VERSION,
    sections: [
      {
        id: idFactory(),
        title: "Subjetivo",
        description:
          "Registre o que o paciente ou acompanhante relata, sem apresentar o relato como um fato observado.",
        fields: [
          {
            id: idFactory(),
            label: "Relato subjetivo",
            type: "textarea",
            required: false,
            placeholder:
              "Ex.: Paciente relata dor de garganta há três dias, febre não medida e dificuldade para engolir.",
            helpText:
              "Inclua sintomas, duração, intensidade, preocupações e a história do problema conforme relatados.",
          },
        ],
      },
      {
        id: idFactory(),
        title: "Objetivo",
        description:
          "Registre apenas informações observadas, examinadas ou medidas pelo profissional.",
        fields: [
          {
            id: idFactory(),
            label: "Dados objetivos",
            type: "textarea",
            required: false,
            placeholder:
              "Ex.: Temperatura 38,2 °C, FC 96 bpm e orofaringe hiperemiada.",
            helpText:
              "Inclua sinais vitais, exame físico e resultados de exames, evitando hipóteses ou opiniões.",
          },
        ],
      },
      {
        id: idFactory(),
        title: "Avaliação",
        description:
          "Interprete os dados subjetivos e objetivos e registre os problemas ou hipóteses identificados.",
        fields: [
          {
            id: idFactory(),
            label: "Avaliação clínica",
            type: "textarea",
            required: false,
            placeholder:
              "Ex.: Quadro sugestivo de faringoamigdalite aguda, possivelmente estreptocócica.",
            helpText:
              "Registre o raciocínio clínico, os problemas e as hipóteses. Informe o CID no campo próprio de diagnóstico do atendimento.",
          },
        ],
      },
      {
        id: idFactory(),
        title: "Plano",
        description:
          "Defina as condutas decorrentes da avaliação clínica e o acompanhamento necessário.",
        fields: [
          {
            id: idFactory(),
            label: "Plano de cuidado",
            type: "textarea",
            required: false,
            placeholder:
              "Ex.: Solicitar exame, orientar hidratação e retornar em 48–72 horas ou antes se houver piora.",
            helpText:
              "Inclua tratamento, prescrições, exames, orientações, encaminhamentos, retorno e sinais de alarme.",
          },
        ],
      },
    ],
  };
}

/**
 * Converts historical schemas to the current in-memory shape without changing
 * persisted snapshots. Rendering must remain tolerant because published
 * template versions are immutable.
 */
export function normalizeClinicalTemplateSchema(
  input: unknown,
): ClinicalTemplateSchema {
  const current = clinicalTemplateSchema.safeParse(input);
  if (current.success) return current.data;

  const rawSections =
    isRecord(input) && Array.isArray(input.sections) ? input.sections : [];

  return {
    schemaVersion: CLINICAL_TEMPLATE_SCHEMA_VERSION,
    sections: rawSections.filter(isRecord).map((section, sectionIndex) => ({
      id: normalizedIdentifier(
        section.id,
        `legacy_section_${sectionIndex + 1}`,
      ),
      title: normalizedLabel(section.title, `Seção ${sectionIndex + 1}`),
      ...optionalProperty(
        "description",
        normalizedOptionalText(section.description),
      ),
      fields: (Array.isArray(section.fields) ? section.fields : [])
        .filter(isRecord)
        .map((field, fieldIndex) =>
          normalizeLegacyField(field, sectionIndex, fieldIndex),
        ),
    })),
  };
}

export function cloneClinicalTemplateSchema(
  input: unknown,
  idFactory: IdFactory = createClinicalId,
): ClinicalTemplateSchema {
  const schema = normalizeClinicalTemplateSchema(input);

  return {
    schemaVersion: CLINICAL_TEMPLATE_SCHEMA_VERSION,
    sections: schema.sections.map((section) => ({
      ...section,
      id: idFactory(),
      fields: section.fields.map((field) => {
        const cloned = { ...field, id: idFactory() };
        if (cloned.type === "select" || cloned.type === "multiselect") {
          return {
            ...cloned,
            options: cloned.options.map((option) => ({
              ...option,
              id: idFactory(),
            })),
          };
        }
        return cloned;
      }),
    })),
  };
}

/**
 * Keeps stable legacy ids whenever they are publishable, while repairing only
 * invalid or duplicate ids in the editable copy. Historical snapshots remain
 * untouched and continue to render through normalizeClinicalTemplateSchema.
 */
export function prepareClinicalTemplateSchemaForEditing(
  input: unknown,
  idFactory: IdFactory = createClinicalId,
): ClinicalTemplateSchema {
  const normalized = normalizeClinicalTemplateSchema(input);
  if (!normalized.sections.length) {
    return createDefaultClinicalTemplateSchema(idFactory);
  }

  const sectionIds = new Set<string>();
  const fieldIds = new Set<string>();

  return {
    schemaVersion: CLINICAL_TEMPLATE_SCHEMA_VERSION,
    sections: normalized.sections.map((section) => {
      const sectionId = publishableClinicalId(section.id, sectionIds)
        ? section.id
        : uniqueClinicalId(sectionIds, idFactory);
      sectionIds.add(sectionId);
      const sourceFields = section.fields.length
        ? section.fields
        : [createClinicalField("textarea", "Novo campo", idFactory)];

      return {
        ...section,
        id: sectionId,
        fields: sourceFields.map((field) => {
          const fieldId = publishableClinicalId(field.id, fieldIds)
            ? field.id
            : uniqueClinicalId(fieldIds, idFactory);
          fieldIds.add(fieldId);

          if (field.type !== "select" && field.type !== "multiselect") {
            return { ...field, id: fieldId };
          }

          const optionIds = new Set<string>();
          const sourceOptions = field.options.length
            ? field.options
            : [
                { id: idFactory(), label: "Opção 1" },
                { id: idFactory(), label: "Opção 2" },
              ];
          return {
            ...field,
            id: fieldId,
            options: sourceOptions.map((option) => {
              const optionId =
                option.id.trim() &&
                option.id.length <= 120 &&
                !optionIds.has(option.id)
                  ? option.id
                  : uniqueOptionId(optionIds, idFactory);
              optionIds.add(optionId);
              return { ...option, id: optionId };
            }),
          };
        }),
      };
    }),
  };
}

function normalizeLegacyField(
  field: Record<string, unknown>,
  sectionIndex: number,
  fieldIndex: number,
): ClinicalField {
  const id = normalizedIdentifier(
    field.id,
    `legacy_field_${sectionIndex + 1}_${fieldIndex + 1}`,
  );
  const label = normalizedLabel(field.label, `Campo ${fieldIndex + 1}`);
  const required = field.required === true;
  const helpText = normalizedOptionalText(field.helpText ?? field.help_text);
  const placeholder = normalizedOptionalText(field.placeholder);
  const type = isClinicalFieldType(field.type) ? field.type : "textarea";
  const base = {
    id,
    label,
    required,
    ...optionalProperty("helpText", helpText),
  };

  if (type === "number") {
    const min = normalizedOptionalNumber(field.min);
    const max = normalizedOptionalNumber(field.max);
    const step = normalizedOptionalNumber(field.step);
    return {
      ...base,
      type,
      ...optionalProperty("placeholder", placeholder),
      ...optionalProperty("unit", normalizedOptionalText(field.unit)),
      ...optionalProperty("min", min),
      ...optionalProperty("max", max),
      ...(step !== undefined && step > 0 ? { step } : {}),
    };
  }

  if (type === "select" || type === "multiselect") {
    const rawOptions = Array.isArray(field.options) ? field.options : [];
    return {
      ...base,
      type,
      ...optionalProperty("placeholder", placeholder),
      options: rawOptions.map((option, optionIndex) =>
        normalizeLegacyOption(option, optionIndex),
      ),
    };
  }

  if (type === "boolean") return { ...base, type };

  return {
    ...base,
    type,
    ...optionalProperty("placeholder", placeholder),
  };
}

function normalizeLegacyOption(
  option: unknown,
  optionIndex: number,
): ClinicalOption {
  if (typeof option === "string") {
    return {
      id: normalizedIdentifier(option, `legacy_option_${optionIndex + 1}`),
      label: normalizedLabel(option, `Opção ${optionIndex + 1}`),
    };
  }
  if (isRecord(option)) {
    const label = normalizedLabel(option.label, `Opção ${optionIndex + 1}`);
    return {
      id: normalizedIdentifier(
        option.id ?? option.value,
        `legacy_option_${optionIndex + 1}`,
      ),
      label,
    };
  }
  return {
    id: `legacy_option_${optionIndex + 1}`,
    label: `Opção ${optionIndex + 1}`,
  };
}

function isClinicalFieldType(value: unknown): value is ClinicalFieldType {
  return (
    typeof value === "string" &&
    (clinicalFieldTypes as readonly string[]).includes(value)
  );
}

function normalizedIdentifier(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : fallback;
}

function publishableClinicalId(value: string, used: Set<string>) {
  return /^[a-z][a-z0-9_]{0,63}$/.test(value) && !used.has(value);
}

function uniqueClinicalId(used: Set<string>, idFactory: IdFactory) {
  let candidate = idFactory();
  while (!publishableClinicalId(candidate, used)) candidate = idFactory();
  return candidate;
}

function uniqueOptionId(used: Set<string>, idFactory: IdFactory) {
  let candidate = idFactory();
  while (!candidate.trim() || candidate.length > 120 || used.has(candidate)) {
    candidate = idFactory();
  }
  return candidate;
}

function normalizedLabel(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 160)
    : fallback;
}

function normalizedOptionalText(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 500)
    : undefined;
}

function normalizedOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): { [Property in Key]?: Value } {
  return value === undefined
    ? {}
    : ({ [key]: value } as {
        [Property in Key]?: Value;
      });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
