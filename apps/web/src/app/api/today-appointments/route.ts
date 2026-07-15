import { NextResponse } from "next/server";
import { getRequestContext } from "@/lib/auth/context";
import { getTodayAppointmentsForRail } from "@/lib/clinic/today-appointments";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const context = await getRequestContext();

  if (
    context.isSuperAdmin ||
    !context.organization ||
    !context.permissionCodes.has("agenda.ver")
  ) {
    return NextResponse.json(
      { error: "Acesso negado." },
      {
        status: 403,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  try {
    const appointments = await getTodayAppointmentsForRail(
      context.organization.id,
    );
    const duration = performance.now() - startedAt;

    return NextResponse.json(
      { appointments },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Server-Timing": `today-appointments;dur=${duration.toFixed(1)}`,
        },
      },
    );
  } catch (error) {
    const duration = performance.now() - startedAt;

    logger.error("today_appointments.load_failed", {
      duration_ms: Math.round(duration),
      organization_id: context.organization.id,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Não foi possível carregar os pacientes do dia." },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store",
          "Server-Timing": `today-appointments;dur=${duration.toFixed(1)}`,
        },
      },
    );
  }
}
