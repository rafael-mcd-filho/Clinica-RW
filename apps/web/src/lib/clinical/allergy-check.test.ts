import { describe, expect, it } from "vitest";
import { allergyTerms, findAllergyMentions } from "./allergy-check";

describe("allergy-check", () => {
  it("separa os termos e ignora negativas", () => {
    expect(allergyTerms("Sulfa, dipirona sódica; Látex e penicilina")).toEqual([
      "Sulfa",
      "dipirona sódica",
      "Látex",
      "penicilina",
    ]);
    expect(allergyTerms("Nega alergias")).toEqual([]);
    expect(allergyTerms("Não informado")).toEqual([]);
    expect(allergyTerms(null)).toEqual([]);
  });

  it("acha a alergia citada na prescrição sem depender de acento", () => {
    expect(
      findAllergyMentions(
        "1. Sulfametoxazol + trimetoprima 800/160 mg — 12/12 h",
        "Sulfa",
      ),
    ).toEqual(["Sulfa"]);
    expect(
      findAllergyMentions("Dipirona 500 mg se dor", "dipirona sódica"),
    ).toEqual(["dipirona sódica"]);
    expect(findAllergyMentions("LATEX nas luvas", "Látex")).toEqual(["Látex"]);
  });

  it("não acusa o que não está no texto", () => {
    expect(findAllergyMentions("Paracetamol 750 mg", "Sulfa; látex")).toEqual(
      [],
    );
    expect(findAllergyMentions("", "Sulfa")).toEqual([]);
    // "sulfa" dentro de outra palavra que não começa com ela não conta.
    expect(findAllergyMentions("Ressulfatação", "Sulfa")).toEqual([]);
  });
});
