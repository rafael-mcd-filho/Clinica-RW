import { describe, expect, it } from "vitest";
import { financeComparisonPeriod } from "./comparison";

describe("financeComparisonPeriod", () => {
  it("mês em andamento compara com o mesmo trecho do mês anterior", () => {
    expect(
      financeComparisonPeriod(
        { from: "2026-11-01", to: "2026-11-30" },
        "2026-11-05",
      ),
    ).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
      label: "vs. outubro até o dia 5",
    });
  });

  it("mês fechado compara com o mês anterior inteiro", () => {
    expect(
      financeComparisonPeriod(
        { from: "2026-10-01", to: "2026-10-31" },
        "2026-11-05",
      ),
    ).toEqual({ from: "2026-09-01", to: "2026-09-30", label: "vs. setembro" });
  });

  it("dia 31 cai no último dia de um mês mais curto", () => {
    expect(
      financeComparisonPeriod(
        { from: "2026-03-01", to: "2026-03-31" },
        "2026-03-31",
      ),
    ).toEqual({ from: "2026-02-01", to: "2026-02-28", label: "vs. fevereiro" });
  });

  it("janeiro compara com dezembro do ano anterior", () => {
    expect(
      financeComparisonPeriod(
        { from: "2027-01-01", to: "2027-01-31" },
        "2027-01-10",
      )?.from,
    ).toBe("2026-12-01");
  });

  it("período livre compara com os dias imediatamente anteriores", () => {
    expect(
      financeComparisonPeriod(
        { from: "2026-10-10", to: "2026-10-19" },
        "2026-11-05",
      ),
    ).toEqual({
      from: "2026-09-30",
      to: "2026-10-09",
      label: "vs. 30/09 a 09/10",
    });
  });

  it("período futuro não tem comparação", () => {
    expect(
      financeComparisonPeriod(
        { from: "2026-12-01", to: "2026-12-31" },
        "2026-11-05",
      ),
    ).toBeNull();
  });
});
