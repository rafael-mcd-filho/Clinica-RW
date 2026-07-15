import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const defaultDashboardTimeZone = "America/Fortaleza";
export const maxCustomPeriodDays = 366;

export type DashboardView = "operational" | "commercial";

export type DashboardPeriodPreset =
  | "today"
  | "yesterday"
  | "current_week"
  | "previous_week"
  | "current_month"
  | "previous_month"
  | "custom";

export type DashboardFilterSelection = {
  view: DashboardView;
  period: DashboardPeriodPreset;
  from?: string;
  to?: string;
};

export type DashboardRange = {
  startInclusive: Date;
  endExclusive: Date;
  localFrom: string;
  localTo: string;
  isPartial: boolean;
};

export type ResolvedDashboardPeriod = {
  selection: DashboardFilterSelection;
  timeZone: string;
  now: Date;
  current: DashboardRange;
  comparison: DashboardRange;
};

type SearchParamsInput = Record<string, string | string[] | undefined> | null;

const dashboardViews = new Set<DashboardView>(["operational", "commercial"]);

const dashboardPeriods = new Set<DashboardPeriodPreset>([
  "today",
  "yesterday",
  "current_week",
  "previous_week",
  "current_month",
  "previous_month",
  "custom",
]);

export function resolveDashboardFilterSelection(
  input: SearchParamsInput,
  options: { now?: Date; timeZone?: string } = {},
): DashboardFilterSelection {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? defaultDashboardTimeZone;
  const requestedView = readParam(input, "view") as DashboardView | undefined;
  const requestedPeriod = readParam(input, "period") as
    | DashboardPeriodPreset
    | undefined;
  const view =
    requestedView && dashboardViews.has(requestedView)
      ? requestedView
      : "operational";
  const period =
    requestedPeriod && dashboardPeriods.has(requestedPeriod)
      ? requestedPeriod
      : "current_month";

  if (period !== "custom") {
    return { view, period };
  }

  const from = readParam(input, "from");
  const to = readParam(input, "to");
  if (!isValidCustomRange(from, to, now, timeZone)) {
    return { view, period: "current_month" };
  }

  return { view, period, from, to };
}

export function resolveDashboardPeriod(
  selection: DashboardFilterSelection,
  options: { now?: Date; timeZone?: string } = {},
): ResolvedDashboardPeriod {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? defaultDashboardTimeZone;
  const wallNow = toZonedTime(now, timeZone);
  const todayStart = startOfWallDay(wallNow);

  let currentStart: Date;
  let currentEnd: Date;
  let comparisonStart: Date;
  let comparisonEnd: Date;
  let currentFrom: Date;
  let currentTo: Date;
  let comparisonFrom: Date;
  let comparisonTo: Date;
  let isPartial = false;

  switch (selection.period) {
    case "today": {
      currentStart = todayStart;
      currentEnd = wallNow;
      comparisonStart = addWallDays(todayStart, -1);
      comparisonEnd = addWallDays(wallNow, -1);
      currentFrom = todayStart;
      currentTo = todayStart;
      comparisonFrom = comparisonStart;
      comparisonTo = comparisonStart;
      isPartial = true;
      break;
    }
    case "yesterday": {
      currentStart = addWallDays(todayStart, -1);
      currentEnd = todayStart;
      comparisonStart = addWallDays(todayStart, -2);
      comparisonEnd = currentStart;
      currentFrom = currentStart;
      currentTo = currentStart;
      comparisonFrom = comparisonStart;
      comparisonTo = comparisonStart;
      break;
    }
    case "current_week": {
      currentStart = startOfWallWeek(wallNow);
      currentEnd = wallNow;
      comparisonStart = addWallDays(currentStart, -7);
      comparisonEnd = addWallDays(wallNow, -7);
      currentFrom = currentStart;
      currentTo = todayStart;
      comparisonFrom = comparisonStart;
      comparisonTo = startOfWallDay(comparisonEnd);
      isPartial = true;
      break;
    }
    case "previous_week": {
      currentEnd = startOfWallWeek(wallNow);
      currentStart = addWallDays(currentEnd, -7);
      comparisonEnd = currentStart;
      comparisonStart = addWallDays(comparisonEnd, -7);
      currentFrom = currentStart;
      currentTo = addWallDays(currentEnd, -1);
      comparisonFrom = comparisonStart;
      comparisonTo = addWallDays(comparisonEnd, -1);
      break;
    }
    case "previous_month": {
      currentEnd = startOfWallMonth(wallNow);
      currentStart = addWallMonths(currentEnd, -1);
      comparisonEnd = currentStart;
      comparisonStart = addWallMonths(comparisonEnd, -1);
      currentFrom = currentStart;
      currentTo = addWallDays(currentEnd, -1);
      comparisonFrom = comparisonStart;
      comparisonTo = addWallDays(comparisonEnd, -1);
      break;
    }
    case "custom": {
      const customFrom = parseLocalDate(selection.from ?? "");
      const customTo = parseLocalDate(selection.to ?? "");
      if (
        !customFrom ||
        !customTo ||
        !isValidCustomRange(selection.from, selection.to, now, timeZone)
      ) {
        return resolveDashboardPeriod(
          { view: selection.view, period: "current_month" },
          options,
        );
      }

      const dayCount = calendarDayDifference(customFrom, customTo) + 1;
      const endsToday = localDateKey(customTo) === localDateKey(todayStart);
      currentStart = startOfWallDay(customFrom);
      currentEnd = endsToday ? wallNow : addWallDays(customTo, 1);
      comparisonStart = addWallDays(currentStart, -dayCount);
      comparisonEnd = endsToday
        ? addWallDays(wallNow, -dayCount)
        : currentStart;
      currentFrom = customFrom;
      currentTo = customTo;
      comparisonFrom = addWallDays(customFrom, -dayCount);
      comparisonTo = addWallDays(customTo, -dayCount);
      isPartial = endsToday;
      break;
    }
    case "current_month":
    default: {
      currentStart = startOfWallMonth(wallNow);
      currentEnd = wallNow;
      comparisonStart = addWallMonths(currentStart, -1);
      comparisonEnd = sameWallTimeInMonth(wallNow, -1);
      currentFrom = currentStart;
      currentTo = todayStart;
      comparisonFrom = comparisonStart;
      comparisonTo = startOfWallDay(comparisonEnd);
      isPartial = true;
      break;
    }
  }

  return {
    selection,
    timeZone,
    now,
    current: toRange(
      currentStart,
      currentEnd,
      currentFrom,
      currentTo,
      isPartial,
      timeZone,
      isPartial ? now : undefined,
    ),
    comparison: toRange(
      comparisonStart,
      comparisonEnd,
      comparisonFrom,
      comparisonTo,
      isPartial,
      timeZone,
    ),
  };
}

