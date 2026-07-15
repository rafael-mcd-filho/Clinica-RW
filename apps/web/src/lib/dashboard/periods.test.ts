import { describe, expect, it } from "vitest";
import {
  buildDashboardPeriodPoints,
  containsInstant,
  dashboardDateField,
  formatDashboardRange,
  resolveDashboardFilterSelection,
  resolveDashboardPeriod,
  type DashboardPeriodPreset,
} from "./periods";

const now = new Date("2026-07-13T17:30:45.250Z");
const timeZone = "America/Fortaleza";

describe("dashboard periods", () => {
  it.each<{
    preset: DashboardPeriodPreset;
    current: [string, string];
    comparison: [string, string];
  }>([
    {
      preset: "today",
      current: ["2026-07-13T03:00:00.000Z", now.toISOString()],
      comparison: ["2026-07-12T03:00:00.000Z", "2026-07-12T17:30:45.250Z"],
    },
    {
      preset: "yesterday",
      current: ["2026-07-12T03:00:00.000Z", "2026-07-13T03:00:00.000Z"],
      comparison: ["2026-07-11T03:00:00.000Z", "2026-07-12T03:00:00.000Z"],
    },
    {
      preset: "current_week",
      current: ["2026-07-12T03:00:00.000Z", now.toISOString()],
      comparison: ["2026-07-05T03:00:00.000Z", "2026-07-06T17:30:45.250Z"],
    },
    {
      preset: "previous_week",
      current: ["2026-07-05T03:00:00.000Z", "2026-07-12T03:00:00.000Z"],
      comparison: ["2026-06-28T03:00:00.000Z", "2026-07-05T03:00:00.000Z"],
    },
    {
      preset: "current_month",
      current: ["2026-07-01T03:00:00.000Z", now.toISOString()],
      comparison: ["2026-06-01T03:00:00.000Z", "2026-06-13T17:30:45.250Z"],
    },
    {
      preset: "previous_month",
      current: ["2026-06-01T03:00:00.000Z", "2026-07-01T03:00:00.000Z"],
      comparison: ["2026-05-01T03:00:00.000Z", "2026-06-01T03:00:00.000Z"],
    },
  ])("resolves $preset with an equivalent comparison", (testCase) => {
    const result = resolveDashboardPeriod(
      { view: "operational", period: testCase.preset },
      { now, timeZone },
    );

    expect([
      result.current.startInclusive.toISOString(),
      result.current.endExclusive.toISOString(),
    ]).toEqual(testCase.current);
    expect([
      result.comparison.startInclusive.toISOString(),
      result.comparison.endExclusive.toISOString(),
    ]).toEqual(testCase.comparison);
  });

  it("starts the week on Sunday", () => {
    const result = resolveDashboardPeriod(
      { view: "operational", period: "current_week" },
      { now, timeZone },
    );

    expect(result.current.localFrom).toBe("2026-07-12");
  });

  it("uses the clinic date across the UTC day boundary", () => {
    const lateUtc = new Date("2026-07-14T01:30:00.000Z");
    const result = resolveDashboardPeriod(
      { view: "operational", period: "today" },
      { now: lateUtc, timeZone },
    );

    expect(result.current.localFrom).toBe("2026-07-13");
    expect(result.current.endExclusive).toEqual(lateUtc);
  });

  it("groups late UTC records on the clinic's local calendar day", () => {
    const lateUtc = new Date("2026-07-14T01:30:00.000Z");
    const result = resolveDashboardPeriod(
      { view: "operational", period: "today" },
      { now: lateUtc, timeZone },
    );

    expect(
      buildDashboardPeriodPoints(
        result.current,
        ["2026-07-14T01:15:00.000Z"],
        timeZone,
      ),
    ).toEqual([{ label: "13/07", value: 1 }]);
  });

  it("preserves the exact instant during a repeated daylight-saving hour", () => {
    const repeatedHour = new Date("2026-11-01T06:30:00.000Z");
    const result = resolveDashboardPeriod(
      { view: "operational", period: "today" },
      { now: repeatedHour, timeZone: "America/New_York" },
    );

    expect(result.current.endExclusive).toEqual(repeatedHour);
  });

  it("uses inclusive start and exclusive end boundaries", () => {
    const result = resolveDashboardPeriod(
      { view: "operational", period: "yesterday" },
      { now, timeZone },
    );

    expect(containsInstant(result.current, result.current.startInclusive)).toBe(
      true,
    );
    expect(containsInstant(result.current, result.current.endExclusive)).toBe(
      false,
    );
  });

  it("compares a partial custom range with the same days and clock time", () => {
    const result = resolveDashboardPeriod(
      {
        view: "commercial",
        period: "custom",
        from: "2026-07-01",
        to: "2026-07-13",
      },
      { now, timeZone },
    );

    expect(result.current.startInclusive.toISOString()).toBe(
      "2026-07-01T03:00:00.000Z",
    );
    expect(result.current.endExclusive).toEqual(now);
    expect(result.comparison.startInclusive.toISOString()).toBe(
      "2026-06-18T03:00:00.000Z",
    );
    expect(result.comparison.endExclusive.toISOString()).toBe(
      "2026-06-30T17:30:45.250Z",
    );
  });

  it("compares a closed custom range with the immediately preceding days", () => {
    const result = resolveDashboardPeriod(
      {
        view: "operational",
        period: "custom",
        from: "2026-07-05",
        to: "2026-07-11",
      },
      { now, timeZone },
    );

    expect(result.current.endExclusive.toISOString()).toBe(
      "2026-07-12T03:00:00.000Z",
    );
    expect(result.comparison.localFrom).toBe("2026-06-28");
    expect(result.comparison.localTo).toBe("2026-07-04");
  });

  it.each([
    ["2024-03-31T15:00:00.000Z", "2024-02-29"],
    ["2025-03-31T15:00:00.000Z", "2025-02-28"],
    ["2026-05-31T15:00:00.000Z", "2026-04-30"],
  ])("clamps missing month days for %s", (instant, expectedDate) => {
    const result = resolveDashboardPeriod(
      { view: "operational", period: "current_month" },
      { now: new Date(instant), timeZone },
    );

    expect(result.comparison.localTo).toBe(expectedDate);
  });

  it.each([
    { from: "2026-02-30", to: "2026-03-02" },
    { from: "2026-07-10", to: "2026-07-01" },
    { from: "2026-07-01", to: "2026-07-14" },
    { from: "2025-07-01", to: "2026-07-13" },
  ])("falls back when a custom range is invalid: $from to $to", (range) => {
    expect(
      resolveDashboardFilterSelection(
        { view: "commercial", period: "custom", ...range },
        { now, timeZone },
      ),
    ).toEqual({ view: "commercial", period: "current_month" });
  });

  it("accepts a custom range with exactly 366 calendar days", () => {
    expect(
      resolveDashboardFilterSelection(
        {
          view: "commercial",
          period: "custom",
          from: "2025-07-13",
          to: "2026-07-13",
        },
        { now, timeZone },
      ),
    ).toEqual({
      view: "commercial",
      period: "custom",
      from: "2025-07-13",
      to: "2026-07-13",
    });
  });

  it("formats full and partial ranges for the filter summary", () => {
    const today = resolveDashboardPeriod(
      { view: "operational", period: "today" },
      { now, timeZone },
    );
    const yesterday = resolveDashboardPeriod(
      { view: "operational", period: "yesterday" },
      { now, timeZone },
    );

    expect(formatDashboardRange(today.current)).toBe("13/07/2026 até agora");
    expect(formatDashboardRange(today.comparison, "até o mesmo horário")).toBe(
      "12/07/2026 até o mesmo horário",
    );
    expect(formatDashboardRange(yesterday.current)).toBe("12/07/2026");
  });

  it("maps each view to its business timestamp", () => {
    expect(dashboardDateField("operational")).toBe("start_at");
    expect(dashboardDateField("commercial")).toBe("created_at");
  });
});
