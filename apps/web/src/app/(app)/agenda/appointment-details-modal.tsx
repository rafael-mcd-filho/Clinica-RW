"use client";

import {
  Fragment,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  CalendarDots as CalendarClock,
  FileText,
  Buildings,
  CreditCard,
  Eye,
  EyeSlash,
  CurrencyDollar,
  Door,
  IdentificationCard,
  Info,
  Lightning,
  PencilSimple,
  Printer,
  ShieldCheck,
  WhatsappLogo,
  EnvelopeSimple as Mail,
  Phone,
  Stethoscope,
  UserCircle as UserRound,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  changeAppointmentStatus,
  loadWaitlistCandidatesForAppointment,
  startAppointmentEncounter,
  type AgendaActionState,
  type WaitlistCandidate,
  updateAppointmentPaymentMethod,
  updateAppointmentPrice,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import detailsStyles from "./appointment-details.module.css";
import {
  appointmentStatusLabels as statusLabel,
  appointmentStatusDescriptions,
  availableAppointmentStatuses,
} from "@/lib/agenda/status";
import { Button } from "@/components/ui/button";
import {
  CancellationReasonFields,
  emptyCancellationReason,
  formatCancellationReason,
  isCancellationReasonComplete,
} from "@/components/agenda/cancellation-reason";
import { WaitlistSuggestionModal } from "@/components/agenda/waitlist-suggestion-modal";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/dialog";
import { buildAgendaEncounterHref } from "@/lib/agenda/range";
import { cn } from "@/lib/utils";
import { formatCPF, formatPhoneBR, maskCPF } from "@/lib/validation/br";
import { type AppointmentReminder } from "@/lib/agenda/reminder-status";
import { ReminderLine } from "@/components/agenda/reminder-indicator";
import { TelehealthButton } from "./telehealth-button";
import type { AgendaData } from "./agenda-board";
import {
  useAgendaTimeZone,
  localDateKey,
  formatFullDay,
  formatTime,
  StatusActions,
  formatSlotLabel,
} from "./agenda-shared";

const initialState: AgendaActionState = {};

export function AppointmentDetailsModal({
  appointment,
  patient,
  professional,
  procedure,
  schedule,
  unit,
  room,
  insurance,
  paymentMethods,
  clinicalTemplates,
  encounter,
  reminder,
  canEdit,
  canViewPatient,
  canViewClinical,
  canStartEncounter,
  returnTo,
  onClose,
}: {
  appointment: AgendaData["appointments"][number];
  patient?: AgendaData["patients"][number];
  professional?: AgendaData["professionals"][number];
  procedure?: AgendaData["procedures"][number];
  schedule?: AgendaData["schedules"][number];
  unit?: AgendaData["units"][number];
  room?: AgendaData["rooms"][number];
  insurance?: AgendaData["insurances"][number];
  paymentMethods: AgendaData["paymentMethods"];
  clinicalTemplates: AgendaData["clinicalTemplates"];
  encounter?: AgendaData["encounters"][number];
  reminder?: AppointmentReminder;
  canEdit: boolean;
  canViewPatient: boolean;
  canViewClinical: boolean;
  canStartEncounter: boolean;
  returnTo: string;
  onClose: () => void;
}) {
  const [editingPrice, setEditingPrice] = useState(false);
  const timeZone = useAgendaTimeZone();
  const patientName = patient?.social_name || patient?.full_name || "Paciente";
  const appointmentStatus =
    statusLabel[appointment.status] ?? appointment.status;
  const canStartClinicalEncounter =
    canStartEncounter &&
    ["confirmed", "waiting", "in_progress"].includes(appointment.status) &&
    encounter?.status !== "finalized";
  const modalFooter = (
    <div className="flex w-full flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-wrap gap-2">
        {canViewPatient && patient ? (
          <Button asChild variant="secondary">
            <Link href={`/pacientes/${patient.id}`}>
              <UserRound className="size-4" aria-hidden="true" />
              Ver paciente
            </Link>
          </Button>
        ) : null}
        {canViewClinical && encounter?.status === "finalized" ? (
          <Button asChild variant="secondary">
            <Link href={buildAgendaEncounterHref(encounter.id, returnTo)}>
              <FileText className="size-4" aria-hidden="true" />
              Abrir prontuário
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {canEdit ? (
          <StatusActions
            appointmentId={appointment.id}
            status={appointment.status}
            startAt={appointment.start_at}
            hideInProgressAction={canStartClinicalEncounter}
            hideAttendedAction={
              canStartEncounter && encounter?.status === "draft"
            }
            fullLabels
          />
        ) : null}
        {canStartClinicalEncounter ? (
          <StartEncounterForm
            appointmentId={appointment.id}
            returnTo={returnTo}
            templates={clinicalTemplates}
            continuing={encounter?.status === "draft"}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Detalhes do agendamento"
      description={`${patientName} · ${appointmentStatus}`}
      className={cn(
        "max-w-6xl [&>header]:border-b-0 [&>header]:pb-0 [&>header]:pt-6 [&>header]:sm:px-6 [&>header_h2]:text-display",
        detailsStyles.details,
      )}
      footer={modalFooter}
    >
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
        <div className="grid min-w-0 gap-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar name={patientName} size="lg" />
                <div className="min-w-0">
                  <h3 className="break-words text-heading font-semibold">
                    {patientName}
                  </h3>
                  {patient?.social_name ? (
                    <p className="mt-0.5 text-caption text-muted-foreground">
                      Nome civil: {patient.full_name}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    appointment.status === "cancelled" ||
                    appointment.status === "no_show"
                      ? "destructive"
                      : appointment.status === "confirmed" ||
                          appointment.status === "attended"
                        ? "success"
                        : appointment.status === "waiting"
                          ? "warning"
                          : "primary"
                  }
                  className="gap-2 rounded-full px-3 py-2"
                >
                  <CalendarClock className="size-4" aria-hidden="true" />
                  {appointmentStatus}
                </Badge>
                {procedure &&
                /tele|v[ií]deo|online/i.test(procedure.name) &&
                !["cancelled", "no_show", "attended"].includes(
                  appointment.status,
                ) ? (
                  <TelehealthButton
                    appointmentId={appointment.id}
                    patientPhone={patient?.whatsapp || patient?.phone || null}
                  />
                ) : null}
                {/* Raio-X V9: falar com o paciente sem descer até os contatos. */}
                {patient?.whatsapp || patient?.phone ? (
                  <Button asChild variant="secondary" size="sm">
                    <a
                      href={appointmentWhatsappHref(
                        patient.whatsapp || patient.phone || "",
                        patientName,
                        appointment.start_at,
                        timeZone,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <WhatsappLogo className="size-4" aria-hidden="true" />
                      WhatsApp
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {/* Sem a permissão o CPF nem chega ao navegador; com ela,
                  aparece mascarado até alguém pedir para ver. */}
              {patient && "cpf" in patient ? (
                <SummaryItem
                  label="CPF"
                  icon={IdentificationCard}
                  value={
                    patient.cpf ? (
                      <MaskedCpfValue cpf={patient.cpf} />
                    ) : (
                      "Não informado"
                    )
                  }
                />
              ) : null}
              <SummaryItem
                label="Telefone"
                icon={Phone}
                value={
                  patient?.phone || patient?.whatsapp ? (
                    <a
                      className="hover:text-primary hover:underline"
                      href={`tel:${patient.phone || patient.whatsapp}`}
                    >
                      {formatPhoneBR(patient.phone || patient.whatsapp || "")}
                    </a>
                  ) : (
                    "Não informado"
                  )
                }
              />
              <SummaryItem
                label="WhatsApp"
                icon={WhatsappLogo}
                value={
                  patient?.whatsapp ? (
                    <a
                      className="hover:text-primary hover:underline"
                      href={`https://wa.me/${patient.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {formatPhoneBR(patient.whatsapp)}
                    </a>
                  ) : (
                    "Não informado"
                  )
                }
              />
              <SummaryItem
                label="E-mail"
                icon={Mail}
                value={
                  patient?.email ? (
                    <a
                      className="hover:text-primary hover:underline"
                      href={`mailto:${patient.email}`}
                    >
                      <EmailText email={patient.email} />
                    </a>
                  ) : (
                    "Não informado"
                  )
                }
              />
            </div>
            {reminder &&
            (appointment.status === "scheduled" ||
              appointment.status === "confirmed") ? (
              <ReminderLine
                reminder={reminder}
                timeZone={timeZone}
                className="mt-4"
              />
            ) : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <DetailsSectionHeading
              icon={CalendarClock}
              title="Resumo do atendimento"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary-muted/60 p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary">
                  <CalendarClock className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-body-sm font-medium">
                    {formatFullDay(
                      localDateKey(appointment.start_at, timeZone),
                    )}
                  </p>
                  <p className="mt-1 text-body-sm tabular-nums text-muted-foreground">
                    {formatTime(appointment.start_at, timeZone)} –{" "}
                    {formatTime(appointment.end_at, timeZone)} ·{" "}
                    {Math.round(
                      (new Date(appointment.end_at).getTime() -
                        new Date(appointment.start_at).getTime()) /
                        60000,
                    )}{" "}
                    min
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                className="text-primary"
              >
                <CalendarClock className="size-4" aria-hidden="true" />
                Ver na agenda
              </Button>
            </div>
            <div className="mt-5 grid gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              <SummaryItem
                label="Procedimento"
                value={procedure?.name ?? "Procedimento"}
                icon={Stethoscope}
              />
              <SummaryItem
                label="Profissional"
                value={professional?.name ?? "Não informado"}
                icon={UserRound}
              />
              <SummaryItem
                label="Agenda"
                value={schedule?.name ?? "Agenda"}
                icon={CalendarClock}
              />
              <SummaryItem
                label="Unidade"
                value={unit?.name ?? "Não informada"}
                icon={Buildings}
              />
              <SummaryItem
                label="Sala"
                value={room?.name ?? "Não informada"}
                icon={Door}
              />
              <SummaryItem
                label="Convênio"
                value={insurance?.name ?? "Sem convênio"}
                icon={ShieldCheck}
              />
            </div>
            {appointment.is_extra ? (
              <Badge variant="warning" className="mt-4">
                Encaixe
              </Badge>
            ) : null}
            <div className="mt-5 flex items-start gap-3 border-t border-border pt-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
                <FileText className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-body-sm font-medium">Observações</h4>
                <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-body-sm text-secondary-foreground">
                  {appointment.notes || "Nenhuma observação registrada."}
                </p>
              </div>
            </div>
          </section>
        </div>

        <section className="min-w-0 rounded-xl border border-border bg-card p-5">
          <DetailsSectionHeading
            icon={CreditCard}
            title="Financeiro e ações"
            description="Informações de pagamento e ações do agendamento."
          />
          <div className="mt-5 rounded-lg bg-success-muted/40 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-muted text-success-foreground">
                <CurrencyDollar className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-secondary-foreground">
                  Valor do atendimento
                </p>
                <p className="mt-1 text-display font-semibold tabular-nums">
                  {appointment.price == null
                    ? "Não informado"
                    : formatMoney(appointment.price)}
                </p>
                {appointment.list_price != null ? (
                  <p className="mt-1 text-caption text-muted-foreground">
                    Preço de tabela: {formatMoney(appointment.list_price)}
                  </p>
                ) : null}
                {appointmentPriceHint(appointment) ? (
                  <p className="mt-1 text-caption text-muted-foreground">
                    {appointmentPriceHint(appointment)}
                  </p>
                ) : null}
              </div>
            </div>
            {canEdit ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-expanded={editingPrice}
                onClick={() => setEditingPrice((value) => !value)}
                className="mt-3 text-primary"
              >
                <PencilSimple className="size-3.5" aria-hidden="true" />
                {editingPrice ? "Fechar edição" : "Editar valor"}
              </Button>
            ) : null}
          </div>
          {canEdit && editingPrice ? (
            <div className="mt-3">
              <AppointmentPriceForm
                appointmentId={appointment.id}
                price={appointment.price ?? null}
                listPrice={appointment.list_price ?? null}
                priceNote={appointment.price_note ?? null}
                onSaved={() => setEditingPrice(false)}
              />
            </div>
          ) : null}
          <div className="mt-5">
            {canEdit ? (
              <PaymentMethodForm
                appointmentId={appointment.id}
                paymentMethodId={appointment.payment_method_id}
                paymentMethods={paymentMethods}
              />
            ) : null}
            <p className={canEdit ? detailsStyles.printOnly : "text-body-sm"}>
              Forma de pagamento:{" "}
              {paymentMethods.find(
                (method) => method.id === appointment.payment_method_id,
              )?.name ?? "Não selecionada"}
            </p>
          </div>
          <div className="mt-5 border-t border-border pt-5">
            <AppointmentStatusSelector
              appointment={appointment}
              canEdit={canEdit}
              startThroughEncounter={canStartClinicalEncounter}
              finishThroughEncounter={
                canStartEncounter && encounter?.status === "draft"
              }
            />
          </div>
          <div
            className={cn(
              "mt-5 border-t border-border pt-4",
              detailsStyles.screenOnly,
            )}
          >
            <h4 className="mb-3 flex items-center gap-2 text-body-sm font-medium">
              <Lightning className="size-4 text-primary" aria-hidden="true" />
              Ações rápidas
            </h4>
            <Button
              type="button"
              variant="secondary"
              onClick={() => window.print()}
              className="w-full"
            >
              <Printer className="size-4 text-primary" aria-hidden="true" />
              Imprimir
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

export function DetailsSectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="text-heading-sm font-semibold">{title}</h3>
        {description ? (
          <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AppointmentStatusSelector({
  appointment,
  canEdit,
  startThroughEncounter,
  finishThroughEncounter,
}: {
  appointment: AgendaData["appointments"][number];
  canEdit: boolean;
  startThroughEncounter: boolean;
  finishThroughEncounter: boolean;
}) {
  const timeZone = useAgendaTimeZone();
  const [selection, setSelection] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [cancelReason, setCancelReason] = useState(emptyCancellationReason);
  const [waitlistCandidates, setWaitlistCandidates] = useState<
    WaitlistCandidate[] | null
  >(null);
  const options = availableAppointmentStatuses(appointment.status, {
    startThroughEncounter,
    finishThroughEncounter,
  });
  const selectedStatus =
    selection?.from === appointment.status && options.includes(selection.to)
      ? selection.to
      : appointment.status;
  const hasChange = selectedStatus !== appointment.status;
  const destructive =
    selectedStatus === "cancelled" || selectedStatus === "no_show";

  async function applyStatus() {
    if (!canEdit || !hasChange || !options.includes(selectedStatus))
      return false;
    setError(undefined);
    try {
      const result = await changeAppointmentStatus(
        appointment.id,
        selectedStatus,
        initialState,
        selectedStatus === "cancelled"
          ? formatCancellationReason(cancelReason)
          : undefined,
      );
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return false;
      }
      if (result.success) toast.success(result.success);
      setSelection(null);
      if (destructive) {
        const candidates = await loadWaitlistCandidatesForAppointment(
          appointment.id,
        );
        if (candidates.ok && candidates.data?.length)
          setWaitlistCandidates(candidates.data);
      }
      return true;
    } catch {
      setError("Não foi possível atualizar o status. Tente novamente.");
      return false;
    }
  }

  return (
    <div className="grid gap-3">
      <label
        className={cn(
          "grid gap-2 text-body-sm font-medium",
          detailsStyles.screenOnly,
        )}
      >
        Status do agendamento
        <Select
          value={selectedStatus}
          onValueChange={(to) => {
            setSelection({ from: appointment.status, to });
            setError(undefined);
          }}
          disabled={!canEdit || !options.length || pending || confirming}
          aria-label="Status do agendamento"
          className="h-11 font-medium text-primary"
        >
          <option value={appointment.status}>
            {statusLabel[appointment.status] ?? appointment.status}
          </option>
          {options.map((status) => (
            <option key={status} value={status}>
              {statusLabel[status]}
            </option>
          ))}
        </Select>
      </label>
      <p className={detailsStyles.printOnly}>
        Status: {statusLabel[appointment.status] ?? appointment.status}
      </p>
      <div className="flex items-start gap-2 rounded-lg bg-primary-muted/70 p-3 text-body-sm leading-relaxed text-secondary-foreground">
        <Info
          className="mt-0.5 size-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <p>
          {appointmentStatusDescriptions[appointment.status] ??
            "Status atual do agendamento."}
          {finishThroughEncounter
            ? " Conclua o prontuário para finalizar o atendimento."
            : startThroughEncounter && appointment.status !== "in_progress"
              ? " Use Iniciar atendimento para abrir a ficha clínica."
              : ""}
        </p>
      </div>
      {canEdit && hasChange ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            if (destructive || selectedStatus === "attended")
              setConfirming(true);
            else
              startTransition(async () => {
                await applyStatus();
              });
          }}
        >
          {pending ? "Atualizando..." : "Aplicar status"}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming && hasChange}
        onClose={() => {
          setConfirming(false);
          setError(undefined);
        }}
        title={
          selectedStatus === "cancelled"
            ? "Cancelar agendamento?"
            : selectedStatus === "no_show"
              ? "Registrar falta?"
              : "Finalizar atendimento?"
        }
        description={
          selectedStatus === "cancelled"
            ? "O agendamento será cancelado e deixará de ocupar este horário."
            : selectedStatus === "no_show"
              ? "O atendimento será marcado como falta no histórico do paciente."
              : "O agendamento será marcado como atendido. Confirme apenas após concluir o atendimento."
        }
        confirmLabel={
          selectedStatus === "cancelled"
            ? "Cancelar agendamento"
            : selectedStatus === "no_show"
              ? "Registrar falta"
              : "Finalizar atendimento"
        }
        pendingLabel="Atualizando..."
        destructive={destructive}
        error={error}
        confirmDisabled={
          selectedStatus === "cancelled" &&
          !isCancellationReasonComplete(cancelReason)
        }
        onConfirm={async () => {
          const success = await applyStatus();
          if (success) {
            setConfirming(false);
            setCancelReason(emptyCancellationReason);
          }
          return success;
        }}
      >
        {selectedStatus === "cancelled" ? (
          <CancellationReasonFields
            value={cancelReason}
            onChange={setCancelReason}
          />
        ) : null}
      </ConfirmDialog>
      {waitlistCandidates ? (
        <WaitlistSuggestionModal
          candidates={waitlistCandidates}
          slotLabel={formatSlotLabel(appointment.start_at, timeZone)}
          onClose={() => setWaitlistCandidates(null)}
        />
      ) : null}
    </div>
  );
}

export function PaymentMethodForm({
  appointmentId,
  paymentMethodId,
  paymentMethods,
}: {
  appointmentId: string;
  paymentMethodId: string | null;
  paymentMethods: AgendaData["paymentMethods"];
}) {
  const boundAction = updateAppointmentPaymentMethod.bind(null, appointmentId);
  const [state, action, pending] = useActionState(boundAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  // Raio-X V9: a forma de pagamento salva ao escolher, sem um segundo
  // botão "Salvar" no mesmo painel do valor.
  return (
    <form ref={formRef} action={action} className="grid gap-2">
      <label className="grid gap-2 text-sm font-medium">
        <span className="flex items-center gap-2">
          <CreditCard className="size-4 text-primary" aria-hidden="true" />
          Forma de pagamento
        </span>
        <Select
          name="payment_method_id"
          defaultValue={paymentMethodId ?? ""}
          disabled={pending}
          aria-label="Forma de pagamento do agendamento"
          allowEmptyOption
          onValueChange={() => {
            // Depois do render, para o campo oculto já ter o valor novo.
            requestAnimationFrame(() => formRef.current?.requestSubmit());
          }}
        >
          <option value="">Não selecionada</option>
          {paymentMethods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </Select>
      </label>
      {pending ? (
        <p role="status" className="text-caption text-muted-foreground">
          Salvando...
        </p>
      ) : null}
    </form>
  );
}

export function StartEncounterForm({
  appointmentId,
  returnTo,
  templates,
  continuing,
}: {
  appointmentId: string;
  returnTo: string;
  templates: AgendaData["clinicalTemplates"];
  continuing: boolean;
}) {
  const boundAction = startAppointmentEncounter.bind(null, appointmentId);
  const [state, action, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      action={action}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <input type="hidden" name="return_to" value={returnTo} readOnly />
      {continuing ? (
        <div className="min-w-56 rounded-md border border-border bg-muted px-3 py-2">
          <p className="text-sm font-medium">Ficha clínica já criada</p>
          <p className="text-xs text-muted-foreground">
            O conteúdo existente será preservado.
          </p>
          <input type="hidden" name="template_version_id" value="" />
        </div>
      ) : (
        <label className="grid min-w-56 gap-1.5 text-sm font-medium">
          Ficha clínica
          <Select
            name="template_version_id"
            defaultValue={
              templates.find((template) => template.is_default)?.version_id ??
              templates[0]?.version_id ??
              ""
            }
            required
            disabled={pending}
          >
            {!templates.length ? (
              <option value="">Nenhuma ficha disponível</option>
            ) : null}
            {templates.map((template) => (
              <option key={template.version_id} value={template.version_id}>
                {template.name}
              </option>
            ))}
          </Select>
          {!templates.length ? (
            <span className="text-xs font-normal text-destructive">
              Ative uma ficha clínica nas configurações para iniciar.
            </span>
          ) : null}
        </label>
      )}
      <Button
        type="submit"
        disabled={pending || (!continuing && !templates.length)}
      >
        <Stethoscope className="size-4" aria-hidden="true" />
        {pending
          ? continuing
            ? "Abrindo..."
            : "Iniciando..."
          : continuing
            ? "Continuar atendimento"
            : "Iniciar atendimento"}
      </Button>
      {state.error ? (
        <p className="text-sm text-destructive sm:self-center" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function MaskedCpfValue({ cpf }: { cpf: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      {visible ? formatCPF(cpf) : maskCPF(cpf)}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-pressed={visible}
        aria-label={visible ? "Ocultar CPF" : "Mostrar CPF"}
        title={visible ? "Ocultar CPF" : "Mostrar CPF"}
        onClick={() => setVisible((value) => !value)}
        className="size-7"
      >
        {visible ? (
          <EyeSlash className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </Button>
    </span>
  );
}

export function SummaryItem({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  /** Linha de apoio abaixo do valor (ex.: o desconto aplicado). */
  hint?: string | null;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {Icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="text-caption text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-body-sm font-medium">{value}</p>
        {hint ? (
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// Numa coluna estreita o e-mail quebrava no meio do domínio ("exam|ple.com");
// o <wbr> dá ao navegador um ponto de quebra melhor, logo depois do @, sem
// inserir caractere nenhum no texto copiado.
export function EmailText({ email }: { email: string }) {
  const at = email.lastIndexOf("@");
  if (at === -1) return email;
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  );
}

export function formatMoney(value: number | string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

/** Conta a diferença entre o preço de tabela e o cobrado, com o motivo quando
    houver — é o que transforma "R$ 360" em "R$ 360, com R$ 40 de desconto". */

export function appointmentPriceHint(appointment: {
  price?: number | string | null;
  list_price?: number | string | null;
  price_note?: string | null;
}) {
  const price = Number(appointment.price ?? 0);
  const listPrice = Number(appointment.list_price ?? 0);
  const difference = listPrice - price;
  if (!listPrice || Math.abs(difference) < 0.01) {
    return appointment.price_note ?? null;
  }
  const label =
    difference > 0
      ? `${formatMoney(difference)} de desconto sobre ${formatMoney(listPrice)}`
      : `${formatMoney(-difference)} acima da tabela de ${formatMoney(listPrice)}`;
  return appointment.price_note
    ? `${label} · ${appointment.price_note}`
    : label;
}

/**
 * Ajuste de valor do agendamento já criado, no mesmo formato do campo de forma
 * de pagamento ao lado: mostra, deixa corrigir e salva ali mesmo.
 */
export function AppointmentPriceForm({
  appointmentId,
  price,
  listPrice,
  priceNote,
  onSaved,
}: {
  appointmentId: string;
  price: number | string | null;
  listPrice: number | string | null;
  priceNote: string | null;
  onSaved?: () => void;
}) {
  const boundAction = async (
    previousState: AgendaActionState,
    formData: FormData,
  ) => {
    const result = await updateAppointmentPrice(
      appointmentId,
      previousState,
      formData,
    );
    if (result.success) {
      toast.success(result.success);
      onSaved?.();
    }
    return result;
  };
  const [state, action, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  const currentPrice =
    price === null ? "" : Number(price).toFixed(2).replace(".", ",");
  const tableLabel =
    listPrice === null || Number(listPrice) <= 0
      ? null
      : `Preço de tabela: ${formatMoney(listPrice)}`;

  return (
    <form
      action={action}
      className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3"
    >
      <label className="grid gap-2 text-sm font-medium">
        Valor do agendamento
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">R$</span>
          <Input
            name="price"
            inputMode="decimal"
            defaultValue={currentPrice}
            aria-label="Valor do agendamento"
            className="text-right tabular-nums"
          />
        </div>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Motivo do ajuste
        <Input
          name="price_note"
          defaultValue={priceNote ?? ""}
          maxLength={200}
          placeholder={tableLabel ?? "Ex.: valor combinado."}
        />
      </label>
      <Button type="submit" variant="secondary" size="lg" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}

/** Conversa no WhatsApp já citando a consulta (dia e hora). */
export function appointmentWhatsappHref(
  phone: string,
  patientName: string,
  startAt: string,
  timeZone: string,
) {
  const digits = phone.replace(/\D/g, "");
  const international =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(startAt));
  const firstName = patientName.split(" ")[0];
  const text = `Olá, ${firstName}! Sobre a sua consulta de ${day} às ${formatTime(startAt, timeZone)}: `;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}
