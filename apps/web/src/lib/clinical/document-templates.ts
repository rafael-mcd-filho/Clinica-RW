import { z } from "zod";

export const clinicalDocumentTypes = [
  "prescription",
  "exam_request",
  "medical_certificate",
  "attendance_declaration",
] as const;

export type ClinicalDocumentType = (typeof clinicalDocumentTypes)[number];

const fontSizeSchema = z.enum(["small", "medium", "large"]);

export const documentTemplateLayoutSchema = z
  .object({
    paperSize: z.enum(["A4", "LETTER"]),
    header: z
      .object({
        enabled: z.boolean(),
        showLogo: z.boolean(),
        logoPosition: z.enum(["left", "right"]),
        showClinicDetails: z.boolean(),
        fontSize: fontSizeSchema,
      })
      .strict(),
    body: z
      .object({
        fontSize: fontSizeSchema,
        showPatientSummary: z.boolean(),
      })
      .strict(),
    signature: z
      .object({
        enabled: z.boolean(),
        showCouncil: z.boolean(),
      })
      .strict(),
    footer: z
      .object({
        enabled: z.boolean(),
        showPatientName: z.boolean(),
        showPageNumber: z.boolean(),
        fontSize: fontSizeSchema,
      })
      .strict(),
  })
  .strict();

export type DocumentTemplateLayout = z.infer<
  typeof documentTemplateLayoutSchema
>;

export const DEFAULT_DOCUMENT_TEMPLATE_LAYOUT = {
  paperSize: "A4",
  header: {
    enabled: true,
    showLogo: true,
    logoPosition: "left",
    showClinicDetails: true,
    fontSize: "medium",
  },
  body: {
    fontSize: "medium",
    showPatientSummary: true,
  },
  signature: {
    enabled: true,
    showCouncil: true,
  },
  footer: {
    enabled: true,
    showPatientName: true,
    showPageNumber: true,
    fontSize: "small",
  },
} as const satisfies DocumentTemplateLayout;

type VariableGroup =
  | "Paciente"
  | "Profissional"
  | "Clínica"
  | "Unidade"
  | "Atendimento"
  | "Documento";

export type DocumentTemplateVariableDefinition = {
  key: string;
  token: string;
  label: string;
  group: VariableGroup;
  example: string;
};

export const DOCUMENT_TEMPLATE_VARIABLES = [
  variable("paciente.nome", "Nome de exibição", "Paciente", "Maria Silva"),
  variable(
    "paciente.nome_completo",
    "Nome completo",
    "Paciente",
    "Maria de Souza Silva",
  ),
  variable("paciente.nome_social", "Nome social", "Paciente", "Maria Silva"),
  variable("paciente.cpf", "CPF", "Paciente", "123.456.789-00"),
  variable("paciente.rg", "RG", "Paciente", "12.345.678-9"),
  variable(
    "paciente.documento",
    "Documento (RG ou CPF)",
    "Paciente",
    "RG 12.345.678-9",
  ),
  variable(
    "paciente.data_nascimento",
    "Data de nascimento",
    "Paciente",
    "15/04/1987",
  ),
  variable("paciente.idade", "Idade", "Paciente", "39 anos"),
  variable("paciente.email", "E-mail", "Paciente", "maria@exemplo.com"),
  variable("paciente.telefone", "Telefone", "Paciente", "(84) 99999-9999"),
  variable("profissional.nome", "Nome", "Profissional", "Dra. Ana Martins"),
  variable(
    "profissional.especialidade",
    "Especialidade",
    "Profissional",
    "Clínica médica",
  ),
  variable("profissional.conselho", "Conselho", "Profissional", "CRM"),
  variable(
    "profissional.numero_conselho",
    "Número do conselho",
    "Profissional",
    "12345",
  ),
  variable("profissional.uf_conselho", "UF do conselho", "Profissional", "RN"),
  variable(
    "profissional.registro",
    "Registro completo",
    "Profissional",
    "CRM 12345 RN",
  ),
  variable("clinica.nome", "Nome fantasia", "Clínica", "Hi Clinic"),
  variable(
    "clinica.razao_social",
    "Razão social",
    "Clínica",
    "Hi Clinic Serviços Médicos Ltda.",
  ),
  variable("clinica.cnpj", "CNPJ", "Clínica", "12.345.678/0001-90"),
  variable(
    "clinica.endereco",
    "Endereço completo",
    "Clínica",
    "Av. Brasil, 1500, Centro, Natal - RN",
  ),
  variable("clinica.cidade", "Cidade", "Clínica", "Natal"),
  variable("clinica.uf", "UF", "Clínica", "RN"),
  variable("clinica.telefone", "Telefone", "Clínica", "(84) 3333-3333"),
  variable("clinica.email", "E-mail", "Clínica", "contato@hiclinic.com.br"),
  variable("unidade.nome", "Nome", "Unidade", "Unidade Centro"),
  variable(
    "unidade.endereco",
    "Endereço completo",
    "Unidade",
    "Rua Principal, 100, Centro, Natal - RN",
  ),
  variable("unidade.cidade", "Cidade", "Unidade", "Natal"),
  variable("unidade.uf", "UF", "Unidade", "RN"),
  variable("unidade.telefone", "Telefone", "Unidade", "(84) 3333-4444"),
  variable("unidade.email", "E-mail", "Unidade", "centro@hiclinic.com.br"),
  variable("atendimento.data", "Data", "Atendimento", "14/07/2026"),
  variable("atendimento.hora_inicio", "Hora de início", "Atendimento", "14:00"),
  variable("atendimento.hora_fim", "Hora de término", "Atendimento", "14:45"),
  variable(
    "atendimento.procedimento",
    "Procedimento",
    "Atendimento",
    "Consulta médica",
  ),
  variable(
    "documento.data_emissao",
    "Data de emissão",
    "Documento",
    "14/07/2026",
  ),
  variable("documento.hora_emissao", "Hora de emissão", "Documento", "14:50"),
] as const;

