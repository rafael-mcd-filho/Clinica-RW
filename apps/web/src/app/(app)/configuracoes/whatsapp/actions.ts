"use server";

import { revalidatePath } from "next/cache";
import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createWebhookSecret,
  decryptCredential,
  encryptCredential,
  getOrganizationEvolutionConfig,
  getPlatformEvolutionConfig,
  getStoredInstanceByOrganization,
} from "@/lib/whatsapp/credentials";
import {
  connectInstance,
  createInstance,
  getInstanceDetails,
  logoutInstance,
  setInstanceWebhook,
  type InstanceDetails,
} from "@/lib/whatsapp/evolution-client";
import type { EvolutionConfig } from "@/lib/whatsapp/config";

export type WhatsAppActionState = {
  error?: string;
  success?: string;
  state?: string;
  qrBase64?: string | null;
  pairingCode?: string | null;
  phoneNumber?: string | null;
  displayName?: string | null;
  profilePictureUrl?: string | null;
};

async function requireWhatsAppAdmin() {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !context.effectiveUser ||
    !context.permissionCodes.has("atendimento.configurar")
  ) {
    throw new Error("Acesso negado.");
  }
  return {
    organizationId: context.organization.id,
    userId: context.effectiveUser.id,
  };
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível concluir a operação.";
}

function webhookUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (!appUrl) {
    throw new Error(
      "Configure NEXT_PUBLIC_APP_URL para registrar o webhook automaticamente.",
    );
  }
  return `${appUrl}/api/whatsapp/webhook`;
}

function instanceName(organizationId: string) {
  return `clinic_${organizationId.replace(/-/g, "")}`;
}

function databaseStatus(state: InstanceDetails["state"]) {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  return "disconnected";
}

async function persistDetails(
  organizationId: string,
  details: InstanceDetails,
) {
  const status = databaseStatus(details.state);
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("whatsapp_instances")
    .update({
      status,
      phone_number: details.phoneNumber,
      display_name: details.displayName,
      profile_picture_url: details.profilePictureUrl,
      last_connected_at:
        status === "connected" ? new Date().toISOString() : undefined,
    })
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  return status;
}

async function ensureCompanyInstance(
  organizationId: string,
): Promise<EvolutionConfig & { webhookSecret: string; webhookUrl: string }> {
  const platform = await getPlatformEvolutionConfig();
  if (!platform) {
    throw new Error(
      "A Evolution API ainda não foi configurada pelo Super Admin.",
    );
  }

  const existing = await getStoredInstanceByOrganization(organizationId);
  const secret = existing?.webhook_secret_encrypted
    ? decryptCredential(existing.webhook_secret_encrypted)
    : createWebhookSecret();
  const url = webhookUrl();
  const config = {
    ...platform,
    instance: existing?.evolution_instance_name ?? instanceName(organizationId),
    webhookSecret: secret,
    webhookUrl: url,
  };

  const remote = await getInstanceDetails(config);
  if (!remote) await createInstance(config);
  await setInstanceWebhook(url, secret, config);

  const admin = createSupabaseAdminClient();
  const values = {
    organization_id: organizationId,
    evolution_instance_name: config.instance,
    evolution_api_url: null,
    api_key_encrypted: null,
    webhook_secret_encrypted:
      existing?.webhook_secret_encrypted ?? encryptCredential(secret),
    webhook_url: url,
    status: remote ? databaseStatus(remote.state) : "disconnected",
    configured_at: new Date().toISOString(),
  };
  const result = existing
    ? await admin
        .from("whatsapp_instances")
        .update(values)
        .eq("id", existing.id)
        .eq("organization_id", organizationId)
    : await admin.from("whatsapp_instances").insert(values);
  if (result.error) throw new Error(result.error.message);

  return config;
}

export async function testWhatsAppConnection(): Promise<WhatsAppActionState> {
  try {
    const auth = await requireWhatsAppAdmin();
    const config = await getOrganizationEvolutionConfig(auth.organizationId);
    if (!config) {
      return { error: "A empresa ainda não iniciou uma conexão." };
    }
    const details = await getInstanceDetails(config);
    if (!details)
      return { error: "A instância não foi encontrada na Evolution API." };
    const state = await persistDetails(auth.organizationId, details);
    revalidatePath("/configuracoes/whatsapp");
    revalidatePath("/atendimento");
    return {
      success:
        state === "connected"
          ? "WhatsApp conectado e dados atualizados."
          : "Evolution respondeu; o WhatsApp ainda está desconectado.",
      ...details,
      state,
    };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function connectWhatsApp(): Promise<WhatsAppActionState> {
  try {
    const auth = await requireWhatsAppAdmin();
    const config = await ensureCompanyInstance(auth.organizationId);
    const details = await getInstanceDetails(config);
    if (details?.state === "open") {
      await persistDetails(auth.organizationId, details);
      return {
        success: "O WhatsApp já está conectado.",
        ...details,
        state: "connected",
      };
    }

    const qr = await connectInstance(config);
    const admin = createSupabaseAdminClient();
    await admin
      .from("whatsapp_instances")
      .update({ status: "connecting" })
      .eq("organization_id", auth.organizationId);
    await admin.from("audit_logs").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      action: "whatsapp.connection.started",
      resource_type: "whatsapp_instance",
      metadata: { instance: config.instance, webhook_url: config.webhookUrl },
    });
    revalidatePath("/configuracoes/whatsapp");
    return {
      success:
        qr.qrBase64 || qr.pairingCode
          ? "Leia o QR Code no WhatsApp. O webhook já foi registrado."
          : "Conexão iniciada e webhook registrado.",
      state: "connecting",
      ...qr,
    };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function disconnectWhatsApp(): Promise<WhatsAppActionState> {
  try {
    const auth = await requireWhatsAppAdmin();
    const config = await getOrganizationEvolutionConfig(auth.organizationId);
    if (!config) return { error: "Não há uma conexão configurada." };
    await logoutInstance(config);
    const admin = createSupabaseAdminClient();
    await admin
      .from("whatsapp_instances")
      .update({
        status: "disconnected",
        phone_number: null,
        display_name: null,
        profile_picture_url: null,
      })
      .eq("organization_id", auth.organizationId);
    await admin.from("audit_logs").insert({
      organization_id: auth.organizationId,
      actor_user_id: auth.userId,
      action: "whatsapp.connection.disconnected",
      resource_type: "whatsapp_instance",
      metadata: { instance: config.instance },
    });
    revalidatePath("/configuracoes/whatsapp");
    revalidatePath("/atendimento");
    return { success: "WhatsApp desconectado.", state: "disconnected" };
  } catch (error) {
    return { error: message(error) };
  }
}
