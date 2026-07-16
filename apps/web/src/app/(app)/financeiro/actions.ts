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
    return "Ja existe uma forma de pagamento com esse nome.";
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
      competence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      category_id: z.union([z.string().uuid(), z.literal("")]),
      notes: z.string().trim().max(500).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { error: "Preencha descrição, valor, competência e vencimento." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("accounts_receivable").insert({
    organization_id: context.organization.id,
    patient_id: null,
    category_id: parsed.data.category_id || null,
    description: parsed.data.description,
    amount: parsed.data.amount,
    competence_date: parsed.data.competence_date,
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
      competence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
    competence_date: parsed.data.competence_date,
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
  return { success: "Classificação da DRE atualizada." };
}
