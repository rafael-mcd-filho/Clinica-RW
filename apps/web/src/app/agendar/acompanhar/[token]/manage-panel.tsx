"use client";

import { useActionState, useEffect } from "react";
import { CalendarClock, X } from "lucide-react";
import { toast } from "sonner";
import {
  cancelPublicBooking,
  reschedulePublicBooking,
  type BookingManageState,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import type { OnlineBookingSlot } from "@/lib/online-booking/slots";

type BookingStatus = "requested" | "confirmed" | "rejected" | "cancelled";

export type BookingDetails = {
  token: string;
  status: BookingStatus;
  patientName: string;
  requestedStartAt: string;
  requestedEndAt: string;
  clinicName: string;
  professionalName: string;
  procedureName: string;
  unitName: string;
  timezone: string;
  cancellationNoticeHours: number;
};

const initialState: BookingManageState = {};
const statusLabel: Record<BookingStatus, string> = {
  requested: "Aguardando confirmacao",
  confirmed: "Confirmado",
  rejected: "Rejeitado",
  cancelled: "Cancelado",
};

export function ManageBookingPanel({ booking }: { booking: BookingDetails }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Acompanhar agendamento</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {booking.clinicName}
            </p>
          </div>
          <Badge
            variant={
              booking.status === "confirmed"
                ? "success"
                : booking.status === "requested"
                  ? "warning"
                  : "neutral"
            }
          >
            {statusLabel[booking.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm md:grid-cols-2">
        <Detail label="Paciente" value={booking.patientName} />
        <Detail
          label="Horario"
          value={formatDateTime(booking.requestedStartAt, booking.timezone)}
        />
        <Detail label="Procedimento" value={booking.procedureName} />
        <Detail label="Profissional" value={booking.professionalName} />
        <Detail label="Unidade" value={booking.unitName} />
        <Detail
          label="Cancelamento online"
          value={`${booking.cancellationNoticeHours}h de antecedencia`}
        />
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

export function RescheduleCard({
  token,
  slots,
}: {
  token: string;
  slots: OnlineBookingSlot[];
}) {
  const actionForToken = reschedulePublicBooking.bind(null, token);
  const [state, action, pending] = useActionState(actionForToken, initialState);
  useToastState(state);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">Remarcar solicitacao pendente</h2>
        </div>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Select name="start_at" required>
            {slots.map((slot) => (
              <option key={slot.id} value={slot.startAt}>
                {slot.label}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={pending}>
            {pending ? "Remarcando..." : "Remarcar"}
          </Button>
          {state.error ? (
            <p className="text-sm text-destructive md:col-span-2">
              {state.error}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

export function CancelCard({ token }: { token: string }) {
  const actionForToken = cancelPublicBooking.bind(null, token);
  const [state, action, pending] = useActionState(actionForToken, initialState);
  useToastState(state);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <X className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-semibold">Cancelar pelo portal</h2>
        </div>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input name="reason" placeholder="Motivo opcional" />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Cancelando..." : "Cancelar"}
          </Button>
          {state.error ? (
            <p className="text-sm text-destructive md:col-span-2">
              {state.error}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function useToastState(state: BookingManageState) {
  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
