"use client";

import Link from "next/link";
import {
  CalendarCheck2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  PanelRightOpen,
  Pin,
  PinOff,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import type { TodayAppointmentItem } from "@/lib/clinic/today-appointments";
import { cn } from "@/lib/utils";

type TodayAppointmentsRailProps = {
  appointments: TodayAppointmentItem[];
  open: boolean;
  pinned: boolean;
  onOpenChange: (open: boolean) => void;
  onPinnedChange: (pinned: boolean) => void;
};

const statusLabels: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  waiting: "Aguardando",
  in_progress: "Em atendimento",
  attended: "Atendido",
  no_show: "Faltou",
  cancelled: "Cancelado",
};

const completedStatuses = new Set(["confirmed", "in_progress", "attended"]);

export function TodayAppointmentsRail({
  appointments,
  open,
  pinned,
  onOpenChange,
  onPinnedChange,
}: TodayAppointmentsRailProps) {
  return (
    <>
      {!open ? (
        <Tooltip content="Pacientes do dia" side="bottom">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Abrir pacientes do dia"
            className="fixed right-3 top-16 z-30 shadow-[var(--shadow-hover)] lg:top-4"
            onClick={() => onOpenChange(true)}
          >
            <PanelRightOpen className="size-4" aria-hidden="true" />
          </Button>
        </Tooltip>
      ) : null}

      {open && !pinned ? (
        <button
          type="button"
          aria-label="Fechar pacientes do dia"
          className="fixed inset-0 z-30 bg-black/10 lg:bg-transparent"
          onClick={() => onOpenChange(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-[21rem] max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-card shadow-[var(--shadow-hover)] transition-transform duration-[var(--motion-drawer)] ease-[var(--ease-out)]",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-label="Pacientes do dia"
      >
        <header className="flex h-16 items-center justify-between gap-3 border-b border-border px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarCheck2 className="size-4 text-primary" aria-hidden />
              <h2 className="truncate font-semibold">Pacientes do dia</h2>
              <Badge variant={appointments.length ? "primary" : "neutral"}>
                {appointments.length}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Atendimentos agendados para hoje
            </p>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip
              content={pinned ? "Desfixar painel" : "Fixar painel"}
              side="bottom"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={pinned ? "Desfixar painel" : "Fixar painel"}
                onClick={() => onPinnedChange(!pinned)}
              >
                {pinned ? (
                  <PinOff className="size-4" aria-hidden />
                ) : (
                  <Pin className="size-4" aria-hidden />
                )}
              </Button>
            </Tooltip>
            <Tooltip content="Fechar" side="bottom">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fechar pacientes do dia"
                onClick={() => {
                  onPinnedChange(false);
                  onOpenChange(false);
                }}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </Tooltip>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {appointments.length ? (
            <div className="divide-y divide-border">
              {appointments.map((appointment) => (
                <TodayAppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                />
              ))}
            </div>
          ) : (
            <div className="p-5">
              <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum atendimento agendado para hoje.
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function TodayAppointmentRow({
  appointment,
}: {
  appointment: TodayAppointmentItem;
}) {
  const statusLabel = statusLabels[appointment.status] ?? appointment.status;

  return (
    <Link
      href={`/pacientes/${appointment.patientId}`}
      className="group flex gap-3 px-5 py-4 transition-colors hover:bg-muted/70"
    >
      <div className="grid w-12 shrink-0 justify-items-start gap-1 text-primary">
        <span className="font-mono text-sm font-semibold leading-none">
          {formatTime(appointment.startAt)}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatTime(appointment.endAt)}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {appointment.tags.slice(0, 2).map((tag) => (
            <span
              key={`${appointment.id}-${tag.id}`}
              className="inline-flex h-5 max-w-full items-center rounded px-1.5 text-caption font-semibold uppercase leading-none text-white"
              style={{ backgroundColor: tag.color }}
            >
              <span className="truncate">{tag.name}</span>
            </span>
          ))}
        </div>

        <p className="mt-1 truncate text-sm font-semibold text-foreground">
          {appointment.patientName}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[appointment.procedureName, appointment.professionalName]
            .filter(Boolean)
            .join(" · ") || "Sem detalhes do atendimento"}
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 className="size-3.5" aria-hidden />
          <span>{statusLabel}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 self-start pt-1">
        {completedStatuses.has(appointment.status) ? (
          <CheckCircle2
            className="size-4 text-success-foreground"
            aria-hidden
          />
        ) : null}
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
}
