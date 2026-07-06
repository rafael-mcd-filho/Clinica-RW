import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/observability/logger";

const clientErrorSchema = z.object({
  digest: z.string().trim().max(200).optional(),
  message: z.string().trim().max(500),
  source: z.string().trim().max(100),
});

export async function POST(request: Request) {
  const parsed = clientErrorSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  logger.error("client.error", {
    digest: parsed.data.digest,
    message: parsed.data.message,
    source: parsed.data.source,
  });

  return NextResponse.json({ ok: true });
}
