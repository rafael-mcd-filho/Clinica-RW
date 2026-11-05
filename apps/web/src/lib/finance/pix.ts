/**
 * Raio-X FI4: Pix "copia e cola" (BR Code estático) com o valor da conta.
 *
 * Gera o código no padrão EMV do Banco Central (Manual de Padrões para
 * Iniciação do Pix) a partir da chave Pix da clínica, sem banco nem gateway
 * no meio. O paciente paga lendo o QR ou colando o código no app do banco; a
 * baixa continua manual. Baixa automática por webhook exige um PSP/gateway
 * (Pix dinâmico) e fica para quando houver contrato com um.
 */

import { isValidCNPJ, isValidCPF, onlyDigits } from "@/lib/validation/br";

export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

export const pixKeyTypeLabels: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  phone: "Celular",
  random: "Chave aleatória",
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(raw: string): string | null {
  const digits = onlyDigits(raw);
  const national =
    digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  // DDD (2) + número de 8 ou 9 dígitos.
  if (national.length !== 10 && national.length !== 11) return null;
  return `+55${national}`;
}

/**
 * Confere e padroniza a chave como o Banco Central espera: CPF e CNPJ só com
 * números, celular com +55 e DDD, e-mail em minúsculas, chave aleatória em
 * minúsculas. Sem tipo informado, tenta descobrir pelo formato.
 */
export function normalizePixKey(
  raw: string,
  type?: PixKeyType | null,
): { key: string; type: PixKeyType } | null {
  const value = raw.trim();
  if (!value) return null;

  const tryType = (candidate: PixKeyType) => {
    switch (candidate) {
      case "email":
        return emailPattern.test(value) && value.length <= 77
          ? value.toLowerCase()
          : null;
      case "random":
        return uuidPattern.test(value) ? value.toLowerCase() : null;
      case "cpf":
        return isValidCPF(value) ? onlyDigits(value) : null;
      case "cnpj":
        return isValidCNPJ(value) ? onlyDigits(value) : null;
      case "phone":
        return normalizePhone(value);
    }
  };

  if (type) {
    const key = tryType(type);
    return key ? { key, type } : null;
  }
  const order: PixKeyType[] = value.includes("@")
    ? ["email"]
    : uuidPattern.test(value)
      ? ["random"]
      : value.trim().startsWith("+")
        ? ["phone"]
        : ["cpf", "cnpj", "phone"];
  for (const candidate of order) {
    const key = tryType(candidate);
    if (key) return { key, type: candidate };
  }
  return null;
}

/** Mostra a chave sem expor tudo: CPF e celular parcialmente ocultos. */
export function maskPixKey(key: string, type: PixKeyType): string {
  if (type === "cpf") return `***.${key.slice(3, 6)}.${key.slice(6, 9)}-**`;
  if (type === "phone") return `${key.slice(0, 5)} *****-${key.slice(-4)}`;
  return key;
}

function field(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** Remove acentos e o que não for ASCII imprimível (o BR Code não aceita). */
function ascii(value: string, max: number) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** CRC16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), como pede o BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Identificador da cobrança: até 25 letras e números. */
export function pixReference(seed: string): string {
  const clean = seed.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return clean ? clean.slice(0, 25) : "***";
}

export type PixPayloadInput = {
  key: string;
  merchantName: string;
  merchantCity: string;
  /** Em reais. Sem valor, o pagador digita no app do banco. */
  amount?: number | null;
  reference?: string;
  description?: string;
};

export function buildPixPayload(input: PixPayloadInput): string {
  const name = ascii(input.merchantName, 25) || "Clinica";
  const city = ascii(input.merchantCity, 15).toUpperCase() || "BRASIL";

  const gui = field("00", "br.gov.bcb.pix");
  const key = field("01", input.key);
  let account = gui + key;
  const description = input.description ? ascii(input.description, 72) : "";
  // O campo 26 inteiro tem no máximo 99 caracteres: a descrição só entra se
  // couber junto com a chave.
  if (description && (account + field("02", description)).length <= 99) {
    account += field("02", description);
  }

  const amount =
    typeof input.amount === "number" && Number.isFinite(input.amount)
      ? input.amount
      : null;
  if (amount !== null && (amount <= 0 || amount > 9_999_999_999.99)) {
    throw new Error("Valor do Pix fora do permitido.");
  }

  const payload = [
    field("00", "01"),
    field("26", account),
    field("52", "0000"),
    field("53", "986"),
    amount !== null ? field("54", amount.toFixed(2)) : "",
    field("58", "BR"),
    field("59", name),
    field("60", city),
    field("62", field("05", pixReference(input.reference ?? ""))),
    "6304",
  ].join("");
  return payload + crc16(payload);
}
