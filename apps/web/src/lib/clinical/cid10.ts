/**
 * Termo de busca de CID no mesmo formato de `cid10_codes.search_text`:
 * minúsculo, sem acentos e com espaços simples. Pontuação que não faz parte
 * de um código ou descrição vira espaço.
 */
export function normalizeCidQuery(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** "j00.0" / "J000" → "J00.0"; devolve null se não parecer um código CID. */
export function formatCidCode(value: string) {
  const compact = value.replace(/[\s.]/g, "").toUpperCase();
  if (!/^[A-Z]\d{2}\d?$/.test(compact)) return null;
  return compact.length === 4
    ? `${compact.slice(0, 3)}.${compact.slice(3)}`
    : compact;
}

export type Cid10SearchItem = {
  code: string;
  description: string;
  is_category: boolean;
};
