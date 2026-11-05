"use server";

import QRCode from "qrcode";
import { z } from "zod";
import { getRequestContext, hasAnyPermission } from "@/lib/auth/context";
import { isMissingColumnError } from "@/lib/clinic/base-registrations";
import {
  buildPixPayload,
  maskPixKey,
  pixKeyTypeLabels,
  type PixKeyType,
} from "@/lib/finance/pix";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PixCharge = {
  payload: string;
  qrDataUrl: string;
  amount: number;
  description: string;
  receiver: string;
  keyLabel: string;
  patientFirstName: string | null;
  patientWhatsapp: string | null;
};

export type PixChargeResult =
  | { data: PixCharge; error?: never }
  | { error: string; reason?: "no_key" | "migration"; data?: never };

/**
 * Raio-X FI4: Pix copia e cola e QR Code com o valor em aberto da conta.
 * Lido com o cliente do usuário (RLS): só gera para quem vê a conta.
 */
export async function getReceivablePixCharge(
  receivableId: string,
): Promise<PixChargeResult> {
  if (!z.string().uuid().safeParse(receivableId).success) {
    return { error: "Conta inválida." };
  }
  const context = await getRequestContext();
  if (
    !context.organization ||
    !hasAnyPermission(context.permissionCodes, [
      "financeiro.ver_geral",
      "financeiro.receber_pagamento",
    ])
  ) {
    return { error: "Você não tem permissão para cobrar esta conta." };
  }
  const organizationId = context.organization.id;
  const supabase = await createSupabaseServerClient();

  const [receivableResult, methodResult, clinicResult] = await Promise.all([
    supabase
      .from("accounts_receivable")
      .select(
        "id, description, amount, paid_amount, status, patients(full_name, social_name, whatsapp, phone)",
      )
      .eq("organization_id", organizationId)
      .eq("id", receivableId)
      .maybeSingle<{
        id: string;
        description: string;
        amount: number | string;
        paid_amount: number | string;
        status: string;
        patients: {
          full_name: string;
          social_name: string | null;
          whatsapp: string | null;
          phone: string | null;
        } | null;
      }>(),
    supabase
      .from("payment_methods")
      .select("id, pix_key, pix_key_type")
      .eq("organization_id", organizationId)
      .eq("method_type", "pix")
      .eq("active", true)
      .not("pix_key", "is", null)
      .order("name")
      .limit(1)
      .returns<
        Array<{ id: string; pix_key: string; pix_key_type: PixKeyType }>
      >(),
    supabase
      .from("clinics")
      .select("trade_name, legal_name, city")
      .eq("organization_id", organizationId)
      .maybeSingle<{
        trade_name: string | null;
        legal_name: string | null;
        city: string | null;
      }>(),
  ]);

  const receivable = receivableResult.data;
  if (receivableResult.error || !receivable) {
    return { error: "Conta não encontrada ou indisponível para seu acesso." };
  }
  if (!["open", "partial"].includes(receivable.status)) {
    return { error: "Só dá para cobrar contas em aberto." };
  }
  const remaining =
    Math.round(
      (Number(receivable.amount) - Number(receivable.paid_amount ?? 0)) * 100,
    ) / 100;
  if (!(remaining > 0)) return { error: "Esta conta não tem saldo em aberto." };

  if (isMissingColumnError(methodResult.error, "pix_key")) {
    return {
      reason: "migration",
      error:
        "O Pix copia e cola ainda não está disponível: falta aplicar a migração da chave Pix no banco.",
    };
  }
  const method = methodResult.data?.[0];
  if (methodResult.error || !method) {
    return {
      reason: "no_key",
      error:
        "Cadastre a chave Pix da clínica em Configurações › Cadastros › Convênios e pagamentos, na forma de pagamento Pix.",
    };
  }

  const clinic = clinicResult.data;
  const receiver =
    clinic?.legal_name || clinic?.trade_name || context.organization.name;
  const payload = buildPixPayload({
    key: method.pix_key,
    merchantName: receiver,
    merchantCity: clinic?.city || "BRASIL",
    amount: remaining,
    reference: receivable.id,
    // Sem descrição: o texto do Pix aparece no extrato dos bancos e a
    // descrição da conta costuma ter o exame e o nome do paciente.
  });
  const qrDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });

  const patient = receivable.patients;
  const patientName = patient?.social_name || patient?.full_name || null;
  return {
    data: {
      payload,
      qrDataUrl,
      amount: remaining,
      description: receivable.description,
      receiver,
      keyLabel: `${pixKeyTypeLabels[method.pix_key_type]} ${maskPixKey(
        method.pix_key,
        method.pix_key_type,
      )}`,
      patientFirstName: patientName ? patientName.split(" ")[0] : null,
      patientWhatsapp: patient?.whatsapp || patient?.phone || null,
    },
  };
}
