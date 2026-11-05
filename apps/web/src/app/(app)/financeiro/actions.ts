"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FinanceActionState = {
  error?: string;
  success?: string;
};

async function requireFinancePermission(code: string) {
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has(code)) return null;
  return context;
}

function friendlyError(message: string) {
  if (message.includes("payment_methods_organization_id_name_key")) {
    return "Já existe uma forma de pagamento com esse nome.";
  }
  if (message.includes("exceeds remaining balance")) {
    return "O valor informado excede o saldo em aberto.";
  }
  if (message.includes("not open for payment")) {
    return "Esta conta não está aberta para recebimento.";
  }
  if (message.includes("Payment method not found")) {
    return "Forma de pagamento inválida.";
  }
  return message;
}

function financialDateTime(value: string | undefined) {
  return value ? `${value}T12:00:00-03:00` : new Date().toISOString();
}

function revalidateFinance() {
  revalidatePath("/pacientes", "layout");
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/contas-a-receber");
  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath("/financeiro/movimentacoes");
  revalidatePath("/financeiro/repasses");
  revalidatePath("/financeiro/dre");
}

export async function createAccountReceivable(
  _state: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const context = await requireFinancePermission(
    "financeiro.receber_pagamento",
  );
  if (!context?.organization) return { error: "Acesso negado." };
  const parsed = z
    .object({
      description: z.string().trim().min(2),
      amount: z.coerce.number().positive(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      category_id: z.union([z.string().uuid(), z.literal("")]),
      notes: z.string().trim().max(500).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: "Preencha descrição, valor e vencimento." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("accounts_receivable").insert({
    organization_id: context.organization.id,
    patient_id: null,
    category_id: parsed.data.category_id || null,
    description: parsed.data.description,
    amount: parsed.data.amount,
    due_date: parsed.data.due_date,
    notes: parsed.data.notes || null,
    created_by_user_id: context.effectiveUser?.id ?? null,
  });
  if (error) return { error: friendlyError(error.message) };
  revalidateFinance();
  return { success: "Receita adicionada." };
}

export async function receivePayment(
  _state: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const context = await requireFinancePermission(
    "financeiro.receber_pagamento",
  );
  if (!context?.organization) return { error: "Acesso negado." };

  const parsed = z
    .object({
      account_receivable_id: z.string().uuid(),
      payment_method_id: z.string().uuid(),
      amount: z.coerce.number().positive(),
      paid_at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "Informe conta, forma de pagamento e valor." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("receive_account_receivable_payment", {
    p_account_receivable_id: parsed.data.account_receivable_id,
    p_payment_method_id: parsed.data.payment_method_id,
    p_amount: parsed.data.amount,
    p_paid_at: financialDateTime(parsed.data.paid_at),
    p_notes: parsed.data.notes || null,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateFinance();
  return { success: "Pagamento registrado." };
}

export async function createAccountPayable(
  _state: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const context = await requireFinancePermission(
    "financeiro.gerenciar_contas_pagar",
  );
  if (!context?.organization) return { error: "Acesso negado." };

  const parsed = z
    .object({
      vendor_name: z.string().trim().min(2),
      description: z.string().trim().min(2),
      amount: z.coerce.number().positive(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      category_id: z.union([z.string().uuid(), z.literal("")]),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "Preencha fornecedor, descrição, vencimento e valor." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("accounts_payable").insert({
    organization_id: context.organization.id,
    category_id: parsed.data.category_id || null,
    vendor_name: parsed.data.vendor_name,
    description: parsed.data.description,
    amount: parsed.data.amount,
    due_date: parsed.data.due_date,
    created_by_user_id: context.effectiveUser?.id ?? null,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateFinance();
  return { success: "Conta a pagar criada." };
}

export async function payAccountPayable(
  _state: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const context = await requireFinancePermission(
    "financeiro.gerenciar_contas_pagar",
  );
  if (!context?.organization) return { error: "Acesso negado." };

  const parsed = z
    .object({
      account_payable_id: z.string().uuid(),
      payment_method_id: z.string().uuid(),
      paid_at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "Selecione a conta e a forma de pagamento." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_account_payable_paid", {
    p_account_payable_id: parsed.data.account_payable_id,
    p_payment_method_id: parsed.data.payment_method_id,
    p_paid_at: financialDateTime(parsed.data.paid_at),
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateFinance();
  return { success: "Conta a pagar quitada." };
}

export async function payProfessionalPayout(
  _state: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const context = await requireFinancePermission(
    "financeiro.gerenciar_contas_pagar",
  );
  if (!context?.organization) return { error: "Acesso negado." };

  const parsed = z
    .object({
      payout_id: z.string().uuid(),
      paid_at: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: "Repasse inválido." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_professional_payout_paid", {
    p_payout_id: parsed.data.payout_id,
    p_paid_at: financialDateTime(parsed.data.paid_at),
  });
  if (error) return { error: friendlyError(error.message) };

  revalidateFinance();
  return { success: "Repasse marcado como pago." };
}

export async function updateFinancialCategoryDreGroup(
  categoryId: string,
  dreGroup: string,
): Promise<FinanceActionState> {
  const context = await requireFinancePermission(
    "financeiro.gerenciar_contas_pagar",
  );
  if (!context?.organization) return { error: "Acesso negado." };
  const parsed = z
    .object({
      id: z.string().uuid(),
      group: z.enum([
        "gross_revenue",
        "revenue_deduction",
        "direct_cost",
        "operating_expense",
        "financial_result",
        "income_tax",
      ]),
    })
    .safeParse({ id: categoryId, group: dreGroup });
  if (!parsed.success) return { error: "Classificação inválida." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("financial_categories")
    .update({ dre_group: parsed.data.group })
    .eq("organization_id", context.organization.id)
    .eq("id", parsed.data.id);
  if (error) return { error: friendlyError(error.message) };
  revalidateFinance();
  return { success: "Classificação do resultado atualizada." };
}

// ─── Correções (Raio-X FI1) ────────────────────────────────────────────────
// Lançou errado tinha que ser corrigido direto no banco. Cancelar e editar
// contas em aberto usam as políticas de RLS que já existem; o estorno de um
// recebimento usa a função reverse_receivable_payment (migração
// 20261105160000). Tudo fica na auditoria.

const reasonSchema = z
  .string()
  .trim()
  .min(3, "Informe o motivo.")
  .max(300, "Use no máximo 300 caracteres.");

async function auditFinance(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  context: NonNullable<Awaited<ReturnType<typeof requireFinancePermission>>>,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown>,
) {
  await supabase.from("audit_logs").insert({
    organization_id: context.organization!.id,
    actor_user_id: context.actor?.id ?? null,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata: {
      ...metadata,
      effective_user_id: context.effectiveUser?.id ?? null,
    },
  });
}

export async function cancelAccountReceivable(
  id: string,
  reason: string,
): Promise<FinanceActionState> {
  const context = await requireFinancePermission("financeiro.ver_geral");
  if (!context?.organization) return { error: "Acesso negado." };
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success || !z.string().uuid().safeParse(id).success) {
    return {
      error: parsedReason.error?.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data: receivable } = await supabase
    .from("accounts_receivable")
    .select("id, status, paid_amount, notes")
    .eq("organization_id", context.organization.id)
    .eq("id", id)
    .maybeSingle<{
      id: string;
      status: string;
      paid_amount: number;
      notes: string | null;
    }>();
  if (!receivable) return { error: "Conta não encontrada." };
  if (!["open", "partial"].includes(receivable.status)) {
    return { error: "Só contas em aberto podem ser canceladas." };
  }
  if (Number(receivable.paid_amount) > 0) {
    return {
      error: "Há recebimentos nesta conta. Estorne-os antes de cancelar.",
    };
  }
  const { error } = await supabase
    .from("accounts_receivable")
    .update({
      status: "cancelled",
      notes: [receivable.notes, `Cancelada: ${parsedReason.data}`]
        .filter(Boolean)
        .join("\n"),
    })
    .eq("organization_id", context.organization.id)
    .eq("id", id);
  if (error) return { error: friendlyError(error.message) };
  await auditFinance(
    supabase,
    context,
    "account_receivable.cancelled",
    "account_receivable",
    id,
    {
      reason: parsedReason.data,
    },
  );
  revalidateFinance();
  return { success: "Conta cancelada." };
}

const editSchema = z.object({
  description: z.string().trim().min(3).max(200),
  amount: z.number().positive().max(9_999_999),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function updateOpenAccountReceivable(
  id: string,
  input: { description: string; amount: number; due_date: string },
): Promise<FinanceActionState> {
  const context = await requireFinancePermission("financeiro.ver_geral");
  if (!context?.organization) return { error: "Acesso negado." };
  const parsed = editSchema.safeParse(input);
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return { error: "Revise descrição, valor e vencimento." };
  }
  const supabase = await createSupabaseServerClient();
  const { data: receivable } = await supabase
    .from("accounts_receivable")
    .select("id, status, paid_amount, amount, description, due_date")
    .eq("organization_id", context.organization.id)
    .eq("id", id)
    .maybeSingle<{
      id: string;
      status: string;
      paid_amount: number;
      amount: number;
      description: string;
      due_date: string;
    }>();
  if (!receivable) return { error: "Conta não encontrada." };
  if (!["open", "partial"].includes(receivable.status)) {
    return { error: "Só contas em aberto podem ser editadas." };
  }
  if (parsed.data.amount < Number(receivable.paid_amount)) {
    return { error: "O valor não pode ficar menor que o já recebido." };
  }
  const nextStatus =
    Number(receivable.paid_amount) >= parsed.data.amount
      ? "paid"
      : Number(receivable.paid_amount) > 0
        ? "partial"
        : "open";
  const { error } = await supabase
    .from("accounts_receivable")
    .update({ ...parsed.data, status: nextStatus })
    .eq("organization_id", context.organization.id)
    .eq("id", id);
  if (error) return { error: friendlyError(error.message) };
  await auditFinance(
    supabase,
    context,
    "account_receivable.updated",
    "account_receivable",
    id,
    {
      before: {
        description: receivable.description,
        amount: receivable.amount,
        due_date: receivable.due_date,
      },
      after: parsed.data,
    },
  );
  revalidateFinance();
  return { success: "Conta atualizada." };
}

export async function reverseReceivablePayment(
  paymentId: string,
  reason: string,
): Promise<FinanceActionState> {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !(
      context.permissionCodes.has("financeiro.ver_geral") ||
      context.permissionCodes.has("financeiro.receber_pagamento")
    )
  ) {
    return { error: "Acesso negado." };
  }
  const parsedReason = reasonSchema.safeParse(reason);
  if (
    !parsedReason.success ||
    !z.string().uuid().safeParse(paymentId).success
  ) {
    return {
      error: parsedReason.error?.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reverse_receivable_payment", {
    p_payment_id: paymentId,
    p_reason: parsedReason.data,
    p_impersonation_session_id: context.impersonation?.id ?? null,
  });
  if (error) {
    if (error.code === "PGRST202" || error.message.includes("Could not find")) {
      return {
        error:
          "O estorno precisa da atualização do banco (migração 20261105160000).",
      };
    }
    if (error.message.includes("payout already paid")) {
      return {
        error:
          "O repasse deste recebimento já foi pago ao profissional. Ajuste o repasse antes de estornar.",
      };
    }
    return { error: friendlyError(error.message) };
  }
  revalidateFinance();
  return { success: "Recebimento estornado." };
}

export async function cancelAccountPayable(
  id: string,
  reason: string,
): Promise<FinanceActionState> {
  const context = await requireFinancePermission(
    "financeiro.gerenciar_contas_pagar",
  );
  if (!context?.organization) return { error: "Acesso negado." };
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success || !z.string().uuid().safeParse(id).success) {
    return {
      error: parsedReason.error?.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("accounts_payable")
    .update({ status: "cancelled" })
    .eq("organization_id", context.organization.id)
    .eq("id", id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (error) return { error: friendlyError(error.message) };
  if (!data)
    return { error: "Só contas a pagar em aberto podem ser canceladas." };
  await auditFinance(
    supabase,
    context,
    "account_payable.cancelled",
    "account_payable",
    id,
    {
      reason: parsedReason.data,
    },
  );
  revalidateFinance();
  return { success: "Conta a pagar cancelada." };
}

export async function reopenAccountPayable(
  id: string,
  reason: string,
): Promise<FinanceActionState> {
  const context = await requireFinancePermission(
    "financeiro.gerenciar_contas_pagar",
  );
  if (!context?.organization) return { error: "Acesso negado." };
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success || !z.string().uuid().safeParse(id).success) {
    return {
      error: parsedReason.error?.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("accounts_payable")
    .update({ status: "open", paid_at: null, paid_by_user_id: null })
    .eq("organization_id", context.organization.id)
    .eq("id", id)
    .eq("status", "paid")
    .select("id")
    .maybeSingle();
  if (error) return { error: friendlyError(error.message) };
  if (!data)
    return { error: "Só pagamentos registrados podem ser estornados." };
  await auditFinance(
    supabase,
    context,
    "account_payable.payment_reversed",
    "account_payable",
    id,
    {
      reason: parsedReason.data,
    },
  );
  revalidateFinance();
  return { success: "Pagamento estornado; a conta voltou a ficar em aberto." };
}
