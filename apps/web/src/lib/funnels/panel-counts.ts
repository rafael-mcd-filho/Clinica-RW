import { z } from "zod";

const funnelPanelCardCountSchema = z.object({
  funnel_id: z.string().uuid(),
  active_card_count: z.coerce.number().int().nonnegative(),
});

export type FunnelPanelCardCount = z.infer<typeof funnelPanelCardCountSchema>;

export function parseFunnelPanelCardCounts(input: unknown) {
  const parsed = z.array(funnelPanelCardCountSchema).safeParse(input);
  return parsed.success ? parsed.data : null;
}
