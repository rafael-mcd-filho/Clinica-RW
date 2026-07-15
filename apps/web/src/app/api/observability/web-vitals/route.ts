import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/observability/logger";

const performanceMetricSchema = z.object({
  id: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(80),
  value: z.number().finite().nonnegative(),
  delta: z.number().finite().optional(),
  rating: z.string().trim().max(40).optional(),
  navigationType: z.string().trim().max(40).optional(),
  route: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  const parsed = performanceMetricSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  logger.info("client.performance", {
    metric_id: parsed.data.id,
    metric_name: parsed.data.name,
    value: Math.round(parsed.data.value * 100) / 100,
    delta:
      parsed.data.delta == null
        ? undefined
        : Math.round(parsed.data.delta * 100) / 100,
    rating: parsed.data.rating,
    navigation_type: parsed.data.navigationType,
    route: parsed.data.route,
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
