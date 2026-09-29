/**
 * Medicamentos de uma prescrição emitida, para a ficha do paciente.
 *
 * O corpo da prescrição é texto livre: o modelo padrão numera os itens
 * ("1. Losartana 50 mg" + "Posologia: 1x ao dia"), mas há quem escreva uma
 * linha por remédio ("Dipirona 500 mg: tomar 1 comprimido se dor"). A leitura
 * aqui é tolerante e nunca inventa: o que não parece um medicamento fica de
 * fora, e sem nenhum item a ficha mostra o título do documento.
 */
export type PrescriptionItem = {
  name: string;
  /** Como tomar, sem a duração (que vem à parte). */
  posology: string | null;
  /** "30 dias", "Uso contínuo"... */
  duration: string | null;
  continuous: boolean;
};

const DOSE_PATTERN =
  /\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|g|ml|mL|UI|ui|%|gotas?|cp|comp(?:rimidos?)?|c[aá]ps(?:ulas?)?)\b/i;
const CONTINUOUS_PATTERN = /uso\s+cont[ií]nuo/i;
const DURATION_PATTERN =
  /(?:por|durante)\s+(?:at[eé]\s+)?(\d+)\s+(dias?|semanas?|meses|m[eê]s)/i;
// Linhas que não são item: cabeçalhos de via ("Uso oral"), o fecho com
// cidade e data e linhas de preencher (só sublinhados).
const HEADER_PATTERN =
  /^(?:uso\s+(?:oral|t[oó]pico|externo|interno|sublingual|nasal|oft[aá]lmico|retal|vaginal|injet[aá]vel|inalat[oó]rio)|via\s+\w+)\s*:?$/i;
const CLOSING_PATTERN = /\d{1,2}\/\d{1,2}\/\d{2,4}\.?$/;
const POSOLOGY_PREFIX =
  /^(?:posologia|modo\s+de\s+usar|como\s+usar|uso)\s*:\s*/i;
const INSTRUCTION_START =
  /^(?:tomar|usar|aplicar|ingerir|administrar|pingar|inalar|dissolver|mastigar|passar)\b/i;

function cleanFragment(value: string) {
  return (
    value
      // A quantidade a dispensar ("30 unidade(s)", "2 caixa(s)") não é nome.
      .replace(/\s*(?:\d+|_+)?\s*\b(?:unidade|caixa|frasco|ampola)\(s\)/gi, " ")
      .replace(/_{2,}/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "")
      .trim()
  );
}

function capitalize(value: string) {
  return value ? value[0].toLocaleUpperCase("pt-BR") + value.slice(1) : value;
}

function splitDuration(text: string | null) {
  if (!text) return { posology: null, duration: null, continuous: false };
  const continuous = CONTINUOUS_PATTERN.test(text);
  const match = text.match(DURATION_PATTERN);
  let posology = text;
  let duration: string | null = null;
  if (continuous) {
    duration = "Uso contínuo";
    posology = posology.replace(CONTINUOUS_PATTERN, " ");
  } else if (match) {
    duration = `${match[1]} ${match[2].toLocaleLowerCase("pt-BR")}`;
    posology = posology.replace(match[0], " ");
  }
  const cleaned = cleanFragment(posology.replace(/[.;]+\s*$/, ""));
  return {
    posology: cleaned ? capitalize(cleaned) : null,
    duration,
    continuous,
  };
}

function isNoise(line: string) {
  return (
    !line ||
    HEADER_PATTERN.test(line) ||
    CLOSING_PATTERN.test(line) ||
    !cleanFragment(line)
  );
}

function buildItem(name: string, instructions: string | null) {
  const cleanName = cleanFragment(name);
  if (!cleanName) return null;
  // "Uso contínuo" às vezes vem junto do nome ("Losartana 50 mg, uso contínuo").
  const nameContinuous = CONTINUOUS_PATTERN.test(cleanName);
  const parts = splitDuration(instructions);
  return {
    name: cleanFragment(cleanName.replace(CONTINUOUS_PATTERN, " ")),
    posology: parts.posology,
    duration: parts.duration ?? (nameContinuous ? "Uso contínuo" : null),
    continuous: parts.continuous || nameContinuous,
  } satisfies PrescriptionItem;
}

export function parsePrescriptionItems(body: string | null | undefined) {
  const lines = (body ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !isNoise(line));
  if (!lines.length) return [];

  const numbered = lines.some((line) => /^\d+\s*[.)-]\s+\S/.test(line));
  const items: PrescriptionItem[] = [];

  if (numbered) {
    let current: { name: string; instructions: string[] } | null = null;
    const flush = () => {
      if (!current) return;
      const item = buildItem(
        current.name,
        current.instructions.join(" ").trim() || null,
      );
      if (item) items.push(item);
    };
    for (const line of lines) {
      const itemMatch = line.match(/^\d+\s*[.)-]\s+(.+)$/);
      if (itemMatch) {
        flush();
        const [name, ...rest] = itemMatch[1].split(/:\s+/);
        current = { name, instructions: rest.length ? [rest.join(": ")] : [] };
      } else if (current) {
        current.instructions.push(line.replace(POSOLOGY_PREFIX, ""));
      }
    }
    flush();
    return items;
  }

  // Sem numeração: uma linha por medicamento, reconhecida pela dose.
  for (const line of lines) {
    if (!DOSE_PATTERN.test(line)) continue;
    const colon = line.indexOf(":");
    if (colon > 0) {
      const item = buildItem(line.slice(0, colon), line.slice(colon + 1));
      if (item) items.push(item);
      continue;
    }
    // "Losartana 50 mg tomar 1 cp ao dia": corta onde a instrução começa.
    const words = line.split(/\s+/);
    const start = words.findIndex(
      (word, index) => index > 0 && INSTRUCTION_START.test(word),
    );
    const item =
      start > 0
        ? buildItem(
            words.slice(0, start).join(" "),
            words.slice(start).join(" "),
          )
        : buildItem(line, null);
    if (item) items.push(item);
  }
  return items;
}

/** "1x ao dia · Uso contínuo": o que vai na segunda linha da ficha. */
export function describePrescriptionItem(item: PrescriptionItem) {
  return [item.posology, item.duration].filter(Boolean).join(" · ");
}
