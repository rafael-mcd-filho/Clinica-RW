import { describe, expect, it } from "vitest";
import {
  addAgendaPeriod,
  buildAgendaEncounterHref,
  buildAgendaReturnTo,
  normalizeAgendaTimeZone,
  parseAgendaLocalDateTime,
  resolveAgendaSelection,
  resolveAgendaVisibleRange,
  safeAgendaReturnTo,
} from "./range";

describe("agenda visible range", () => {
  it("defaults to the clinic's current local day", () => {
    expect(
      resolveAgendaSelection(null, {
        now: new Date("2026-07-14T01:30:00.000Z"),
        timeZone: "America/Fortaleza",
      }),
    ).toEqual({ date: "2026-07-13", view: "day" });
  });

  it("normalizes invalid URL values", () => {
    expect(
      resolveAgendaSelection(
        { date: "2026-02-30", view: "timeline" },
        {
          now: new Date("2026-07-13T12:00:00.000Z"),
          timeZone: "America/Fortaleza",
        },
      ),
    ).toEqual({ date: "2026-07-13", view: "day" });
  });

  it("resolves Monday through Sunday for the weekly view", () => {
    const range = resolveAgendaVisibleRange(
      { date: "2026-07-15", view: "week" },
      "America/Fortaleza",
    );
    expect(range.localFrom).toBe("2026-07-13");
    expect(range.localTo).toBe("2026-07-19");
    expect(range.startInclusive.toISOString()).toBe("2026-07-13T03:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-07-20T03:00:00.000Z");
  });

  it("uses a semi-open calendar month range", () => {
    const range = resolveAgendaVisibleRange(
      { date: "2026-02-18", view: "month" },
      "America/Fortaleza",
    );
    expect(range.localFrom).toBe("2026-02-01");
    expect(range.localTo).toBe("2026-02-28");
  });

  it("preserves DST boundaries in configured timezones", () => {
    const range = resolveAgendaVisibleRange(
      { date: "2026-03-08", view: "day" },
      "America/New_York",
    );
    expect(range.endExclusive.getTime() - range.startInclusive.getTime()).toBe(
      23 * 60 * 60 * 1000,
    );
  });

  it("rejects nonexistent local times during a DST transition", () => {
    expect(
      parseAgendaLocalDateTime("2026-03-08T02:30", "America/New_York"),
    ).toBeNull();
    expect(
      parseAgendaLocalDateTime(
        "2026-03-08T03:30",
        "America/New_York",
      )?.toISOString(),
    ).toBe("2026-03-08T07:30:00.000Z");
  });

  it("moves by the current view and falls back from invalid timezones", () => {
    expect(addAgendaPeriod("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(addAgendaPeriod("2026-07-13", "week", -1)).toBe("2026-07-06");
    expect(normalizeAgendaTimeZone("Invalid/Timezone")).toBe(
      "America/Fortaleza",
    );
  });

  it("preserves a valid agenda date and view in a safe return path", () => {
    const returnTo = buildAgendaReturnTo("2026-07-13", "week");

    expect(returnTo).toBe("/agenda?date=2026-07-13&view=week");
    expect(safeAgendaReturnTo(returnTo)).toBe(returnTo);
    expect(buildAgendaEncounterHref("encounter-id", returnTo)).toBe(
      "/prontuario/encounter-id?from=agenda&return_to=%2Fagenda%3Fdate%3D2026-07-13%26view%3Dweek",
    );
  });

  it("rejects external and malformed agenda return paths", () => {
    expect(
      safeAgendaReturnTo("https://example.com/agenda?date=2026-07-13&view=day"),
    ).toBeNull();
    expect(
      safeAgendaReturnTo("//example.com/agenda?date=2026-07-13&view=day"),
    ).toBeNull();
    expect(safeAgendaReturnTo("/agenda?date=2026-02-30&view=week")).toBeNull();
    expect(
      safeAgendaReturnTo("/agenda?date=2026-07-13&view=timeline"),
    ).toBeNull();
  });
});
