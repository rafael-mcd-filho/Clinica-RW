"use client";

import {
  Fragment,
  useActionState,
  createContext,
  useEffect,
  useContext,
  useState,
  useTransition,
} from "react";
import {
  CalendarDots as CalendarClock,
  Check,
  Clock as Clock3,
  UserCheck,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  changeAppointmentStatus,
  loadWaitlistCandidatesForAppointment,
  rescheduleAppointment,
  type AgendaActionState,
  type WaitlistCandidate,
} from "./actions";
import { availableAppointmentStatuses } from "@/lib/agenda/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  CancellationReasonFields,
  emptyCancellationReason,
  formatCancellationReason,
  isCancellationReasonComplete,
} from "@/components/agenda/cancellation-reason";
import { WaitlistSuggestionModal } from "@/components/agenda/waitlist-suggestion-modal";
import { Input } from "@/components/ui/field";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { defaultAgendaTimeZone } from "@/lib/agenda/range";

const initialState: AgendaActionState = {};

export const AgendaTimeZoneContext = createContext(defaultAgendaTimeZone);

export function useAgendaTimeZone() {
  return useContext(AgendaTimeZoneContext);
}

export function DateTimeField({
  name,
  label,
  defaultValue,
  required,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  const timeZone = useAgendaTimeZone();
  const parsed = splitDateTimeValue(defaultValue, timeZone);
  const [date, setDate] = useState(parsed.date);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const normalizedHour = normalizeTimePart(hour, 23);
  const normalizedMinute = normalizeTimePart(minute, 59);
  const value = date ? `${date}T${normalizedHour}:${normalizedMinute}` : "";

  return (
    <label className={`grid gap-2 text-sm font-medium ${className ?? ""}`}>
      {label}
      <input type="hidden" name={name} value={value} />
      <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_5.5rem_5.5rem]">
        <DatePickerInput
          name={`${name}_date`}
          value={date}
          onValueChange={setDate}
          required={required}
          ariaLabel={`${label}: data`}
          className="w-full"
          todayValue={localDateKey(new Date().toISOString(), timeZone)}
        />
        <TimeInput
          value={hour}
          onChange={setHour}
          onBlur={() => setHour(normalizedHour)}
          max={23}
          ariaLabel={`${label}: hora`}
        />
        <TimeInput
          value={minute}
          onChange={setMinute}
          onBlur={() => setMinute(normalizedMinute)}
          max={59}
          ariaLabel={`${label}: minuto`}
        />
      </div>
    </label>
  );
}

export function TimeInput({
  value,
  onChange,
  onBlur,
  max,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  max: number;
  ariaLabel: string;
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(event) =>
        onChange(event.target.value.replace(/\D/g, "").slice(0, 2))
      }
      onBlur={onBlur}
      aria-label={ariaLabel}
      maxLength={2}
      placeholder={max === 23 ? "hh" : "mm"}
      className="w-full text-center tabular-nums"
    />
  );
}

export function StatusActions({
  appointmentId,
  status,
  startAt,
  hideInProgressAction = false,
  hideAttendedAction = false,
  fullLabels = false,
}: {
  appointmentId: string;
  status: string;
  startAt: string;
  hideInProgressAction?: boolean;
  hideAttendedAction?: boolean;
  /** No rodapé do modal, "Cancelar" sozinho lê como "fechar a janela" e
      "Faltou" descreve em vez de agir: lá os botões dizem o que fazem. Nos
      cards da grade não há espaço. */
  fullLabels?: boolean;
}) {
  if (["attended", "no_show", "cancelled"].includes(status)) return null;
  // Todas as transições que o banco aceita (Raio-X A4): chegada direta sem
  // confirmação e falta antes do check-in também são caminhos válidos.
  const statusActionLabels: Record<
    string,
    [string, string, React.ComponentType<{ className?: string }>]
  > = {
    confirmed: ["Confirmar", "Confirmar presença", Check],
    waiting: ["Check-in", "Registrar chegada", UserCheck],
    in_progress: ["Iniciar", "Iniciar atendimento", Clock3],
    attended: ["Finalizar", "Finalizar atendimento", Check],
    no_show: ["Faltou", "Registrar falta", X],
    cancelled: ["Cancelar", "Cancelar agendamento", X],
  };
  const visibleActions = availableAppointmentStatuses(status, {
    startThroughEncounter: hideInProgressAction,
    finishThroughEncounter: hideAttendedAction,
  })
    .filter((next) => statusActionLabels[next])
    .map(
      (next) =>
        [
          next,
          statusActionLabels[next][fullLabels ? 1 : 0],
          statusActionLabels[next][2],
        ] as const,
    );
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <RescheduleForm appointmentId={appointmentId} startAt={startAt} />
      {visibleActions.map(([next, label, Icon]) => (
        <StatusActionForm
          key={String(next)}
          appointmentId={appointmentId}
          startAt={startAt}
          nextStatus={String(next)}
          label={String(label)}
          icon={typeof Icon === "string" ? undefined : Icon}
          destructive={next === "cancelled" || next === "no_show"}
          requiresConfirmation={
            next === "cancelled" || next === "no_show" || next === "attended"
          }
        />
      ))}
    </div>
  );
}

