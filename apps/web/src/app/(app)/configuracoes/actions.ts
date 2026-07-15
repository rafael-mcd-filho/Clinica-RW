"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/session";
import { uploadBrandingLogo } from "@/lib/storage/branding";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PlatformSettingsState = {
  error?: string;
  success?: string;
};

const platformSettingsSchema = z.object({
  app_name: z.string().trim().min(2, "Informe o nome da plataforma."),
  primary_color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Use uma cor hexadecimal válida."),
  support_email: z
    .string()
    .trim()
    .email("E-mail de suporte inválido.")
    .optional()
    .or(z.literal("")),
  support_whatsapp: z.string().trim().optional(),
});

function emptyToNull(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

export async function updatePlatformSettings(
  _previousState: PlatformSettingsState,
  formData: FormData,
): Promise<PlatformSettingsState> {
  const appUser = await getCurrentAppUser();

  if (!appUser?.is_super_admin) {
    return { error: "Apenas Super Admin pode alterar a plataforma." };
  }

  const parsed = platformSettingsSchema.safeParse({
    app_name: formData.get("app_name"),
    primary_color: formData.get("primary_color"),
    support_email: formData.get("support_email") ?? "",
    support_whatsapp: formData.get("support_whatsapp") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const uploaded = await uploadBrandingLogo(formData.get("logo"), "platform");

  if (uploaded.error) {
    return { error: uploaded.error };
  }

  const removeLogo = formData.get("remove_logo") === "true";
  const currentLogoUrl =
    String(formData.get("current_logo_url") ?? "").trim() || null;
  const logoUrl = uploaded.url ?? (removeLogo ? null : currentLogoUrl);

  const supabase = await createSupabaseServerClient();
  const settings = parsed.data;
  const { error } = await supabase.from("platform_settings").upsert({
    id: true,
    app_name: settings.app_name,
    primary_color: settings.primary_color,
    logo_url: logoUrl,
    support_email: emptyToNull(settings.support_email),
    support_whatsapp: emptyToNull(settings.support_whatsapp),
  });

  if (error) {
    return { error: error.message };
  }

  await supabase.from("audit_logs").insert({
    organization_id: null,
    actor_user_id: appUser.id,
    action: "platform_settings.updated",
    resource_type: "platform_settings",
    metadata: {
      app_name: settings.app_name,
      primary_color: settings.primary_color,
    },
  });

  revalidatePath("/", "layout");
  revalidatePath("/configuracoes", "layout");

  return { success: "Configurações salvas." };
}
