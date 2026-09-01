"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Buildings as Building2,
  CalendarDots as CalendarClock,
  Check,
  Clock as Clock3,
  Globe as Globe2,
  ListPlus,
  EnvelopeSimple as Mail,
  ChatCenteredText as MessageSquareText,
  Phone,
  Stethoscope,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  confirmOnlineBookingRequest,
  rejectOnlineBookingRequest,
  type AgendaActionState,
} from "@/app/(app)/agenda/actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";

export type DashboardOnlineRequest = {
  id: string;
  requested_start_at: string;
  requested_end_at: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  patient_notes: string | null;
  procedures: { name: string } | null;
  professionals: { name: string } | null;
  units: { name: string } | null;
  health_insurances: { name: string } | null;
};

export type DashboardWaitlistEntry = {
  id: string;
  preferred_period: string | null;
  notes: string | null;
  created_at: string;
  patients: { full_name: string; social_name: string | null } | null;
  procedures: { name: string } | null;
  professionals: { name: string } | null;
};

const initialState: AgendaActionState = {};
const periodLabel: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
  any: "Qualquer período",
};

export function CompanyOperationsPanel({
  onlineRequests,
  waitlist,
  canConfirmOnlineRequests,
  canRejectOnlineRequests,
}: {
  onlineRequests: DashboardOnlineRequest[];
  waitlist: DashboardWaitlistEntry[];
  canConfirmOnlineRequests: boolean;
  canRejectOnlineRequests: boolean;
}) {
  return (
    <section className="grid gap-4">
      <WaitlistCard entries={waitlist} />
      <OnlineRequestsCard
        requests={onlineRequests}
        canConfirm={canConfirmOnlineRequests}
        canReject={canRejectOnlineRequests}
      />
    </section>
  );
}

