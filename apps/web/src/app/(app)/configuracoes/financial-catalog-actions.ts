"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CatalogActionState = {
  error?: string;
  success?: string;
};

const optionalId = z.string().uuid().nullable();

function decimalValue(value: unknown) {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  return normalized === "" ? undefined : Number(normalized);
}

const calculationSchema = z
  .object({
    calculation_type: z.enum(["fixed", "percentage"]),
    value: z.preprocess(
      decimalValue,
      z.number().finite().min(0, "O valor não pode ser negativo."),
    ),
  })
  .superRefine((data, context) => {
    if (data.calculation_type === "percentage" && data.value > 100) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "O percentual deve estar entre 0% e 100%.",
      });
    }
  });

const procedureCostSchema = z
  .object({
    procedure_id: z.string().uuid("Selecione um procedimento ou serviço."),
    name: z.string().trim().min(2, "Informe o nome do custo.").max(80),
    cost_type: z.enum([
      "commission",
      "location_fee",
      "materials",
      "outsourced_service",
      "taxes",
      "equipment",
      "other",
    ]),
  })
  .and(calculationSchema);

const paymentMethodSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da forma de pagamento.")
    .max(80),
  method_type: z.enum([
    "cash",
    "pix",
    "credit_card",
    "debit_card",
    "bank_transfer",
    "other",
  ]),
});

const paymentMethodFeeSchema = z
  .object({
    payment_method_id: z.string().uuid("Selecione uma forma de pagamento."),
    name: z.string().trim().min(2, "Informe o nome da taxa.").max(80),
  })
  .and(calculationSchema);

async function requireCatalogPermission() {
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has("config.geral")) {
    return null;
  }
  return context;
}

function formValues(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_")),
  );
}

function refreshCatalog() {
  revalidatePath("/configuracoes", "layout");
  revalidatePath("/agenda");
  revalidatePath("/financeiro");
  revalidatePath("/agendar", "layout");
}

function databaseError(message: string) {
  if (message.includes("payment_methods_organization_id_name_key")) {
    return "Já existe uma forma de pagamento com esse nome.";
  }
  if (message.includes("foreign key")) {
    return "O item selecionado não pertence a esta empresa.";
  }
  return "Não foi possível salvar. Tente novamente.";
}

export async function saveProcedureCost(
  recordId: string | null,
  _previousState: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const context = await requireCatalogPermission();
  if (!context?.organization) return { error: "Acesso negado." };

  const id = optionalId.safeParse(recordId);
  const parsed = procedureCostSchema.safeParse(formValues(formData));
  if (!id.success || !parsed.success) {
    return {
      error: parsed.success
        ? "Custo inválido."
        : (parsed.error.issues[0]?.message ?? "Revise os dados do custo."),
    };
  }

  const supabase = await createSupabaseServerClient();
  const payload = {
    ...parsed.data,
    organization_id: context.organization.id,
  };
  const query = recordId
    ? supabase
        .from("procedure_costs")
        .update(payload)
        .eq("organization_id", context.organization.id)
        .eq("id", recordId)
    : supabase.from("procedure_costs").insert(payload);
  const { error } = await query;

  if (error) return { error: databaseError(error.message) };
  refreshCatalog();
  return { success: recordId ? "Custo atualizado." : "Custo adicionado." };
}

