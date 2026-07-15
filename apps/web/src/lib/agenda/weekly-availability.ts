export type WeeklyAvailabilityDayInput = {
  weekday: number;
  active: boolean;
  startTime: string;
  endTime: string;
  lunchEnabled: boolean;
  lunchStart: string;
  lunchEnd: string;
  preserve?: boolean;
};

export type WeeklyAvailabilityInterval = {
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
};

const dayNames = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export function buildWeeklyAvailabilityIntervals(
  days: WeeklyAvailabilityDayInput[],
  slotMinutes: number,
):
  | {
      rows: WeeklyAvailabilityInterval[];
      managedWeekdays: Set<number>;
      error?: never;
    }
  | { error: string; rows?: never; managedWeekdays?: never } {
  const rows: WeeklyAvailabilityInterval[] = [];
  const managedWeekdays = new Set<number>();

  for (const day of days) {
    if (day.preserve) continue;
    managedWeekdays.add(day.weekday);
    if (!day.active) continue;

    if (day.startTime >= day.endTime) {
      return {
        error: `O fim do atendimento de ${dayNames[day.weekday]} deve ser posterior ao início.`,
      };
    }

    if (day.lunchEnabled) {
      if (
        !(
          day.startTime < day.lunchStart &&
          day.lunchStart < day.lunchEnd &&
          day.lunchEnd < day.endTime
        )
      ) {
        return {
          error: `Revise a pausa de almoço de ${dayNames[day.weekday]}.`,
        };
      }
      rows.push(
        {
          weekday: day.weekday,
          start_time: day.startTime,
          end_time: day.lunchStart,
          slot_minutes: slotMinutes,
        },
        {
          weekday: day.weekday,
          start_time: day.lunchEnd,
          end_time: day.endTime,
          slot_minutes: slotMinutes,
        },
      );
      continue;
    }

    rows.push({
      weekday: day.weekday,
      start_time: day.startTime,
      end_time: day.endTime,
      slot_minutes: slotMinutes,
    });
  }

  return { rows, managedWeekdays };
}
