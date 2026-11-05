import { beforeAll, describe, expect, it } from "vitest";
import {
  createDocumentVerificationCode,
  documentVerificationUrl,
  verifyDocumentVerificationCode,
} from "./document-verification";

beforeAll(() => {
  process.env.DOCUMENT_LINK_SECRET = "segredo-de-teste";
});

const id = "3f2a9c1e-7b4d-4e8a-9f10-2b3c4d5e6f70";

describe("código de verificação de documento", () => {
  it("volta o mesmo documento", () => {
    const code = createDocumentVerificationCode(id);
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/);
    expect(verifyDocumentVerificationCode(code)).toBe(id);
  });

  it("recusa código alterado ou de outro documento", () => {
    const code = createDocumentVerificationCode(id);
    const other = createDocumentVerificationCode(
      "00000000-0000-4000-8000-000000000001",
    );
    const [otherId] = other.split(".");
    const [, sig] = code.split(".");
    expect(verifyDocumentVerificationCode(`${otherId}.${sig}`)).toBeNull();
    expect(verifyDocumentVerificationCode(`${code}x`)).toBeNull();
    expect(verifyDocumentVerificationCode("lixo")).toBeNull();
    expect(verifyDocumentVerificationCode("")).toBeNull();
  });

  it("monta a URL pública", () => {
    expect(documentVerificationUrl("https://app.exemplo.com/", id)).toMatch(
      /^https:\/\/app\.exemplo\.com\/validar\/[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/,
    );
  });
});