function OnlineRequestsCard({
  requests,
  canConfirm,
  canReject,
}: {
  requests: DashboardOnlineRequest[];
  canConfirm: boolean;
  canReject: boolean;
}) {
  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe2 className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-heading-sm font-semibold">
              Solicitações online
            </h2>
          </div>
          <Badge variant={requests.length ? "warning" : "neutral"}>
            {requests.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {requests.length ? (
          <ul className="divide-y divide-border">
            {requests.map((request) => (
              <li
                key={request.id}
                className="grid gap-3 py-4 first:pt-0 last:pb-0 xl:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)]"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={request.patient_name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-body font-semibold">
                          {request.patient_name}
                        </p>
                        <p className="text-body-sm text-muted-foreground">
                          Solicitação recebida pelo portal online
                        </p>
                      </div>
                    </div>
                    <Badge variant="warning" className="w-fit">
                      Pendente
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-x-5 gap-y-2 text-body-sm text-muted-foreground sm:grid-cols-2 2xl:grid-cols-3">
                    <RequestInfoRow
                      icon={Clock3}
                      text={`${formatDateTime(
                        request.requested_start_at,
                      )} - ${formatTime(request.requested_end_at)}`}
                    />
                    <RequestInfoRow
                      icon={Stethoscope}
                      text={`${request.procedures?.name ?? "Procedimento"} · ${
                        request.professionals?.name ?? "Profissional"
                      }`}
                    />
                    <RequestInfoRow
                      icon={Phone}
                      text={request.patient_phone || "Telefone não informado"}
                    />
                    <RequestInfoRow
                      icon={Mail}
                      text={request.patient_email || "E-mail não informado"}
                    />
                    <RequestInfoRow
                      icon={Building2}
                      text={[
                        request.units?.name,
                        request.health_insurances?.name ?? "Particular",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  </div>

                  {request.patient_notes ? (
                    <div className="mt-3 flex gap-2 rounded-md border border-border bg-muted/25 px-3 py-2 text-body-sm">
                      <MessageSquareText
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="min-w-0 whitespace-pre-wrap break-words">
                        {request.patient_notes}
                      </p>
                    </div>
                  ) : null}
                </div>
                {canConfirm || canReject ? (
                  <OnlineRequestActions
                    requestId={request.id}
                    canConfirm={canConfirm}
                    canReject={canReject}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="Nenhuma solicitação online pendente."
            className="py-6"
          />
        )}
      </CardContent>
    </Card>
  );
}

function OnlineRequestActions({
  requestId,
  canConfirm,
  canReject,
}: {
  requestId: string;
  canConfirm: boolean;
  canReject: boolean;
}) {
  const confirmActionForRequest = confirmOnlineBookingRequest.bind(
    null,
    requestId,
  );
  const rejectActionForRequest = rejectOnlineBookingRequest.bind(
    null,
    requestId,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmActionForRequest,
    initialState,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectActionForRequest,
    initialState,
  );
  const [rejectReason, setRejectReason] = useState("");
  const [confirmingReject, setConfirmingReject] = useState(false);
  const pending = confirmPending || rejectPending;

  useToastState(confirmState);
  useToastState(rejectState);

  return (
    <div className="grid content-start gap-2 rounded-md border border-border bg-muted/35 p-3">
      {canConfirm ? (
        <form action={confirmAction}>
          <Button type="submit" disabled={pending} className="w-full">
            <Check className="size-4" />
            {confirmPending ? "Confirmando..." : "Confirmar"}
          </Button>
        </form>
      ) : null}
      {canReject ? (
        <div className="grid gap-2">
          <Input
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Motivo da rejeição (opcional)"
            aria-label="Motivo da rejeição"
          />
          <Button
            type="button"
            disabled={pending}
            variant="secondary"
            className="w-full"
            onClick={() => setConfirmingReject(true)}
          >
            <X className="size-4" />
            Rejeitar
          </Button>
          <ConfirmDialog
            open={confirmingReject && !rejectState.success}
            onClose={() => setConfirmingReject(false)}
            title="Rejeitar solicitação?"
            description="A solicitação de agendamento será rejeitada e o horário voltará a ficar disponível."
            confirmLabel="Rejeitar solicitação"
            pendingLabel="Rejeitando..."
            destructive
            pending={rejectPending}
            error={rejectState.error}
            formAction={rejectAction}
          >
            <input type="hidden" name="reason" value={rejectReason} />
          </ConfirmDialog>
        </div>
      ) : null}
      {confirmState.error || rejectState.error ? (
        <p className="rounded-md border border-destructive-muted bg-destructive-muted/40 px-3 py-2 text-sm text-destructive">
          {confirmState.error ?? rejectState.error}
        </p>
      ) : null}
    </div>
  );
}

function RequestInfoRow({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="truncate">{text}</span>
    </div>
  );
}

function WaitlistCard({ entries }: { entries: DashboardWaitlistEntry[] }) {
  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ListPlus className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-heading-sm font-semibold">Fila de espera</h2>
          </div>
          <Badge variant={entries.length ? "primary" : "neutral"}>
            {entries.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {entries.length ? (
          <ul className="divide-y divide-border">
            {entries.map((entry) => {
              const patientName =
                entry.patients?.social_name ||
                entry.patients?.full_name ||
                "Paciente";

              return (
                <li
                  key={entry.id}
                  className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <Avatar name={patientName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-col justify-between gap-2 sm:flex-row sm:items-start">
                      <div className="min-w-0">
                        <p className="truncate text-body font-semibold">
                          {patientName}
                        </p>
                        <p className="text-body-sm text-muted-foreground">
                          {entry.procedures?.name ?? "Qualquer procedimento"}
                          {entry.professionals?.name
                            ? ` · ${entry.professionals.name}`
                            : ""}
                        </p>
                      </div>
                      <Badge variant="neutral" className="w-fit">
                        {periodLabel[entry.preferred_period || "any"] ??
                          "Período"}
                      </Badge>
                    </div>
                    {entry.notes ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-body-sm text-secondary-foreground">
                        {entry.notes}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={ListPlus}
            title="Nenhum paciente aguardando vaga."
            className="py-6"
          />
        )}
      </CardContent>
    </Card>
  );
}

function useToastState(state: AgendaActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  }).format(new Date(value));
}
