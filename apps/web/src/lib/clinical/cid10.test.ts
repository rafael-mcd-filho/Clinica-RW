import { describe, expect, it } from "vitest";
import { formatCidCode, normalizeCidQuery } from "./cid10";

describe("normalizeCidQuery", () => {
  it("deixa minúsculo, sem acento e com espaços simples", () => {
    expect(normalizeCidQuery("  Hipertensão   Essencial ")).toBe(
      "hipertensao essencial",
    );
  });

  it("mantém o ponto do código e troca pontuação solta por espaço", () => {
    expect(normalizeCidQuery("J00.0")).toBe("j00.0");
    expect(normalizeCidQuery("dengue, febre!")).toBe("dengue febre");
  });

  it("aceita vazio", () => {
    expect(normalizeCidQuery(null)).toBe("");
  });
});

describe("formatCidCode", () => {
  it("formata categoria e subcategoria", () => {
    expect(formatCidCode("j00")).toBe("J00");
    expect(formatCidCode("j000")).toBe("J00.0");
    expect(formatCidCode("F32.9")).toBe("F32.9");
  });

  it("recusa o que não é código", () => {
    expect(formatCidCode("dengue")).toBeNull();
    expect(formatCidCode("J0")).toBeNull();
    expect(formatCidCode("J00.00")).toBeNull();
  });
});
