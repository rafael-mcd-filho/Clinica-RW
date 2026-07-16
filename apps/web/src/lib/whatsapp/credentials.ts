import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { EvolutionConfig } from "@/lib/whatsapp/config";

type StoredInstance = {
  id: string;
  evolution_instance_name: string;
  evolution_api_url: string | null;
  api_key_encrypted: string | null;
  webhook_secret_encrypted: string | null;
  webhook_url: string | null;
  status: string;
  phone_number: string | null;
  display_name: string | null;
  profile_picture_url: string | null;
};

type PlatformEvolutionRow = {
  evolution_api_url: string | null;
  evolution_api_key_encrypted: string | null;
};

function encryptionKey(): Buffer {
  const secret = process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "Configure WHATSAPP_CREDENTIALS_ENCRYPTION_KEY no servidor.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptCredential(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptCredential(value: string): string {
  const [version, iv, tag, payload] = value.split(".");
  if (version !== "v1" || !iv || !tag || !payload)
    throw new Error("Credencial criptografada inválida.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function createWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}

export async function getStoredInstanceByOrganization(
  organizationId: string,
): Promise<StoredInstance | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("whatsapp_instances")
    .select(
      "id, evolution_instance_name, evolution_api_url, api_key_encrypted, webhook_secret_encrypted, webhook_url, status, phone_number, display_name, profile_picture_url",
    )
    .eq("organization_id", organizationId)
    .order("created_at")
    .limit(1)
    .maybeSingle<StoredInstance>();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPlatformEvolutionConfig(): Promise<Pick<
  EvolutionConfig,
  "baseUrl" | "apiKey"
> | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("platform_integration_settings")
    .select("evolution_api_url, evolution_api_key_encrypted")
    .eq("id", true)
    .maybeSingle<PlatformEvolutionRow>();
  if (error) throw new Error(error.message);

  if (data?.evolution_api_url && data.evolution_api_key_encrypted) {
    return {
      baseUrl: data.evolution_api_url.replace(/\/+$/, ""),
      apiKey: decryptCredential(data.evolution_api_key_encrypted),
    };
  }

  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  return baseUrl && apiKey ? { baseUrl, apiKey } : null;
}

export async function getPlatformEvolutionSummary(): Promise<{
  apiUrl: string;
  hasApiKey: boolean;
}> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("platform_integration_settings")
    .select("evolution_api_url, evolution_api_key_encrypted")
    .eq("id", true)
    .maybeSingle<PlatformEvolutionRow>();
  return {
    apiUrl: data?.evolution_api_url ?? process.env.EVOLUTION_API_URL ?? "",
    hasApiKey: Boolean(
      data?.evolution_api_key_encrypted || process.env.EVOLUTION_API_KEY,
    ),
  };
}

export async function getOrganizationEvolutionConfig(
  organizationId: string,
): Promise<
  | (EvolutionConfig & { webhookSecret: string; webhookUrl: string | null })
  | null
> {
  const row = await getStoredInstanceByOrganization(organizationId);
  if (!row?.webhook_secret_encrypted) return null;
  const platform = await getPlatformEvolutionConfig();
  const baseUrl =
    platform?.baseUrl ?? row.evolution_api_url?.replace(/\/+$/, "");
  const apiKey =
    platform?.apiKey ??
    (row.api_key_encrypted ? decryptCredential(row.api_key_encrypted) : null);
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl,
    apiKey,
    instance: row.evolution_instance_name,
    webhookSecret: decryptCredential(row.webhook_secret_encrypted),
    webhookUrl: row.webhook_url,
  };
}

export async function getInstanceWebhookSecret(
  instanceName: string,
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("whatsapp_instances")
    .select("webhook_secret_encrypted")
    .eq("evolution_instance_name", instanceName)
    .maybeSingle<{ webhook_secret_encrypted: string | null }>();
  return data?.webhook_secret_encrypted
    ? decryptCredential(data.webhook_secret_encrypted)
    : null;
}

export async function getEvolutionConfigByInstance(
  instanceName: string,
): Promise<(EvolutionConfig & { organizationId: string }) | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("whatsapp_instances")
    .select(
      "organization_id, evolution_instance_name, evolution_api_url, api_key_encrypted",
    )
    .eq("evolution_instance_name", instanceName)
    .maybeSingle<{
      organization_id: string;
      evolution_instance_name: string;
      evolution_api_url: string | null;
      api_key_encrypted: string | null;
    }>();
  if (!data) return null;
  const platform = await getPlatformEvolutionConfig();
  const baseUrl =
    platform?.baseUrl ?? data.evolution_api_url?.replace(/\/+$/, "");
  const apiKey =
    platform?.apiKey ??
    (data.api_key_encrypted ? decryptCredential(data.api_key_encrypted) : null);
  if (!baseUrl || !apiKey) return null;
  return {
    organizationId: data.organization_id,
    baseUrl,
    apiKey,
    instance: data.evolution_instance_name,
  };
}
