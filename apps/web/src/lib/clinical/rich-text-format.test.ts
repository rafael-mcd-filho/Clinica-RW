import { describe, expect, it } from "vitest";
import {
  richTextToHtml,
  serializeRichText,
  stripRichTextMarkers,
  type RichTextNode,
} from "./rich-text-format";

function paragraph(...content: RichTextNode[]): RichTextNode {
  return { type: "paragraph", content };
}

function text(value: string, ...marks: string[]): RichTextNode {
  return {
    type: "text",
    text: value,
    marks: marks.map((type) => ({ type })),
  };
}

function listItem(value: string): RichTextNode {
  return { type: "listItem", content: [paragraph(text(value))] };
}

describe("clinical rich text format", () => {
  it("keeps bold and italic when saving", () => {
    const document = {
      type: "doc",
      content: [
        paragraph(
          text("Dor "),
          text("intensa", "bold"),
          text(" há "),
          text("três dias", "italic"),
          text(" e "),
          text("febre", "bold", "italic"),
        ),
      ],
    };

    expect(serializeRichText(document)).toBe(
      "Dor **intensa** há *três dias* e ***febre***",
    );
  });

  it("writes lists one item per line", () => {
    const document = {
      type: "doc",
      content: [
        paragraph(text("Conduta:")),
        {
          type: "bulletList",
          content: [listItem("Hidratação"), listItem("Repouso")],
        },
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [listItem("Dipirona"), listItem("Retorno em 48h")],
        },
      ],
    };

    expect(serializeRichText(document)).toBe(
      "Conduta:\n\n- Hidratação\n- Repouso\n\n1. Dipirona\n2. Retorno em 48h",
    );
  });

  it("reads the saved format back into formatted HTML", () => {
    expect(
      richTextToHtml(
        "Dor **intensa** e *febre*\n\n- Hidratação\n- Repouso\n\n1. Dipirona",
      ),
    ).toBe(
      "<p>Dor <strong>intensa</strong> e <em>febre</em></p>" +
        "<ul><li><p>Hidratação</p></li><li><p>Repouso</p></li></ul>" +
        '<ol start="1"><li><p>Dipirona</p></li></ol>',
    );
    expect(richTextToHtml("***febre***")).toBe(
      "<p><strong><em>febre</em></strong></p>",
    );
  });

  it("opens older plain text as before and escapes HTML", () => {
    expect(richTextToHtml("Linha 1\nLinha 2\n\n<b>nota</b>")).toBe(
      "<p>Linha 1<br>Linha 2</p><p>&lt;b&gt;nota&lt;/b&gt;</p>",
    );
  });

  it("strips markers for one-line summaries", () => {
    expect(stripRichTextMarkers("Dor **intensa** e *febre*\n- Repouso")).toBe(
      "Dor intensa e febre\n• Repouso",
    );
  });
});
