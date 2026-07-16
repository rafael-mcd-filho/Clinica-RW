import {
  Buildings as Building2,
  CurrencyCircleDollar as CircleDollarSign,
  GearSix as Settings,
  Wallet as WalletCards,
} from "@phosphor-icons/react/dist/ssr";
import {
  FinancePanel,
  type FinancialCategoryRow,
  type FinanceListPagination,
  type FinanceSummary,
  type PayableRow,
  type PaymentMethodRow,
  type PaymentRow,
  type PayoutRow,
  type ReceivableRow,
} from "./finance-panel";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type OrganizationBillingRow = {
  status: string;
};

type FinanceSummaryRpcRow = {
  open_receivable: number | string;
  received_month: number | string;
  open_payable: number | string;
  pending_payout: number | string;
  receivable_count: number | string;
  payment_count: number | string;
  payable_count: number | string;
  payout_count: number | string;
};

type FinancePeriodMetricsRow = {
  accrual_revenue: number | string;
  accrual_expense: number | string;
  cash_in: number | string;
  cash_out: number | string;
  open_receivable: number | string;
  open_payable: number | string;
  average_collection_days: number | string;
};

type DreRow = { dre_group: string; amount: number | string };

const financePageSize = 10;

export type FinanceSection =
  | "visao-geral"
  | "a-receber"
  | "a-pagar"
  | "movimentacoes"
  | "repasses"
  | "dre";

export default async function FinanceiroPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderFinanceiroPage("visao-geral", props);
}

