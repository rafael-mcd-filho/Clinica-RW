"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  FileText,
  Plus,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import {
  createAccountPayable,
  createPaymentMethod,
  payAccountPayable,
  payProfessionalPayout,
  receivePayment,
  type FinanceActionState,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ConfirmDialog, FormDialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export type PaymentMethodRow = {
  id: string;
  name: string;
  method_type?: string;
};

export type FinancialCategoryRow = {
  id: string;
  name: string;
  category_type: string;
};

export type ReceivableRow = {
  id: string;
  description: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  status: string;
  patients: { full_name: string; social_name: string | null } | null;
  professionals: { name: string } | null;
};

export type PaymentRow = {
  id: string;
  account_receivable_id: string;
  amount: number;
  paid_at: string;
  payment_methods: { name: string } | null;
  accounts_receivable: { description: string } | null;
};

export type PayableRow = {
  id: string;
  vendor_name: string;
  description: string;
  amount: number;
  due_date: string;
  status: string;
};

export type PayoutRow = {
  id: string;
  amount: number;
  due_date: string;
  status: string;
  professionals: { name: string } | null;
};

export type FinanceSummary = {
  openReceivable: number;
  receivedMonth: number;
  openPayable: number;
  pendingPayout: number;
};

type Permissions = {
  canReceive: boolean;
  canManagePayables: boolean;
  canManagePaymentMethods: boolean;
  canViewCash: boolean;
  canViewPayouts: boolean;
};

const initialState: FinanceActionState = {};

export function FinancePanel({
  summary,
  receivables,
  payments,
  payables,
  payouts,
  paymentMethods,
  categories,
  permissions,
}: {
  summary: FinanceSummary;
  receivables: ReceivableRow[];
  payments: PaymentRow[];
  payables: PayableRow[];
  payouts: PayoutRow[];
  paymentMethods: PaymentMethodRow[];
  categories: FinancialCategoryRow[];
  permissions: Permissions;
}) {
  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-xl font-semibold">Financeiro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recebimentos, contas a pagar, recibos e repasses profissionais.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard
          icon={CircleDollarSign}
          label="A receber"
          value={formatCurrency(summary.openReceivable)}
          tone="success"
        />
        <MetricCard
          icon={WalletCards}
          label="Recebido no mês"
          value={formatCurrency(summary.receivedMonth)}
          tone="success"
        />
        <MetricCard
          icon={ReceiptText}
          label="A pagar"
          value={formatCurrency(summary.openPayable)}
          tone="destructive"
        />
        <MetricCard
          icon={Banknote}
          label="Repasses pendentes"
          value={formatCurrency(summary.pendingPayout)}
          tone="destructive"
        />
      </section>

      {permissions.canViewCash || permissions.canManagePaymentMethods ? (
        <PaymentMethodsSection
          paymentMethods={paymentMethods}
          canManage={permissions.canManagePaymentMethods}
        />
      ) : null}

      {permissions.canViewCash ? (
        <ReceivablesSection
          receivables={receivables}
          paymentMethods={paymentMethods}
          canReceive={permissions.canReceive}
        />
      ) : null}

      {permissions.canViewCash ? <PaymentsSection payments={payments} /> : null}

      {permissions.canManagePayables ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Nova conta a pagar</h2>
          </CardHeader>
          <CardContent>
            <CreatePayableForm categories={categories} />
          </CardContent>
        </Card>
      ) : null}

      {permissions.canManagePayables || permissions.canViewCash ? (
        <PayablesSection
          payables={payables}
          paymentMethods={paymentMethods}
          canManage={permissions.canManagePayables}
        />
      ) : null}

      {permissions.canViewPayouts ? (
        <PayoutsSection
          payouts={payouts}
          canManage={permissions.canManagePayables}
        />
      ) : null}
    </div>
  );
}

