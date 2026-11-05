"use client";

import { useState } from "react";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { sendDayReminders } from "./actions";

type Candidate = {
  id: string;
  startAt: string;
  hasPhone: boolean;
  reminded: boolean;
};

type Plan = {
  willReceive: number;
  withoutPhone: number;
  alreadyReminded: number;
};

function formatDayMonth(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Raio-X A7: "Enviar lembretes" do dia aberto na agenda. Manda o pedido de
 * confirmação para todos os agendados que ainda não receberam, em vez de a
 * recepção ligar um por um.
 */
export function DayRemindersButton({
  date,
  appointments,
  className,
}: {
  date: string;
  appointments: Candidate[];
  className?: string;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | undefined>();

  if (!appointments.length) return null;

  function openDialog() {
    const now = Date.now();
    const upcoming = appointments.filter(
      (item) => new Date(item.startAt).getTime() > now,
    );
    const pending = upcoming.filter((item) => !item.reminded);
    setError(undefined);
    setPlan({
      willReceive: pending.filter((item) => item.hasPhone).length,
      withoutPhone: pending.filter((item) => !item.hasPhone).length,
      alreadyReminded: upcoming.length - pending.length,
    });
  }

  const dayLabel = formatDayMonth(date);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={className}
        onClick={openDialog}
      >
        <PaperPlaneTilt className="size-4" aria-hidden="true" />
        Enviar lembretes
      </Button>
      <ConfirmDialog
        open={plan !== null}
        onClose={() => setPlan(null)}
        title={`Enviar lembretes de ${dayLabel}`}
        description="Os pacientes agendados que ainda não confirmaram recebem no WhatsApp o lembrete com o pedido de confirmação."
        icon={PaperPlaneTilt}
        confirmLabel="Enviar lembretes"
        pendingLabel="Enviando..."
        confirmDisabled={!plan?.willReceive}
        error={error}
        onConfirm={async () => {
          const result = await sendDayReminders(date);
          if (result.error) {
            setError(result.error);
            return false;
          }
          toast.success(result.success ?? "Lembretes na fila de envio.");
          return true;
        }}
      >
        {plan ? (
          <ul className="grid gap-2 text-body-sm">
            <li className="font-medium text-foreground">
              {plan.willReceive
                ? `${plural(plan.willReceive, "paciente vai", "pacientes vão")} receber o lembrete.`
                : "Nenhum paciente pendente de lembrete neste dia."}
            </li>
            {plan.withoutPhone ? (
              <li className="text-muted-foreground">
                {plural(plan.withoutPhone, "paciente", "pacientes")} sem
                telefone cadastrado {plan.withoutPhone === 1 ? "fica" : "ficam"}{" "}
                de fora: ligue ou atualize o cadastro.
              </li>
            ) : null}
            {plan.alreadyReminded ? (
              <li className="text-muted-foreground">
                {plural(plan.alreadyReminded, "já recebeu", "já receberam")} e
                não {plan.alreadyReminded === 1 ? "recebe" : "recebem"} de novo.
              </li>
            ) : null}
            <li className="text-muted-foreground">
              O texto e a janela de horário de envio são os do lembrete em
              Configurações › Mensagens automáticas.
            </li>
          </ul>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
