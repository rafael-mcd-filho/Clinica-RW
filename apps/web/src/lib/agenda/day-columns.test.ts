import { describe, expect, it } from "vitest";
import {
  appointmentOccupiesTime,
  closedRanges,
  dayTimelineRange,
  listFreeSlots,
  localMinuteRangeOnDate,
  notBeforeMinuteFor,
  timeToMinutes,
  weekdayOfDateKey,
  windowsForSchedule,
} from "./day-columns";

const availability = [
  {
    schedule_id: "a",
    weekday: 4,
    start_time: "13:00:00",
    end_time: "18:00:00",
    slot_minutes: 30,
  },
  {
    schedule_id: "a",
    weekday: 4,
    start_time: "08:00:00",
    end_time: "12:00:00",
    slot_minutes: 30,
  },
  {
    schedule_id: "a",
    weekday: 5,
    start_time: "08:00:00",
    end_time: "12:00:00",
    slot_minutes: 30,
  },
  {
    schedule_id: "b",
    weekday: 4,
    start_time: "09:00:00",
    end_time: "10:00:00",
    slot_minutes: 20,
  },
];

describe("day-columns", () => {
  it("lê o dia da semana da chave sem depender do fuso", () => {
    // 05/11/2026 é quinta-feira.
    expect(weekdayOfDateKey("2026-11-05")).toBe(4);
    expect(weekdayOfDateKey("2026-11-08")).toBe(0);
  });

  it("monta as janelas da agenda no dia, em ordem", () => {
    expect(windowsForSchedule(availability, "a", 4)).toEqual([
      { startMinute: 480, endMinute: 720, slotMinutes: 30 },
      { startMinute: 780, endMinute: 1080, slotMinutes: 30 },
    ]);
    expect(windowsForSchedule(availability, "a", 6)).toEqual([]);
  });

  it("recorta o intervalo no dia local, inclusive bloqueio de dia inteiro", () => {
    const timeZone = "America/Sao_Paulo";
    expect(
      localMinuteRangeOnDate(
        "2026-11-05T12:30:00.000Z",
        "2026-11-05T13:10:00.000Z",
        "2026-11-05",
        timeZone,
      ),
    ).toEqual({
      startMinute: timeToMinutes("09:30"),
      endMinute: timeToMinutes("10:10"),
    });
    expect(
      localMinuteRangeOnDate(
        "2026-11-05T03:00:00.000Z",
        "2026-11-06T03:00:00.000Z",
        "2026-11-05",
        timeZone,
      ),
    ).toEqual({ startMinute: 0, endMinute: 1440 });
    expect(
      localMinuteRangeOnDate(
        "2026-11-06T12:00:00.000Z",
        "2026-11-06T13:00:00.000Z",
        "2026-11-05",
        timeZone,
      ),
    ).toBeNull();
  });

  it("oferece só horários livres, no passo da janela e a partir de agora", () => {
    const windows = windowsForSchedule(availability, "b", 4);
    expect(
      listFreeSlots({ windows, busy: [] }).map((slot) => slot.time),
    ).toEqual(["09:00", "09:20", "09:40"]);
    expect(
      listFreeSlots({
        windows,
        busy: [{ startMinute: 9 * 60 + 15, endMinute: 9 * 60 + 35 }],
      }).map((slot) => slot.time),
    ).toEqual(["09:40"]);
    expect(
      listFreeSlots({ windows, busy: [], notBeforeMinute: 9 * 60 + 1 }).map(
        (slot) => slot.time,
      ),
    ).toEqual(["09:20", "09:40"]);
  });

  it("pinta como fechado o que fica fora do expediente", () => {
    const windows = windowsForSchedule(availability, "a", 4);
    expect(
      closedRanges(windows, { startMinute: 450, endMinute: 1110 }),
    ).toEqual([
      { startMinute: 450, endMinute: 480 },
      { startMinute: 720, endMinute: 780 },
      { startMinute: 1080, endMinute: 1110 },
    ]);
    expect(closedRanges([], { startMinute: 480, endMinute: 600 })).toEqual([
      { startMinute: 480, endMinute: 600 },
    ]);
  });

  it("ajusta a faixa da grade ao expediente e aos encaixes", () => {
    expect(dayTimelineRange({ windows: [], items: [] })).toEqual({
      startMinute: 480,
      endMinute: 1080,
    });
    expect(
      dayTimelineRange({
        windows: [{ startMinute: 480, endMinute: 1080 }],
        items: [{ startMinute: 7 * 60 + 40, endMinute: 8 * 60 }],
      }),
    ).toEqual({ startMinute: 450, endMinute: 1080 });
    // Expediente curto ainda mostra quatro horas.
    expect(
      dayTimelineRange({
        windows: [{ startMinute: 540, endMinute: 600 }],
        items: [],
      }),
    ).toEqual({ startMinute: 540, endMinute: 780 });
  });

  it("libera o horário de cancelados e faltas", () => {
    expect(appointmentOccupiesTime("cancelled")).toBe(false);
    expect(appointmentOccupiesTime("no_show")).toBe(false);
    expect(appointmentOccupiesTime("attended")).toBe(true);
    expect(appointmentOccupiesTime("scheduled")).toBe(true);
  });

  it("não oferece horário no passado", () => {
    expect(notBeforeMinuteFor("2026-11-06", "2026-11-05", 600)).toBe(0);
    expect(notBeforeMinuteFor("2026-11-04", "2026-11-05", 600)).toBe(1440);
    expect(notBeforeMinuteFor("2026-11-05", "2026-11-05", 600)).toBe(600);
  });
});
