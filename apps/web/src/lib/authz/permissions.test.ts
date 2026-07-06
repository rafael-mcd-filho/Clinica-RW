import { describe, expect, it } from "vitest";
import { hasPermission, resolveEffectivePermissions } from "./permissions";

describe("permissions", () => {
  it("keeps permissions inherited from profiles", () => {
    expect(hasPermission(["agenda.ver"], "agenda.ver")).toBe(true);
  });

  it("adds granted overrides", () => {
    const permissions = resolveEffectivePermissions(
      ["agenda.ver"],
      [{ code: "financeiro.ver_geral", granted: true }],
    );

    expect(permissions.has("financeiro.ver_geral")).toBe(true);
  });

  it("removes denied overrides", () => {
    const permissions = resolveEffectivePermissions(
      ["agenda.ver"],
      [{ code: "agenda.ver", granted: false }],
    );

    expect(permissions.has("agenda.ver")).toBe(false);
  });
});
