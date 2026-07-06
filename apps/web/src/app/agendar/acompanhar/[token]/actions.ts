"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BookingManageState = {
  error?: string;
  success?: string;
};

function friendlyError(message: string, code?: string) {
  if (code === "23P01" || message.includes("slot is not available")) {
    return "Este horario nao esta mais disponivel.";
  }
  if (message.includes("Cancellation window")) {
    return "O prazo de cancelamento online desta consulta ja encerrou.";
  }
  if (message.includes("Only pending")) {
    return "Somente solicitacoes pendentes podem ser remarcadas por aqui.";
  }
  if (message.includes("booking window")) {
    return "O horario escolhido esta fora da janela de agendamento.";
  }
  return message;
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

  if (!parsed.success) return { error: "Selecione um novo horario." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reschedule_online_booking_request", {
    p_access_token: token,
    p_start_at: parsed.data.start_at,
  });

  if (error) return { error: friendlyError(error.message, error.code) };

  revalidatePath(`/agendar/acompanhar/${token}`);
  return { success: "Solicitacao remarcada." };
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
  return { success: "Solicitacao cancelada." };
}
