"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDots as CalendarDays,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  FileText,
  UserCheck,
  X,
  XCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { changeAppointmentStatus } from "../../agenda/actions";
import {
  PatientStartEncounterForm,
  type EncounterProfessionalOption,
  type EncounterTemplateOption,
} from "./patient-start-encounter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormError } from "@/components/ui/form-error";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

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
  canStartEncounter: boolean;
  patientId: string;
  professionalId: string;
  professionals: EncounterProfessionalOption[];
  templates: EncounterTemplateOption[];
  encounterStatus?: string;
  encounterHref?: string;
  /** "timeline": linha do histórico do Resumo (data à esquerda). */
  variant?: "card" | "timeline";
  dateLabel?: string;
  timeLabel?: string;
  /** Destaca o mais recente da linha do tempo. */
  highlight?: boolean;
};

const statusIcons: Record<
  string,
  React.ComponentType<{ className?: string; weight?: "bold" | "fill" }>
> = {
  attended: CheckCircle,
  cancelled: XCircle,
  no_show: XCircle,
  confirmed: Check,
  scheduled: Clock,
  waiting: Clock,
  in_progress: Clock,
};

type AppointmentAction = {
  nextStatus: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresConfirmation?: boolean;
  destructive?: boolean;
};

// Os rótulos dizem o que acontece: "Cancelar" sozinho, dentro de um modal, lê
// como "fechar a janela", e "Faltou" descreve em vez de agir. Mesmos textos
// do modal da agenda.
const actionsByStatus: Record<string, AppointmentAction[]> = {
  scheduled: [
    { nextStatus: "confirmed", label: "Confirmar", icon: Check },
    {
      nextStatus: "cancelled",
      label: "Cancelar agendamento",
      icon: X,
      requiresConfirmation: true,
      destructive: true,
    },
  ],
  confirmed: [
    { nextStatus: "waiting", label: "Check-in", icon: UserCheck },
    {
      nextStatus: "cancelled",
      label: "Cancelar agendamento",
      icon: X,
      requiresConfirmation: true,
      destructive: true,
    },
  ],
  waiting: [
    {
      nextStatus: "in_progress",
      label: "Marcar em atendimento",
      icon: Clock,
    },
    {
      nextStatus: "no_show",
      label: "Registrar falta",
      icon: X,
      requiresConfirmation: true,
      destructive: true,
    },
  ],
  in_progress: [
    {
      nextStatus: "attended",
      label: "Marcar como atendido",
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
  canStartEncounter,
  patientId,
  professionalId,
  professionals,
  templates,
  encounterStatus,
  encounterHref,
  variant = "card",
  dateLabel,
  timeLabel,
  highlight = false,
}: PatientAppointmentActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<AppointmentAction | null>(
    null,
  );
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>();
  const canStartThisAppointment =
    canStartEncounter &&
    ["confirmed", "waiting", "in_progress"].includes(status) &&
    encounterStatus !== "finalized" &&
    professionals.some((professional) => professional.id === professionalId);
  const availableActions = canEditAgenda
    ? (actionsByStatus[status] ?? []).filter(
        (action) =>
          !(canStartThisAppointment && action.nextStatus === "in_progress") &&
          !(canStartEncounter && action.nextStatus === "attended"),
      )
    : [];
  const hasActions = availableActions.length > 0 || canStartThisAppointment;

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
  const modalFooter = (
    <div className="grid w-full gap-3">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
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
                {encounterStatus === "draft"
                  ? "Continuar atendimento"
                  : "Abrir prontuário"}
              </Link>
            </Button>
          ) : null}
        </div>

        {availableActions.length ? (
          <div className="flex flex-wrap justify-end gap-2">
            {availableActions.map((action) => {
              const Icon = action.icon;
              const pending = pendingStatus === action.nextStatus;

              return (
                <Button
                  key={action.nextStatus}
                  type="button"
                  size="sm"
                  variant={action.destructive ? "destructive-ghost" : "primary"}
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
        ) : null}
      </div>
      {!confirmation ? <FormError message={actionError} /> : null}
    </div>
  );

  const StatusIcon = statusIcons[status];
  const trigger =
    variant === "timeline" ? (
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${procedureName}, ${dateTimeLabel}, ${statusLabel}. ${
          hasActions ? "Abrir detalhes e ações" : "Abrir detalhes"
        }`}
        onClick={() => setOpen(true)}
        className="group grid w-full grid-cols-[5.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:grid-cols-[5.25rem_minmax(0,1fr)_auto_auto]"
      >
        <span className="grid">
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              highlight ? "text-primary" : "text-foreground",
            )}
          >
            {dateLabel}
          </span>
          <span className="text-caption tabular-nums text-muted-foreground">
            {timeLabel}
          </span>
        </span>
        <span className="grid min-w-0">
          <span className="truncate text-sm font-semibold text-foreground">
            {procedureName}
          </span>
          <span className="truncate text-caption text-muted-foreground">
            {professionalName}
          </span>
        </span>
        <Badge
          variant={statusVariant}
          className="col-start-2 row-start-2 w-fit gap-1 rounded-full sm:col-start-auto sm:row-start-auto"
        >
          {StatusIcon ? (
            <StatusIcon className="size-3.5" weight="bold" />
          ) : null}
          {statusLabel}
        </Badge>
        <CaretRight
          className="col-start-3 row-span-2 row-start-1 size-4 text-muted-foreground transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5 sm:col-start-auto sm:row-span-1 sm:row-start-auto"
          aria-hidden="true"
        />
      </button>
    ) : null;

  return (
    <>
      {trigger ?? (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`${
            hasActions ? "Abrir detalhes e ações" : "Abrir detalhes"
          } de ${procedureName}, ${dateTimeLabel}`}
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
          {/* Atendido, cancelado, falta ou sem permissão de editar: o modal
            não tem ação nenhuma, e "Ver ações" prometia o que não há. */}
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {hasActions ? "Ver ações" : "Ver detalhes"}
          </span>
        </button>
      )}

      <Modal
        open={open}
        onClose={closeModal}
        title="Detalhes do agendamento"
        description={`${procedureName} · ${statusLabel}`}
        footer={modalFooter}
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
              value={insuranceName || "Sem convênio"}
            />
          </section>

          {canStartThisAppointment && !encounterHref ? (
            <section className="grid gap-3 border-t border-border pt-4">
              <div>
                <h3 className="font-semibold">Atendimento clínico</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escolha a ficha que será usada neste atendimento.
                </p>
              </div>
              <PatientStartEncounterForm
                patientId={patientId}
                professionalId={professionalId}
                professionals={professionals}
                templates={templates}
                appointmentId={id}
              />
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
