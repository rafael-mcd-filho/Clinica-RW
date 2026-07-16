"use client";

import Link from "next/link";
import {
  CalendarCheck as CalendarCheck2,
  CheckCircle as CheckCircle2,
  CaretRight as ChevronRight,
  Clock as Clock3,
  SidebarSimple as PanelRightOpen,
  PushPin as Pin,
  PushPinSlash as PinOff,
  ArrowsClockwise as RefreshCw,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/loader";
import { Tooltip } from "@/components/ui/tooltip";
import type { TodayAppointmentItem } from "@/lib/clinic/today-appointments";
import { cn } from "@/lib/utils";

type TodayAppointmentsRailProps = {
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
  open,
  pinned,
  onOpenChange,
  onPinnedChange,
}: TodayAppointmentsRailProps) {
  const [appointments, setAppointments] = useState<TodayAppointmentItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [hasLoaded, setHasLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const loadedRef = useRef(false);
  const lastLoadedAtRef = useRef(0);

  const loadAppointments = useCallback(async (force = false) => {
    if (
      !force &&
      loadedRef.current &&
      Date.now() - lastLoadedAtRef.current < 30_000
    ) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");

    try {
      const response = await fetch("/api/today-appointments", {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        appointments?: TodayAppointmentItem[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao carregar pacientes do dia.");
      }

      setAppointments(
        Array.isArray(payload.appointments) ? payload.appointments : [],
      );
      loadedRef.current = true;
      lastLoadedAtRef.current = Date.now();
      setHasLoaded(true);
      setStatus("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void loadAppointments(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAppointments, open]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

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
        aria-busy={status === "loading"}
      >
        <header className="flex h-16 items-center justify-between gap-3 border-b border-border px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarCheck2 className="size-4 text-primary" aria-hidden />
              <h2 className="truncate font-semibold">Pacientes do dia</h2>
              <Badge
                variant={
                  hasLoaded && appointments.length ? "primary" : "neutral"
                }
              >
                {hasLoaded ? appointments.length : "…"}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Atendimentos agendados para hoje
            </p>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip content="Atualizar pacientes" side="bottom">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Atualizar pacientes do dia"
                disabled={status === "loading"}
                onClick={() => void loadAppointments(true)}
              >
                <RefreshCw
                  className={cn(
                    "size-4",
                    status === "loading" ? "animate-spin" : "",
                  )}
                  aria-hidden
                />
              </Button>
            </Tooltip>
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

        <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
          {status === "idle" || (status === "loading" && !hasLoaded) ? (
            <TodayAppointmentsSkeleton />
          ) : status === "error" ? (
            <div className="p-5">
              <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive-muted/40 px-4 py-8 text-center">
                <p className="text-sm font-medium text-destructive-foreground">
                  Não foi possível carregar os pacientes do dia.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-4"
                  onClick={() => void loadAppointments(true)}
                >
                  Tentar novamente
                </Button>
              </div>
            </div>
          ) : appointments.length ? (
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

function TodayAppointmentsSkeleton() {
  return (
    <div className="divide-y divide-border" role="status">
      <span className="sr-only">Carregando pacientes do dia</span>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex gap-3 px-5 py-4">
          <div className="grid w-12 shrink-0 content-start gap-2">
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-3 w-8" />
          </div>
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
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
