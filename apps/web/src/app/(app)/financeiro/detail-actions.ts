"use server";

import { z } from "zod";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadReportTimeZone, zonedDateKey } from "@/lib/reports/time-zone";
import type {
  PaymentMethodRow,
  PaymentRow,
  PayableRow,
  PayoutRow,
  ReceivableRow,
} from "./finance-panel";

export type FinancialRecordKind =
  "receivable" | "payment" | "payable" | "payout";
type FinancialRecord =
  | { kind: "receivable"; row: ReceivableRow }
  | { kind: "payment"; row: PaymentRow }
  | { kind: "payable"; row: PayableRow }
  | { kind: "payout"; row: PayoutRow };
export type FinancialDetails = {
  record: FinancialRecord;
  description: string;
  party: string | null;
  category: string | null;
  notes: string | null;
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  status: string;
  amount: number;
  paidAmount: number | null;
  canSettle: boolean;
  paymentMethods: PaymentMethodRow[];
  payments: PaymentRow[];
  paymentCount: number;
  timeZone: string;
  today: string;
};
export type FinancialDetailsResult =
  { data: FinancialDetails; error?: never } | { error: string; data?: never };

export async function loadFinancialDetails(
  kind: FinancialRecordKind,
  id: string,
): Promise<FinancialDetailsResult> {
  if (
    !z.enum(["receivable", "payment", "payable", "payout"]).safeParse(kind)
      .success ||
    !z.string().uuid().safeParse(id).success
  ) {
    return { error: "Lançamento inválido." };
  }
  const context = await getRequestContext();
  const allowed =
    kind === "payable"
      ? ["financeiro.ver_geral", "financeiro.gerenciar_contas_pagar"]
      : kind === "payout"
        ? ["financeiro.ver_geral", "financeiro.ver_proprio_repasse"]
        : ["financeiro.ver_geral", "financeiro.receber_pagamento"];
  if (
    !context.organization ||
    !context.effectiveUser ||
    !hasAnyPermission(context.permissionCodes, allowed)
  ) {
    return { error: "Você não tem permissão para visualizar este lançamento." };
  }
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const missing = {
    error: "Lançamento não encontrado ou indisponível para seu acesso.",
  };
  let record: FinancialRecord;
  let description = "";
  let party: string | null = null;
  let category: string | null = null;
  let notes: string | null = null;
  let dueDate: string | null = null;
  let paidAt: string | null = null;
  let paymentMethod: string | null = null;
  let status = "paid";
  let paidAmount: number | null = null;
  let canSettle = false;
  let payments: PaymentRow[] = [];
  let paymentCount = 0;

  if (kind === "receivable") {
    const { data: row, error } = await supabase
      .from("accounts_receivable")
      .select(
        "id, description, amount, paid_amount, due_date, status, notes, patients(full_name, social_name), professionals(name), financial_categories(name)",
      )
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle<
        ReceivableRow & {
          notes: string | null;
          financial_categories: { name: string } | null;
        }
      >();
    if (error || !row) return missing;
    record = { kind, row };
    description = row.description;
    party = row.patients?.social_name || row.patients?.full_name || null;
    category = row.financial_categories?.name ?? null;
    notes = row.notes;
    dueDate = row.due_date;
    status = row.status;
    paidAmount = Number(row.paid_amount);
    canSettle =
      context.permissionCodes.has("financeiro.receber_pagamento") &&
      ["open", "partial"].includes(status) &&
      Number(row.amount) > paidAmount;
    const history = await supabase
      .from("payments")
      .select(
        "id, account_receivable_id, amount, paid_at, payment_methods(name)",
        { count: "exact" },
      )
      .eq("organization_id", organizationId)
      .eq("account_receivable_id", id)
      .order("paid_at", { ascending: false })
      .limit(100)
      .returns<PaymentRow[]>();
    if (history.error)
      return {
        error: "Não foi possível carregar os recebimentos. Tente novamente.",
      };
    payments = history.data ?? [];
    paymentCount = history.count ?? payments.length;
  } else if (kind === "payment") {
    const { data: row, error } = await supabase
      .from("payments")
      .select(
        "id, account_receivable_id, amount, paid_at, notes, payment_methods(name), accounts_receivable(description)",
      )
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle<PaymentRow & { notes: string | null }>();
    if (error || !row) return missing;
    record = { kind, row };
    description = row.accounts_receivable?.description ?? "Recebimento";
    paidAt = row.paid_at;
    paymentMethod = row.payment_methods?.name ?? null;
    notes = row.notes;
  } else if (kind === "payable") {
    const { data: row, error } = await supabase
      .from("accounts_payable")
      .select(
        "id, vendor_name, description, amount, due_date, status, paid_at, financial_categories(name), payment_methods(name)",
      )
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle<
        PayableRow & {
          paid_at: string | null;
          financial_categories: { name: string } | null;
          payment_methods: { name: string } | null;
        }
      >();
    if (error || !row) return missing;
    record = { kind, row };
    description = row.description;
    party = row.vendor_name;
    category = row.financial_categories?.name ?? null;
    paymentMethod = row.payment_methods?.name ?? null;
    paidAt = row.paid_at;
    dueDate = row.due_date;
    status = row.status;
    canSettle =
      context.permissionCodes.has("financeiro.gerenciar_contas_pagar") &&
      status === "open";
  } else {
    let query = supabase
      .from("professional_payouts")
      .select(
        "id, professional_id, amount, due_date, status, paid_at, professionals(name)",
      )
      .eq("organization_id", organizationId)
      .eq("id", id);
    // Também restringe a visualização durante uma sessão de suporte.
    if (!context.permissionCodes.has("financeiro.ver_geral")) {
      const professional = await supabase
        .from("professionals")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", context.effectiveUser.id)
        .maybeSingle<{ id: string }>();
      if (professional.error || !professional.data) return missing;
      query = query.eq("professional_id", professional.data.id);
    }
    const { data: row, error } = await query.maybeSingle<
      PayoutRow & { paid_at: string | null }
    >();
    if (error || !row) return missing;
    record = { kind, row };
    description = "Repasse profissional";
    party = row.professionals?.name ?? null;
    paidAt = row.paid_at;
    dueDate = row.due_date;
    status = row.status;
    canSettle =
      context.permissionCodes.has("financeiro.gerenciar_contas_pagar") &&
      status === "pending";
  }

  let paymentMethods: PaymentMethodRow[] = [];
  if (canSettle && kind !== "payout") {
    const methods = await supabase
      .from("payment_methods")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .returns<PaymentMethodRow[]>();
    if (methods.error)
      return {
        error:
          "Não foi possível carregar as formas de pagamento. Tente novamente.",
      };
    paymentMethods = methods.data ?? [];
  }
  const timeZone = await loadReportTimeZone(supabase, organizationId);
  return {
    data: {
      record,
      description,
      party,
      category,
      notes,
      dueDate,
      paidAt,
      paymentMethod,
      status,
      amount: Number(record.row.amount),
      paidAmount,
      canSettle,
      paymentMethods,
      payments,
      paymentCount,
      timeZone,
      today: zonedDateKey(new Date(), timeZone),
    },
  };
}
