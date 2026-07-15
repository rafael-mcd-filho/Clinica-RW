import { z } from "zod";

export const funnelBoardAggregateSchema = z.object({
  last_movements: z.array(
    z.object({
      card_id: z.string().uuid(),
      moved_at: z.string(),
    }),
  ),
  stage_metrics: z.array(
    z.object({
      stage_id: z.string().uuid(),
      entered_count: z.number().int().nonnegative(),
      conversion_rate: z.number().int().min(0).max(100).nullable(),
      average_duration_hours: z.number().finite().nonnegative().nullable(),
    }),
  ),
});

export type FunnelBoardAggregate = z.infer<typeof funnelBoardAggregateSchema>;

export function parseFunnelBoardAggregate(input: unknown) {
  const parsed = funnelBoardAggregateSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
