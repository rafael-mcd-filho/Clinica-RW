"use server";

import { revalidatePath } from "next/cache";
import { getRequestContext } from "@/lib/auth/context";
import { databaseErrorMessage } from "@/lib/errors/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProfileActionState = {
  error?: string;
  success?: string;
};

/**
 * Esquece as fotos de perfil guardadas para a empresa.
 *
 * As fotos são baixadas do WhatsApp uma vez e servidas do bucket por uma
 * semana. Quando alguém troca a foto no WhatsApp, a antiga continua
 * aparecendo até esse prazo vencer — este botão encurta a espera. Só o
 * registro é apagado; o arquivo é sobrescrito na próxima visita.
 */
export async function clearContactPhotoCache(): Promise<ProfileActionState> {
  const context = await getRequestContext();
  if (!context.organization) {
    return { error: "Sua conta não está vinculada a uma empresa." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("clear_contact_photo_cache");
  if (error) {
    return { error: databaseErrorMessage(error, "Não foi possível limpar.") };
  }

  revalidatePath("/atendimento");
  const cleared = Number(data ?? 0);
  return {
    success: cleared
      ? `Cache limpo: ${cleared} foto${cleared === 1 ? "" : "s"} será${cleared === 1 ? "" : "ão"} buscada${cleared === 1 ? "" : "s"} de novo.`
      : "Não havia foto em cache para limpar.",
  };
}