export async function renderFinanceiroPage(
  section: FinanceSection,
  {
    searchParams,
  }: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  },
) {
  const context = await getRequestContext();

  if (context.isSuperAdmin) {
    return <SuperAdminFinanceView />;
  }

  if (
    !hasAnyPermission(context.permissionCodes, [
      "financeiro.ver_geral",
      "financeiro.ver_proprio_repasse",
      "financeiro.receber_pagamento",
      "financeiro.gerenciar_contas_pagar",
    ])
  ) {
    redirect("/dashboard");
  }

  if (!context.organization) redirect("/dashboard");

  const canViewGeneral = context.permissionCodes.has("financeiro.ver_geral");
  const canReceive = context.permissionCodes.has(
    "financeiro.receber_pagamento",
  );
  const canManagePayables = context.permissionCodes.has(
    "financeiro.gerenciar_contas_pagar",
  );
  const canViewOwnPayout = context.permissionCodes.has(
    "financeiro.ver_proprio_repasse",
  );
  const canViewCash = canViewGeneral || canReceive;
  const canViewPayables = canViewGeneral || canManagePayables;
  const canViewPayouts =
    canViewGeneral || canViewOwnPayout || canManagePayables;
  const organizationId = context.organization.id;
  const supabase = await createSupabaseServerClient();
  const params = (await searchParams) ?? {};
  const period = financePeriod(params);
  const pages = {
    receivables: financePageParam(params.receivables_page),
    payments: financePageParam(params.payments_page),
    payables: financePageParam(params.payables_page),
    payouts: financePageParam(params.payouts_page),
  };

  const [
    financeSummary,
    receivables,
    payments,
    payables,
    payouts,
    paymentMethods,
    categories,
    periodMetrics,
    dre,
  ] = await Promise.all([
    supabase
      .rpc("get_operational_finance_summary", {
        p_organization_id: organizationId,
      })
      .returns<FinanceSummaryRpcRow[]>(),
    canViewCash && section === "a-receber"
      ? supabase
          .from("accounts_receivable")
          .select(
            "id, description, amount, paid_amount, due_date, status, patients(full_name, social_name), professionals(name)",
            { count: "exact" },
          )
          .eq("organization_id", organizationId)
          .gte("due_date", period.from)
          .lte("due_date", period.to)
          .order("due_date", { ascending: true })
          .order("id", { ascending: true })
          .range(
            (pages.receivables - 1) * financePageSize,
            pages.receivables * financePageSize - 1,
          )
          .returns<ReceivableRow[]>()
      : Promise.resolve({ data: [] as ReceivableRow[] }),
    canViewCash && section === "movimentacoes"
      ? supabase
          .from("payments")
          .select(
            "id, account_receivable_id, amount, paid_at, payment_methods(name), accounts_receivable(description)",
            { count: "exact" },
          )
          .eq("organization_id", organizationId)
          .gte("paid_at", `${period.from}T00:00:00-03:00`)
          .lte("paid_at", `${period.to}T23:59:59.999-03:00`)
          .order("paid_at", { ascending: false })
          .order("id", { ascending: true })
          .range(
            (pages.payments - 1) * financePageSize,
            pages.payments * financePageSize - 1,
          )
          .returns<PaymentRow[]>()
      : Promise.resolve({ data: [] as PaymentRow[] }),
    canViewPayables && section === "a-pagar"
      ? supabase
          .from("accounts_payable")
          .select("id, vendor_name, description, amount, due_date, status", {
            count: "exact",
          })
          .eq("organization_id", organizationId)
          .gte("due_date", period.from)
          .lte("due_date", period.to)
          .order("due_date", { ascending: true })
          .order("id", { ascending: true })
          .range(
            (pages.payables - 1) * financePageSize,
            pages.payables * financePageSize - 1,
          )
          .returns<PayableRow[]>()
      : Promise.resolve({ data: [] as PayableRow[] }),
    canViewPayouts && section === "repasses"
      ? supabase
          .from("professional_payouts")
          .select("id, amount, due_date, status, professionals(name)", {
            count: "exact",
          })
          .eq("organization_id", organizationId)
          .gte("due_date", period.from)
          .lte("due_date", period.to)
          .order("due_date", { ascending: false })
          .order("id", { ascending: true })
          .range(
            (pages.payouts - 1) * financePageSize,
            pages.payouts * financePageSize - 1,
          )
          .returns<PayoutRow[]>()
      : Promise.resolve({ data: [] as PayoutRow[] }),
    (canReceive && section === "a-receber") ||
    (canManagePayables && section === "a-pagar")
      ? supabase
          .from("payment_methods")
          .select("id, name, method_type")
          .eq("organization_id", organizationId)
          .eq("active", true)
          .order("name")
          .returns<PaymentMethodRow[]>()
      : Promise.resolve({ data: [] as PaymentMethodRow[] }),
    canViewGeneral || canReceive || canManagePayables
      ? supabase
          .from("financial_categories")
          .select("id, name, category_type, dre_group")
          .eq("organization_id", organizationId)
          .eq("active", true)
          .order("name")
          .returns<FinancialCategoryRow[]>()
      : Promise.resolve({ data: [] as FinancialCategoryRow[] }),
    supabase
      .rpc("get_finance_period_metrics", {
        p_organization_id: organizationId,
        p_from: period.from,
        p_to: period.to,
      })
      .returns<FinancePeriodMetricsRow[]>(),
    canViewGeneral
      ? supabase
          .rpc("get_finance_dre", {
            p_organization_id: organizationId,
            p_from: period.from,
            p_to: period.to,
          })
          .returns<DreRow[]>()
      : Promise.resolve({ data: [] as DreRow[] }),
  ]);

  if (financeSummary.error) {
    throw new Error("Não foi possível carregar os indicadores financeiros.");
  }

  const receivableRows = receivables.data ?? [];
  const paymentRows = payments.data ?? [];
  const payableRows = payables.data ?? [];
  const payoutRows = payouts.data ?? [];
  const summaryRow = Array.isArray(financeSummary.data)
    ? financeSummary.data[0]
    : undefined;
  const periodRows = Array.isArray(periodMetrics.data)
    ? (periodMetrics.data as unknown as FinancePeriodMetricsRow[])
    : [];
  const dreRows = Array.isArray(dre.data)
    ? (dre.data as unknown as DreRow[])
    : [];
  const summary: FinanceSummary = {
    openReceivable: Number(summaryRow?.open_receivable ?? 0),
    receivedMonth: Number(summaryRow?.received_month ?? 0),
    openPayable: Number(summaryRow?.open_payable ?? 0),
    pendingPayout: Number(summaryRow?.pending_payout ?? 0),
    accrualRevenue: Number(periodRows[0]?.accrual_revenue ?? 0),
    accrualExpense: Number(periodRows[0]?.accrual_expense ?? 0),
    cashIn: Number(periodRows[0]?.cash_in ?? 0),
    cashOut: Number(periodRows[0]?.cash_out ?? 0),
    averageCollectionDays: Number(periodRows[0]?.average_collection_days ?? 0),
  };
  const pagination = {
    receivables: financePagination(
      pages.receivables,
      ("count" in receivables ? receivables.count : null) ??
        summaryRow?.receivable_count,
      receivableRows.length,
    ),
    payments: financePagination(
      pages.payments,
      ("count" in payments ? payments.count : null) ??
        summaryRow?.payment_count,
      paymentRows.length,
    ),
    payables: financePagination(
      pages.payables,
      ("count" in payables ? payables.count : null) ??
        summaryRow?.payable_count,
      payableRows.length,
    ),
    payouts: financePagination(
      pages.payouts,
      ("count" in payouts ? payouts.count : null) ?? summaryRow?.payout_count,
      payoutRows.length,
    ),
  } satisfies Record<string, FinanceListPagination>;

  return (
    <FinancePanel
      section={section}
      period={period}
      dreRows={dreRows.map((row) => ({
        group: row.dre_group,
        amount: Number(row.amount),
      }))}
      summary={summary}
      receivables={receivableRows}
      payments={paymentRows}
      payables={payableRows}
      payouts={payoutRows}
      paymentMethods={paymentMethods.data ?? []}
      categories={categories.data ?? []}
      pagination={pagination}
      permissions={{
        canReceive,
        canManagePayables,
        canViewCash,
        canViewPayables,
        canViewPayouts,
      }}
    />
  );
}

