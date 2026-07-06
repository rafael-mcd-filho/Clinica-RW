import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type SlotSchedule = {
  id: string;
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
  label: string;
};

export function buildOnlineBookingSlots({
  schedules,
  procedures,
  availability,
  busyRanges,
  timezone,
  from,
  maxDaysAhead,
  limit = 240,
}: {
  schedules: SlotSchedule[];
  procedures: SlotProcedure[];
  availability: SlotAvailability[];
  busyRanges: SlotBusyRange[];
  timezone: string;
  from: Date;
  maxDaysAhead: number;
  limit?: number;
}) {
  const slots: OnlineBookingSlot[] = [];
  const activeScheduleIds = new Set(schedules.map((schedule) => schedule.id));
  const availabilityBySchedule = new Map<string, SlotAvailability[]>();

  for (const row of availability) {
    if (!activeScheduleIds.has(row.schedule_id)) continue;
    const existing = availabilityBySchedule.get(row.schedule_id) ?? [];
    existing.push(row);
    availabilityBySchedule.set(row.schedule_id, existing);
  }

  for (let dayOffset = 0; dayOffset <= maxDaysAhead; dayOffset += 1) {
    const date = addDays(from, dayOffset);
    const localDate = formatInTimeZone(date, timezone, "yyyy-MM-dd");
    const weekday = new Date(`${localDate}T12:00:00`).getDay();

    for (const schedule of schedules) {
      const rows = (availabilityBySchedule.get(schedule.id) ?? []).filter(
        (row) => row.weekday === weekday,
      );
      if (!rows.length) continue;

      for (const row of rows) {
        const windowStart = timeToMinutes(row.start_time);
        const windowEnd = timeToMinutes(row.end_time);
        for (
          let startMinute = windowStart;
          startMinute < windowEnd;
          startMinute += row.slot_minutes
        ) {
          for (const procedure of procedures) {
            const endMinute = startMinute + procedure.duration_minutes;
            if (endMinute > windowEnd) continue;

            const start = fromZonedTime(
              `${localDate}T${minutesToTime(startMinute)}:00`,
              timezone,
            );
            const end = fromZonedTime(
              `${localDate}T${minutesToTime(endMinute)}:00`,
              timezone,
            );
            if (start < from || isBusy(schedule.id, start, end, busyRanges)) {
              continue;
            }

            slots.push({
              id: `${schedule.id}:${procedure.id}:${start.toISOString()}`,
              scheduleId: schedule.id,
              procedureId: procedure.id,
              startAt: start.toISOString(),
              label: formatInTimeZone(start, timezone, "dd/MM/yyyy 'as' HH:mm"),
            });
            if (slots.length >= limit) return slots;
          }
        }
      }
    }
  }

  return slots;
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isBusy(
  scheduleId: string,
  start: Date,
  end: Date,
  busyRanges: SlotBusyRange[],
) {
  return busyRanges.some((range) => {
    if (range.schedule_id !== scheduleId) return false;
    const busyStart = new Date(range.start_at);
    const busyEnd = new Date(range.end_at);
    return busyStart < end && busyEnd > start;
  });
}
