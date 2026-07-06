import {
  Building2,
  CircleDollarSign,
  Settings,
  WalletCards,
} from "lucide-react";
import {
  FinancePanel,
  type FinancialCategoryRow,
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

export default async function FinanceiroPage() {
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
  const canManagePaymentMethods = context.permissionCodes.has(
    "financeiro.ver_geral",
  );
  const canViewOwnPayout = context.permissionCodes.has(
    "financeiro.ver_proprio_repasse",
  );
  const canViewCash = canViewGeneral || canReceive;
  const organizationId = context.organization.id;
  const supabase = await createSupabaseServerClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [receivables, payments, payables, payouts, paymentMethods, categories] =
    await Promise.all([
      canViewCash
        ? supabase
            .from("accounts_receivable")
            .select(
              "id, description, amount, paid_amount, due_date, status, patients(full_name, social_name), professionals(name)",
            )
            .eq("organization_id", organizationId)
            .order("due_date", { ascending: true })
            .limit(30)
            .returns<ReceivableRow[]>()
        : Promise.resolve({ data: [] as ReceivableRow[] }),
      canViewCash
        ? supabase
            .from("payments")
            .select(
              "id, account_receivable_id, amount, paid_at, payment_methods(name), accounts_receivable(description)",
            )
            .eq("organization_id", organizationId)
            .order("paid_at", { ascending: false })
            .limit(20)
            .returns<PaymentRow[]>()
        : Promise.resolve({ data: [] as PaymentRow[] }),
      canViewGeneral || canManagePayables
        ? supabase
            .from("accounts_payable")
            .select("id, vendor_name, description, amount, due_date, status")
            .eq("organization_id", organizationId)
            .order("due_date", { ascending: true })
            .limit(30)
            .returns<PayableRow[]>()
        : Promise.resolve({ data: [] as PayableRow[] }),
      canViewGeneral || canViewOwnPayout || canManagePayables
        ? supabase
            .from("professional_payouts")
            .select("id, amount, due_date, status, professionals(name)")
            .eq("organization_id", organizationId)
            .order("due_date", { ascending: false })
            .limit(30)
            .returns<PayoutRow[]>()
        : Promise.resolve({ data: [] as PayoutRow[] }),
      canReceive || canManagePayables || canManagePaymentMethods
        ? supabase
            .from("payment_methods")
            .select("id, name, method_type")
            .eq("organization_id", organizationId)
            .eq("active", true)
            .order("name")
            .returns<PaymentMethodRow[]>()
        : Promise.resolve({ data: [] as PaymentMethodRow[] }),
      canManagePayables
        ? supabase
            .from("financial_categories")
            .select("id, name, category_type")
            .eq("organization_id", organizationId)
            .eq("active", true)
            .order("name")
            .returns<FinancialCategoryRow[]>()
        : Promise.resolve({ data: [] as FinancialCategoryRow[] }),
    ]);

  const receivableRows = receivables.data ?? [];
  const paymentRows = payments.data ?? [];
  const payableRows = payables.data ?? [];
  const payoutRows = payouts.data ?? [];
  const summary: FinanceSummary = {
    openReceivable: receivableRows
      .filter((item) => ["open", "partial"].includes(item.status))
      .reduce(
        (sum, item) =>
          sum + Math.max(0, Number(item.amount) - Number(item.paid_amount)),
        0,
      ),
    receivedMonth: paymentRows
      .filter((item) => new Date(item.paid_at) >= monthStart)
      .reduce((sum, item) => sum + Number(item.amount), 0),
    openPayable: payableRows
      .filter((item) => item.status === "open")
      .reduce((sum, item) => sum + Number(item.amount), 0),
    pendingPayout: payoutRows
      .filter((item) => item.status === "pending")
      .reduce((sum, item) => sum + Number(item.amount), 0),
  };

  return (
    <FinancePanel
      summary={summary}
      receivables={receivableRows}
      payments={paymentRows}
      payables={payableRows}
      payouts={payoutRows}
      paymentMethods={paymentMethods.data ?? []}
      categories={categories.data ?? []}
      permissions={{
        canReceive,
        canManagePayables,
        canManagePaymentMethods,
        canViewCash,
        canViewPayouts: canViewGeneral || canViewOwnPayout || canManagePayables,
      }}
    />
  );
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
