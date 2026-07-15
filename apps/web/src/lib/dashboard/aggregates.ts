import { z } from "zod";

const count = z.number().int().nonnegative();
const nullableRate = z.number().int().min(0).max(100).nullable();
const nullableValue = z.number().finite().nonnegative().nullable();

const appointmentStatsSchema = z.object({
  total: count,
  valid: count,
  attended: count,
  unique_patients: count,
  no_show_rate: nullableRate,
  cancellation_rate: nullableRate,
});

const countSliceSchema = z.object({
  label: z.string(),
  value: count,
});

export const dashboardAggregatePayloadSchema = z.object({
  patient_data_available: z.boolean(),
  current_stats: appointmentStatsSchema,
  comparison_stats: appointmentStatsSchema,
  current_new_patients: count,
  comparison_new_patients: count,
  average_lead_days: nullableValue,
  charts: z.object({
    patients: z.object({
      new_count: count,
      recurring_count: count,
      male_count: count,
      female_count: count,
    }),
    procedures: z.array(countSliceSchema),
    insurance_status: z.object({
      with_insurance: count,
      without_insurance: count,
    }),
    insurance_breakdown: z.array(countSliceSchema),
    timing: z.object({
      average_value: nullableValue,
      particular_value: nullableValue,
      insurance_value: nullableValue,
    }),
    cancellations: z.object({
      no_shows: count,
      cancellations: count,
      no_show_rate: nullableRate,
      cancellation_rate: nullableRate,
    }),
    period_points: z.array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        value: count,
      }),
    ),
    age_distribution: z.array(
      z.object({
        age: z.number().int().nonnegative(),
        value: count,
      }),
    ),
    birthdays: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        age: z.number().int().nonnegative().nullable(),
      }),
    ),
    commercial_summary: z.object({
      future: count,
      attended: count,
      open: count,
      losses: count,
    }),
  }),
});

export type DashboardAggregatePayload = z.infer<
  typeof dashboardAggregatePayloadSchema
>;

export function parseDashboardAggregatePayload(input: unknown) {
  const parsed = dashboardAggregatePayloadSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
