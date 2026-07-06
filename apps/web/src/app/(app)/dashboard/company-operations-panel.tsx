"use client";

import { useActionState, useEffect } from "react";
import {
  Building2,
  CalendarClock,
  Check,
  Clock3,
  Globe2,
  ListPlus,
  Mail,
  MessageSquareText,
  Phone,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  confirmOnlineBookingRequest,
  rejectOnlineBookingRequest,
  type AgendaActionState,
} from "@/app/(app)/agenda/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <OnlineRequestsCard
        requests={onlineRequests}
        canConfirm={canConfirmOnlineRequests}
        canReject={canRejectOnlineRequests}
      />
      <WaitlistCard entries={waitlist} />
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
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe2 className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Solicitações online</h2>
          </div>
          <Badge variant={requests.length ? "warning" : "neutral"}>
            {requests.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {requests.map((request) => (
          <div
            key={request.id}
            className="grid gap-4 rounded-md border border-border bg-background p-4 lg:grid-cols-[minmax(0,1fr)_15rem]"
          >
            <div className="grid min-w-0 gap-3">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <UserRound
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <p className="truncate text-sm font-semibold">
                      {request.patient_name}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Solicitação recebida pelo portal online
                  </p>
                </div>
                <Badge variant="warning" className="w-fit">
                  Pendente
                </Badge>
              </div>

              <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
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
                <div className="flex gap-2 rounded-md border border-border bg-muted/25 px-3 py-2 text-sm">
                  <MessageSquareText
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p>{request.patient_notes}</p>
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
          </div>
        ))}
        {!requests.length ? (
          <EmptyState
            icon={CalendarClock}
            text="Nenhuma solicitação online pendente."
          />
        ) : null}
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
  const pending = confirmPending || rejectPending;

  useToastState(confirmState);
  useToastState(rejectState);

  return (
    <div className="grid content-start gap-3 rounded-md bg-muted/35 p-3">
      {canConfirm ? (
        <form action={confirmAction}>
          <Button type="submit" disabled={pending} className="w-full">
            <Check className="size-4" />
            {confirmPending ? "Confirmando..." : "Confirmar"}
          </Button>
        </form>
      ) : null}
      {canReject ? (
        <form action={rejectAction} className="grid gap-2">
          <Input
            name="reason"
            placeholder="Motivo da rejeição (opcional)"
            aria-label="Motivo da rejeição"
          />
          <Button
            type="submit"
            disabled={pending}
            variant="secondary"
            className="w-full"
          >
            <X className="size-4" />
            {rejectPending ? "Rejeitando..." : "Rejeitar"}
          </Button>
        </form>
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
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{text}</span>
    </div>
  );
}

function WaitlistCard({ entries }: { entries: DashboardWaitlistEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ListPlus className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Fila de espera</h2>
          </div>
          <Badge variant={entries.length ? "primary" : "neutral"}>
            {entries.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-md border border-border bg-background p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {entry.patients?.social_name ||
                    entry.patients?.full_name ||
                    "Paciente"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {entry.procedures?.name ?? "Qualquer procedimento"}
                  {entry.professionals?.name
                    ? ` · ${entry.professionals.name}`
                    : ""}
                </p>
              </div>
              <Badge variant="neutral">
                {periodLabel[entry.preferred_period || "any"] ?? "Período"}
              </Badge>
            </div>
            {entry.notes ? <p className="mt-2 text-sm">{entry.notes}</p> : null}
          </div>
        ))}
        {!entries.length ? (
          <EmptyState icon={ListPlus} text="Nenhum paciente aguardando vaga." />
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      <Icon className="mx-auto mb-2 size-5" aria-hidden="true" />
      {text}
    </div>
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
