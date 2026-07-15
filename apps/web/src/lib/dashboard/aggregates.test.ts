import { describe, expect, it } from "vitest";
import { parseDashboardAggregatePayload } from "./aggregates";

const payload = {
  patient_data_available: true,
  current_stats: {
    total: 5,
    valid: 3,
    attended: 2,
    unique_patients: 4,
    no_show_rate: 33,
    cancellation_rate: 20,
  },
  comparison_stats: {
    total: 4,
    valid: 3,
    attended: 2,
    unique_patients: 3,
    no_show_rate: null,
    cancellation_rate: 25,
  },
  current_new_patients: 2,
  comparison_new_patients: 1,
  average_lead_days: 4.5,
  charts: {
    patients: {
      new_count: 2,
      recurring_count: 3,
      male_count: 2,
      female_count: 2,
    },
    procedures: [{ label: "Consulta", value: 5 }],
    insurance_status: { with_insurance: 3, without_insurance: 2 },
    insurance_breakdown: [{ label: "Plano", value: 3 }],
    timing: {
      average_value: 30,
      particular_value: 25,
      insurance_value: 35,
    },
    cancellations: {
      no_shows: 1,
      cancellations: 1,
      no_show_rate: 33,
      cancellation_rate: 20,
    },
    period_points: [{ date: "2026-07-13", value: 5 }],
    age_distribution: [{ age: 35, value: 2 }],
    birthdays: [
      {
        id: "2d29d2cb-730d-4923-a651-0ba2182bd419",
        name: "Paciente",
        age: 35,
      },
    ],
    commercial_summary: { future: 2, attended: 1, open: 1, losses: 1 },
  },
};

describe("parseDashboardAggregatePayload", () => {
  it("accepts a complete aggregate returned by PostgreSQL", () => {
    expect(parseDashboardAggregatePayload(payload)).toEqual(payload);
  });

  it("rejects malformed aggregates so the page can use its safe fallback", () => {
    expect(
      parseDashboardAggregatePayload({
        ...payload,
        current_stats: { ...payload.current_stats, total: -1 },
      }),
    ).toBeNull();
  });
});
