"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  formatPhoneBR,
  isValidCPF,
  isValidPhoneBR,
  onlyDigits,
} from "@/lib/validation/br";
import { getOrganizationEvolutionConfig } from "@/lib/whatsapp/credentials";
import { sendTextMessage } from "@/lib/whatsapp/evolution-client";

export type OnlineBookingState = {
  error?: string;
  success?: string;
  accessToken?: string;
};

export type ContactVerificationState = {
  error?: string;
  success?: string;
  verificationId?: string;
  deliveryDebugCode?: string;
  verified?: boolean;
};

function friendlyError(message: string, code?: string) {
  const normalizedMessage = message.toLowerCase();
  if (normalizedMessage.includes("schedule does not accept online booking")) {
    return "Esta agenda não está mais disponível para agendamento online.";
  }
  if (
    normalizedMessage.includes("procedure is not available on this schedule")
  ) {
    return "Este serviço não está mais disponível nesta agenda.";
  }
  if (code === "23P01" || message.includes("slot is not available")) {
    return "Este horário acabou de ficar indisponível. Escolha outro horário.";
  }
  if (message.includes("booking window")) {
    return "O horário escolhido está fora da janela desta agenda.";
  }
  if (message.includes("LGPD consent")) {
    return "Aceite o consentimento para enviar a solicitação.";
  }
  if (message.includes("contact is required")) {
    return "Informe e-mail ou telefone para contato.";
  }
  if (message.includes("Contact verification")) {
    return "Verifique o contato antes de enviar a solicitação.";
  }
  if (message.includes("Invalid verification")) {
    return "Código de verificação inválido.";
  }
  if (message.includes("Verification expired")) {
    return "O código expirou. Gere um novo código.";
  }
  if (message.includes("Verification request limit")) {
    return "Este contato atingiu o limite de códigos na última hora.";
  }
  if (message.includes("request limit")) {
    return "Este contato atingiu o limite de solicitações nas últimas 24 horas.";
  }
  if (message.includes("no-show history")) {
    return "Não foi possível solicitar online por histórico recente de faltas. Entre em contato com a clínica.";
  }
  if (message.includes("not available")) {
    return "Esta agenda ou serviço não está disponível para agendamento online.";
  }
  // O texto técnico do banco (em inglês) chegava ao paciente. Ele fica no
  // log; na tela vai uma mensagem que diz o que fazer.
  logger.error("public_booking.request_failed", { code, message });
  return "Não foi possível enviar agora. Tente de novo em alguns instantes ou fale com a clínica.";
}

/**
 * Gera o código de verificação e o envia pelo WhatsApp da clínica.
 *
 * O código só existe no servidor: a função do banco é restrita ao service
 * role, e a resposta ao navegador nunca o carrega (antes ele aparecia na
 * tela e a verificação não verificava nada). Sem WhatsApp conectado não há
 * como entregar — fora do desenvolvimento, o paciente é orientado a falar
 * com a clínica.
 */
