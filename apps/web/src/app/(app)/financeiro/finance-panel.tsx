"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  Money as Banknote,
  CurrencyCircleDollar as CircleDollarSign,
  CreditCard,
  FileText,
  Plus,
  Receipt as ReceiptText,
  Wallet as WalletCards,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  createAccountReceivable,
  createAccountPayable,
  payAccountPayable,
  payProfessionalPayout,
  receivePayment,
  updateFinancialCategoryDreGroup,
  type FinanceActionState,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ConfirmDialog, FormDialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import type { TabItem } from "@/components/ui/tabs";
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
  dre_group: string | null;
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
  accrualRevenue: number;
  accrualExpense: number;
  cashIn: number;
  cashOut: number;
  averageCollectionDays: number;
};

type FinancePeriod = { from: string; to: string; mode: "cash" | "accrual" };
type DreRow = { group: string; amount: number };

export type FinanceListPagination = {
  page: number;
  pageSize: number;
  total: number;
};

type FinancePagination = {
  receivables: FinanceListPagination;
  payments: FinanceListPagination;
  payables: FinanceListPagination;
  payouts: FinanceListPagination;
};

type FinanceSectionPaginationProps = {
  pagination: FinanceListPagination;
  pending: boolean;
  onPageChange: (page: number) => void;
};

type Permissions = {
  canReceive: boolean;
  canManagePayables: boolean;
  canViewCash: boolean;
  canViewPayables: boolean;
  canViewPayouts: boolean;
};

const initialState: FinanceActionState = {};

