/** Brazilian document and phone helpers shared by forms and server actions. */

import {
  formatToCNPJ,
  formatToCPF,
  formatToPhone,
  isCNPJ,
  isCPF,
  isPhone,
} from "brazilian-values";

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Validates a CPF by length, repeated-digit guard and both check digits. */
export function isValidCPF(value: string): boolean {
  return isCPF(value);
}

/** Formats up to 11 digits as 000.000.000-00 (partial input allowed). */
export function formatCPF(value: string): string {
  return formatToCPF(onlyDigits(value).slice(0, 11));
}

/** Validates a CNPJ by length, repeated-digit guard and both check digits. */
export function isValidCNPJ(value: string): boolean {
  return isCNPJ(value);
}

/** Formats up to 14 digits as 00.000.000/0000-00 (partial input allowed). */
export function formatCNPJ(value: string): string {
  return formatToCNPJ(onlyDigits(value).slice(0, 14));
}

/** Formats up to 11 digits as (00) 0000-0000 or (00) 00000-0000. */
export function formatPhoneBR(value: string): string {
  return formatToPhone(onlyDigits(value).slice(0, 11));
}

/** Accepts Brazilian landline (10) or mobile (11) digit counts. */
export function isValidPhoneBR(value: string): boolean {
  return isPhone(value);
}
