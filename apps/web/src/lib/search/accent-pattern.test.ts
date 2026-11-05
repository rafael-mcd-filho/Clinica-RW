import { describe, expect, it } from "vitest";
import {
  accentInsensitiveNameFilters,
  accentInsensitivePattern,
} from "./accent-pattern";

function matches(pattern: string, value: string) {
  return new RegExp(pattern, "i").test(value);
}

describe("accentInsensitivePattern", () => {
  it("acha o nome com ou sem acento", () => {
    const pattern = accentInsensitivePattern("joao");
    expect(matches(pattern, "João da Silva")).toBe(true);
    expect(matches(pattern, "JOAO")).toBe(true);
    expect(
      matches(accentInsensitivePattern("conceição"), "Maria Conceicao"),
    ).toBe(true);
    expect(matches(accentInsensitivePattern("ines"), "Inês")).toBe(true);
  });

  it("não deixa passar caracteres de regex nem de filtro", () => {
    expect(accentInsensitivePattern('a(b)*"c,d')).toBe("[aáàâãä] b [cç] d");
    expect(accentInsensitivePattern("d.r")).toBe("d\\.r");
    expect(accentInsensitivePattern("   ")).toBe("");
  });

  it("monta o filtro do PostgREST entre aspas", () => {
    expect(accentInsensitiveNameFilters("ana")).toEqual([
      'full_name.imatch."[aáàâãä][nñ][aáàâãä]"',
      'social_name.imatch."[aáàâãä][nñ][aáàâãä]"',
    ]);
    expect(accentInsensitiveNameFilters("")).toEqual([]);
  });
});
