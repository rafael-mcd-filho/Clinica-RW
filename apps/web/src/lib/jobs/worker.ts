import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getOrganizationEvolutionConfig } from "@/lib/whatsapp/credentials";
import { sendTextMessage } from "@/lib/whatsapp/evolution-client";

/**
 * O processo que esvazia a caixa de saida de notificacoes.
 *
 * Todo o resto da automacao ja existia no banco desde a fase 11 -- regras,
 * modelos, janela de envio, opt-out, fila de jobs com `claim_next_job` e
 * `complete_job` liberados para `service_role`. Faltava exatamente isto: quem
 * puxa o job e entrega. Sem este arquivo, confirmacao e recusa de agendamento
 * online eram enfileiradas e nunca saiam.
 *
 * Roda sempre com o cliente admin: `claim_next_job` e `complete_job` sao
 * `security definer` concedidos so a `service_role`.
 */

/** Teto por rodada: o cron chama de novo se ainda houver fila. */
const DEFAULT_BATCH_SIZE = 25;

type JobRow = {
  id: string;
  organization_id: string;
  job_type: string;
  payload: Record<string, unknown> | null;
  attempts: number;
};

type NotificationRow = {
  id: string;
  organization_id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
};

export type DispatchSummary = {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type JobOutcome =
  | { result: "sent" }
  /** Entregou o job, mas nao havia como enviar: o motivo fica no outbox. */
  | { result: "skipped"; reason: string }
  | { result: "failed"; reason: string };

export async function dispatchPendingJobs(
  batchSize = DEFAULT_BATCH_SIZE,
): Promise<DispatchSummary> {
  const admin = createSupabaseAdminClient();
  const workerId = `web-${process.pid}`;
  const summary: DispatchSummary = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (let processed = 0; processed < batchSize; processed += 1) {
    const { data, error } = await admin.rpc("claim_next_job", {
      p_worker_id: workerId,
      p_job_types: ["send_notification"],
    });

    if (error) {
      summary.errors.push(`claim_next_job: ${error.message}`);
      break;
    }

    // `claim_next_job` devolve `setof job_queue`: zero ou uma linha.
    const job = (data as JobRow[] | null)?.[0];
    if (!job) break;
    summary.claimed += 1;

    const outcome = await runJob(admin, job);

    // `complete_job` com sucesso marca a notificacao como enviada. Quando o
    // canal nao tinha como sair, o job encerra assim mesmo -- repetir cinco
    // vezes algo que nunca vai funcionar so entope a fila -- e logo depois a
    // notificacao e corrigida para 'skipped' com o motivo.
    const { error: completeError } = await admin.rpc("complete_job", {
      p_job_id: job.id,
      p_success: outcome.result !== "failed",
      p_error_message: outcome.result === "sent" ? null : outcome.reason,
    });
    if (completeError) {
      summary.errors.push(`complete_job: ${completeError.message}`);
    }

    if (outcome.result === "sent") {
      summary.sent += 1;
    } else if (outcome.result === "skipped") {
      summary.skipped += 1;
      const notificationId = readNotificationId(job);
      if (notificationId) {
        await admin
          .from("notification_outbox")
          .update({ status: "skipped", error_message: outcome.reason })
          .eq("id", notificationId);
      }
    } else {
      summary.failed += 1;
      summary.errors.push(outcome.reason);
    }
  }

  return summary;
}

async function runJob(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  job: JobRow,
): Promise<JobOutcome> {
  if (job.job_type !== "send_notification") {
    return {
      result: "skipped",
      reason: `Nenhum worker registrado para o tipo de job "${job.job_type}".`,
    };
  }

  const notificationId = readNotificationId(job);
  if (!notificationId) {
    return {
      result: "skipped",
      reason: "Job de notificação sem notification_id no payload.",
    };
  }

  const { data: notification, error } = await admin
    .from("notification_outbox")
    .select("id, organization_id, channel, recipient, subject, body, status")
    .eq("id", notificationId)
    .maybeSingle<NotificationRow>();

  if (error) {
    return {
      result: "failed",
      reason: `Não foi possível ler a notificação: ${error.message}`,
    };
  }
  if (!notification) {
    return {
      result: "skipped",
      reason: "A notificação deste job não existe mais.",
    };
  }
  // Reentrega depois de um retry que ja tinha saido: nao manda de novo.
  if (notification.status === "sent") return { result: "sent" };

  if (notification.channel !== "whatsapp") {
    return {
      result: "skipped",
      reason: `Não há transporte configurado para o canal "${notification.channel}". Só WhatsApp está ligado.`,
    };
  }

  const config = await getOrganizationEvolutionConfig(
    notification.organization_id,
  );
  if (!config) {
    return {
      result: "skipped",
      reason:
        "A empresa não tem uma conexão de WhatsApp configurada; a mensagem não pôde sair.",
    };
  }

  try {
    const text = notification.subject
      ? `*${notification.subject}*\n\n${notification.body}`
      : notification.body;
    await sendTextMessage(notification.recipient, text, config);
    return { result: "sent" };
  } catch (sendError) {
    return {
      result: "failed",
      reason:
        sendError instanceof Error
          ? `Falha ao enviar pelo WhatsApp: ${sendError.message}`
          : "Falha desconhecida ao enviar pelo WhatsApp.",
    };
  }
}

function readNotificationId(job: JobRow): string | null {
  const value = job.payload?.notification_id;
  return typeof value === "string" && value ? value : null;
}

/**
 * Varreduras de manutencao: solta horario preso por solicitacao que ninguem
 * revisou e limpa entradas de fila esquecidas. Uma RPC so, para o cron nao
 * precisar saber o que existe la dentro.
 */
export async function runScheduledMaintenance(): Promise<{
  expiredOnlineRequests: number;
  expiredWaitlistEntries: number;
  error?: string;
}> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("run_scheduled_maintenance");

  if (error) {
    return {
      expiredOnlineRequests: 0,
      expiredWaitlistEntries: 0,
      error: error.message,
    };
  }

  const counters = (data ?? {}) as {
    expired_online_requests?: number;
    expired_waitlist_entries?: number;
  };
  return {
    expiredOnlineRequests: counters.expired_online_requests ?? 0,
    expiredWaitlistEntries: counters.expired_waitlist_entries ?? 0,
  };
}
