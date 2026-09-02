import { fromZonedTime } from "date-fns-tz";

/**
 * O recorte da agenda de que o formulário de agendamento precisa: catálogos
 * para os campos e a grade (janelas, agendamentos e bloqueios) para calcular
 * horário livre. `AgendaData` satisfaz este formato, e o atendimento monta o
 * mesmo pacote sob demanda — é o que permite os dois usarem o mesmo modal.
 */
export type AppointmentFormData = {
  timeZone: string;
  /** Dia que o formulário abre preenchido. */
  selectedDate: string;
  /** Faixa com agendamentos/bloqueios em mãos; fora dela não há como afirmar
      que um horário está livre. */
  visibleFrom: string;
  visibleTo: string;
  schedules: Array<{
    id: string;
    professional_id: string;
    unit_id: string;
    name: string;
  }>;
  rooms: Array<{ id: string; unit_id: string; name: string }>;
  patients: Array<{
    id: string;
    full_name: string;
    social_name: string | null;
    cpf?: string | null;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
  }>;
  procedures: Array<{ id: string; name: string; duration_minutes: number }>;
  insurances: Array<{ id: string; name: string }>;
  paymentMethods: Array<{ id: string; name: string }>;
  appointments: Array<{
    id: string;
    professional_id: string;
    schedule_id: string;
    start_at: string;
    end_at: string;
  }>;
  blocks: Array<{
    id: string;
    schedule_id: string;
    start_at: string;
    end_at: string;
  }>;
  availability: Array<{
    id: string;
    schedule_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
    slot_minutes: number;
  }>;
};

export function localDateFromKey(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

export function dateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
  }).format(value);
}

export function localDateKey(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
  }).format(new Date(value));
}

export function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function intervalsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
) {
  return startA < endB && endA > startB;
}

export function maxDate(first: Date, second: Date) {
  return first > second ? first : second;
}

export function roundDateToStep(value: Date, stepMinutes: number) {
  const stepMs = Math.max(stepMinutes, 1) * 60_000;
  return new Date(Math.ceil(value.getTime() / stepMs) * stepMs);
}

