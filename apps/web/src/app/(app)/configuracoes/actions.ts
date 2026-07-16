"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAppUser } from "@/lib/auth/session";
import { uploadBrandingLogo } from "@/lib/storage/branding";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptCredential } from "@/lib/whatsapp/credentials";

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
  evolution_api_url: z
    .string()
    .trim()
    .url("URL da Evolution API inválida.")
    .optional()
    .or(z.literal("")),
  evolution_api_key: z.string().trim().optional(),
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
    evolution_api_url: formData.get("evolution_api_url") ?? "",
    evolution_api_key: formData.get("evolution_api_key") ?? "",
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
  const admin = createSupabaseAdminClient();
  const { data: currentEvolution } = await admin
    .from("platform_integration_settings")
    .select("evolution_api_key_encrypted")
    .eq("id", true)
    .maybeSingle<{ evolution_api_key_encrypted: string | null }>();
  if (
    settings.evolution_api_url &&
    !settings.evolution_api_key &&
    !currentEvolution?.evolution_api_key_encrypted &&
    !process.env.EVOLUTION_API_KEY
  ) {
    return { error: "Informe a API key global da Evolution." };
  }
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

  const { error: evolutionError } = await admin
    .from("platform_integration_settings")
    .upsert({
      id: true,
      evolution_api_url: emptyToNull(settings.evolution_api_url),
      evolution_api_key_encrypted: settings.evolution_api_key
        ? encryptCredential(settings.evolution_api_key)
        : (currentEvolution?.evolution_api_key_encrypted ?? null),
      updated_at: new Date().toISOString(),
    });
  if (evolutionError) return { error: evolutionError.message };

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
