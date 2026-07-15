import {
  normalizeClinicalTemplateSchema,
  type ClinicalField,
  type ClinicalFieldValue,
  type ClinicalStructuredData,
  type ClinicalTemplateSchema,
} from "./template-schema";

export type ClinicalStructuredDataIssue = {
  fieldId: string;
  fieldLabel: string;
  message: string;
};

export class ClinicalStructuredDataError extends Error {
  readonly issues: ClinicalStructuredDataIssue[];

  constructor(issues: ClinicalStructuredDataIssue[]) {
    super(issues[0]?.message ?? "Dados clínicos inválidos.");
    this.name = "ClinicalStructuredDataError";
    this.issues = issues;
  }
}

type ParseClinicalStructuredDataOptions = {
  enforceRequired?: boolean;
};

/**
 * Converts browser FormData to native JSON values using the trusted template
 * snapshot as the source of field types. Unknown submitted fields are ignored.
 */
export function parseClinicalStructuredData(
  formData: FormData,
  schemaInput: ClinicalTemplateSchema | unknown,
  options: ParseClinicalStructuredDataOptions = {},
): ClinicalStructuredData {
  const schema = normalizeClinicalTemplateSchema(schemaInput);
  const structuredData: ClinicalStructuredData = {};
  const issues: ClinicalStructuredDataIssue[] = [];

  for (const section of schema.sections) {
    for (const field of section.fields) {
      try {
        const value = parseFieldValue(formData, field);
        if (value !== undefined) structuredData[field.id] = value;
        if (options.enforceRequired && field.required && value === undefined) {
          issues.push(issue(field, `${field.label} é obrigatório.`));
        }
      } catch (error) {
        issues.push(
          issue(
            field,
            error instanceof Error
              ? error.message
              : `O valor de ${field.label} é inválido.`,
          ),
        );
      }
    }
  }

  if (issues.length) throw new ClinicalStructuredDataError(issues);
  return structuredData;
}

export function isClinicalFieldValueEmpty(
  value: ClinicalFieldValue | null | undefined,
) {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim().length === 0;
  return false;
}

function parseFieldValue(
  formData: FormData,
  field: ClinicalField,
): ClinicalFieldValue | undefined {
  const name = `field:${field.id}`;

  if (field.type === "multiselect") {
    const values = parseMultipleValues(formData.getAll(name));
    if (!values.length) return undefined;
    assertAllowedOptions(field, values);
    return values;
  }

  const raw = scalarFormValue(formData.get(name));
  if (raw === undefined || !raw.trim()) return undefined;
  const value = raw.trim();

  switch (field.type) {
    case "text":
    case "textarea":
      return value;
    case "number": {
      const parsed = Number(value.replace(",", "."));
      if (!Number.isFinite(parsed)) {
        throw new Error(`${field.label} deve ser um número válido.`);
      }
      if (field.min !== undefined && parsed < field.min) {
        throw new Error(
          `${field.label} deve ser maior ou igual a ${field.min}.`,
        );
      }
      if (field.max !== undefined && parsed > field.max) {
        throw new Error(
          `${field.label} deve ser menor ou igual a ${field.max}.`,
        );
      }
      if (
        field.step !== undefined &&
        !matchesStep(parsed, field.step, field.min ?? 0)
      ) {
        throw new Error(
          `${field.label} deve respeitar o incremento de ${field.step}.`,
        );
      }
      return parsed;
    }
    case "boolean":
      if (["true", "1", "on", "sim"].includes(value.toLowerCase())) {
        return true;
      }
      if (["false", "0", "off", "não", "nao"].includes(value.toLowerCase())) {
        return false;
      }
      throw new Error(`${field.label} deve ser respondido com sim ou não.`);
    case "select":
      assertAllowedOptions(field, [value]);
      return value;
    case "date":
      if (!isValidIsoDate(value)) {
        throw new Error(`${field.label} deve conter uma data válida.`);
      }
      return value;
    case "time":
      if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
        throw new Error(`${field.label} deve conter um horário válido.`);
      }
      return value;
  }
}

function parseMultipleValues(values: FormDataEntryValue[]) {
  const scalarValues = values
    .map(scalarFormValue)
    .filter((value): value is string => value !== undefined)
    .map((value) => value.trim())
    .filter(Boolean);

  if (scalarValues.length === 1 && scalarValues[0]!.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(scalarValues[0]!);
      if (
        !Array.isArray(parsed) ||
        parsed.some((item) => typeof item !== "string")
      ) {
        throw new Error();
      }
      return [...new Set(parsed.map((item) => item.trim()).filter(Boolean))];
    } catch {
      throw new Error("A seleção múltipla informada é inválida.");
    }
  }

  return [...new Set(scalarValues)];
}

function assertAllowedOptions(
  field: Extract<ClinicalField, { type: "select" | "multiselect" }>,
  values: string[],
) {
  const allowed = new Set(field.options.map((option) => option.id));
  if (values.some((value) => !allowed.has(value))) {
    throw new Error(`${field.label} contém uma opção inválida.`);
  }
}

function matchesStep(value: number, step: number, base: number) {
  const quotient = (value - base) / step;
  return Math.abs(quotient - Math.round(quotient)) < 1e-9;
}

function isValidIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function scalarFormValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : undefined;
}

function issue(
  field: ClinicalField,
  message: string,
): ClinicalStructuredDataIssue {
  return { fieldId: field.id, fieldLabel: field.label, message };
}
