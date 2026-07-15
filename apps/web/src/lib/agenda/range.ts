import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const defaultAgendaTimeZone = "America/Fortaleza";

export type AgendaView = "day" | "week" | "month";

export type AgendaSelection = {
  date: string;
  view: AgendaView;
};

export type AgendaVisibleRange = AgendaSelection & {
  startInclusive: Date;
  endExclusive: Date;
  localFrom: string;
  localTo: string;
};

type SearchParamsInput = Record<string, string | string[] | undefined> | null;

const agendaViews = new Set<AgendaView>(["day", "week", "month"]);

export function normalizeAgendaTimeZone(value?: string | null) {
  const candidate = value?.trim() || defaultAgendaTimeZone;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return defaultAgendaTimeZone;
  }
}

export function parseAgendaLocalDateTime(
  value: string,
  timeZoneInput?: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const timeZone = normalizeAgendaTimeZone(timeZoneInput);
  const parsed = fromZonedTime(`${value}:00`, timeZone);
  if (Number.isNaN(parsed.getTime())) return null;

  const roundTrip = formatInTimeZone(parsed, timeZone, "yyyy-MM-dd'T'HH:mm");
  return roundTrip === value ? parsed : null;
}

export function resolveAgendaSelection(
  input: SearchParamsInput,
  options: { now?: Date; timeZone?: string } = {},
): AgendaSelection {
  const now = options.now ?? new Date();
  const timeZone = normalizeAgendaTimeZone(options.timeZone);
  const requestedView = readParam(input, "view") as AgendaView | undefined;
  const requestedDate = readParam(input, "date");

  return {
    view:
      requestedView && agendaViews.has(requestedView) ? requestedView : "day",
    date: isDateKey(requestedDate)
      ? requestedDate
      : formatInTimeZone(now, timeZone, "yyyy-MM-dd"),
  };
}

export function resolveAgendaVisibleRange(
  selection: AgendaSelection,
  timeZoneInput?: string,
): AgendaVisibleRange {
  const timeZone = normalizeAgendaTimeZone(timeZoneInput);
  const selectedDate = isDateKey(selection.date)
    ? selection.date
    : formatInTimeZone(new Date(), timeZone, "yyyy-MM-dd");
  let localFrom = selectedDate;
  let endKey: string;

  if (selection.view === "week") {
    localFrom = startOfCalendarWeek(selectedDate);
    endKey = addCalendarDays(localFrom, 7);
  } else if (selection.view === "month") {
    localFrom = `${selectedDate.slice(0, 7)}-01`;
    endKey = addCalendarMonths(localFrom, 1);
  } else {
    endKey = addCalendarDays(localFrom, 1);
  }

  return {
    date: selectedDate,
    view: selection.view,
    localFrom,
    localTo: addCalendarDays(endKey, -1),
    startInclusive: fromZonedTime(`${localFrom}T00:00:00`, timeZone),
    endExclusive: fromZonedTime(`${endKey}T00:00:00`, timeZone),
  };
}

export function addAgendaPeriod(
  date: string,
  view: AgendaView,
  direction: -1 | 1,
) {
  if (view === "day") return addCalendarDays(date, direction);
  if (view === "week") return addCalendarDays(date, direction * 7);
  return addCalendarMonths(date, direction);
}

export function buildAgendaReturnTo(date: string, view: AgendaView) {
  if (!isDateKey(date) || !agendaViews.has(view)) return "/agenda";
  const params = new URLSearchParams({ date, view });
  return `/agenda?${params.toString()}`;
}

export function safeAgendaReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const internalOrigin = "https://agenda.local";
    const parsed = new URL(value, internalOrigin);
    const date = parsed.searchParams.get("date");
    const view = parsed.searchParams.get("view") as AgendaView | null;

    if (
      parsed.origin !== internalOrigin ||
      parsed.pathname !== "/agenda" ||
      parsed.hash ||
      !date ||
      !isDateKey(date) ||
      !view ||
      !agendaViews.has(view)
    ) {
      return null;
    }

    return buildAgendaReturnTo(date, view);
  } catch {
    return null;
  }
}

export function buildAgendaEncounterHref(
  encounterId: string,
  returnTo: unknown,
) {
  const params = new URLSearchParams({
    from: "agenda",
    return_to: safeAgendaReturnTo(returnTo) ?? "/agenda",
  });
  return `/prontuario/${encodeURIComponent(encounterId)}?${params.toString()}`;
}

export function isDateKey(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function startOfCalendarWeek(date: string) {
  const parsed = calendarDate(date);
  const weekday = parsed.getUTCDay();
  return addCalendarDays(date, weekday === 0 ? -6 : 1 - weekday);
}

function addCalendarDays(date: string, days: number) {
  const parsed = calendarDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return calendarKey(parsed);
}

function addCalendarMonths(date: string, months: number) {
  const parsed = calendarDate(date);
  const originalDay = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0),
  ).getUTCDate();
  parsed.setUTCDate(Math.min(originalDay, lastDay));
  return calendarKey(parsed);
}

function calendarDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function calendarKey(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function readParam(input: SearchParamsInput, key: string) {
  const value = input?.[key];
  return Array.isArray(value) ? value[0] : value;
}
