import { beforeAll, describe, expect, it } from "vitest";
import {
  createDocumentShareToken,
  verifyDocumentShareToken,
} from "./document-share";

beforeAll(() => {
  process.env.DOCUMENT_LINK_SECRET = "segredo-de-teste";
});

describe("link de documento", () => {
  it("abre o documento certo dentro do prazo", () => {
    const { token } = createDocumentShareToken("doc-1", "org-1");
    expect(verifyDocumentShareToken(token)).toMatchObject({
      documentId: "doc-1",
      organizationId: "org-1",
    });
  });

  it("recusa token adulterado ou vencido", () => {
    const { token } = createDocumentShareToken("doc-1", "org-1");
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ d: "doc-2", o: "org-1", e: 9_999_999_999 }),
    ).toString("base64url");
    expect(verifyDocumentShareToken(`${forged}.${signature}`)).toBeNull();
    expect(verifyDocumentShareToken(`${payload}.x${signature}`)).toBeNull();
    expect(verifyDocumentShareToken("lixo")).toBeNull();
    const { token: expired } = createDocumentShareToken("doc-1", "org-1", -1);
    expect(verifyDocumentShareToken(expired)).toBeNull();
  });
});
