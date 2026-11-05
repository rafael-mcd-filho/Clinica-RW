import { isValidCPF, isValidPhoneBR, onlyDigits } from "@/lib/validation/br";

/**
 * Importação de pacientes por planilha (Raio-X P1). Funções puras: ler o CSV,
 * reconhecer as colunas pelo cabeçalho e validar cada linha antes de enviar.
 */

export type ImportField =
  | "full_name"
  | "social_name"
  | "birth_date"
  | "sex_at_birth"
  | "cpf"
  | "email"
  | "phone"
  | "whatsapp";

export const importFieldLabels: Record<ImportField, string> = {
  full_name: "Nome completo",
  social_name: "Nome social",
  birth_date: "Nascimento",
  sex_at_birth: "Sexo",
  cpf: "CPF",
  email: "E-mail",
  phone: "Telefone",
  whatsapp: "WhatsApp / celular",
};

const headerAliases: Record<ImportField, string[]> = {
  full_name: ["nome", "nome completo", "paciente", "nome do paciente", "name"],
  social_name: ["nome social", "apelido"],
  birth_date: [
    "nascimento",
    "data de nascimento",
    "data nascimento",
    "dt nascimento",
    "nasc",
    "birth_date",
  ],
  sex_at_birth: ["sexo", "genero", "gênero", "sex"],
  cpf: ["cpf", "documento"],
  email: ["email", "e-mail", "e mail"],
  phone: ["telefone", "fone", "tel", "telefone fixo"],
  whatsapp: ["whatsapp", "celular", "whats", "telefone celular", "cel"],
};

export type ImportedPatient = {
  full_name: string;
  social_name: string | null;
  birth_date: string | null;
  sex_at_birth: "female" | "male" | null;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
};

export type ImportRowResult = {
  line: number;
  patient: ImportedPatient;
  errors: string[];
};

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** CSV com vírgula, ponto e vírgula ou tab (o Excel em português usa ";"),
    aspas e quebras de linha dentro de campos. */
export function parseCsv(text: string): string[][] {
  const content = text.replace(/^﻿/, "");
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", ",", "\t"]
    .map((candidate) => ({
      candidate,
      count: firstLine.split(candidate).length,
    }))
    .sort((a, b) => b.count - a.count)[0].candidate;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (quoted) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

/** Coluna de cada campo a partir do cabeçalho (índice ou -1). */
export function detectColumns(header: string[]) {
  const normalized = header.map(stripAccents);
  const mapping = {} as Record<ImportField, number>;
  for (const field of Object.keys(headerAliases) as ImportField[]) {
    mapping[field] = normalized.findIndex((cell) =>
      headerAliases[field].some((alias) => cell === stripAccents(alias)),
    );
  }
  return mapping;
}

/** "15/04/1988", "15-04-1988" ou "1988-04-15" → "1988-04-15". */
export function parseBirthDate(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  let year: number;
  let month: number;
  let day: number;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const br = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (br) {
    [day, month, year] = [Number(br[1]), Number(br[2]), Number(br[3])];
    if (year < 100) year += year > 30 ? 1900 : 2000;
  } else {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    year < 1900 ||
    date.getTime() > Date.now()
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseSex(value: string): ImportedPatient["sex_at_birth"] {
  const text = stripAccents(value);
  if (["f", "feminino", "fem", "mulher"].includes(text)) return "female";
  if (["m", "masculino", "masc", "homem"].includes(text)) return "male";
  return null;
}

function phoneDigits(value: string) {
  let digits = onlyDigits(value);
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  return digits || null;
}

/** Valida e normaliza as linhas de dados (sem o cabeçalho). Linhas com o
    mesmo CPF dentro da planilha também são apontadas. */
export function normalizeImportRows(
  rows: string[][],
  mapping: Record<ImportField, number>,
  firstLineNumber = 2,
): ImportRowResult[] {
  const seenCpf = new Map<string, number>();
  return rows.map((row, index) => {
    const read = (field: ImportField) =>
      mapping[field] >= 0 ? (row[mapping[field]] ?? "").trim() : "";
    const errors: string[] = [];
    const fullName = read("full_name").replace(/\s+/g, " ");
    if (fullName.length < 3) errors.push("Nome ausente ou curto");

    const rawBirth = read("birth_date");
    const birthDate = parseBirthDate(rawBirth);
    if (rawBirth && !birthDate) errors.push("Nascimento inválido");

    const rawCpf = read("cpf");
    const cpf = rawCpf ? onlyDigits(rawCpf).padStart(11, "0") : null;
    if (cpf && !isValidCPF(cpf)) errors.push("CPF inválido");
    const line = firstLineNumber + index;
    if (cpf && isValidCPF(cpf)) {
      const previous = seenCpf.get(cpf);
      if (previous) errors.push(`CPF repetido (linha ${previous})`);
      else seenCpf.set(cpf, line);
    }

    const phone = phoneDigits(read("phone"));
    const whatsapp = phoneDigits(read("whatsapp"));
    if (phone && !isValidPhoneBR(phone)) errors.push("Telefone inválido");
    if (whatsapp && !isValidPhoneBR(whatsapp)) errors.push("Celular inválido");

    const email = read("email").toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("E-mail inválido");
    }

    return {
      line,
      errors,
      patient: {
        full_name: fullName,
        social_name: read("social_name") || null,
        birth_date: birthDate,
        sex_at_birth: parseSex(read("sex_at_birth")),
        cpf: cpf && isValidCPF(cpf) ? cpf : null,
        email: email || null,
        phone,
        whatsapp,
      },
    };
  });
}
