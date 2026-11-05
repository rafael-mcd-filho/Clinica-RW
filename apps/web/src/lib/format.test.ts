import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatCurrencyAbsolute,
  formatNumber,
  formatPercent,
  pluralize,
} from "./format";

const nbsp = / /g;

describe("formatação pt-BR", () => {
  it("moeda sem -R$ 0,00", () => {
    expect(formatCurrency(1234.5).replace(nbsp, " ")).toBe("R$ 1.234,50");
    expect(formatCurrency(-0).replace(nbsp, " ")).toBe("R$ 0,00");
    expect(formatCurrency(-0.001).replace(nbsp, " ")).toBe("R$ 0,00");
    expect(formatCurrency("80").replace(nbsp, " ")).toBe("R$ 80,00");
    expect(formatCurrency(null).replace(nbsp, " ")).toBe("R$ 0,00");
    expect(formatCurrencyAbsolute(-71091).replace(nbsp, " ")).toBe(
      "R$ 71.091,00",
    );
  });

  it("percentual com vírgula e sinal só quando pedido", () => {
    expect(formatPercent(-84.83)).toBe("-84,8%");
    expect(formatPercent(12.5, { signed: true })).toBe("+12,5%");
    expect(formatPercent(-0.04, { signed: true })).toBe("0%");
    expect(formatPercent(30)).toBe("30%");
    expect(formatPercent(7.25, { fractionDigits: 2 })).toBe("7,25%");
  });

  it("número e plural", () => {
    expect(formatNumber(1240)).toBe("1.240");
    expect(formatNumber(2.46, 1)).toBe("2,5");
    expect(pluralize(1, "bloqueio", "bloqueios")).toBe("1 bloqueio");
    expect(pluralize(0, "bloqueio", "bloqueios")).toBe("0 bloqueios");
    expect(pluralize(1240, "paciente", "pacientes")).toBe("1.240 pacientes");
  });
});