function PaymentMethodsSection({
  paymentMethods,
  canManage,
}: {
  paymentMethods: PaymentMethodRow[];
  canManage: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="font-semibold">Formas de pagamento</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre as formas usadas na agenda, recebimentos e custos.
          </p>
        </div>
        <Badge variant="primary">{paymentMethods.length} ativas</Badge>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-2">
          {paymentMethods.length ? (
            paymentMethods.map((method) => (
              <div
                key={method.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {method.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {paymentMethodTypeLabel(method.method_type)}
                  </p>
                </div>
                <CreditCard
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
              Nenhuma forma de pagamento cadastrada.
            </div>
          )}
        </div>
        {canManage ? <CreatePaymentMethodForm /> : null}
      </CardContent>
    </Card>
  );
}

function CreatePaymentMethodForm() {
  const [state, action, pending] = useActionState(
    createPaymentMethod,
    initialState,
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      action={action}
      className="grid gap-3 rounded-md border border-border bg-muted/20 p-4"
    >
      <div>
        <h3 className="text-sm font-semibold">Nova forma</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          A forma fica disponivel no agendamento.
        </p>
      </div>
      <label className="grid gap-2 text-sm font-medium">
        Nome
        <Input name="name" placeholder="Pix, cartao, dinheiro..." required />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Tipo
        <Select name="method_type" defaultValue="pix">
          <option value="pix">Pix</option>
          <option value="cash">Dinheiro</option>
          <option value="credit_card">Cartao de credito</option>
          <option value="debit_card">Cartao de debito</option>
          <option value="bank_transfer">Transferencia bancaria</option>
          <option value="other">Outro</option>
        </Select>
      </label>
      <Button type="submit" disabled={pending}>
        <Plus className="size-4" aria-hidden="true" />
        {pending ? "Salvando..." : "Cadastrar"}
      </Button>
    </form>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "success" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-md",
            tone === "success"
              ? "bg-success-muted text-success"
              : "bg-destructive-muted text-destructive",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 text-display font-semibold tabular-nums",
            tone === "success"
              ? "text-success-foreground"
              : "text-destructive-foreground",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ReceivablesSection({
  receivables,
  paymentMethods,
  canReceive,
}: {
  receivables: ReceivableRow[];
  paymentMethods: PaymentMethodRow[];
  canReceive: boolean;
}) {
  const [target, setTarget] = useState<ReceivableRow | null>(null);

  const columns = useMemo<ColumnDef<ReceivableRow>[]>(
    () => [
      {
        accessorFn: (receivable) =>
          receivable.patients?.social_name ||
          receivable.patients?.full_name ||
          "Paciente",
        header: "Paciente",
        cell: ({ row }) => {
          const receivable = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate font-medium">
                {receivable.patients?.social_name ||
                  receivable.patients?.full_name ||
                  "Paciente"}
              </p>
              {receivable.professionals?.name ? (
                <p className="truncate text-xs text-muted-foreground">
                  {receivable.professionals.name}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "description",
        header: "Procedimento",
        cell: ({ row }) => (
          <span className="truncate">{row.original.description}</span>
        ),
      },
      {
        accessorKey: "amount",
        header: "Valor",
        cell: ({ row }) => {
          const receivable = row.original;
          return (
            <div>
              <p className="font-medium tabular-nums">
                {formatCurrency(receivable.amount)}
              </p>
              {receivable.status === "partial" ? (
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(receivable.paid_amount)} recebido
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "due_date",
        header: "Vencimento",
        cell: ({ row }) => formatDate(row.original.due_date),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "Ação",
        enableSorting: false,
        cell: ({ row }) => {
          const receivable = row.original;
          if (!canReceive || !["open", "partial"].includes(receivable.status)) {
            return null;
          }
          return (
            <Button
              type="button"
              size="sm"
              onClick={() => setTarget(receivable)}
            >
              Receber
            </Button>
          );
        },
      },
    ],
    [canReceive],
  );

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold">Contas a receber</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Consultas geram cobranças automaticamente a partir do valor do
          procedimento.
        </p>
      </div>
      <DataTable
        columns={columns}
        data={receivables}
        pageSize={8}
        emptyTitle="Nenhuma conta a receber"
        emptyDescription="Cobranças geradas por consultas aparecerão aqui."
      />

      {target ? (
        <ReceivePaymentDialog
          receivable={target}
          paymentMethods={paymentMethods}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </section>
  );
}

function PaymentsSection({ payments }: { payments: PaymentRow[] }) {
  const columns = useMemo<ColumnDef<PaymentRow>[]>(
    () => [
      {
        accessorFn: (payment) =>
          payment.accounts_receivable?.description ?? "Recebimento",
        header: "Descrição",
        cell: ({ row }) =>
          row.original.accounts_receivable?.description ?? "Recebimento",
      },
      {
        accessorKey: "amount",
        header: "Valor",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {formatCurrency(row.original.amount)}
          </span>
        ),
      },
      {
        accessorFn: (payment) =>
          payment.payment_methods?.name ?? "Forma não informada",
        header: "Forma",
        cell: ({ row }) =>
          row.original.payment_methods?.name ?? "Forma não informada",
      },
      {
        accessorKey: "paid_at",
        header: "Data",
        cell: ({ row }) => formatDateTime(row.original.paid_at),
      },
      {
        id: "actions",
        header: "Recibo",
        enableSorting: false,
        cell: ({ row }) => (
          <Button asChild size="sm" variant="ghost">
            <Link
              href={`/financeiro/recibos/${row.original.id}/pdf`}
              target="_blank"
            >
              <FileText className="size-4" aria-hidden="true" /> Abrir
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <section className="grid gap-3">
      <h2 className="text-base font-semibold">Pagamentos recebidos</h2>
      <DataTable
        columns={columns}
        data={payments}
        pageSize={8}
        emptyTitle="Nenhum recebimento registrado"
        emptyDescription="Pagamentos confirmados aparecerão aqui."
      />
    </section>
  );
}

function PayablesSection({
  payables,
  paymentMethods,
  canManage,
}: {
  payables: PayableRow[];
  paymentMethods: PaymentMethodRow[];
  canManage: boolean;
}) {
  const [target, setTarget] = useState<PayableRow | null>(null);

  const columns = useMemo<ColumnDef<PayableRow>[]>(
    () => [
      {
        accessorKey: "vendor_name",
        header: "Fornecedor",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.vendor_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.description}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Valor",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {formatCurrency(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: "due_date",
        header: "Vencimento",
        cell: ({ row }) => formatDate(row.original.due_date),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "Ação",
        enableSorting: false,
        cell: ({ row }) => {
          const payable = row.original;
          if (!canManage || payable.status !== "open") return null;
          return (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setTarget(payable)}
            >
              Marcar pago
            </Button>
          );
        },
      },
    ],
    [canManage],
  );

  return (
    <section className="grid gap-3">
      <h2 className="text-base font-semibold">Contas a pagar</h2>
      <DataTable
        columns={columns}
        data={payables}
        pageSize={8}
        emptyTitle="Nenhuma conta a pagar"
        emptyDescription="Contas cadastradas manualmente aparecerão aqui."
      />

      {target ? (
        <PayPayableDialog
          payable={target}
          paymentMethods={paymentMethods}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </section>
  );
}

function PayoutsSection({
  payouts,
  canManage,
}: {
  payouts: PayoutRow[];
  canManage: boolean;
}) {
  const [target, setTarget] = useState<PayoutRow | null>(null);

  const columns = useMemo<ColumnDef<PayoutRow>[]>(
    () => [
      {
        accessorFn: (payout) => payout.professionals?.name ?? "Profissional",
        header: "Profissional",
        cell: ({ row }) => row.original.professionals?.name ?? "Profissional",
      },
      {
        accessorKey: "amount",
        header: "Valor",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {formatCurrency(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: "due_date",
        header: "Vencimento",
        cell: ({ row }) => formatDate(row.original.due_date),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "Ação",
        enableSorting: false,
        cell: ({ row }) => {
          const payout = row.original;
          if (!canManage || payout.status !== "pending") return null;
          return (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setTarget(payout)}
            >
              Marcar pago
            </Button>
          );
        },
      },
    ],
    [canManage],
  );

  return (
    <section className="grid gap-3">
      <h2 className="text-base font-semibold">Repasses profissionais</h2>
      <DataTable
        columns={columns}
        data={payouts}
        pageSize={8}
        emptyTitle="Nenhum repasse encontrado"
        emptyDescription="Repasses gerados a partir de pagamentos aparecerão aqui."
      />

      {target ? (
        <PayPayoutDialog payout={target} onClose={() => setTarget(null)} />
      ) : null}
    </section>
  );
}

function ReceivePaymentDialog({
  receivable,
  paymentMethods,
  onClose,
}: {
  receivable: ReceivableRow;
  paymentMethods: PaymentMethodRow[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    receivePayment,
    initialState,
  );
  const remaining = Number(receivable.amount) - Number(receivable.paid_amount);

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onClose();
    }
  }, [state.success, onClose]);

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
          step="0.01"
          defaultValue={remaining.toFixed(2)}
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

function PayPayableDialog({
  payable,
  paymentMethods,
  onClose,
}: {
  payable: PayableRow;
  paymentMethods: PaymentMethodRow[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    payAccountPayable,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onClose();
    }
  }, [state.success, onClose]);

  return (
    <FormDialog
      open
      onClose={onClose}
      title="Marcar conta como paga"
      description={`${payable.vendor_name} · ${formatCurrency(payable.amount)}`}
      formAction={formAction}
      pending={pending}
      error={state.error}
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
    </FormDialog>
  );
}

function PayPayoutDialog({
  payout,
  onClose,
}: {
  payout: PayoutRow;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    payProfessionalPayout,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onClose();
    }
  }, [state.success, onClose]);

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
    </ConfirmDialog>
  );
}

function CreatePayableForm({
  categories,
}: {
  categories: FinancialCategoryRow[];
}) {
  const [state, action, pending] = useActionState(
    createAccountPayable,
    initialState,
  );
  useToastState(state);

  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium">
        Fornecedor
        <Input name="vendor_name" required />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Categoria
        <Select name="category_id" defaultValue="" allowEmptyOption>
          <option value="">Sem categoria</option>
          {categories
            .filter((category) => category.category_type !== "receivable")
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </Select>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Descrição
        <Input name="description" required />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Vencimento
        <DatePickerInput name="due_date" required />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Valor
        <Input name="amount" type="number" min="0.01" step="0.01" required />
      </label>
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Criando..." : "Criar conta"}
        </Button>
      </div>
      {state.error ? (
        <p className="text-sm text-destructive md:col-span-2">{state.error}</p>
      ) : null}
    </form>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    open: "Aberto",
    partial: "Parcial",
    paid: "Pago",
    cancelled: "Cancelado",
    written_off: "Baixado",
    pending: "Pendente",
  };
  const variant =
    status === "paid"
      ? "success"
      : status === "open" || status === "pending"
        ? "warning"
        : "neutral";
  return <Badge variant={variant}>{label[status] ?? status}</Badge>;
}

function useToastState(state: FinanceActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}

function paymentMethodTypeLabel(value?: string) {
  switch (value) {
    case "cash":
      return "Dinheiro";
    case "pix":
      return "Pix";
    case "credit_card":
      return "Cartao de credito";
    case "debit_card":
      return "Cartao de debito";
    case "bank_transfer":
      return "Transferencia bancaria";
    default:
      return "Outro";
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