export function StatusActionForm({
  appointmentId,
  startAt,
  destructive,
  icon: Icon,
  label,
  nextStatus,
  requiresConfirmation,
}: {
  appointmentId: string;
  startAt: string;
  destructive: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  nextStatus: string;
  requiresConfirmation: boolean;
}) {
  const timeZone = useAgendaTimeZone();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [cancelReason, setCancelReason] = useState(emptyCancellationReason);
  const [waitlistCandidates, setWaitlistCandidates] = useState<
    WaitlistCandidate[] | null
  >(null);

  async function updateStatus() {
    setError(undefined);
    const result = await changeAppointmentStatus(
      appointmentId,
      nextStatus,
      initialState,
      nextStatus === "cancelled"
        ? formatCancellationReason(cancelReason)
        : undefined,
    );
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return false;
    }
    if (result.success) toast.success(result.success);

    // Cancelamento e falta abrem um horário. É aqui que a fila de espera deixa
    // de ser um caderno que ninguém abre: quem cabe naquele horário aparece
    // sozinho, sem depender de alguém lembrar de conferir.
    if (nextStatus === "cancelled" || nextStatus === "no_show") {
      const candidates =
        await loadWaitlistCandidatesForAppointment(appointmentId);
      if (candidates.ok && candidates.data?.length) {
        setWaitlistCandidates(candidates.data);
      }
    }
    return true;
  }

  function closeConfirmation() {
    setConfirming(false);
    setError(undefined);
    setCancelReason(emptyCancellationReason);
  }

  const waitlistSuggestion = waitlistCandidates ? (
    <WaitlistSuggestionModal
      candidates={waitlistCandidates}
      slotLabel={formatSlotLabel(startAt, timeZone)}
      onClose={() => setWaitlistCandidates(null)}
    />
  ) : null;

  if (requiresConfirmation) {
    const isFinalizing = nextStatus === "attended";
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant={destructive ? "destructive-ghost" : "primary"}
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
          {label}
        </Button>
        <ConfirmDialog
          open={confirming}
          onClose={closeConfirmation}
          title={
            isFinalizing
              ? "Finalizar atendimento?"
              : nextStatus === "cancelled"
                ? "Cancelar agendamento?"
                : "Registrar falta?"
          }
          description={
            isFinalizing
              ? "O agendamento será marcado como atendido. Confirme apenas após concluir o atendimento."
              : nextStatus === "cancelled"
                ? "O agendamento será cancelado e deixará de ocupar este horário."
                : "O atendimento será marcado como falta no histórico do paciente."
          }
          confirmLabel={
            isFinalizing
              ? "Finalizar atendimento"
              : nextStatus === "cancelled"
                ? "Cancelar agendamento"
                : "Registrar falta"
          }
          pendingLabel="Atualizando..."
          destructive={destructive}
          error={error}
          confirmDisabled={
            nextStatus === "cancelled" &&
            !isCancellationReasonComplete(cancelReason)
          }
          onConfirm={updateStatus}
        >
          {nextStatus === "cancelled" ? (
            <CancellationReasonFields
              value={cancelReason}
              onChange={setCancelReason}
            />
          ) : null}
        </ConfirmDialog>
        {waitlistSuggestion}
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            await updateStatus();
          });
        }}
      >
        {Icon ? <Icon className="size-3.5" /> : null}
        {pending ? "Atualizando..." : label}
      </Button>
      {waitlistSuggestion}
    </>
  );
}

export function formatSlotLabel(startAt: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(startAt));
}

export function RescheduleForm({
  appointmentId,
  startAt,
}: {
  appointmentId: string;
  startAt: string;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = rescheduleAppointment.bind(null, appointmentId);
  const [state, action, pending] = useActionState(boundAction, initialState);
  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);
  if (!open)
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        <CalendarClock className="size-3.5" />
        Remarcar
      </Button>
    );
  return (
    <Card className="fixed inset-x-4 top-28 z-50 mx-auto max-w-md text-left shadow-[var(--shadow-lg)]">
      <CardHeader className="flex flex-row items-center justify-between">
        <h2 className="font-semibold">Remarcar atendimento</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar remarcação"
          onClick={() => setOpen(false)}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <DateTimeField
            name="start_at"
            label="Nova data e hora"
            defaultValue={startAt}
            required
          />
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Confirmar remarcação"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function localDateKey(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
  }).format(new Date(value));
}

export function localDateFromKey(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

export function formatFullDay(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(localDateFromKey(value));
}

export function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function formatDateTimeInput(value: string, timeZone: string) {
  return new Date(value)
    .toLocaleString("sv-SE", { timeZone })
    .replace(" ", "T")
    .slice(0, 16);
}

export function normalizeTimePart(value: string, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "00";
  return String(Math.min(Math.max(Math.trunc(parsed), 0), max)).padStart(
    2,
    "0",
  );
}

export function splitDateTimeValue(
  value: string | undefined,
  timeZone: string,
) {
  if (!value) {
    return { date: "", hour: "08", minute: "00" };
  }

  const [date = "", time = ""] = formatDateTimeInput(value, timeZone).split(
    "T",
  );
  const [hour = "08", minute = "00"] = time.split(":");

  return {
    date,
    hour: normalizeTimePart(hour, 23),
    minute: normalizeTimePart(minute, 59),
  };
}
