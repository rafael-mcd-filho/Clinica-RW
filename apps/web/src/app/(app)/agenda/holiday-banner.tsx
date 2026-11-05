"use client";

import { useState } from "react";
import { CalendarX } from "@phosphor-icons/react";
import { toast } from "sonner";
import { blockDayForAllSchedules } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { holidayOn } from "@/lib/agenda/holidays";

/**
 * Raio-X A13: aviso de feriado no dia aberto na agenda, com a opção de
 * bloquear o dia inteiro em todas as agendas de uma vez.
 */
export function HolidayBanner({
  date,
  today,
  canBlock,
}: {
  date: string;
  today: string;
  canBlock: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const holiday = holidayOn(date);
  if (!holiday) return null;
  const label =
    holiday.kind === "holiday" ? "Feriado nacional" : "Ponto facultativo";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-warning-muted px-3 py-2 text-body-sm text-warning-foreground">
      <CalendarX className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <strong className="font-semibold">{label}:</strong> {holiday.name}.
        {holiday.kind === "optional"
          ? " Confira se a clínica abre."
          : " Confira se há atendimentos a remarcar."}
      </p>
      {canBlock && date >= today ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setConfirming(true)}
        >
          Bloquear o dia
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Bloquear ${holiday.name}?`}
        description="Todas as agendas ativas ficam bloqueadas o dia inteiro, inclusive no agendamento online. Os agendamentos que já existem continuam na agenda para a recepção remarcar."
        confirmLabel="Bloquear o dia"
        onConfirm={async () => {
          const result = await blockDayForAllSchedules(
            date,
            `${label}: ${holiday.name}`,
          );
          if (result.error) {
            toast.error(result.error);
            return false;
          }
          toast.success(result.success ?? "Dia bloqueado.");
          return true;
        }}
      />
    </div>
  );
}
