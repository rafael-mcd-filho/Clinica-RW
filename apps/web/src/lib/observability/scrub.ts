/**
 * Raio-X EN5: tira dado pessoal do que vai para alerta e monitoramento.
 * Prontuário é dado sensível (LGPD, art. 11): erro reportado leva o que
 * aconteceu e onde, nunca nome, contato, documento ou texto clínico.
 */

const sensitiveKey =
  /(name|nome|email|e_mail|phone|telefone|whatsapp|cpf|cnpj|rg|birth|nascimento|address|endereco|body|text|texto|content|conteudo|note|nota|password|senha|token|secret|segredo|authorization|cookie|key)/i;

const replacements: Array<[RegExp, string]> = [
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]"],
  [/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, "$1 [token]"],
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]"],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[cpf]"],
  [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "[cnpj]"],
  [/(\+55\s?)?\(\d{2}\)\s?9?\d{4}-?\d{4}\b/g, "[telefone]"],
  [/\b\d{2}\s9?\d{4}-\d{4}\b/g, "[telefone]"],
  // Sem formatação não dá para saber se é CPF, CNPJ ou telefone.
  [/\+?\b\d{8,}\b/g, "[número]"],
];

export function scrubText(value: string, maxLength = 500) {
  let result = value;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result.length > maxLength ? `${result.slice(0, maxLength)}…` : result;
}

export type SafeContext = Record<string, string | number | boolean | null>;

export function scrubContext(
  context: Record<string, unknown> | undefined,
): SafeContext {
  const safe: SafeContext = {};
  for (const [key, value] of Object.entries(context ?? {})) {
    if (value === undefined) continue;
    if (sensitiveKey.test(key)) {
      safe[key] = "[removido]";
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    } else if (value === null) {
      safe[key] = null;
    } else {
      safe[key] = scrubText(String(value), 300);
    }
  }
  return safe;
}
