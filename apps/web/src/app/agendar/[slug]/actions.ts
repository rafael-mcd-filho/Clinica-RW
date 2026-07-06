"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  if (code === "23P01" || message.includes("slot is not available")) {
    return "Este horário acabou de ficar indisponível. Escolha outro horário.";
  }
  if (message.includes("booking window")) {
    return "O horário escolhido está fora da janela de agendamento da clínica.";
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
    return "O agendamento online desta clínica não está disponível.";
  }
  return message;
}

export async function startContactVerification(
  _state: ContactVerificationState,
  formData: FormData,
): Promise<ContactVerificationState> {
  const parsed = z
    .object({
      slug: z.string().trim().min(3),
      contact_type: z.enum(["email", "phone"]),
      destination: z.string().trim().min(3),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "Informe o contato para verificação." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "start_online_booking_contact_verification",
    {
      p_public_slug: parsed.data.slug,
      p_contact_type: parsed.data.contact_type,
      p_destination: parsed.data.destination,
    },
  );

  if (error) return { error: friendlyError(error.message, error.code) };

  const payload = data as {
    verification_id?: string;
    delivery_debug_code?: string;
  } | null;

  return {
    success: "Código gerado.",
    verificationId: payload?.verification_id,
    deliveryDebugCode: payload?.delivery_debug_code,
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
