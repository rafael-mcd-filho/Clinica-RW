import { describe, expect, it } from "vitest";
import {
  buildWeeklyAvailabilityIntervals,
  type WeeklyAvailabilityDayInput,
} from "./weekly-availability";

function day(
  overrides: Partial<WeeklyAvailabilityDayInput> = {},
): WeeklyAvailabilityDayInput {
  return {
    weekday: 1,
    active: true,
    startTime: "08:00",
    endTime: "18:00",
    lunchEnabled: false,
    lunchStart: "12:00",
    lunchEnd: "13:00",
    ...overrides,
  };
}

describe("weekly schedule availability", () => {
  it("creates one interval for a continuous service day", () => {
    const result = buildWeeklyAvailabilityIntervals([day()], 30);

    expect(result).toEqual({
      managedWeekdays: new Set([1]),
      rows: [
        {
          weekday: 1,
          start_time: "08:00",
          end_time: "18:00",
          slot_minutes: 30,
        },
      ],
    });
  });

  it("splits service into two intervals when lunch is enabled", () => {
    const result = buildWeeklyAvailabilityIntervals(
      [day({ lunchEnabled: true })],
      45,
    );

    expect(result.rows).toEqual([
      {
        weekday: 1,
        start_time: "08:00",
        end_time: "12:00",
        slot_minutes: 45,
      },
      {
        weekday: 1,
        start_time: "13:00",
        end_time: "18:00",
        slot_minutes: 45,
      },
    ]);
  });

  it("removes an inactive managed day and preserves advanced days", () => {
    const result = buildWeeklyAvailabilityIntervals(
      [day({ active: false }), day({ weekday: 2, preserve: true })],
      30,
    );

    expect(result.rows).toEqual([]);
    expect(result.managedWeekdays).toEqual(new Set([1]));
  });

  it("rejects a lunch break outside the service interval", () => {
    const result = buildWeeklyAvailabilityIntervals(
      [day({ lunchEnabled: true, lunchStart: "07:30" })],
      30,
    );

    expect(result.error).toBe("Revise a pausa de almoço de segunda-feira.");
  });
});