export function FinancePanel({
  section,
  period,
  dreRows,
  summary,
  receivables,
  payments,
  payables,
  payouts,
  paymentMethods,
  categories,
  pagination,
  permissions,
}: {
  section:
    | "visao-geral"
    | "a-receber"
    | "a-pagar"
    | "movimentacoes"
    | "repasses"
    | "dre";
  period: FinancePeriod;
  dreRows: DreRow[];
  summary: FinanceSummary;
  receivables: ReceivableRow[];
  payments: PaymentRow[];
  payables: PayableRow[];
  payouts: PayoutRow[];
  paymentMethods: PaymentMethodRow[];
  categories: FinancialCategoryRow[];
  pagination: FinancePagination;
  permissions: Permissions;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [navigationPending, startNavigation] = useTransition();
  const [entryDialog, setEntryDialog] = useState<"revenue" | "expense" | null>(
    null,
  );
  const periodRevenue =
    period.mode === "cash" ? summary.cashIn : summary.accrualRevenue;
  const periodExpense =
    period.mode === "cash" ? summary.cashOut : summary.accrualExpense;

  function changePage(queryKey: string, section: string, nextPage: number) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("section", section);
    if (nextPage <= 1) nextParams.delete(queryKey);
    else nextParams.set(queryKey, String(nextPage));

    startNavigation(() => {
      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    });
  }

  const tabs: TabItem[] = [
    {
      id: "visao-geral",
      label: "Visão geral",
      icon: <WalletCards />,
      content: (
        <div className="grid min-w-0 gap-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {permissions.canViewCash ? (
              <>
                <MetricCard
                  icon={CircleDollarSign}
                  label={period.mode === "cash" ? "Entradas" : "Receitas"}
                  value={formatCurrency(periodRevenue)}
                  tone="success"
                />
                <MetricCard
                  icon={WalletCards}
                  label={period.mode === "cash" ? "Saídas" : "Despesas"}
                  value={formatCurrency(periodExpense)}
                  tone="success"
                />
              </>
            ) : null}
            {permissions.canViewPayables ? (
              <MetricCard
                icon={ReceiptText}
                label="Resultado do período"
                value={formatCurrency(periodRevenue - periodExpense)}
                tone={
                  periodRevenue - periodExpense >= 0 ? "success" : "destructive"
                }
              />
            ) : null}
            {permissions.canViewPayouts ? (
              <MetricCard
                icon={Banknote}
                label="Prazo médio para receber"
                value={`${summary.averageCollectionDays.toFixed(1)} dias`}
                tone="success"
              />
            ) : null}
            {permissions.canViewCash ? (
              <MetricCard
                icon={CircleDollarSign}
                label="A receber"
                value={formatCurrency(summary.openReceivable)}
                tone="success"
              />
            ) : null}
            {permissions.canViewPayables ? (
              <MetricCard
                icon={ReceiptText}
                label="A pagar"
                value={formatCurrency(summary.openPayable)}
                tone="destructive"
              />
            ) : null}
          </section>
        </div>
      ),
    },
  ];

  if (permissions.canViewCash) {
    tabs.push(
      {
        id: "a-receber",
        label: "A receber",
        icon: <CircleDollarSign />,
        content: (
          <ReceivablesSection
            receivables={receivables}
            paymentMethods={paymentMethods}
            canReceive={permissions.canReceive}
            pagination={pagination.receivables}
            pending={navigationPending}
            onPageChange={(page) =>
              changePage("receivables_page", "a-receber", page)
            }
          />
        ),
      },
      {
        id: "movimentacoes",
        label: "Movimentações",
        icon: <CreditCard />,
        content: (
          <PaymentsSection
            payments={payments}
            pagination={pagination.payments}
            pending={navigationPending}
            onPageChange={(page) =>
              changePage("payments_page", "movimentacoes", page)
            }
          />
        ),
      },
    );
  }

  if (permissions.canViewPayables) {
    tabs.push({
      id: "a-pagar",
      label: "A pagar",
      icon: <ReceiptText />,
      content: (
        <div className="grid min-w-0 gap-6">
          <PayablesSection
            payables={payables}
            paymentMethods={paymentMethods}
            canManage={permissions.canManagePayables}
            pagination={pagination.payables}
            pending={navigationPending}
            onPageChange={(page) =>
              changePage("payables_page", "a-pagar", page)
            }
          />
        </div>
      ),
    });
  }

  if (permissions.canViewPayouts) {
    tabs.push({
      id: "repasses",
      label: "Repasses",
      icon: <Banknote />,
      content: (
        <PayoutsSection
          payouts={payouts}
          canManage={permissions.canManagePayables}
          pagination={pagination.payouts}
          pending={navigationPending}
          onPageChange={(page) => changePage("payouts_page", "repasses", page)}
        />
      ),
    });
  }

  if (permissions.canViewCash && permissions.canViewPayables) {
    tabs.push({
      id: "dre",
      label: "DRE",
      icon: <FileText />,
      content: (
        <DreSection
          rows={dreRows}
          categories={categories}
          canManage={permissions.canManagePayables}
        />
      ),
    });
  }

  const selectedContent =
    tabs.find((item) => item.id === section)?.content ?? tabs[0]?.content;

  return (
    <div
      className="grid min-w-0 gap-6"
      aria-busy={navigationPending || undefined}
    >
      <PageHeader
        icon={WalletCards}
        title="Financeiro"
        description="Recebimentos, contas a pagar, recibos e repasses profissionais."
        actions={
          <>
            {permissions.canReceive ? (
              <Button
                type="button"
                size="lg"
                onClick={() => setEntryDialog("revenue")}
              >
                <Plus className="size-4" aria-hidden="true" /> Nova receita
              </Button>
            ) : null}
            {permissions.canManagePayables ? (
              <Button
                type="button"
                size="lg"
                variant="secondary"
                onClick={() => setEntryDialog("expense")}
              >
                <Plus className="size-4" aria-hidden="true" /> Nova despesa
              </Button>
            ) : null}
          </>
        }
      />

      <FinancePeriodFilter period={period} />

      <div className="min-h-[38rem]">{selectedContent}</div>

      {entryDialog === "revenue" ? (
        <CreateRevenueDialog
          categories={categories}
          onClose={() => setEntryDialog(null)}
        />
      ) : null}
      {entryDialog === "expense" ? (
        <CreateExpenseDialog
          categories={categories}
          onClose={() => setEntryDialog(null)}
        />
      ) : null}
    </div>
  );
}