export function parseLocalDateTimeForUi(
  date: string,
  time: string,
  timeZone: string,
) {
  const parsed = fromZonedTime(
    `${date}T${normalizeTimeValue(time)}:00`,
    timeZone,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function localDateTimeParts(value: Date, timeZone: string) {
  const [date, time = "00:00"] = value
    .toLocaleString("sv-SE", { timeZone })
    .split(" ");
  return { date, time: time.slice(0, 5) };
}

function normalizeTimePart(value: string, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "00";
  return String(Math.min(Math.max(Math.trunc(parsed), 0), max)).padStart(
    2,
    "0",
  );
}

export function formatPartialTime(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function normalizeTimeValue(value: string) {
  const parts = value.split(":");
  const digits = value.replace(/\D/g, "").slice(0, 4);
  const hourSource = value.includes(":")
    ? parts[0]
    : digits.length <= 2
      ? digits
      : digits.slice(0, 2);
  const minuteSource = value.includes(":")
    ? parts[1]
    : digits.length > 2
      ? digits.slice(2, 4)
      : "00";
  const hour = normalizeTimePart(hourSource || "0", 23);
  const minute = normalizeTimePart(minuteSource || "0", 59);
  return `${hour}:${minute}`;
}

export function addMinutesToTime(
  date: string,
  time: string,
  minutes: number,
  timeZone: string,
) {
  const start = parseLocalDateTimeForUi(date, time, timeZone);
  if (!start) return "--:--";
  return localDateTimeParts(
    new Date(start.getTime() + minutes * 60_000),
    timeZone,
  ).time;
}

export function defaultAppointmentDateTime(
  timeZone: string,
  selectedDate: string,
) {
  const roundedNow = localDateTimeParts(
    roundDateToStep(new Date(), 15),
    timeZone,
  );
  return roundedNow.date === selectedDate
    ? roundedNow
    : { date: selectedDate, time: "08:00" };
}

export function hasScheduleConflict({
  data,
  schedule,
  startAt,
  endAt,
}: {
  data: AppointmentFormData;
  schedule: AppointmentFormData["schedules"][number];
  startAt: Date;
  endAt: Date;
}) {
  return (
    data.appointments.some((appointment) => {
      if (
        appointment.schedule_id !== schedule.id &&
        appointment.professional_id !== schedule.professional_id
      ) {
        return false;
      }
      return intervalsOverlap(
        startAt,
        endAt,
        new Date(appointment.start_at),
        new Date(appointment.end_at),
      );
    }) ||
    data.blocks.some((block) => {
      if (block.schedule_id !== schedule.id) return false;
      return intervalsOverlap(
        startAt,
        endAt,
        new Date(block.start_at),
        new Date(block.end_at),
      );
    })
  );
}

/** O dia tem grade conhecida: janelas cadastradas para aquele dia da semana e
    a data dentro da faixa carregada. */
export function dayHasSchedule({
  data,
  scheduleId,
  date,
}: {
  data: AppointmentFormData;
  scheduleId: string;
  date: string;
}) {
  if (!scheduleId || !date) return false;
  if (date < data.visibleFrom || date > data.visibleTo) return false;
  const weekday = localDateFromKey(date).getUTCDay();
  return data.availability.some(
    (item) => item.schedule_id === scheduleId && item.weekday === weekday,
  );
}

/**
 * Todos os horários de início livres do dia para aquela agenda, no passo de
 * cada janela de atendimento e já descontando a duração do procedimento, os
 * agendamentos existentes e os bloqueios. Fora da faixa carregada devolve
 * vazio: sem os agendamentos daquele dia em mãos, oferecer horário "livre"
 * seria chute.
 */
export function listFreeSlotsForDay({
  data,
  scheduleId,
  durationMinutes,
  date,
}: {
  data: AppointmentFormData;
  scheduleId: string;
  durationMinutes: number;
  date: string;
}): string[] {
  const schedule = data.schedules.find((item) => item.id === scheduleId);
  if (!schedule || !date || durationMinutes <= 0) return [];
  if (date < data.visibleFrom || date > data.visibleTo) return [];

  const weekday = localDateFromKey(date).getUTCDay();
  const windows = data.availability
    .filter(
      (item) => item.schedule_id === scheduleId && item.weekday === weekday,
    )
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const slots = new Set<string>();
  for (const window of windows) {
    const windowStart = parseLocalDateTimeForUi(
      date,
      window.start_time.slice(0, 5),
      data.timeZone,
    );
    const windowEnd = parseLocalDateTimeForUi(
      date,
      window.end_time.slice(0, 5),
      data.timeZone,
    );
    if (!windowStart || !windowEnd) continue;

    const step = Math.max(5, window.slot_minutes);
    let candidate = windowStart;
    while (
      candidate.getTime() + durationMinutes * 60_000 <=
      windowEnd.getTime()
    ) {
      const candidateEnd = new Date(
        candidate.getTime() + durationMinutes * 60_000,
      );
      if (
        !hasScheduleConflict({
          data,
          schedule,
          startAt: candidate,
          endAt: candidateEnd,
        })
      ) {
        slots.add(localDateTimeParts(candidate, data.timeZone).time);
      }
      candidate = new Date(candidate.getTime() + step * 60_000);
    }
  }

  return [...slots].sort();
}

/** Primeiro horário livre a partir de uma data/hora, avançando pelos dias
    seguintes até o fim da faixa carregada. */
export function findNextFreeSlot({
  data,
  scheduleId,
  durationMinutes,
  date,
  time,
}: {
  data: AppointmentFormData;
  scheduleId: string;
  durationMinutes: number;
  date: string;
  time: string;
}) {
  const schedule = data.schedules.find((item) => item.id === scheduleId);
  const initial = parseLocalDateTimeForUi(date, time, data.timeZone);
  if (!schedule || !initial) return null;

  const sortedAvailability = data.availability
    .filter((item) => item.schedule_id === scheduleId)
    .sort(
      (a, b) =>
        a.weekday - b.weekday || a.start_time.localeCompare(b.start_time),
    );

  for (let offset = 0; offset <= 90; offset += 1) {
    const initialLocalDate = localDateKey(initial.toISOString(), data.timeZone);
    const day = addDays(localDateFromKey(initialLocalDate), offset);
    const dayKey = dateKey(day);
    if (dayKey > data.visibleTo) break;
    const dayStartLimit =
      offset === 0
        ? initial
        : parseLocalDateTimeForUi(dayKey, "00:00", data.timeZone);
    const dayAvailability = sortedAvailability.filter(
      (item) => item.weekday === day.getUTCDay(),
    );

    for (const availability of dayAvailability) {
      const windowStart = parseLocalDateTimeForUi(
        dayKey,
        availability.start_time.slice(0, 5),
        data.timeZone,
      );
      const windowEnd = parseLocalDateTimeForUi(
        dayKey,
        availability.end_time.slice(0, 5),
        data.timeZone,
      );

      if (!windowStart || !windowEnd || !dayStartLimit) continue;

      let candidate = roundDateToStep(
        maxDate(dayStartLimit, windowStart),
        availability.slot_minutes,
      );

      while (
        candidate.getTime() + durationMinutes * 60_000 <=
        windowEnd.getTime()
      ) {
        const candidateEnd = new Date(
          candidate.getTime() + durationMinutes * 60_000,
        );

        if (
          !hasScheduleConflict({
            data,
            schedule,
            startAt: candidate,
            endAt: candidateEnd,
          })
        ) {
          return localDateTimeParts(candidate, data.timeZone);
        }

        candidate = new Date(
          candidate.getTime() + availability.slot_minutes * 60_000,
        );
      }
    }
  }

  return null;
}
