"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logger } from "@/lib/observability/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BookingManageState = {
  error?: string;
  success?: string;
};

function friendlyError(message: string, code?: string) {
  const normalizedMessage = message.toLowerCase();
  if (normalizedMessage.includes("online booking request not found")) {
    return "Não encontramos esta solicitação. Confira o link que você recebeu.";
  }
  if (normalizedMessage.includes("schedule does not accept online booking")) {
    return "Esta agenda não está mais disponível para remarcação online.";
  }
  if (normalizedMessage.includes("online booking is not available")) {
    return "O agendamento online desta clínica está desativado no momento.";
  }
  if (
    normalizedMessage.includes("procedure is not available on this schedule")
  ) {
    return "Este serviço não está mais disponível nesta agenda.";
  }
  if (normalizedMessage.includes("procedure not found")) {
    return "Este serviço não está mais disponível.";
  }
  if (code === "23P01" || message.includes("slot is not available")) {
    return "Este horário não está mais disponível.";
  }
  if (message.includes("Cancellation window")) {
    return "O prazo de cancelamento online desta consulta já encerrou.";
  }
  if (normalizedMessage.includes("cannot be cancelled online")) {
    return "Esta solicitação não pode mais ser cancelada por aqui. Fale com a clínica.";
  }
  if (message.includes("Only pending")) {
    return "Somente solicitações pendentes podem ser remarcadas por aqui.";
  }
  if (message.includes("booking window")) {
    return "O horário escolhido está fora da janela de agendamento.";
  }
  // O texto técnico do banco (em inglês) chegava ao paciente. Ele fica no
  // log; na tela vai uma mensagem que diz o que fazer.
  logger.error("public_booking.manage_failed", { code, message });
  return "Não foi possível concluir agora. Tente de novo em alguns instantes ou fale com a clínica.";
}

export async function reschedulePublicBooking(
  token: string,
  _state: BookingManageState,
  formData: FormData,
): Promise<BookingManageState> {
  void _state;
  const parsed = z
    .object({
      start_at: z.string().datetime(),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: "Selecione um novo horário." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reschedule_online_booking_request", {
    p_access_token: token,
    p_start_at: parsed.data.start_at,
  });

  if (error) return { error: friendlyError(error.message, error.code) };

  revalidatePath(`/agendar/acompanhar/${token}`);
  return { success: "Solicitação remarcada." };
}

export async function cancelPublicBooking(
  token: string,
  _state: BookingManageState,
  formData: FormData,
): Promise<BookingManageState> {
  void _state;
  const parsed = z
    .object({
      reason: z.string().trim().max(300).optional(),
    })
    .safeParse(Object.fromEntries(formData));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_online_booking_request", {
    p_access_token: token,
    p_reason: parsed.success ? parsed.data.reason || null : null,
  });

  if (error) return { error: friendlyError(error.message, error.code) };

  revalidatePath(`/agendar/acompanhar/${token}`);
  return { success: "Solicitação cancelada." };
}
