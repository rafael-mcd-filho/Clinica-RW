import { getEvolutionConfig } from "@/lib/whatsapp/config";

/**
 * Cliente HTTP fino para a Evolution API (v2). Todas as chamadas usam a API key
 * do ambiente no header `apikey`. Roda apenas no servidor.
 *
 * A Evolution abstrai tanto o backend não-oficial (Baileys) quanto a Cloud API
 * oficial da Meta — este cliente é agnóstico ao backend escolhido na instância.
 */

export type SendResult = {
  /** id da mensagem no WhatsApp, quando retornado. */
  waMessageId: string | null;
  raw: unknown;
};

export type ConnectionState =
  | "open"
  | "connecting"
  | "close"
  | "refused"
  | "unknown";

async function evolutionFetch(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const config = getEvolutionConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: config.apiKey,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    const detail =
      (payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : text) || `HTTP ${response.status}`;
    throw new Error(`Evolution API: ${detail}`);
  }

  return payload;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Normaliza um telefone BR para o formato que a Evolution espera (só dígitos). */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Adiciona o DDI do Brasil quando o número vem sem ele.
  if (digits.length <= 11 && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

export async function sendTextMessage(
  phone: string,
  text: string,
): Promise<SendResult> {
  const config = getEvolutionConfig();
  const payload = await evolutionFetch(`/message/sendText/${config.instance}`, {
    method: "POST",
    body: JSON.stringify({ number: toWhatsAppNumber(phone), text }),
  });
  return { waMessageId: extractMessageId(payload), raw: payload };
}

export async function sendMediaMessage(input: {
  phone: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "document" | "audio";
  caption?: string;
  fileName?: string;
}): Promise<SendResult> {
  const config = getEvolutionConfig();
  const payload = await evolutionFetch(
    `/message/sendMedia/${config.instance}`,
    {
      method: "POST",
      body: JSON.stringify({
        number: toWhatsAppNumber(input.phone),
        mediatype: input.mediaType,
        media: input.mediaUrl,
        caption: input.caption,
        fileName: input.fileName,
      }),
    },
  );
  return { waMessageId: extractMessageId(payload), raw: payload };
}

/** Estado atual da conexão da instância. */
export async function getConnectionState(): Promise<ConnectionState> {
  const config = getEvolutionConfig();
  const payload = await evolutionFetch(
    `/instance/connectionState/${config.instance}`,
  );
  const state =
    payload && typeof payload === "object" && "instance" in payload
      ? (payload as { instance?: { state?: string } }).instance?.state
      : undefined;
  return (state as ConnectionState) ?? "unknown";
}

/** Inicia a conexão e retorna o QR code (base64) para parear o número. */
export async function connectInstance(): Promise<{
  qrBase64: string | null;
  pairingCode: string | null;
}> {
  const config = getEvolutionConfig();
  const payload = await evolutionFetch(`/instance/connect/${config.instance}`);
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    return {
      qrBase64: typeof record.base64 === "string" ? record.base64 : null,
      pairingCode:
        typeof record.pairingCode === "string" ? record.pairingCode : null,
    };
  }
  return { qrBase64: null, pairingCode: null };
}

/** Registra a URL de webhook da instância para receber eventos de mensagem. */
export async function setInstanceWebhook(url: string): Promise<void> {
  const config = getEvolutionConfig();
  await evolutionFetch(`/webhook/set/${config.instance}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
      },
    }),
  });
}

function extractMessageId(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "key" in payload) {
    const key = (payload as { key?: { id?: unknown } }).key;
    if (key && typeof key.id === "string") {
      return key.id;
    }
  }
  return null;
}
