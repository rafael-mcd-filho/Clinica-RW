import { describe, expect, it } from "vitest";
import { buildOnlineBookingSlots, type SlotAvailability } from "./slots";

const mondayAvailability = (
  scheduleId: string,
  overrides: Partial<SlotAvailability> = {},
): SlotAvailability => ({
  schedule_id: scheduleId,
  weekday: 1,
  start_time: "08:00",
  end_time: "10:00",
  slot_minutes: 30,
  ...overrides,
});

describe("online booking slots", () => {
  it("keeps the global limit chronological and fair across tied schedules and procedures", () => {
    const input = {
      schedules: [{ id: "schedule-z" }, { id: "schedule-a" }],
      procedures: [
        { id: "procedure-z", duration_minutes: 30 },
        { id: "procedure-a", duration_minutes: 30 },
      ],
      availability: [
        mondayAvailability("schedule-z"),
        mondayAvailability("schedule-a"),
      ],
      busyRanges: [],
      timezone: "UTC",
      from: new Date("2026-07-13T07:00:00.000Z"),
      maxDaysAhead: 0,
      limit: 6,
    };

    const slots = buildOnlineBookingSlots(input);

    expect(
      slots.map((slot) => [slot.timeLabel, slot.scheduleId, slot.procedureId]),
    ).toEqual([
      ["08:00", "schedule-a", "procedure-a"],
      ["08:00", "schedule-z", "procedure-a"],
      ["08:00", "schedule-a", "procedure-z"],
      ["08:00", "schedule-z", "procedure-z"],
      ["08:30", "schedule-z", "procedure-a"],
      ["08:30", "schedule-a", "procedure-z"],
    ]);

    expect(
      buildOnlineBookingSlots({
        ...input,
        schedules: [...input.schedules].reverse(),
        procedures: [...input.procedures].reverse(),
        availability: [...input.availability].reverse(),
      }),
    ).toEqual(slots);
  });

  it("uses until as an exclusive exact boundary for slot start times", () => {
    const slots = buildOnlineBookingSlots({
      schedules: [{ id: "schedule" }],
      procedures: [{ id: "procedure", duration_minutes: 30 }],
      availability: [mondayAvailability("schedule")],
      busyRanges: [],
      timezone: "UTC",
      from: new Date("2026-07-13T07:00:00.000Z"),
      until: new Date("2026-07-13T09:00:00.000Z"),
      maxDaysAhead: 30,
    });

    expect(slots.map((slot) => slot.timeLabel)).toEqual(["08:00", "08:30"]);
    expect(
      slots.every(
        (slot) => new Date(slot.startAt) < new Date("2026-07-13T09:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("excludes every slot that overlaps a busy range while preserving touching boundaries", () => {
    const slots = buildOnlineBookingSlots({
      schedules: [{ id: "schedule" }],
      procedures: [{ id: "procedure", duration_minutes: 30 }],
      availability: [mondayAvailability("schedule")],
      busyRanges: [
        {
          schedule_id: "schedule",
          start_at: "2026-07-13T08:15:00.000Z",
          end_at: "2026-07-13T08:45:00.000Z",
        },
        {
          schedule_id: "schedule",
          start_at: "2026-07-13T09:30:00.000Z",
          end_at: "2026-07-13T10:00:00.000Z",
        },
      ],
      timezone: "UTC",
      from: new Date("2026-07-13T07:00:00.000Z"),
      maxDaysAhead: 0,
    });

    expect(slots.map((slot) => slot.timeLabel)).toEqual(["09:00"]);
  });

  it("uses the clinic local calendar day and exposes labels without parsing label", () => {
    const slots = buildOnlineBookingSlots({
      schedules: [{ id: "schedule" }],
      procedures: [{ id: "procedure", duration_minutes: 30 }],
      availability: [
        {
          schedule_id: "schedule",
          weekday: 3,
          start_time: "22:30",
          end_time: "23:30",
          slot_minutes: 30,
        },
      ],
      busyRanges: [],
      timezone: "America/Fortaleza",
      from: new Date("2026-07-16T01:00:00.000Z"),
      maxDaysAhead: 0,
      limit: 1,
    });

    expect(slots).toEqual([
      {
        id: "schedule:procedure:2026-07-16T01:30:00.000Z",
        scheduleId: "schedule",
        procedureId: "procedure",
        startAt: "2026-07-16T01:30:00.000Z",
        dayKey: "2026-07-15",
        dateLabel: "15/07",
        weekdayLabel: "qua",
        timeLabel: "22:30",
        label: "15/07/2026 as 22:30",
      },
    ]);
  });

  it("advances by local calendar days across a daylight-saving transition", () => {
    const slots = buildOnlineBookingSlots({
      schedules: [{ id: "schedule" }],
      procedures: [{ id: "procedure", duration_minutes: 30 }],
      availability: [
        {
          schedule_id: "schedule",
          weekday: 0,
          start_time: "09:00",
          end_time: "10:00",
          slot_minutes: 30,
        },
      ],
      busyRanges: [],
      timezone: "America/New_York",
      from: new Date("2026-03-07T15:00:00.000Z"),
      maxDaysAhead: 1,
      limit: 1,
    });

    expect(slots[0]).toMatchObject({
      startAt: "2026-03-08T13:00:00.000Z",
      dayKey: "2026-03-08",
      dateLabel: "08/03",
      timeLabel: "09:00",
    });
  });

  it("applies publication, notice, window and procedure rules per schedule", () => {
    const availability = [
      ...[1, 2, 3].map((weekday) =>
        mondayAvailability("early", {
          weekday,
          start_time: "08:00",
          end_time: "11:00",
        }),
      ),
      ...[1, 2, 3].map((weekday) =>
        mondayAvailability("late", {
          weekday,
          start_time: "08:00",
          end_time: "11:00",
        }),
      ),
      mondayAvailability("disabled"),
    ];

    const slots = buildOnlineBookingSlots({
      schedules: [
        {
          id: "early",
          enabled: true,
          minNoticeHours: 0,
          maxDaysAhead: 2,
          procedureIds: ["procedure-a"],
        },
        {
          id: "late",
          enabled: true,
          minNoticeHours: 2,
          maxDaysAhead: 1,
          procedureIds: ["procedure-b"],
        },
        {
          id: "disabled",
          enabled: false,
          minNoticeHours: 0,
          maxDaysAhead: 2,
          procedureIds: ["procedure-a"],
        },
      ],
      procedures: [
        { id: "procedure-a", duration_minutes: 30 },
        { id: "procedure-b", duration_minutes: 30 },
      ],
      availability,
      busyRanges: [
        {
          schedule_id: "early",
          start_at: "2026-07-13T08:00:00.000Z",
          end_at: "2026-07-13T08:30:00.000Z",
        },
      ],
      timezone: "UTC",
      from: new Date("2026-07-13T07:00:00.000Z"),
      maxDaysAhead: 2,
    });

    expect(slots.some((slot) => slot.scheduleId === "disabled")).toBe(false);
    expect(
      slots.every((slot) =>
        slot.scheduleId === "early"
          ? slot.procedureId === "procedure-a"
          : slot.procedureId === "procedure-b",
      ),
    ).toBe(true);
    expect(
      slots.find(
        (slot) => slot.scheduleId === "early" && slot.dayKey === "2026-07-13",
      )?.timeLabel,
    ).toBe("08:30");
    expect(
      slots.find(
        (slot) => slot.scheduleId === "late" && slot.dayKey === "2026-07-13",
      )?.timeLabel,
    ).toBe("09:00");
    expect(
      slots.some(
        (slot) => slot.scheduleId === "early" && slot.dayKey === "2026-07-14",
      ),
    ).toBe(true);
    expect(
      slots.some(
        (slot) => slot.scheduleId === "late" && slot.dayKey === "2026-07-14",
      ),
    ).toBe(false);
  });
});
