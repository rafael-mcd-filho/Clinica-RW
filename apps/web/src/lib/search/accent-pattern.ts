/**
 * Busca de nomes sem depender de acento nem de maiúscula, direto no
 * PostgREST (`imatch`, regex sem diferenciar maiúsculas): "joao" vira
 * `j[oóòôõö][aáàâãä][oóòôõö]` e acha "João". Antes a busca usava `ilike` e
 * "Joao" não encontrava "João" — e abrir o paciente errado é um erro clássico.
 */
const accentClasses: Record<string, string> = {
  a: "[aáàâãä]",
  e: "[eéèêë]",
  i: "[iíìîï]",
  o: "[oóòôõö]",
  u: "[uúùûü]",
  c: "[cç]",
  n: "[nñ]",
};

export function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Padrão regex que casa a busca com ou sem acentos. Só letras, dígitos,
    espaço, ponto, hífen e apóstrofo passam; o resto é descartado. */
export function accentInsensitivePattern(query: string) {
  const cleaned = stripAccents(query)
    .replace(/[^a-z0-9 .'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...cleaned]
    .map((char) => {
      if (accentClasses[char]) return accentClasses[char];
      if (char === ".") return "\\.";
      return char;
    })
    .join("");
}

/** Filtro `or` do PostgREST para nome civil e social. O valor vai entre
    aspas porque leva colchetes. */
export function accentInsensitiveNameFilters(
  query: string,
  columns: string[] = ["full_name", "social_name"],
) {
  const pattern = accentInsensitivePattern(query);
  if (!pattern) return [];
  return columns.map((column) => `${column}.imatch."${pattern}"`);
}
