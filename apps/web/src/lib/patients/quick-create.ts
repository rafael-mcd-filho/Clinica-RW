"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { onlyDigits } from "@/lib/validation/br";

export type QuickPatientActionState = {
  error?: string;
  success?: string;
  patient?: {
    id: string;
    full_name: string;
    social_name: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
  };
};

export async function createQuickPatient(
  source: string,
  _state: QuickPatientActionState,
  formData: FormData,
): Promise<QuickPatientActionState> {
  const context = await getRequestContext();
  if (!context.organization || !context.permissionCodes.has("paciente.criar")) {
    return { error: "Você não pode cadastrar pacientes." };
  }

  const parsed = z
    .object({
      full_name: z.string().trim().min(3, "Informe o nome do paciente."),
      phone: z.string().trim().optional(),
      email: z
        .string()
        .trim()
        .email("E-mail inválido.")
        .optional()
        .or(z.literal("")),
    })
    .safeParse({
      full_name: formData.get("full_name"),
      phone: formData.get("phone") || undefined,
      email: formData.get("email") ?? "",
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const phone = parsed.data.phone ? onlyDigits(parsed.data.phone) : null;
  const email = parsed.data.email || null;
  const supabase = await createSupabaseServerClient();
  const { data: patient, error } = await supabase
    .from("patients")
    .insert({
      organization_id: context.organization.id,
      full_name: parsed.data.full_name,
      email,
      phone,
      preferred_contact: phone ? "phone" : email ? "email" : "none",
      source,
    })
    .select("id, full_name, social_name, email, phone, whatsapp")
    .single<NonNullable<QuickPatientActionState["patient"]>>();

  if (error || !patient) {
    return { error: error?.message ?? "Falha ao cadastrar paciente." };
  }

  revalidatePath("/pacientes");
  return { success: "Paciente cadastrado.", patient };
}
