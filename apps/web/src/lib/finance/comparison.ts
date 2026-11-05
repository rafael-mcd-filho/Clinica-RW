/**
 * Raio-X V16: com quem o período do financeiro se compara. O mês em
 * andamento se compara com o mesmo trecho do mês anterior (dia 1 ao dia de
 * hoje), e não com o mês anterior inteiro — o que fazia "Entradas" aparecer
 * com -84,8% todo começo de mês.
 */

export type FinanceComparison = {
  from: string;
  to: string;
  /** Ex.: "vs. outubro até o dia 5", "vs. outubro", "vs. 01/10 a 15/10". */
  label: string;
};

function parse(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function key(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12));
}

const monthName = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  timeZone: "UTC",
});
const dayMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

export function financeComparisonPeriod(
  period: { from: string; to: string },
  today: string,
): FinanceComparison | null {
  if (today < period.from || period.to < period.from) return null;
  const from = parse(period.from);
  const to = parse(period.to);
  const effectiveTo = period.to < today ? to : parse(today);

  const isFullMonth =
    from.getUTCDate() === 1 &&
    from.getUTCFullYear() === to.getUTCFullYear() &&
    from.getUTCMonth() === to.getUTCMonth() &&
    key(to) === key(lastDayOfMonth(to.getUTCFullYear(), to.getUTCMonth()));

  if (isFullMonth) {
    const previousStart = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1, 12),
    );
    const previousLast = lastDayOfMonth(
      previousStart.getUTCFullYear(),
      previousStart.getUTCMonth(),
    );
    const elapsedDays = effectiveTo.getUTCDate();
    const candidate = addDays(previousStart, elapsedDays - 1);
    const previousTo = candidate > previousLast ? previousLast : candidate;
    const name = monthName.format(previousStart);
    return {
      from: key(previousStart),
      to: key(previousTo),
      label:
        key(effectiveTo) === period.to
          ? `vs. ${name}`
          : `vs. ${name} até o dia ${elapsedDays}`,
    };
  }

  const days =
    Math.round((effectiveTo.getTime() - from.getTime()) / 86_400_000) + 1;
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(days - 1));
  return {
    from: key(previousFrom),
    to: key(previousTo),
    label: `vs. ${dayMonth.format(previousFrom)} a ${dayMonth.format(previousTo)}`,
  };
}