function financePeriod(params: Record<string, string | string[] | undefined>) {
  const now = new Date();
  const fallbackFrom = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const fallbackTo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);
  const validDate = (value: string | undefined) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  const mode = firstSearchParam(params.mode) === "cash" ? "cash" : "accrual";
  return {
    from: validDate(firstSearchParam(params.from)) ?? fallbackFrom,
    to: validDate(firstSearchParam(params.to)) ?? fallbackTo,
    mode: mode as "cash" | "accrual",
  };
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function financePageParam(value: string | string[] | undefined) {
  const parsed = Number.parseInt(firstSearchParam(value) ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

function financePagination(
  page: number,
  total: number | string | undefined,
  loadedRows: number,
): FinanceListPagination {
  const parsedTotal = total === undefined ? null : Number(total);
  const fallbackTotal = (page - 1) * financePageSize + loadedRows;

  return {
    page,
    pageSize: financePageSize,
    total:
      parsedTotal !== null && Number.isFinite(parsedTotal)
        ? Math.max(0, parsedTotal)
        : fallbackTotal,
  };
}

async function SuperAdminFinanceView() {
  const supabase = await createSupabaseServerClient();
  const { data: organizationRows } = await supabase
    .from("organizations")
    .select("status")
    .returns<OrganizationBillingRow[]>();
  const organizations = organizationRows ?? [];

  const activeOrganizations = organizations.filter(
    (organization) => organization.status === "active",
  ).length;
  const trialOrganizations = organizations.filter(
    (organization) => organization.status === "trial",
  ).length;
  const suspendedOrganizations = organizations.filter(
    (organization) => organization.status === "suspended",
  ).length;

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-xl font-semibold">Financeiro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão do faturamento SaaS da plataforma.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
          <Building2 className="size-5 text-primary" aria-hidden="true" />
          <p className="mt-5 text-sm text-muted-foreground">Empresas ativas</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {activeOrganizations}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
          <WalletCards className="size-5 text-primary" aria-hidden="true" />
          <p className="mt-5 text-sm text-muted-foreground">Trials</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {trialOrganizations}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
          <WalletCards className="size-5 text-warning" aria-hidden="true" />
          <p className="mt-5 text-sm text-muted-foreground">
            Empresas suspensas
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {suspendedOrganizations}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <CircleDollarSign
            className="size-5 text-primary"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-base font-semibold">Cobrança SaaS</h2>
            <p className="text-sm text-muted-foreground">
              Assinaturas e receita recorrente entram na Fase 19.
            </p>
          </div>
        </div>
        <div className="flex min-h-40 items-center justify-center px-5 py-8">
          <div className="max-w-md text-center">
            <Settings
              className="mx-auto size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium">
              Financeiro SaaS ainda sem billing recorrente
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              A Fase 9 cobre o financeiro operacional das clínicas. Billing da
              plataforma continua reservado para a Fase 19.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