export async function startContactVerification(
  _state: ContactVerificationState,
  formData: FormData,
): Promise<ContactVerificationState> {
  const parsed = z
    .object({
      slug: z.string().trim().min(3),
      destination: z.string().trim().min(3),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success || !isValidPhoneBR(parsed.data.destination)) {
    return { error: "Informe um telefone com DDD para receber o código." };
  }

  const admin = createSupabaseAdminClient();
  const { data: settings } = await admin
    .from("online_booking_settings")
    .select("organization_id, contact_verification_ttl_minutes")
    .eq("public_slug", parsed.data.slug.toLowerCase())
    .eq("enabled", true)
    .maybeSingle<{
      organization_id: string;
      contact_verification_ttl_minutes: number;
    }>();
  if (!settings) {
    return { error: "O agendamento online desta clínica não está disponível." };
  }

  const [config, clinic] = await Promise.all([
    getOrganizationEvolutionConfig(settings.organization_id),
    admin
      .from("clinics")
      .select("trade_name")
      .eq("organization_id", settings.organization_id)
      .maybeSingle<{ trade_name: string | null }>(),
  ]);
  const developmentOnly = process.env.NODE_ENV === "development";
  if (!config && !developmentOnly) {
    logger.error("public_booking.verification_without_whatsapp", {
      organizationId: settings.organization_id,
    });
    return {
      error:
        "A clínica não consegue enviar o código agora. Entre em contato com ela para agendar.",
    };
  }

  const { data, error } = await admin.rpc(
    "start_online_booking_contact_verification",
    {
      p_public_slug: parsed.data.slug,
      p_contact_type: "phone",
      p_destination: parsed.data.destination,
    },
  );
  if (error) return { error: friendlyError(error.message, error.code) };

  const payload = data as {
    verification_id?: string;
    delivery_debug_code?: string;
  } | null;
  const code = payload?.delivery_debug_code;
  if (!payload?.verification_id || !code) {
    return { error: "Não foi possível gerar o código. Tente de novo." };
  }

  const phoneLabel = formatPhoneBR(onlyDigits(parsed.data.destination));
  if (config) {
    const clinicName = clinic.data?.trade_name?.trim() || "a clínica";
    try {
      await sendTextMessage(
        onlyDigits(parsed.data.destination),
        `Seu código para confirmar o agendamento com ${clinicName}: *${code}*

Ele vale por ${settings.contact_verification_ttl_minutes} minutos. Se não foi você, ignore esta mensagem.`,
        config,
      );
    } catch (sendError) {
      logger.error("public_booking.verification_send_failed", {
        organizationId: settings.organization_id,
        message: sendError instanceof Error ? sendError.message : "unknown",
      });
      return {
        error:
          "Não foi possível enviar o código pelo WhatsApp agora. Confira o número e tente de novo em instantes.",
      };
    }
    return {
      success: `Enviamos o código pelo WhatsApp para ${phoneLabel}.`,
      verificationId: payload.verification_id,
    };
  }

  // Só em desenvolvimento, sem WhatsApp configurado: o código aparece na tela
  // para permitir testar o fluxo.
  return {
    success: "Código de teste gerado (só em desenvolvimento).",
    verificationId: payload.verification_id,
    deliveryDebugCode: code,
  };
}

export async function verifyContactCode(
  _state: ContactVerificationState,
  formData: FormData,
): Promise<ContactVerificationState> {
  const parsed = z
    .object({
      verification_id: z.string().uuid(),
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "Informe o código de 6 dígitos." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("verify_online_booking_contact", {
    p_verification_id: parsed.data.verification_id,
    p_code: parsed.data.code,
  });

  if (error) return { error: friendlyError(error.message, error.code) };

  return {
    success: "Contato verificado.",
    verificationId: parsed.data.verification_id,
    verified: true,
  };
}

export async function submitOnlineBookingRequest(
  _state: OnlineBookingState,
  formData: FormData,
): Promise<OnlineBookingState> {
  const parsed = z
    .object({
      slug: z.string().trim().min(3),
      schedule_id: z.string().uuid(),
      procedure_id: z.string().uuid(),
      start_at: z.string().datetime(),
      patient_name: z.string().trim().min(2),
      patient_email: z.union([z.string().trim().email(), z.literal("")]),
      patient_phone: z.string().trim().max(30),
      patient_cpf: z.string().trim().max(20),
      health_insurance_id: z.union([z.string().uuid(), z.literal("")]),
      patient_notes: z.string().trim().max(500),
      lgpd_consent: z.literal("on"),
    })
    .safeParse({
      slug: formData.get("slug"),
      schedule_id: formData.get("schedule_id"),
      procedure_id: formData.get("procedure_id"),
      start_at: formData.get("start_at"),
      patient_name: formData.get("patient_name"),
      patient_email: formData.get("patient_email") ?? "",
      patient_phone: formData.get("patient_phone") ?? "",
      patient_cpf: formData.get("patient_cpf") ?? "",
      health_insurance_id: formData.get("health_insurance_id") ?? "",
      patient_notes: formData.get("patient_notes") ?? "",
      lgpd_consent: formData.get("lgpd_consent"),
    });

  if (!parsed.success) {
    return {
      error:
        "Preencha nome, contato, procedimento, horário e aceite de consentimento.",
    };
  }

  if (!parsed.data.patient_email && !parsed.data.patient_phone) {
    return { error: "Informe e-mail ou telefone para contato." };
  }
  if (parsed.data.patient_phone && !isValidPhoneBR(parsed.data.patient_phone)) {
    return { error: "Informe um telefone com DDD válido." };
  }
  if (parsed.data.patient_cpf && !isValidCPF(parsed.data.patient_cpf)) {
    return { error: "Informe um CPF válido." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "submit_online_booking_request_with_token",
    {
      p_public_slug: parsed.data.slug,
      p_schedule_id: parsed.data.schedule_id,
      p_procedure_id: parsed.data.procedure_id,
      p_start_at: parsed.data.start_at,
      p_patient_name: parsed.data.patient_name,
      p_patient_email: parsed.data.patient_email || null,
      p_patient_phone: parsed.data.patient_phone || null,
      p_patient_cpf: parsed.data.patient_cpf || null,
      p_health_insurance_id: parsed.data.health_insurance_id || null,
      p_patient_notes: parsed.data.patient_notes || null,
      p_lgpd_consent: true,
    },
  );

  if (error) return { error: friendlyError(error.message, error.code) };

  const payload = data as { access_token?: string } | null;

  revalidatePath(`/agendar/${parsed.data.slug}`);
  return {
    success:
      "Solicitação enviada. A clínica vai confirmar o agendamento pelo contato informado.",
    accessToken: payload?.access_token,
  };
}