export function dashboardDateField(view: DashboardView) {
  return view === "commercial" ? "created_at" : "start_at";
}

export function containsInstant(range: DashboardRange, value: Date | string) {
  const instant = value instanceof Date ? value : new Date(value);
  return instant >= range.startInclusive && instant < range.endExclusive;
}

export function buildDashboardPeriodPoints(
  period: DashboardRange,
  dates: string[],
  timeZone: string,
) {
  const counts = new Map<string, number>();
  for (const date of dates) {
    const key = formatInTimeZone(date, timeZone, "yyyy-MM-dd");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points = [];
  let cursor = period.localFrom;

  while (cursor <= period.localTo) {
    points.push({
      label: formatShortDateKey(cursor),
      value: counts.get(cursor) ?? 0,
    });
    cursor = addDateKeyDays(cursor, 1);
  }

  return points;
}

export function formatDashboardRange(
  range: DashboardRange,
  partialLabel = "até agora",
) {
  const from = formatDateKey(range.localFrom);
  const to = formatDateKey(range.localTo);
  const dates = range.localFrom === range.localTo ? from : `${from} – ${to}`;
  return range.isPartial ? `${dates} ${partialLabel}` : dates;
}

export function isValidTimeZone(value: string | null | undefined) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isValidCustomRange(
  fromValue: string | undefined,
  toValue: string | undefined,
  now: Date,
  timeZone: string,
) {
  const from = parseLocalDate(fromValue ?? "");
  const to = parseLocalDate(toValue ?? "");
  if (!from || !to || from > to) return false;

  const today = startOfWallDay(toZonedTime(now, timeZone));
  const dayCount = calendarDayDifference(from, to) + 1;
  return to <= today && dayCount <= maxCustomPeriodDays;
}

function toRange(
  wallStart: Date,
  wallEnd: Date,
  localFrom: Date,
  localTo: Date,
  isPartial: boolean,
  timeZone: string,
  exactEnd?: Date,
): DashboardRange {
  return {
    startInclusive: fromZonedTime(wallStart, timeZone),
    endExclusive: exactEnd ?? fromZonedTime(wallEnd, timeZone),
    localFrom: localDateKey(localFrom),
    localTo: localDateKey(localTo),
    isPartial,
  };
}

function readParam(input: SearchParamsInput, key: string) {
  const value = input?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function parseLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function startOfWallDay(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    0,
    0,
    0,
    0,
  );
}

function startOfWallWeek(value: Date) {
  return addWallDays(startOfWallDay(value), -value.getDay());
}

function startOfWallMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
}

function addWallDays(value: Date, amount: number) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate() + amount,
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    value.getMilliseconds(),
  );
}

function addWallMonths(value: Date, amount: number) {
  return new Date(
    value.getFullYear(),
    value.getMonth() + amount,
    1,
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    value.getMilliseconds(),
  );
}

function sameWallTimeInMonth(value: Date, monthOffset: number) {
  const targetMonthStart = new Date(
    value.getFullYear(),
    value.getMonth() + monthOffset,
    1,
    0,
    0,
    0,
    0,
  );
  const lastDay = new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth() + 1,
    0,
  ).getDate();

  return new Date(
    targetMonthStart.getFullYear(),
    targetMonthStart.getMonth(),
    Math.min(value.getDate(), lastDay),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
    value.getMilliseconds(),
  );
}

function calendarDayDifference(from: Date, to: Date) {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function localDateKey(value: Date) {
  return [
    String(value.getFullYear()).padStart(4, "0"),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDateKey(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function addDateKeyDays(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return date.toISOString().slice(0, 10);
}

function formatShortDateKey(value: string) {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}
