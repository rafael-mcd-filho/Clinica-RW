"use client";

import {
  ClockCountdown,
  PaperPlaneTilt,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import {
  describeReminder,
  type AppointmentReminder,
  type AppointmentReminderStatus,
} from "@/lib/agenda/reminder-status";
import { cn } from "@/lib/utils";

const reminderIcon: Record<AppointmentReminderStatus, Icon> = {
  queued: ClockCountdown,
  sent: PaperPlaneTilt,
  failed: WarningCircle,
};

const reminderTone: Record<AppointmentReminderStatus, string> = {
  queued: "text-muted-foreground",
  sent: "text-primary",
  failed: "text-destructive",
};

/** Ícone do lembrete no card (Raio-X A7). O texto vai no title e no rótulo
    acessível do card; aqui o ícone é só reforço visual. */
export function ReminderIndicator({
  reminder,
  timeZone,
  className,
}: {
  reminder: AppointmentReminder;
  timeZone: string;
  className?: string;
}) {
  const IconComponent = reminderIcon[reminder.status];
  return (
    <span
      title={describeReminder(reminder, timeZone)}
      className={cn(
        "inline-flex shrink-0",
        reminderTone[reminder.status],
        className,
      )}
    >
      <IconComponent
        className="size-3.5"
        weight={reminder.status === "sent" ? "fill" : "regular"}
        aria-hidden="true"
      />
    </span>
  );
}

/** Linha de texto para o detalhe do agendamento. */
export function ReminderLine({
  reminder,
  timeZone,
  className,
}: {
  reminder: AppointmentReminder;
  timeZone: string;
  className?: string;
}) {
  const IconComponent = reminderIcon[reminder.status];
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-body-sm",
        reminder.status === "failed"
          ? "text-destructive"
          : "text-muted-foreground",
        className,
      )}
    >
      <IconComponent className="size-4 shrink-0" aria-hidden="true" />
      {describeReminder(reminder, timeZone)}
    </p>
  );
}