export type DocumentVariableKey =
  (typeof DOCUMENT_TEMPLATE_VARIABLES)[number]["key"];

export const DOCUMENT_TEMPLATE_VARIABLE_KEYS = DOCUMENT_TEMPLATE_VARIABLES.map(
  ({ key }) => key,
) as DocumentVariableKey[];

export type DocumentVariableValues = Partial<
  Record<DocumentVariableKey, string | null | undefined>
>;

export type DocumentTemplateVariableInspection = {
  variables: DocumentVariableKey[];
  unknownVariables: string[];
};

export type DocumentTemplateResolution = DocumentTemplateVariableInspection & {
  value: string;
  missingVariables: DocumentVariableKey[];
};

const knownVariableKeys = new Set<string>(DOCUMENT_TEMPLATE_VARIABLE_KEYS);
const variablePattern = /{{\s*([^{}]+?)\s*}}/g;
const fontSizes = new Set(["small", "medium", "large"]);

export function normalizeDocumentTemplateLayout(
  value: unknown,
): DocumentTemplateLayout {
  const source = isRecord(value) ? value : {};
  const header = isRecord(source.header) ? source.header : {};
  const body = isRecord(source.body) ? source.body : {};
  const signature = isRecord(source.signature) ? source.signature : {};
  const footer = isRecord(source.footer) ? source.footer : {};

  return {
    paperSize: source.paperSize === "LETTER" ? "LETTER" : "A4",
    header: {
      enabled: booleanOr(header.enabled, true),
      showLogo: booleanOr(header.showLogo, true),
      logoPosition: header.logoPosition === "right" ? "right" : "left",
      showClinicDetails: booleanOr(header.showClinicDetails, true),
      fontSize: normalizeFontSize(header.fontSize, "medium"),
    },
    body: {
      fontSize: normalizeFontSize(body.fontSize, "medium"),
      showPatientSummary: booleanOr(body.showPatientSummary, true),
    },
    signature: {
      enabled: booleanOr(signature.enabled, true),
      showCouncil: booleanOr(signature.showCouncil, true),
    },
    footer: {
      enabled: booleanOr(footer.enabled, true),
      showPatientName: booleanOr(footer.showPatientName, true),
      showPageNumber: booleanOr(footer.showPageNumber, true),
      fontSize: normalizeFontSize(footer.fontSize, "small"),
    },
  };
}

export function inspectDocumentTemplateVariables(
  ...templates: Array<string | null | undefined>
): DocumentTemplateVariableInspection {
  const variables = new Set<DocumentVariableKey>();
  const unknownVariables = new Set<string>();

  for (const template of templates) {
    for (const key of matchedVariableKeys(template ?? "")) {
      if (knownVariableKeys.has(key)) {
        variables.add(key as DocumentVariableKey);
      } else {
        unknownVariables.add(key);
      }
    }
  }

  return {
    variables: [...variables],
    unknownVariables: [...unknownVariables],
  };
}

export function resolveDocumentTemplate(
  template: string | null | undefined,
  values: DocumentVariableValues,
): DocumentTemplateResolution {
  const variables = new Set<DocumentVariableKey>();
  const unknownVariables = new Set<string>();
  const missingVariables = new Set<DocumentVariableKey>();
  const source = sanitizeDocumentTemplateText(template ?? "");

  const value = source.replace(variablePattern, (token, rawKey: string) => {
    const key = rawKey.trim();

    if (!knownVariableKeys.has(key)) {
      unknownVariables.add(key);
      return token;
    }

    const typedKey = key as DocumentVariableKey;
    variables.add(typedKey);
    const replacement = values[typedKey];

    if (
      replacement === null ||
      replacement === undefined ||
      replacement === ""
    ) {
      missingVariables.add(typedKey);
      return token;
    }

    return sanitizeDocumentTemplateText(String(replacement));
  });

  return {
    value,
    variables: [...variables],
    unknownVariables: [...unknownVariables],
    missingVariables: [...missingVariables],
  };
}

export function sanitizeDocumentTemplateText(value: string) {
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function variable<Key extends string>(
  key: Key,
  label: string,
  group: VariableGroup,
  example: string,
) {
  return { key, token: `{{${key}}}`, label, group, example } as const;
}

function matchedVariableKeys(value: string) {
  return Array.from(value.matchAll(variablePattern), (match) =>
    (match[1] ?? "").trim(),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanOr(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeFontSize(
  value: unknown,
  fallback: "small" | "medium" | "large",
) {
  return typeof value === "string" && fontSizes.has(value)
    ? (value as "small" | "medium" | "large")
    : fallback;
}
