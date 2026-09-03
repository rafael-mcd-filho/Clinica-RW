import { NextResponse, type NextRequest } from "next/server";
import { dispatchPendingJobs, runScheduledMaintenance } from "@/lib/jobs/worker";

/**
 * Batida do cron: entrega as notificacoes enfileiradas e roda as varreduras de
 * manutencao (solicitacao online presa, entrada de fila esquecida).
 *
 * Chamar de fora, a cada poucos minutos:
 *   curl -X POST https://.../api/jobs/dispatch \
 *        -H "authorization: Bearer $JOBS_WORKER_SECRET"
 *
 * Sem `JOBS_WORKER_SECRET` configurado a rota recusa tudo: e melhor o cron
 * falhar barulhento do que deixar um disparador de mensagens aberto na
 * internet.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const secret = process.env.JOBS_WORKER_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "JOBS_WORKER_SECRET não está configurado no servidor; a rota fica desligada.",
      },
      { status: 503 },
    );
  }

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-worker-secret") ??
    "";
  if (provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const maintenance = await runScheduledMaintenance();
  const dispatch = await dispatchPendingJobs();

  return NextResponse.json({
    maintenance,
    dispatch,
    // Ainda havia job quando o lote acabou: o cron pode chamar de novo já.
    hasMore: dispatch.claimed > 0 && dispatch.claimed >= 25,
  });
}
