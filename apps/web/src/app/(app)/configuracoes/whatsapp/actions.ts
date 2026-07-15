"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createWebhookSecret, encryptCredential, getOrganizationEvolutionConfig, getStoredInstanceByOrganization } from "@/lib/whatsapp/credentials";
import { connectInstance, getConnectionState, getInstanceWebhook, setInstanceWebhook } from "@/lib/whatsapp/evolution-client";
import type { EvolutionConfig } from "@/lib/whatsapp/config";

export type WhatsAppActionState = {
  error?: string;
  success?: string;
  state?: string;
  qrBase64?: string | null;
  pairingCode?: string | null;
  existingWebhook?: string | null;
  needsConfirmation?: boolean;
};

const configSchema = z.object({
  apiUrl: z.string().trim().url("Informe uma URL válida."),
  instance: z.string().trim().min(1, "Informe o nome da instância."),
  apiKey: z.string().trim().optional(),
});

async function requireWhatsAppAdmin() {
  const context = await getRequestContext();
  if (!context.organization || !context.effectiveUser || !context.permissionCodes.has("atendimento.configurar")) throw new Error("Acesso negado.");
  return { organizationId: context.organization.id, userId: context.effectiveUser.id };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

export async function saveWhatsAppConfig(_previous: WhatsAppActionState, formData: FormData): Promise<WhatsAppActionState> {
  try {
    const auth = await requireWhatsAppAdmin();
    const parsed = configSchema.safeParse({ apiUrl: formData.get("api_url"), instance: formData.get("instance"), apiKey: formData.get("api_key") });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    const existing = await getStoredInstanceByOrganization(auth.organizationId);
    const apiKey = parsed.data.apiKey || (existing?.api_key_encrypted ? null : undefined);
    if (apiKey === undefined) return { error: "Informe a API key." };

    const candidate: EvolutionConfig = {
      baseUrl: parsed.data.apiUrl.replace(/\/+$/, ""),
      instance: parsed.data.instance,
      apiKey: parsed.data.apiKey || (await getOrganizationEvolutionConfig(auth.organizationId))?.apiKey || "",
    };
    if (!candidate.apiKey) return { error: "Informe novamente a API key para alterar a configuração." };
    const state = await getConnectionState(candidate);
    const webhookSecretEncrypted = existing?.webhook_secret_encrypted ?? encryptCredential(createWebhookSecret());
    const values = {
      organization_id: auth.organizationId,
      evolution_instance_name: candidate.instance,
      evolution_api_url: candidate.baseUrl,
      api_key_encrypted: parsed.data.apiKey ? encryptCredential(parsed.data.apiKey) : existing?.api_key_encrypted,
      webhook_secret_encrypted: webhookSecretEncrypted,
      status: state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected",
      last_connected_at: state === "open" ? new Date().toISOString() : null,
      configured_at: new Date().toISOString(),
    };
    const admin = createSupabaseAdminClient();
    const result = existing
      ? await admin.from("whatsapp_instances").update(values).eq("id", existing.id).eq("organization_id", auth.organizationId)
      : await admin.from("whatsapp_instances").insert(values);
    if (result.error) throw new Error(result.error.message);
    await admin.from("audit_logs").insert({ organization_id: auth.organizationId, actor_user_id: auth.userId, action: "whatsapp.configuration.updated", resource_type: "whatsapp_instance", metadata: { instance: candidate.instance, api_url: candidate.baseUrl } });
    revalidatePath("/configuracoes/whatsapp");
    revalidatePath("/atendimento");
    return { success: "Credenciais validadas e salvas com segurança.", state };
  } catch (error) { return { error: message(error) }; }
}

export async function testWhatsAppConnection(): Promise<WhatsAppActionState> {
  try {
    const auth = await requireWhatsAppAdmin();
    const config = await getOrganizationEvolutionConfig(auth.organizationId);
    if (!config) return { error: "Salve as credenciais primeiro." };
    const state = await getConnectionState(config);
    return { success: state === "open" ? "Instância conectada ao WhatsApp." : `Evolution respondeu. Estado: ${state}.`, state };
  } catch (error) { return { error: message(error) }; }
}

export async function connectWhatsApp(): Promise<WhatsAppActionState> {
  try {
    const auth = await requireWhatsAppAdmin();
    const config = await getOrganizationEvolutionConfig(auth.organizationId);
    if (!config) return { error: "Salve as credenciais primeiro." };
    const state = await getConnectionState(config);
    if (state === "open") return { success: "O WhatsApp já está conectado.", state };
    const qr = await connectInstance(config);
    return { success: qr.qrBase64 || qr.pairingCode ? "Leia o QR Code no WhatsApp." : "Conexão iniciada.", state: "connecting", ...qr };
  } catch (error) { return { error: message(error) }; }
}

export async function registerWhatsAppWebhook(_previous: WhatsAppActionState, formData: FormData): Promise<WhatsAppActionState> {
  try {
    const auth = await requireWhatsAppAdmin();
    const config = await getOrganizationEvolutionConfig(auth.organizationId);
    if (!config) return { error: "Salve as credenciais primeiro." };
    const url = z.string().trim().url("Informe uma URL pública válida.").parse(formData.get("webhook_url"));
    if (!url.startsWith("https://")) return { error: "O webhook deve usar HTTPS." };
    const current = await getInstanceWebhook(config);
    const replacing = current.enabled && current.url && current.url !== url;
    if (replacing && formData.get("confirm_replace") !== "true") {
      return { error: "A instância já possui outro webhook. Confirme a substituição.", existingWebhook: current.url, needsConfirmation: true };
    }
    await setInstanceWebhook(url, config.webhookSecret, config);
    const admin = createSupabaseAdminClient();
    await admin.from("whatsapp_instances").update({ webhook_url: url }).eq("organization_id", auth.organizationId).eq("evolution_instance_name", config.instance);
    await admin.from("audit_logs").insert({ organization_id: auth.organizationId, actor_user_id: auth.userId, action: "whatsapp.webhook.updated", resource_type: "whatsapp_instance", metadata: { webhook_url: url, replaced: Boolean(replacing) } });
    revalidatePath("/configuracoes/whatsapp");
    return { success: "Webhook registrado e protegido com segredo compartilhado.", existingWebhook: url };
  } catch (error) { return { error: message(error) }; }
}
