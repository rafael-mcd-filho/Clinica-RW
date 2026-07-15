import { describe, expect, it } from "vitest";
import {
  buildAppointmentStats,
  buildCountTrend,
  buildRateTrend,
} from "./metrics";

describe("dashboard comparison metrics", () => {
  it("summarizes the appointment cohort with honest rate denominators", () => {
    const stats = buildAppointmentStats([
      { patient_id: "patient-1", status: "attended" },
      { patient_id: "patient-1", status: "no_show" },
      { patient_id: "patient-2", status: "cancelled" },
      { patient_id: "patient-3", status: "scheduled" },
    ]);

    expect(stats).toEqual({
      total: 4,
      valid: 2,
      attended: 1,
      uniquePatients: 3,
      noShowRate: 50,
      cancellationRate: 25,
    });
  });

  it("marks a new count when the comparison has no records", () => {
    expect(buildCountTrend(3, 0)).toMatchObject({
      direction: "up",
      sentiment: "positive",
      value: "Novo",
    });
  });

  it("does not invent rates when a cohort has no denominator", () => {
    expect(buildAppointmentStats([])).toMatchObject({
      noShowRate: null,
      cancellationRate: null,
    });
    expect(
      buildAppointmentStats([{ patient_id: "patient-1", status: "scheduled" }]),
    ).toMatchObject({
      noShowRate: null,
      cancellationRate: 0,
    });
  });

  it("calculates count variation and respects the preferred direction", () => {
    expect(buildCountTrend(8, 10)).toMatchObject({
      direction: "down",
      sentiment: "negative",
      value: "-20%",
    });
    expect(buildCountTrend(8, 10, "lower")).toMatchObject({
      direction: "down",
      sentiment: "positive",
      value: "-20%",
    });
  });

  it("shows rate changes as percentage points", () => {
    expect(buildRateTrend(12, 8, "lower")).toMatchObject({
      direction: "up",
      sentiment: "negative",
      value: "+4 p.p.",
    });
    expect(buildRateTrend(8, 12, "lower")).toMatchObject({
      direction: "down",
      sentiment: "positive",
      value: "-4 p.p.",
    });
  });

  it("keeps equal comparisons neutral", () => {
    expect(buildCountTrend(0, 0)).toMatchObject({
      direction: "flat",
      sentiment: "neutral",
      value: "0%",
    });
    expect(buildRateTrend(10, 10, "lower")).toMatchObject({
      direction: "flat",
      sentiment: "neutral",
      value: "0 p.p.",
    });
  });
});
