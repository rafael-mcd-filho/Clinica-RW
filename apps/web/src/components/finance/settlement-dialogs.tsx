"use client";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  receivePayment,
  payAccountPayable,
  payProfessionalPayout,
  type FinanceActionState,
} from "@/app/(app)/financeiro/actions";
import type {
  ReceivableRow,
  PayableRow,
  PayoutRow,
  PaymentMethodRow,
} from "@/app/(app)/financeiro/finance-panel";
import { FormDialog, ConfirmDialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/field";
import { DatePickerInput } from "@/components/ui/date-picker-input";
const initialState: FinanceActionState = {};
const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );
function localDateValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
  }).format(new Date());
}

export function ReceivePaymentDialog({
  receivable,
  paymentMethods,
  onClose,
  onSuccess,
  today,
}: {
  receivable: ReceivableRow;
  paymentMethods: PaymentMethodRow[];
  onClose: () => void;
  onSuccess?: () => void;
  today?: string;
}) {
  const [state, formAction, pending] = useActionState(
    receivePayment,
    initialState,
  );
  const remaining = Number(receivable.amount) - Number(receivable.paid_amount);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onSuccess?.();
      onClose();
    }
  }, [state.success, onClose, onSuccess]);

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Registrar recebimento"
      description={`${
        receivable.patients?.social_name ||
        receivable.patients?.full_name ||
        "Paciente"
      } · ${receivable.description}`}
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmDisabled={!paymentMethods.length}
      confirmLabel="Receber"
      pendingLabel="Registrando..."
    >
      <input type="hidden" name="account_receivable_id" value={receivable.id} />
      <label className="grid gap-2 text-sm font-medium">
        Forma de pagamento
        <Select name="payment_method_id" required>
          {paymentMethods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Valor
        <Input
          name="amount"
          type="number"
          min="0.01"
          max={remaining.toFixed(2)}
          step="0.01"
          defaultValue={remaining.toFixed(2)}
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Data do recebimento
        <DatePickerInput
          name="paid_at"
          defaultValue={today ?? localDateValue()}
          required
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Observação
        <Textarea name="notes" placeholder="Observação (opcional)" />
      </label>
    </FormDialog>
  );
}

export function PayPayableDialog({
  payable,
  paymentMethods,
  onClose,
  onSuccess,
  today,
}: {
  payable: PayableRow;
  paymentMethods: PaymentMethodRow[];
  onClose: () => void;
  onSuccess?: () => void;
  today?: string;
}) {
  const [state, formAction, pending] = useActionState(
    payAccountPayable,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onSuccess?.();
      onClose();
    }
  }, [state.success, onClose, onSuccess]);

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Marcar conta como paga"
      description={`${payable.vendor_name} · ${formatCurrency(payable.amount)}`}
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmDisabled={!paymentMethods.length}
      confirmLabel="Marcar pago"
      pendingLabel="Baixando..."
    >
      <input type="hidden" name="account_payable_id" value={payable.id} />
      <label className="grid gap-2 text-sm font-medium">
        Forma de pagamento
        <Select name="payment_method_id" required>
          {paymentMethods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Data do pagamento
        <DatePickerInput
          name="paid_at"
          defaultValue={today ?? localDateValue()}
          required
        />
      </label>
    </FormDialog>
  );
}

export function PayPayoutDialog({
  payout,
  onClose,
  onSuccess,
  today,
}: {
  payout: PayoutRow;
  onClose: () => void;
  onSuccess?: () => void;
  today?: string;
}) {
  const [state, formAction, pending] = useActionState(
    payProfessionalPayout,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onSuccess?.();
      onClose();
    }
  }, [state.success, onClose, onSuccess]);

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Marcar repasse como pago"
      description={`${payout.professionals?.name ?? "Profissional"} · ${formatCurrency(
        payout.amount,
      )}`}
      formAction={formAction}
      pending={pending}
      error={state.error}
      confirmLabel="Marcar pago"
      pendingLabel="Baixando..."
    >
      <input type="hidden" name="payout_id" value={payout.id} />
      <label className="grid gap-2 text-sm font-medium">
        Data do pagamento
        <DatePickerInput
          name="paid_at"
          defaultValue={today ?? localDateValue()}
          required
        />
      </label>
    </ConfirmDialog>
  );
}
