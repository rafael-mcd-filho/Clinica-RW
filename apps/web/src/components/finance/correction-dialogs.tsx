"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/field";
import type { FinanceActionState } from "@/app/(app)/financeiro/actions";

/** Confirmação com motivo obrigatório (estorno e cancelamento). */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onSubmit,
  onDone,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<FinanceActionState>;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  return (
    <ConfirmDialog
      open={open}
      onClose={() => {
        setReason("");
        setError(undefined);
        onClose();
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      pendingLabel="Salvando..."
      destructive
      error={error}
      confirmDisabled={reason.trim().length < 3}
      onConfirm={async () => {
        const result = await onSubmit(reason);
        if (result.error) {
          setError(result.error);
          return false;
        }
        toast.success(result.success ?? "Feito.");
        setReason("");
        onDone();
        return true;
      }}
    >
      <label className="grid gap-1.5 text-label font-medium">
        Motivo
        <Textarea
          value={reason}
          maxLength={300}
          placeholder="Ex.: recebimento lançado em duplicidade"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ConfirmDialog>
  );
}

/** Edição de conta a receber em aberto: descrição, valor e vencimento. */
export function EditReceivableDialog({
  open,
  initial,
  onClose,
  onSubmit,
  onDone,
}: {
  open: boolean;
  initial: { description: string; amount: number; due_date: string };
  onClose: () => void;
  onSubmit: (input: {
    description: string;
    amount: number;
    due_date: string;
  }) => Promise<FinanceActionState>;
  onDone: () => void;
}) {
  const [description, setDescription] = useState(initial.description);
  const [amount, setAmount] = useState<number | null>(initial.amount);
  const [dueDate, setDueDate] = useState(initial.due_date);
  const [error, setError] = useState<string>();
  return (
    <ConfirmDialog
      open={open}
      onClose={() => {
        setError(undefined);
        onClose();
      }}
      title="Editar conta a receber"
      description="Contas com recebimento não podem ficar com valor menor que o já recebido."
      confirmLabel="Salvar"
      pendingLabel="Salvando..."
      error={error}
      confirmDisabled={!description.trim() || !amount || !dueDate}
      onConfirm={async () => {
        const result = await onSubmit({
          description,
          amount: amount ?? 0,
          due_date: dueDate,
        });
        if (result.error) {
          setError(result.error);
          return false;
        }
        toast.success(result.success ?? "Conta atualizada.");
        onDone();
        return true;
      }}
    >
      <div className="grid gap-3">
        <label className="grid gap-1.5 text-label font-medium">
          Descrição
          <Input
            value={description}
            maxLength={200}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-label font-medium">
            Valor
            <CurrencyInput
              name="amount"
              defaultValue={initial.amount}
              onValueChange={(formatted) => {
                const parsed = Number(
                  formatted.replace(/\./g, "").replace(",", "."),
                );
                setAmount(Number.isFinite(parsed) ? parsed : null);
              }}
              aria-label="Valor"
            />
          </label>
          <label className="grid gap-1.5 text-label font-medium">
            Vencimento
            <Input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
        </div>
      </div>
    </ConfirmDialog>
  );
}
