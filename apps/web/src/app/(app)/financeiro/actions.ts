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

export async function createPaymentMethod(
  _state: FinanceActionState,
  formData: FormData,
): Promise<FinanceActionState> {
  const context = await requireFinancePermission("financeiro.ver_geral");
  if (!context?.organization) return { error: "Acesso negado." };

  const parsed = z
    .object({
      name: z.string().trim().min(2).max(80),
      method_type: z.enum([
        "cash",
        "pix",
        "credit_card",
        "debit_card",
        "bank_transfer",
        "other",
      ]),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "Informe nome e tipo da forma de pagamento." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("payment_methods").insert({
    organization_id: context.organization.id,
    name: parsed.data.name,
    method_type: parsed.data.method_type,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/financeiro");
  revalidatePath("/agenda");
  return { success: "Forma de pagamento cadastrada." };
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
    p_paid_at: new Date().toISOString(),
    p_notes: parsed.data.notes || null,
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/financeiro");
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

  revalidatePath("/financeiro");
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
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "Selecione a conta e a forma de pagamento." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_account_payable_paid", {
    p_account_payable_id: parsed.data.account_payable_id,
    p_payment_method_id: parsed.data.payment_method_id,
    p_paid_at: new Date().toISOString(),
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/financeiro");
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
    .object({ payout_id: z.string().uuid() })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: "Repasse inválido." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_professional_payout_paid", {
    p_payout_id: parsed.data.payout_id,
    p_paid_at: new Date().toISOString(),
  });
  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/financeiro");
  return { success: "Repasse marcado como pago." };
}
