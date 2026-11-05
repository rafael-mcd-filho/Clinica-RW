import { describe, expect, it } from "vitest";
import { secretsMatch } from "./secrets";

describe("secretsMatch", () => {
  it("aceita só o segredo igual", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
    expect(secretsMatch("abc124", "abc123")).toBe(false);
    expect(secretsMatch("abc", "abc123")).toBe(false);
  });

  it("recusa quando falta um dos lados", () => {
    expect(secretsMatch("", "abc")).toBe(false);
    expect(secretsMatch("abc", "")).toBe(false);
    expect(secretsMatch(null, undefined)).toBe(false);
  });
});