function DreSection({
  rows,
  categories,
  canManage,
}: {
  rows: DreRow[];
  categories: FinancialCategoryRow[];
  canManage: boolean;
}) {
  const value = (group: string) =>
    rows.find((row) => row.group === group)?.amount ?? 0;
  const grossRevenue = value("gross_revenue");
  const deductions = value("revenue_deduction");
  const netRevenue = grossRevenue + deductions;
  const directCosts = value("direct_cost");
  const grossProfit = netRevenue + directCosts;
  const operatingExpenses = value("operating_expense");
  const operatingResult = grossProfit + operatingExpenses;
  const financialResult = value("financial_result");
  const preTax = operatingResult + financialResult;
  const incomeTax = value("income_tax");
  const netResult = preTax + incomeTax;
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <h2 className="font-semibold">DRE gerencial</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Resultado estruturado por competência e classificação financeira.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3">
          <DreLine label="Receita operacional bruta" value={grossRevenue} />
          <DreLine label="(-) Deduções da receita" value={deductions} />
          <DreLine
            label="Receita operacional líquida"
            value={netRevenue}
            strong
          />
          <DreLine
            label="(-) Custos diretos dos serviços"
            value={directCosts}
          />
          <DreLine label="Lucro bruto" value={grossProfit} strong />
          <DreLine
            label="(-) Despesas operacionais"
            value={operatingExpenses}
          />
          <DreLine
            label="Resultado operacional"
            value={operatingResult}
            strong
          />
          <DreLine label="(+/-) Resultado financeiro" value={financialResult} />
          <DreLine label="Resultado antes dos tributos" value={preTax} strong />
          <DreLine label="(-) Tributos sobre o lucro" value={incomeTax} />
          <DreLine label="Resultado líquido" value={netResult} strong />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Classificação das categorias</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define em qual linha cada lançamento aparece na DRE.
          </p>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {categories.map((category) => (
            <DreCategoryRow
              key={category.id}
              category={category}
              disabled={!canManage}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DreCategoryRow({
  category,
  disabled,
}: {
  category: FinancialCategoryRow;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium">{category.name}</span>
      <Select
        value={
          category.dre_group ??
          (category.category_type === "receivable"
            ? "gross_revenue"
            : "operating_expense")
        }
        disabled={disabled || pending}
        onValueChange={(value) =>
          startTransition(async () => {
            const result = await updateFinancialCategoryDreGroup(
              category.id,
              value,
            );
            if (result.error) toast.error(result.error);
            else toast.success(result.success);
          })
        }
        className="w-full sm:w-72"
      >
        <option value="gross_revenue">Receita bruta</option>
        <option value="revenue_deduction">Dedução da receita</option>
        <option value="direct_cost">Custo direto</option>
        <option value="operating_expense">Despesa operacional</option>
        <option value="financial_result">Resultado financeiro</option>
        <option value="income_tax">Tributos sobre o lucro</option>
      </Select>
    </div>
  );
}

function FinancePeriodFilter({ period }: { period: FinancePeriod }) {
  const pathname = usePathname();
  const modeHref = (mode: FinancePeriod["mode"]) =>
    `${pathname}?from=${period.from}&to=${period.to}&mode=${mode}`;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:items-end lg:justify-between">
        <form
          method="get"
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="mode" value={period.mode} />
          <label className="grid gap-1.5 text-sm font-medium">
            De
            <DatePickerInput name="from" defaultValue={period.from} required />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Até
            <DatePickerInput name="to" defaultValue={period.to} required />
          </label>
          <Button type="submit" variant="secondary">
            Aplicar período
          </Button>
        </form>
        <div
          className="flex rounded-md border border-border bg-muted p-1"
          aria-label="Regime financeiro"
        >
          <Button
            asChild
            size="sm"
            variant={period.mode === "accrual" ? "primary" : "ghost"}
          >
            <Link href={modeHref("accrual")}>Competência</Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant={period.mode === "cash" ? "primary" : "ghost"}
          >
            <Link href={modeHref("cash")}>Caixa</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DreLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-border py-3",
        strong && "font-semibold",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
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
  pagination,
  pending,
  onPageChange,
}: {
  receivables: ReceivableRow[];
  paymentMethods: PaymentMethodRow[];
  canReceive: boolean;
} & FinanceSectionPaginationProps) {
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
        enableSorting={false}
        pageSize={pagination.pageSize}
        serverPagination={{ ...pagination, pending, onPageChange }}
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

function PaymentsSection({
  payments,
  pagination,
  pending,
  onPageChange,
}: {
  payments: PaymentRow[];
} & FinanceSectionPaginationProps) {
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
        enableSorting={false}
        pageSize={pagination.pageSize}
        serverPagination={{ ...pagination, pending, onPageChange }}
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
  pagination,
  pending,
  onPageChange,
}: {
  payables: PayableRow[];
  paymentMethods: PaymentMethodRow[];
  canManage: boolean;
} & FinanceSectionPaginationProps) {
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
        enableSorting={false}
        pageSize={pagination.pageSize}
        serverPagination={{ ...pagination, pending, onPageChange }}
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
  pagination,
  pending,
  onPageChange,
}: {
  payouts: PayoutRow[];
  canManage: boolean;
} & FinanceSectionPaginationProps) {
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
        enableSorting={false}
        pageSize={pagination.pageSize}
        serverPagination={{ ...pagination, pending, onPageChange }}
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
        Data do recebimento
        <DatePickerInput
          name="paid_at"
          defaultValue={localDateValue()}
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
      <label className="grid gap-2 text-sm font-medium">
        Data do pagamento
        <DatePickerInput
          name="paid_at"
          defaultValue={localDateValue()}
          required
        />
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
      <label className="grid gap-2 text-sm font-medium">
        Data do pagamento
        <DatePickerInput
          name="paid_at"
          defaultValue={localDateValue()}
          required
        />
      </label>
    </ConfirmDialog>
  );
}

function CreateRevenueDialog({
  categories,
  onClose,
}: {
  categories: FinancialCategoryRow[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    createAccountReceivable,
    initialState,
  );
  useCloseOnSuccess(state, onClose);
  const today = localDateValue();
  return (
    <FormDialog
      open
      onClose={onClose}
      title="Nova receita"
      description="Registre uma receita avulsa por competência."
      formAction={action}
      pending={pending}
      error={state.error}
      confirmLabel="Adicionar receita"
      pendingLabel="Salvando..."
    >
      <label className="grid gap-2 text-sm font-medium">
        Descrição
        <Input name="description" required />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Categoria
        <Select name="category_id" defaultValue="" allowEmptyOption>
          <option value="">Sem categoria</option>
          {categories
            .filter((category) => category.category_type !== "payable")
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </Select>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Valor
        <Input name="amount" type="number" min="0.01" step="0.01" required />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Competência
          <DatePickerInput
            name="competence_date"
            defaultValue={today}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Vencimento
          <DatePickerInput name="due_date" defaultValue={today} required />
        </label>
      </div>
      <label className="grid gap-2 text-sm font-medium">
        Observação
        <Textarea name="notes" />
      </label>
    </FormDialog>
  );
}

function CreateExpenseDialog({
  categories,
  onClose,
}: {
  categories: FinancialCategoryRow[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    createAccountPayable,
    initialState,
  );
  useCloseOnSuccess(state, onClose);
  const today = localDateValue();
  return (
    <FormDialog
      open
      onClose={onClose}
      title="Nova despesa"
      description="Registre uma despesa e sua competência."
      formAction={action}
      pending={pending}
      error={state.error}
      confirmLabel="Adicionar despesa"
      pendingLabel="Salvando..."
    >
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
        Valor
        <Input name="amount" type="number" min="0.01" step="0.01" required />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Competência
          <DatePickerInput
            name="competence_date"
            defaultValue={today}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Vencimento
          <DatePickerInput name="due_date" defaultValue={today} required />
        </label>
      </div>
    </FormDialog>
  );
}

function useCloseOnSuccess(state: FinanceActionState, onClose: () => void) {
  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onClose();
    }
  }, [state.success, onClose]);
}

function localDateValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
  }).format(new Date());
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
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
