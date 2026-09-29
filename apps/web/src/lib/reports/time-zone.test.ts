import { describe, expect, it } from "vitest";
import {
  addDateKeyDays,
  dateKeysBetween,
  dateKeyWeekday,
  zonedDateKey,
  zonedDayEndExclusive,
  zonedDayStart,
} from "./time-zone";

describe("report periods in the clinic time zone", () => {
  it("starts the period at local midnight, not UTC midnight", () => {
    expect(zonedDayStart("2026-09-01", "America/Fortaleza").toISOString()).toBe(
      "2026-09-01T03:00:00.000Z",
    );
  });

  it("ends the period at the next local midnight, exclusive", () => {
    expect(
      zonedDayEndExclusive("2026-09-30", "America/Fortaleza").toISOString(),
    ).toBe("2026-10-01T03:00:00.000Z");
  });

  it("keeps a 21h appointment on its local day", () => {
    // 21h em Fortaleza já é meia-noite em UTC: em UTC caía no dia seguinte.
    expect(zonedDateKey("2026-09-15T00:30:00.000Z", "America/Fortaleza")).toBe(
      "2026-09-14",
    );
  });

  it("walks calendar days across month boundaries", () => {
    expect(addDateKeyDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDateKeyDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(dateKeysBetween("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(dateKeysBetween("2026-10-02", "2026-09-29")).toEqual([]);
  });

  it("reads the weekday of the calendar date", () => {
    // 2026-09-27 é um domingo.
    expect(dateKeyWeekday("2026-09-27")).toBe(0);
    expect(dateKeyWeekday("2026-09-26")).toBe(6);
  });
});
