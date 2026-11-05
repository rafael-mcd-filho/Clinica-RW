"use server";

import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { onlyDigits } from "@/lib/validation/br";

export type BirthdayMessageResult =
  | { url: string; error?: never }
  | { error: string; url?: never };

/**
 * Raio-X D3: "Enviar parabéns" no card de aniversariantes. Monta a mensagem
 * no WhatsApp da clínica (wa.me) com o telefone do cadastro e registra na
 * auditoria quem enviou. O telefone não vai para o navegador antes do clique.
 */
export async function birthdayMessageLink(
  patientId: string,
): Promise<BirthdayMessageResult> {
  if (!z.string().uuid().safeParse(patientId).success) {
    return { error: "Paciente inválido." };
  }
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has("paciente.ver")) {
    return { error: "Você não tem permissão para ver o contato do paciente." };
  }
  const supabase = await createSupabaseServerClient();
  const [{ data: patient }, { data: clinic }] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name, social_name, whatsapp, phone")
      .eq("organization_id", context.organization.id)
      .eq("id", patientId)
      .is("deleted_at", null)
      .maybeSingle<{
        id: string;
        full_name: string;
        social_name: string | null;
        whatsapp: string | null;
        phone: string | null;
      }>(),
    supabase
      .from("clinics")
      .select("trade_name")
      .eq("organization_id", context.organization.id)
      .maybeSingle<{ trade_name: string | null }>(),
  ]);
  if (!patient) return { error: "Paciente não encontrado." };

  const digits = onlyDigits(patient.whatsapp || patient.phone || "");
  if (digits.length < 10) {
    return { error: "Este paciente não tem celular cadastrado." };
  }
  const international =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  const firstName = (patient.social_name || patient.full_name).split(" ")[0];
  const clinicName = clinic?.trade_name || context.organization.name;
  const message = `Olá, ${firstName}! A equipe da ${clinicName} deseja um feliz aniversário, com muita saúde. 🎉`;

  await supabase.from("audit_logs").insert({
    organization_id: context.organization.id,
    actor_user_id: context.actor?.id ?? null,
    action: "patient.birthday_message",
    resource_type: "patient",
    resource_id: patient.id,
    metadata: {
      channel: "whatsapp_link",
      effective_user_id: context.effectiveUser?.id ?? null,
    },
  });

  return {
    url: `https://wa.me/${international}?text=${encodeURIComponent(message)}`,
  };
}