export async function setProcedureCostActive(
  recordId: string,
  active: boolean,
): Promise<CatalogActionState> {
  const context = await requireCatalogPermission();
  if (!context?.organization) return { error: "Acesso negado." };

  const parsedId = z.string().uuid().safeParse(recordId);
  if (!parsedId.success) return { error: "Custo inválido." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("procedure_costs")
    .update({ active })
    .eq("organization_id", context.organization.id)
    .eq("id", recordId);
  if (error) return { error: databaseError(error.message) };

  refreshCatalog();
  return { success: active ? "Custo ativado." : "Custo desativado." };
}

export async function deleteProcedureCost(
  recordId: string,
  _previousState: CatalogActionState,
  _formData: FormData,
): Promise<CatalogActionState> {
  void _previousState;
  void _formData;
  const context = await requireCatalogPermission();
  if (!context?.organization) return { error: "Acesso negado." };

  const parsedId = z.string().uuid().safeParse(recordId);
  if (!parsedId.success) return { error: "Custo inválido." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("procedure_costs")
    .delete()
    .eq("organization_id", context.organization.id)
    .eq("id", recordId);
  if (error) return { error: databaseError(error.message) };

  refreshCatalog();
  return { success: "Custo excluído." };
}

export async function savePaymentMethod(
  recordId: string | null,
  _previousState: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const context = await requireCatalogPermission();
  if (!context?.organization) return { error: "Acesso negado." };

  const id = optionalId.safeParse(recordId);
  const parsed = paymentMethodSchema.safeParse(formValues(formData));
  if (!id.success || !parsed.success) {
    return {
      error: parsed.success
        ? "Forma de pagamento inválida."
        : (parsed.error.issues[0]?.message ?? "Revise os dados informados."),
    };
  }

  const supabase = await createSupabaseServerClient();
  const payload = {
    ...parsed.data,
    organization_id: context.organization.id,
  };
  const query = recordId
    ? supabase
        .from("payment_methods")
        .update(payload)
        .eq("organization_id", context.organization.id)
        .eq("id", recordId)
    : supabase.from("payment_methods").insert(payload);
  const { error } = await query;

  if (error) return { error: databaseError(error.message) };
  refreshCatalog();
  return {
    success: recordId
      ? "Forma de pagamento atualizada."
      : "Forma de pagamento cadastrada.",
  };
}

export async function setPaymentMethodActive(
  recordId: string,
  active: boolean,
): Promise<CatalogActionState> {
  const context = await requireCatalogPermission();
  if (!context?.organization) return { error: "Acesso negado." };

  const parsedId = z.string().uuid().safeParse(recordId);
  if (!parsedId.success) return { error: "Forma de pagamento inválida." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("payment_methods")
    .update({ active })
    .eq("organization_id", context.organization.id)
    .eq("id", recordId);
  if (error) return { error: databaseError(error.message) };

  refreshCatalog();
  return {
    success: active
      ? "Forma de pagamento ativada."
      : "Forma de pagamento desativada.",
  };
}

export async function deletePaymentMethod(
  recordId: string,
  _previousState: CatalogActionState,
  _formData: FormData,
): Promise<CatalogActionState> {
  void _previousState;
  void _formData;
  const context = await requireCatalogPermission();
  if (!context?.organization) return { error: "Acesso negado." };

  const parsedId = z.string().uuid().safeParse(recordId);
  if (!parsedId.success) return { error: "Forma de pagamento inválida." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_unused_payment_method", {
    p_payment_method_id: recordId,
  });
  if (error) {
    if (
      error.code === "23503" ||
      error.message.includes("payment method is referenced")
    ) {
      return {
        error:
          "Esta forma de pagamento já possui lançamentos ou agendamentos. Desative-a para preservar o histórico.",
      };
    }
    return { error: databaseError(error.message) };
  }

  refreshCatalog();
  return { success: "Forma de pagamento excluída." };
}

export async function savePaymentMethodFee(
  recordId: string | null,
  _previousState: CatalogActionState,
  formData: FormData,
): Promise<CatalogActionState> {
  const context = await requireCatalogPermission();
  if (!context?.organization) return { error: "Acesso negado." };

  const id = optionalId.safeParse(recordId);
  const parsed = paymentMethodFeeSchema.safeParse(formValues(formData));
  if (!id.success || !parsed.success) {
    return {
      error: parsed.success
        ? "Taxa inválida."
        : (parsed.error.issues[0]?.message ?? "Revise os dados da taxa."),
    };
  }

  const supabase = await createSupabaseServerClient();
  const payload = {
    ...parsed.data,
    organization_id: context.organization.id,
  };
  const query = recordId
    ? supabase
        .from("payment_method_fees")
        .update(payload)
        .eq("organization_id", context.organization.id)
        .eq("id", recordId)
    : supabase.from("payment_method_fees").insert(payload);
  const { error } = await query;

  if (error) return { error: databaseError(error.message) };
  refreshCatalog();
  return { success: recordId ? "Taxa atualizada." : "Taxa adicionada." };
}

export async function setPaymentMethodFeeActive(
  recordId: string,
  active: boolean,
): Promise<CatalogActionState> {
  const context = await requireCatalogPermission();
  if (!context?.organization) return { error: "Acesso negado." };

  const parsedId = z.string().uuid().safeParse(recordId);
  if (!parsedId.success) return { error: "Taxa inválida." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("payment_method_fees")
    .update({ active })
    .eq("organization_id", context.organization.id)
    .eq("id", recordId);
  if (error) return { error: databaseError(error.message) };

  refreshCatalog();
  return { success: active ? "Taxa ativada." : "Taxa desativada." };
}

export async function deletePaymentMethodFee(
  recordId: string,
  _previousState: CatalogActionState,
  _formData: FormData,
): Promise<CatalogActionState> {
  void _previousState;
  void _formData;
  const context = await requireCatalogPermission();
  if (!context?.organization) return { error: "Acesso negado." };

  const parsedId = z.string().uuid().safeParse(recordId);
  if (!parsedId.success) return { error: "Taxa inválida." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("payment_method_fees")
    .delete()
    .eq("organization_id", context.organization.id)
    .eq("id", recordId);
  if (error) return { error: databaseError(error.message) };

  refreshCatalog();
  return { success: "Taxa excluída." };
}
