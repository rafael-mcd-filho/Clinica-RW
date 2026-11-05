/**
 * Raio-X A13: feriados nacionais na agenda. Os fixos e os móveis (pela data
 * da Páscoa), mais os pontos facultativos de Carnaval e Corpus Christi, que
 * muitas clínicas também fecham. Feriado estadual e municipal a clínica
 * bloqueia na própria agenda.
 */

export type Holiday = {
  date: string;
  name: string;
  /** Feriado nacional ou ponto facultativo (a clínica decide se abre). */
  kind: "holiday" | "optional";
};

/** Domingo de Páscoa (algoritmo anônimo gregoriano, Meeus/Jones/Butcher). */
export function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function key(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shift(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

const fixedHolidays: Array<[string, string]> = [
  ["01-01", "Confraternização Universal"],
  ["04-21", "Tiradentes"],
  ["05-01", "Dia do Trabalho"],
  ["09-07", "Independência do Brasil"],
  ["10-12", "Nossa Senhora Aparecida"],
  ["11-02", "Finados"],
  ["11-15", "Proclamação da República"],
  ["12-25", "Natal"],
];

const cache = new Map<number, Holiday[]>();

export function brazilianHolidays(year: number): Holiday[] {
  const cached = cache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const holidays: Holiday[] = [
    ...fixedHolidays.map(([monthDay, name]) => ({
      date: `${year}-${monthDay}`,
      name,
      kind: "holiday" as const,
    })),
    // Feriado nacional desde 2024 (Lei 14.759/2023).
    ...(year >= 2024
      ? [
          {
            date: `${year}-11-20`,
            name: "Consciência Negra",
            kind: "holiday" as const,
          },
        ]
      : []),
    { date: key(shift(easter, -48)), name: "Carnaval", kind: "optional" },
    { date: key(shift(easter, -47)), name: "Carnaval", kind: "optional" },
    {
      date: key(shift(easter, -46)),
      name: "Quarta-feira de Cinzas (até 14h)",
      kind: "optional",
    },
    {
      date: key(shift(easter, -2)),
      name: "Sexta-feira Santa",
      kind: "holiday",
    },
    { date: key(shift(easter, 60)), name: "Corpus Christi", kind: "optional" },
  ];
  holidays.sort((a, b) => a.date.localeCompare(b.date));
  cache.set(year, holidays);
  return holidays;
}

/** Feriado de uma data (yyyy-mm-dd), se houver. */
export function holidayOn(dateKey: string): Holiday | null {
  const year = Number(dateKey.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return brazilianHolidays(year).find((item) => item.date === dateKey) ?? null;
}
