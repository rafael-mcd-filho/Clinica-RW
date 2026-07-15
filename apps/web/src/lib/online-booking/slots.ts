import { addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type SlotSchedule = {
  id: string;
  enabled?: boolean;
  minNoticeHours?: number;
  maxDaysAhead?: number;
  /** Ausente mantém compatibilidade; uma lista vazia não publica serviços. */
  procedureIds?: string[];
};

export type SlotProcedure = {
  id: string;
  duration_minutes: number;
};

export type SlotAvailability = {
  schedule_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
};

export type SlotBusyRange = {
  schedule_id: string;
  start_at: string;
  end_at: string;
};

export type OnlineBookingSlot = {
  id: string;
  scheduleId: string;
  procedureId: string;
  startAt: string;
  dayKey: string;
  dateLabel: string;
  weekdayLabel: string;
  timeLabel: string;
  label: string;
};

type SlotCandidate = OnlineBookingSlot & {
  pairRank: number;
  startTimestamp: number;
};

export function buildOnlineBookingSlots({
  schedules,
  procedures,
  availability,
  busyRanges,
  timezone,
  from,
  until,
  maxDaysAhead,
  limit = 240,
}: {
  schedules: SlotSchedule[];
  procedures: SlotProcedure[];
  availability: SlotAvailability[];
  busyRanges: SlotBusyRange[];
  timezone: string;
  from: Date;
  until?: Date;
  maxDaysAhead: number;
  limit?: number;
}): OnlineBookingSlot[] {
  if (
    limit <= 0 ||
    maxDaysAhead < 0 ||
    Number.isNaN(from.getTime()) ||
    (until && (Number.isNaN(until.getTime()) || until <= from))
  ) {
    return [];
  }

  // Database ids are unique, but normalizing and sorting here keeps the result
  // stable even when a caller supplies the same records in a different order.
  const activeSchedules = uniqueById(schedules)
    .filter((schedule) => schedule.enabled !== false)
    .sort(compareById);
  const activeProcedures = uniqueById(procedures)
    .filter(
      (procedure) =>
        Number.isFinite(procedure.duration_minutes) &&
        procedure.duration_minutes > 0,
    )
    .sort(compareById);

  if (!activeSchedules.length || !activeProcedures.length) return [];

  const activeScheduleIds = new Set(
    activeSchedules.map((schedule) => schedule.id),
  );
  const availabilityBySchedule = new Map<string, SlotAvailability[]>();

  for (const row of availability) {
    if (!activeScheduleIds.has(row.schedule_id) || row.slot_minutes <= 0) {
      continue;
    }
    const existing = availabilityBySchedule.get(row.schedule_id) ?? [];
    existing.push(row);
    availabilityBySchedule.set(row.schedule_id, existing);
  }

  for (const rows of availabilityBySchedule.values()) {
    rows.sort(
      (left, right) =>
        left.weekday - right.weekday ||
        left.start_time.localeCompare(right.start_time) ||
        left.end_time.localeCompare(right.end_time) ||
        left.slot_minutes - right.slot_minutes,
    );
  }

  const busyBySchedule = new Map<string, SlotBusyRange[]>();
  for (const range of busyRanges) {
    if (!activeScheduleIds.has(range.schedule_id)) continue;
    const existing = busyBySchedule.get(range.schedule_id) ?? [];
    existing.push(range);
    busyBySchedule.set(range.schedule_id, existing);
  }

  const slots: OnlineBookingSlot[] = [];
  const firstDayKey = formatInTimeZone(from, timezone, "yyyy-MM-dd");
  const scheduleCount = activeSchedules.length;
  const pairCount = scheduleCount * activeProcedures.length;
  let chronologicalGroup = 0;

  for (let dayOffset = 0; dayOffset <= maxDaysAhead; dayOffset += 1) {
    const dayKey = addCalendarDays(firstDayKey, dayOffset);
    const weekday = weekdayForDayKey(dayKey);
    const candidatesById = new Map<string, SlotCandidate>();

    for (
      let scheduleRank = 0;
      scheduleRank < activeSchedules.length;
      scheduleRank += 1
    ) {
      const schedule = activeSchedules[scheduleRank];
      const scheduleMaxDaysAhead = validNonNegativeInteger(
        schedule.maxDaysAhead,
        maxDaysAhead,
      );
      if (dayOffset > scheduleMaxDaysAhead) continue;

      const scheduleMinNoticeHours = validNonNegativeNumber(
        schedule.minNoticeHours,
        0,
      );
      const scheduleFrom = new Date(
        from.getTime() + scheduleMinNoticeHours * 3_600_000,
      );
      const scheduleUntil = earliestDate(
        until,
        Number.isInteger(schedule.maxDaysAhead) &&
          Number(schedule.maxDaysAhead) >= 0
          ? addDays(from, scheduleMaxDaysAhead!)
          : undefined,
      );
      const scheduleProcedureIds = schedule.procedureIds
        ? new Set(schedule.procedureIds)
        : null;
      const rows = (availabilityBySchedule.get(schedule.id) ?? []).filter(
        (row) => row.weekday === weekday,
      );

      for (const row of rows) {
        const windowStart = timeToMinutes(row.start_time);
        const windowEnd = timeToMinutes(row.end_time);
        if (windowStart === null || windowEnd === null) continue;

        for (
          let startMinute = windowStart;
          startMinute < windowEnd;
          startMinute += row.slot_minutes
        ) {
          for (
            let procedureRank = 0;
            procedureRank < activeProcedures.length;
            procedureRank += 1
          ) {
            const procedure = activeProcedures[procedureRank];
            if (
              scheduleProcedureIds &&
              !scheduleProcedureIds.has(procedure.id)
            ) {
              continue;
            }
            const endMinute = startMinute + procedure.duration_minutes;
            if (endMinute > windowEnd) continue;

            const localStart = `${dayKey}T${minutesToTime(startMinute)}`;
            const localEnd = `${dayKey}T${minutesToTime(endMinute)}`;
            const start = fromZonedTime(localStart, timezone);
            const end = fromZonedTime(localEnd, timezone);
            if (
              !isValidZonedTime(start, localStart, timezone) ||
              !isValidZonedTime(end, localEnd, timezone) ||
              start < scheduleFrom ||
              (scheduleUntil && start >= scheduleUntil) ||
              isBusy(start, end, busyBySchedule.get(schedule.id) ?? [])
            ) {
              continue;
            }

            const startAt = start.toISOString();
            const id = `${schedule.id}:${procedure.id}:${startAt}`;
            if (candidatesById.has(id)) continue;

            const timeLabel = formatInTimeZone(start, timezone, "HH:mm");
            candidatesById.set(id, {
              id,
              scheduleId: schedule.id,
              procedureId: procedure.id,
              startAt,
              dayKey,
              dateLabel: formatInTimeZone(start, timezone, "dd/MM"),
              weekdayLabel: formatInTimeZone(start, timezone, "EEEEEE", {
                locale: ptBR,
              }),
              timeLabel,
              label: `${formatInTimeZone(start, timezone, "dd/MM/yyyy")} as ${timeLabel}`,
              // Schedule changes fastest so a limit ending inside a tie does
              // not fill only the first schedule with every procedure.
              pairRank: procedureRank * scheduleCount + scheduleRank,
              startTimestamp: start.getTime(),
            });
          }
        }
      }
    }

    const candidates = [...candidatesById.values()].sort(
      (left, right) =>
        left.startTimestamp - right.startTimestamp ||
        left.pairRank - right.pairRank,
    );

    for (let index = 0; index < candidates.length; ) {
      const startTimestamp = candidates[index].startTimestamp;
      let groupEnd = index + 1;
      while (
        groupEnd < candidates.length &&
        candidates[groupEnd].startTimestamp === startTimestamp
      ) {
        groupEnd += 1;
      }

      const rotation = chronologicalGroup % pairCount;
      const tiedCandidates = candidates
        .slice(index, groupEnd)
        .sort(
          (left, right) =>
            rotatedRank(left.pairRank, rotation, pairCount) -
              rotatedRank(right.pairRank, rotation, pairCount) ||
            left.id.localeCompare(right.id),
        );

      for (const candidate of tiedCandidates) {
        slots.push(toOnlineBookingSlot(candidate));
        if (slots.length >= limit) return slots;
      }

      chronologicalGroup += 1;
      index = groupEnd;
    }
  }

  return slots;
}

function uniqueById<T extends { id: string }>(records: T[]) {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function toOnlineBookingSlot(candidate: SlotCandidate): OnlineBookingSlot {
  return {
    id: candidate.id,
    scheduleId: candidate.scheduleId,
    procedureId: candidate.procedureId,
    startAt: candidate.startAt,
    dayKey: candidate.dayKey,
    dateLabel: candidate.dateLabel,
    weekdayLabel: candidate.weekdayLabel,
    timeLabel: candidate.timeLabel,
    label: candidate.label,
  };
}

function compareById<T extends { id: string }>(left: T, right: T) {
  return left.id.localeCompare(right.id);
}

function validNonNegativeInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

function validNonNegativeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function earliestDate(left?: Date, right?: Date) {
  if (!left) return right;
  if (!right) return left;
  return left <= right ? left : right;
}

function addCalendarDays(dayKey: string, days: number) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function weekdayForDayKey(dayKey: string) {
  return new Date(`${dayKey}T12:00:00.000Z`).getUTCDay();
}

function rotatedRank(rank: number, rotation: number, count: number) {
  return (rank - rotation + count) % count;
}

function isValidZonedTime(date: Date, localValue: string, timezone: string) {
  return (
    !Number.isNaN(date.getTime()) &&
    formatInTimeZone(date, timezone, "yyyy-MM-dd'T'HH:mm") === localValue
  );
}

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isBusy(start: Date, end: Date, busyRanges: SlotBusyRange[]) {
  return busyRanges.some((range) => {
    const busyStart = new Date(range.start_at);
    const busyEnd = new Date(range.end_at);
    return busyStart < end && busyEnd > start;
  });
}
