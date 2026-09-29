// Formato do texto dos campos clínicos com formatação.
//
// O valor salvo é texto, que é o que o prontuário e os resumos mostram. A
// formatação vai em marcações simples que o editor lê de volta:
// **negrito**, *itálico*, "- item" e "1. item", com blocos separados por
// linha em branco. Texto puro salvo antes continua abrindo como parágrafos.

/** Nó do editor (formato JSON do Tiptap/ProseMirror), só o que usamos. */
export type RichTextNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: Array<{ type: string }>;
  text?: string;
};

/** Documento do editor → texto com marcações. */
export function serializeRichText(document: RichTextNode) {
  return (document.content ?? [])
    .map(serializeBlock)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function serializeBlock(node: RichTextNode): string {
  if (node.type === "bulletList") {
    return (node.content ?? [])
      .map((item) => `- ${serializeListItem(item)}`)
      .join("\n");
  }
  if (node.type === "orderedList") {
    const start = Number(node.attrs?.start ?? 1) || 1;
    return (node.content ?? [])
      .map((item, index) => `${start + index}. ${serializeListItem(item)}`)
      .join("\n");
  }
  return serializeInline(node.content);
}

// Sublistas viram parte do item: o formato tem um nível só.
function serializeListItem(item: RichTextNode): string {
  return (item.content ?? [])
    .map((child) =>
      child.type === "bulletList" || child.type === "orderedList"
        ? serializeBlock(child)
            .split("\n")
            .map((line) => line.replace(/^(-|\d+\.)\s+/, ""))
            .join("; ")
        : serializeInline(child.content),
    )
    .filter(Boolean)
    .join("; ");
}

function serializeInline(content: RichTextNode[] | undefined): string {
  return (content ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      const text = node.text ?? "";
      if (!text.trim()) return text;
      const marks = new Set((node.marks ?? []).map((mark) => mark.type));
      // O marcador fica rente ao texto: espaços das pontas ficam de fora.
      const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
      const lead = match?.[1] ?? "";
      const core = match?.[2] ?? text;
      const trail = match?.[3] ?? "";
      let wrapped = core;
      if (marks.has("italic")) wrapped = `*${wrapped}*`;
      if (marks.has("bold")) wrapped = `**${wrapped}**`;
      return `${lead}${wrapped}${trail}`;
    })
    .join("");
}

/** Texto com marcações (ou texto puro antigo) → HTML para o editor. */
export function richTextToHtml(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
        return `<ul>${lines
          .map(
            (line) =>
              `<li><p>${formatInline(line.replace(/^\s*[-•]\s+/, ""))}</p></li>`,
          )
          .join("")}</ul>`;
      }
      if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
        const start = Number.parseInt(lines[0], 10) || 1;
        return `<ol start="${start}">${lines
          .map(
            (line) =>
              `<li><p>${formatInline(line.replace(/^\s*\d+[.)]\s+/, ""))}</p></li>`,
          )
          .join("")}</ol>`;
      }
      return `<p>${lines.map(formatInline).join("<br>")}</p>`;
    })
    .join("");
}

function formatInline(text: string) {
  return escapeHtml(text)
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, "<em>$1</em>")
    .replace(/\*(?=[^\s*])([^\s*])\*/g, "<em>$1</em>");
}

/** Texto com marcações → texto limpo, para resumos de uma linha. */
export function stripRichTextMarkers(value: string) {
  return value
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "$1")
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1")
    .replace(/\*(?=[^\s*])([^*]*?[^\s*]|[^\s*])\*/g, "$1")
    .replace(/^\s*[-•]\s+/gm, "• ");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
