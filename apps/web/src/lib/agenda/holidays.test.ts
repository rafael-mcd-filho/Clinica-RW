import { describe, expect, it } from "vitest";
import { brazilianHolidays, easterSunday, holidayOn } from "./holidays";

describe("feriados", () => {
  it("calcula a Páscoa", () => {
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(easterSunday(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
    expect(easterSunday(2025).toISOString().slice(0, 10)).toBe("2025-04-20");
  });

  it("monta os móveis de 2026 a partir da Páscoa", () => {
    const byName = Object.fromEntries(
      brazilianHolidays(2026).map((item) => [item.name + item.date, item]),
    );
    expect(byName["Carnaval2026-02-16"].kind).toBe("optional");
    expect(byName["Carnaval2026-02-17"].kind).toBe("optional");
    expect(byName["Sexta-feira Santa2026-04-03"].kind).toBe("holiday");
    expect(byName["Corpus Christi2026-06-04"].kind).toBe("optional");
  });

  it("encontra o feriado de uma data", () => {
    expect(holidayOn("2026-11-02")?.name).toBe("Finados");
    expect(holidayOn("2026-11-20")?.name).toBe("Consciência Negra");
    expect(holidayOn("2023-11-20")).toBeNull();
    expect(holidayOn("2026-11-05")).toBeNull();
  });
});
