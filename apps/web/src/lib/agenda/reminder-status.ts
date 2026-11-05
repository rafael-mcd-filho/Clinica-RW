/**
 * Raio-X A7: situação do lembrete de cada agendamento, para a recepção ver no
 * card quem já recebeu o pedido de confirmação e quem ainda precisa de
 * ligação. Vem do evento "appointment.reminder_due" e da notificação gerada
 * a partir dele (fila de envio do WhatsApp).
 */

export type AppointmentReminderStatus = "queued" | "sent" | "failed";

export type AppointmentReminder = {
  status: AppointmentReminderStatus;
  /** Quando foi enviado; na fila ou com falha, quando entrou na fila. */
  at: string;
};

type OutboxRow = {
  status: string | null;
  sent_at: string | null;
  created_at?: string | null;
};

export type ReminderEventRow = {
  aggregate_id: string | null;
  occurred_at: string;
  notification_outbox: OutboxRow[] | OutboxRow | null;
};

const statusRank: Record<AppointmentReminderStatus, number> = {
  failed: 0,
  queued: 1,
  sent: 2,
};

function outboxStatus(row: OutboxRow): AppointmentReminderStatus {
  if (row.status === "sent") return "sent";
  if (row.status === "queued" || row.status === "sending") return "queued";
  // "failed" e "skipped" (sem telefone, canal desligado, opt-out): não chegou.
  return "failed";
}

/** Uma situação por agendamento; vale a melhor (enviado > na fila > falhou). */
export function buildReminderMap(
  rows: ReminderEventRow[] | null | undefined,
): Record<string, AppointmentReminder> {
  const map: Record<string, AppointmentReminder> = {};
  for (const row of rows ?? []) {
    if (!row.aggregate_id) continue;
    const outbox = Array.isArray(row.notification_outbox)
      ? row.notification_outbox
      : row.notification_outbox
        ? [row.notification_outbox]
        : [];
    // Evento sem notificação ainda: o produtor de mensagens não rodou.
    const candidates: AppointmentReminder[] = outbox.length
      ? outbox.map((item) => {
          const status = outboxStatus(item);
          return {
            status,
            at:
              (status === "sent" ? item.sent_at : item.created_at) ??
              row.occurred_at,
          };
        })
      : [{ status: "queued", at: row.occurred_at }];
    for (const candidate of candidates) {
      const current = map[row.aggregate_id];
      if (
        !current ||
        statusRank[candidate.status] > statusRank[current.status] ||
        (candidate.status === current.status && candidate.at > current.at)
      ) {
        map[row.aggregate_id] = candidate;
      }
    }
  }
  return map;
}

export const reminderStatusLabels: Record<AppointmentReminderStatus, string> = {
  queued: "Lembrete na fila",
  sent: "Lembrete enviado",
  failed: "Lembrete não enviado",
};

/** Texto do detalhe: "Lembrete enviado em 04/11 às 10:00". */
export function describeReminder(
  reminder: AppointmentReminder,
  timeZone: string,
): string {
  const date = new Date(reminder.at);
  if (Number.isNaN(date.getTime()))
    return reminderStatusLabels[reminder.status];
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  const when = `${day} às ${time}`;
  if (reminder.status === "sent") return `Lembrete enviado em ${when}`;
  if (reminder.status === "queued") return `Lembrete na fila desde ${when}`;
  return `Lembrete não enviado (${when}): confira o telefone ou ligue`;
}
