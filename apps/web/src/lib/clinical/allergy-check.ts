/**
 * Confere se um texto clínico (uma prescrição, por exemplo) cita algo que
 * consta nas alergias do paciente. É uma rede de segurança, não um sistema de
 * interações: compara palavras sem acento e sem diferenciar maiúsculas, para
 * "sulfa" pegar "Sulfametoxazol" e "dipirona sódica" pegar "Dipirona 500 mg".
 */

const negativeStatements = [
  "nega",
  "nenhum",
  "nenhuma",
  "nao possui",
  "nao tem",
  "sem alergia",
  "desconhece",
  "nao informado",
];

export function normalizeClinicalText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Termos de alergia de um texto livre ("Sulfa, dipirona; látex"). */
export function allergyTerms(allergies: string | null | undefined) {
  if (!allergies) return [];
  return allergies
    .split(/[,;\n/]|\s+e\s+/i)
    .map((term) => term.replace(/^[-•*\s]+/, "").trim())
    .filter((term) => {
      const normalized = normalizeClinicalText(term);
      return (
        normalized.length >= 3 &&
        !negativeStatements.some((statement) => normalized.includes(statement))
      );
    });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Termos das alergias citados no texto, na grafia em que foram cadastrados. */
export function findAllergyMentions(
  text: string,
  allergies: string | null | undefined,
) {
  const normalizedText = normalizeClinicalText(text);
  if (!normalizedText.trim()) return [];
  const mentions: string[] = [];
  for (const term of allergyTerms(allergies)) {
    const normalizedTerm = normalizeClinicalText(term);
    // A palavra principal do termo ("dipirona" em "dipirona sódica") basta,
    // desde que não seja curta demais para casar por acaso.
    const keyword = normalizedTerm
      .split(/\s+/)
      .find((word) => word.length >= 4);
    const candidates = [normalizedTerm, keyword].filter(
      (candidate): candidate is string => Boolean(candidate),
    );
    const found = candidates.some((candidate) =>
      new RegExp(`(^|[^a-z0-9])${escapeRegExp(candidate)}`).test(
        normalizedText,
      ),
    );
    if (found && !mentions.includes(term)) mentions.push(term);
  }
  return mentions;
}
