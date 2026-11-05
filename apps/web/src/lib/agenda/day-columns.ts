import { localDateFromKey, localDateTimeParts } from "./slots";

export { appointmentOccupiesTime } from "./status";

/**
 * Cálculos da visão "dia por profissional" da agenda: expediente de cada
 * agenda no dia, faixa de horas da grade e horários livres.
 *
 * Tudo trabalha em minutos do dia local da clínica (0–1440), que é como a
 * grade desenha. Datas chegam como chave `yyyy-MM-dd` no fuso da clínica.
 */

export type DayWindow = {
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
};

export type MinuteRange = { startMinute: number; endMinute: number };

export type FreeSlot = MinuteRange & { time: string };

/** Dia da semana (0 = domingo) da chave de data, sem depender do fuso do
    navegador. */
export function weekdayOfDateKey(date: string) {
  return localDateFromKey(date).getUTCDay();
}

/** "08:30" ou "08:30:00" → 510. */
export function timeToMinutes(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

export function minutesToTime(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Janelas de atendimento da agenda naquele dia da semana, em ordem. */
export function windowsForSchedule(
  availability: Array<{
    schedule_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
    slot_minutes: number;
  }>,
  scheduleId: string,
  weekday: number,
): DayWindow[] {
  return availability
    .filter(
      (item) => item.schedule_id === scheduleId && item.weekday === weekday,
    )
    .map((item) => ({
      startMinute: timeToMinutes(item.start_time),
      endMinute: timeToMinutes(item.end_time),
      slotMinutes: Math.max(5, item.slot_minutes || 30),
    }))
    .filter((item) => item.endMinute > item.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute);
}

/**
 * Parte de um intervalo (instantes ISO) que cai no dia local `date`, em
 * minutos. Bloqueio de dia inteiro (00:00 → 00:00 do dia seguinte) vira
 * 0–1440; o que não toca o dia devolve null.
 */
export function localMinuteRangeOnDate(
  startAt: string,
  endAt: string,
  date: string,
  timeZone: string,
): MinuteRange | null {
  const start = localDateTimeParts(new Date(startAt), timeZone);
  const end = localDateTimeParts(new Date(endAt), timeZone);
  if (start.date > date || end.date < date) return null;
  const startMinute = start.date < date ? 0 : timeToMinutes(start.time);
  const endMinute = end.date > date ? 24 * 60 : timeToMinutes(end.time);
  if (endMinute <= startMinute) return null;
  return { startMinute, endMinute };
}

function overlaps(a: MinuteRange, b: MinuteRange) {
  return a.startMinute < b.endMinute && a.endMinute > b.startMinute;
}

/**
 * Horários de início livres de uma agenda no dia, no passo de cada janela.
 * `busy` são os intervalos ocupados (agendamentos do profissional e
 * bloqueios da agenda). Horários que começam antes de `notBeforeMinute`
 * (o "agora" de hoje; 1440 para dias passados) não são oferecidos.
 */
export function listFreeSlots({
  windows,
  busy,
  notBeforeMinute = 0,
}: {
  windows: DayWindow[];
  busy: MinuteRange[];
  notBeforeMinute?: number;
}): FreeSlot[] {
  const slots: FreeSlot[] = [];
  const seen = new Set<number>();
  for (const window of windows) {
    for (
      let minute = window.startMinute;
      minute + window.slotMinutes <= window.endMinute;
      minute += window.slotMinutes
    ) {
      if (minute < notBeforeMinute || seen.has(minute)) continue;
      const candidate = {
        startMinute: minute,
        endMinute: minute + window.slotMinutes,
      };
      if (busy.some((item) => overlaps(candidate, item))) continue;
      seen.add(minute);
      slots.push({ ...candidate, time: minutesToTime(minute) });
    }
  }
  return slots.sort((a, b) => a.startMinute - b.startMinute);
}

/** Trechos da faixa visível fora do expediente (antes, entre e depois das
    janelas): a grade pinta de cinza para ninguém marcar no almoço sem ver. */
export function closedRanges(
  windows: DayWindow[],
  range: MinuteRange,
): MinuteRange[] {
  if (!windows.length) return [range];
  const closed: MinuteRange[] = [];
  let cursor = range.startMinute;
  for (const window of windows) {
    const start = Math.max(window.startMinute, range.startMinute);
    const end = Math.min(window.endMinute, range.endMinute);
    if (end <= start) continue;
    if (start > cursor) closed.push({ startMinute: cursor, endMinute: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < range.endMinute) {
    closed.push({ startMinute: cursor, endMinute: range.endMinute });
  }
  return closed;
}

/**
 * Faixa de horas da grade: do primeiro início ao último fim entre expediente
 * e itens do dia, arredondada ao passo. Sem nada cadastrado, 08:00–18:00.
 * Garante pelo menos quatro horas para a grade não ficar espremida.
 */
export function dayTimelineRange({
  windows,
  items,
  step = 30,
  fallback = { startMinute: 8 * 60, endMinute: 18 * 60 },
}: {
  windows: MinuteRange[];
  items: MinuteRange[];
  step?: number;
  fallback?: MinuteRange;
}): MinuteRange {
  const all = [...windows, ...items];
  if (!all.length) return fallback;
  const start = Math.min(...all.map((item) => item.startMinute));
  const end = Math.max(...all.map((item) => item.endMinute));
  const startMinute = Math.max(0, Math.floor(start / step) * step);
  let endMinute = Math.min(24 * 60, Math.ceil(end / step) * step);
  if (endMinute - startMinute < 4 * 60) {
    endMinute = Math.min(24 * 60, startMinute + 4 * 60);
  }
  return { startMinute, endMinute };
}

/** Minuto a partir do qual ainda se oferece horário no dia: 0 no futuro,
    1440 no passado e o minuto atual hoje. */
export function notBeforeMinuteFor(
  date: string,
  today: string,
  nowMinute: number,
) {
  if (date > today) return 0;
  if (date < today) return 24 * 60;
  return nowMinute;
}
