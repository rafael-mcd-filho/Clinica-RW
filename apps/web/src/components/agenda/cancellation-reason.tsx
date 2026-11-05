"use client";

import { useId } from "react";
import { Input, Select } from "@/components/ui/field";
import { cancellationReasons } from "@/lib/agenda/status";

export type CancellationReasonValue = { reason: string; note: string };

export const emptyCancellationReason: CancellationReasonValue = {
  reason: "",
  note: "",
};

/** Texto gravado no histórico do status ("Paciente desmarcou: viagem"). */
export function formatCancellationReason(value: CancellationReasonValue) {
  const note = value.note.trim();
  if (!value.reason) return "";
  return note ? `${value.reason}: ${note}` : value.reason;
}

export function isCancellationReasonComplete(value: CancellationReasonValue) {
  if (!value.reason) return false;
  return value.reason !== "Outro motivo" || value.note.trim().length >= 3;
}

/**
 * Motivo do cancelamento numa lista curta (Raio-X A5): todo cancelamento
 * saía como "Cancelado pela agenda" e não havia como saber se o paciente
 * desmarcou, o médico faltou ou houve remarcação.
 */
export function CancellationReasonFields({
  value,
  onChange,
}: {
  value: CancellationReasonValue;
  onChange: (value: CancellationReasonValue) => void;
}) {
  const reasonId = useId();
  const noteId = useId();
  return (
    <div className="grid gap-3">
      <label htmlFor={reasonId} className="grid gap-1.5 text-label font-medium">
        Motivo do cancelamento
        <Select
          id={reasonId}
          value={value.reason}
          onValueChange={(reason) => onChange({ ...value, reason })}
          aria-label="Motivo do cancelamento"
        >
          <option value="">Selecione o motivo</option>
          {cancellationReasons.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </Select>
      </label>
      <label htmlFor={noteId} className="grid gap-1.5 text-label font-medium">
        {value.reason === "Outro motivo" ? "Qual?" : "Observação (opcional)"}
        <Input
          id={noteId}
          value={value.note}
          maxLength={200}
          placeholder={
            value.reason === "Outro motivo"
              ? "Descreva o motivo"
              : "Ex.: pediu para remarcar na próxima semana"
          }
          onChange={(event) => onChange({ ...value, note: event.target.value })}
        />
      </label>
    </div>
  );
}
