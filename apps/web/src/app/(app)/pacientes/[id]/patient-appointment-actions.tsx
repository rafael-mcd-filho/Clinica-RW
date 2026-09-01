"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDots as CalendarDays,
  Check,
  Clock,
  FileText,
  UserCheck,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { changeAppointmentStatus } from "../../agenda/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Modal } from "@/components/ui/modal";

type StatusVariant =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "destructive";

type PatientAppointmentActionsProps = {
  id: string;
  procedureName: string;
  status: string;
  statusLabel: string;
  statusVariant: StatusVariant;
  dateTimeLabel: string;
  professionalName: string;
  insuranceName: string | null;
  agendaHref: string;
  canEditAgenda: boolean;
  encounterHref?: string;
};

type AppointmentAction = {
  nextStatus: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresConfirmation?: boolean;
  destructive?: boolean;
};

const actionsByStatus: Record<string, AppointmentAction[]> = {
  scheduled: [
    { nextStatus: "confirmed", label: "Confirmar", icon: Check },
    {
      nextStatus: "cancelled",
      label: "Cancelar",
      icon: X,
      requiresConfirmation: true,
      destructive: true,
    },
  ],
  confirmed: [
    { nextStatus: "waiting", label: "Check-in", icon: UserCheck },
    {
      nextStatus: "cancelled",
      label: "Cancelar",
      icon: X,
      requiresConfirmation: true,
      destructive: true,
    },
  ],
  waiting: [
    { nextStatus: "in_progress", label: "Iniciar", icon: Clock },
    {
      nextStatus: "no_show",
      label: "Faltou",
      icon: X,
      requiresConfirmation: true,
      destructive: true,
    },
  ],
  in_progress: [
    {
      nextStatus: "attended",
      label: "Finalizar",
      icon: Check,
      requiresConfirmation: true,
    },
  ],
};

export function PatientAppointmentActions({
  id,
  procedureName,
  status,
  statusLabel,
  statusVariant,
  dateTimeLabel,
  professionalName,
  insuranceName,
  agendaHref,
  canEditAgenda,
  encounterHref,
}: PatientAppointmentActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<AppointmentAction | null>(
    null,
  );
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>();
  const availableActions = canEditAgenda ? (actionsByStatus[status] ?? []) : [];

  function closeModal() {
    if (pendingStatus) return;
    setConfirmation(null);
    setActionError(undefined);
    setOpen(false);
  }

  async function updateStatus(action: AppointmentAction) {
    setActionError(undefined);
    setPendingStatus(action.nextStatus);

    try {
      const result = await changeAppointmentStatus(id, action.nextStatus, {});

      if (result.error) {
        setActionError(result.error);
        toast.error(result.error);
        return false;
      }

      toast.success(result.success ?? "Status do agendamento atualizado.");
      setConfirmation(null);
      setOpen(false);
      router.refresh();
      return true;
    } catch {
      const message = "Não foi possível atualizar o agendamento.";
      setActionError(message);
      toast.error(message);
      return false;
    } finally {
      setPendingStatus(null);
    }
  }

  const confirmationCopy = confirmation
    ? getConfirmationCopy(confirmation.nextStatus)
    : null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Abrir detalhes e ações de ${procedureName}, ${dateTimeLabel}`}
        onClick={() => setOpen(true)}
        className="flex w-full flex-col justify-between gap-3 rounded-md border border-border px-3 py-3 text-left transition-[background-color,border-color,box-shadow] hover:border-border-strong hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 sm:flex-row sm:items-center"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">
              {procedureName}
            </span>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {dateTimeLabel} · {professionalName}
            {insuranceName ? ` · ${insuranceName}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-sm font-medium text-muted-foreground">
          Ver ações
        </span>
      </button>

      <Modal
        open={open}
        onClose={closeModal}
        title="Detalhes do agendamento"
        description={`${procedureName} · ${statusLabel}`}
      >
        <div className="grid gap-5">
          <section className="grid gap-3 rounded-md border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CalendarDays
                  className="size-5 text-primary"
                  aria-hidden="true"
                />
                <h3 className="font-semibold">{procedureName}</h3>
              </div>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
            </div>

            <DetailItem label="Data e horário" value={dateTimeLabel} />
            <DetailItem label="Profissional" value={professionalName} />
            <DetailItem
              label="Convênio"
              value={insuranceName || "Particular"}
            />
          </section>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href={agendaHref}>
                <CalendarDays className="size-4" aria-hidden="true" />
                Ver na agenda
              </Link>
            </Button>
            {encounterHref ? (
              <Button asChild variant="secondary">
                <Link href={encounterHref}>
                  <FileText className="size-4" aria-hidden="true" />
                  Abrir prontuário
                </Link>
              </Button>
            ) : null}
          </div>

          {availableActions.length ? (
            <section className="grid gap-3 border-t border-border pt-4">
              <div>
                <h3 className="font-semibold">Ações do agendamento</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Atualize o andamento deste compromisso.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableActions.map((action) => {
                  const Icon = action.icon;
                  const pending = pendingStatus === action.nextStatus;

                  return (
                    <Button
                      key={action.nextStatus}
                      type="button"
                      size="sm"
                      variant={
                        action.destructive ? "destructive-ghost" : "primary"
                      }
                      disabled={Boolean(pendingStatus)}
                      onClick={() => {
                        if (action.requiresConfirmation) {
                          setActionError(undefined);
                          setConfirmation(action);
                          return;
                        }
                        void updateStatus(action);
                      }}
                    >
                      <Icon className="size-3.5" aria-hidden="true" />
                      {pending ? "Atualizando..." : action.label}
                    </Button>
                  );
                })}
              </div>
              {actionError && !confirmation ? (
                <p className="text-sm text-destructive">{actionError}</p>
              ) : null}
            </section>
          ) : null}
        </div>
      </Modal>

      {confirmation && confirmationCopy ? (
        <ConfirmDialog
          open
          onClose={() => {
            if (!pendingStatus) {
              setConfirmation(null);
              setActionError(undefined);
            }
          }}
          title={confirmationCopy.title}
          description={confirmationCopy.description}
          confirmLabel={confirmationCopy.confirmLabel}
          pendingLabel="Atualizando..."
          destructive={confirmation.destructive}
          pending={pendingStatus === confirmation.nextStatus}
          error={actionError}
          onConfirm={() => updateStatus(confirmation)}
        />
      ) : null}
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border/70 pb-2 last:border-b-0 last:pb-0">
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function getConfirmationCopy(nextStatus: string) {
  if (nextStatus === "cancelled") {
    return {
      title: "Cancelar agendamento?",
      description:
        "O agendamento será cancelado e deixará de ocupar este horário.",
      confirmLabel: "Cancelar agendamento",
    };
  }

  if (nextStatus === "no_show") {
    return {
      title: "Registrar falta?",
      description: "O atendimento será marcado como falta no histórico.",
      confirmLabel: "Registrar falta",
    };
  }

  if (nextStatus === "attended") {
    return {
      title: "Finalizar atendimento?",
      description:
        "O agendamento será marcado como atendido. Confirme apenas após concluir o atendimento.",
      confirmLabel: "Finalizar atendimento",
    };
  }

  return null;
}
