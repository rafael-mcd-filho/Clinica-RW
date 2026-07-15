import { NextResponse, type NextRequest } from "next/server";
import { getWebhookSecret } from "@/lib/whatsapp/config";
import {
  ingestInboundMessage,
  updateInstanceConnection,
  updateMessageStatus,
} from "@/lib/whatsapp/ingest";
import { type MessageStatus, type MessageType } from "@/lib/whatsapp/types";
import { getInstanceWebhookSecret } from "@/lib/whatsapp/credentials";
import { getEvolutionConfigByInstance } from "@/lib/whatsapp/credentials";
import { getMediaMessageBase64 } from "@/lib/whatsapp/evolution-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook da Evolution API. Recebe eventos de mensagem/conexão da instância e
 * persiste no Supabase (via service role, dentro de ingest.ts). Responde 200
 * rápido: a Evolution reenvia em caso de erro.
 *
 * Proteção: se WHATSAPP_WEBHOOK_SECRET estiver definido, exigimos o mesmo valor
 * no header `x-webhook-secret` (ou `apikey`).
 */
export async function POST(request: NextRequest) {
  let payload: EvolutionEvent;
  try {
    payload = (await request.json()) as EvolutionEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const secret = payload.instance
    ? (await getInstanceWebhookSecret(payload.instance)) ?? getWebhookSecret()
    : getWebhookSecret();
  if (secret) {
    const provided = request.headers.get("x-webhook-secret") ?? request.headers.get("apikey") ?? "";
    if (provided !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await handleEvent(payload);
  } catch (error) {
    // Loga mas responde 200 para não entrar em loop de reentrega em erro nosso.
    console.error("[whatsapp webhook]", error);
  }

  return NextResponse.json({ received: true });
}

type EvolutionEvent = {
  event?: string;
  instance?: string;
  data?: unknown;
};

async function handleEvent(payload: EvolutionEvent): Promise<void> {
  const eventName = (payload.event ?? "").toLowerCase().replace(/_/g, ".");
  const instanceName = payload.instance;
  if (!instanceName) return;

  if (eventName === "messages.upsert") {
    const parsed = parseInboundMessage(instanceName, payload.data);
    if (parsed) {
      if (parsed.type !== "text" && parsed.type !== "system" && parsed.waMessageId) {
        parsed.mediaUrl = await persistInboundMedia(instanceName, parsed.waMessageId, parsed.mediaMimeType, payload.data);
      }
      await ingestInboundMessage(parsed);
    }
    return;
  }

  if (eventName === "messages.update") {
    const update = parseStatusUpdate(instanceName, payload.data);
    if (update) {
      await updateMessageStatus(update);
    }
    return;
  }

  if (eventName === "connection.update") {
    const dataRecord = asRecord(payload.data);
    const state = dataRecord
      ? mapConnectionState(readString(dataRecord, "state"))
      : null;
    if (state) {
      await updateInstanceConnection({ instanceName, state });
    }
  }
}

async function persistInboundMedia(instanceName: string, messageId: string, hintedMimeType: string | null, messagePayload: unknown) {
  try {
    const config = await getEvolutionConfigByInstance(instanceName);
    if (!config) return null;
    const media = await getMediaMessageBase64(messagePayload, config);
    if (!media) return null;
    const dataUri = media.base64.match(/^data:([^;]+);base64,([\s\S]+)$/);
    const mimeType = dataUri?.[1] ?? media.mimeType ?? hintedMimeType ?? "application/octet-stream";
    const encoded = dataUri?.[2] ?? media.base64;
    const extension = extensionForMimeType(mimeType);
    const path = `${config.organizationId}/${messageId}.${extension}`;
    const admin = createSupabaseAdminClient();
    const { error } = await admin.storage.from("whatsapp-media").upload(path, Buffer.from(encoded, "base64"), { contentType: mimeType, upsert: true });
    return error ? null : path;
  } catch (error) {
    console.error("[whatsapp media]", error);
    return null;
  }
}

function extensionForMimeType(mimeType: string) {
  const subtype = mimeType.split("/")[1]?.split(";")[0]?.toLowerCase() ?? "bin";
  return (({ jpeg: "jpg", "svg+xml": "svg", "vnd.openxmlformats-officedocument.wordprocessingml.document": "docx" } as Record<string, string>)[subtype] ?? subtype.replace(/[^a-z0-9]/g, "")) || "bin";
}

function parseInboundMessage(
  instanceName: string,
  data: unknown,
): Parameters<typeof ingestInboundMessage>[0] | null {
  const record = asRecord(data);
  if (!record) return null;

  const key = asRecord(record.key);
  const remoteJid = key ? readString(key, "remoteJid") : null;
  if (!remoteJid || remoteJid.endsWith("@g.us")) return null; // ignora grupos
  if (key && readBoolean(key, "fromMe")) return null; // ignora eco do próprio envio

  const phone = remoteJid.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (!phone) return null;

  const message = asRecord(record.message);
  const { type, body, mediaMimeType } = extractContent(message);
  const timestampSeconds = readNumber(record, "messageTimestamp");

  return {
    instanceName,
    phone,
    waName: readString(record, "pushName"),
    waMessageId: key ? readString(key, "id") : null,
    type,
    body,
    mediaUrl: null,
    mediaMimeType,
    timestampMs: timestampSeconds ? timestampSeconds * 1000 : null,
  };
}

function extractContent(message: Record<string, unknown> | null): {
  type: MessageType;
  body: string | null;
  mediaMimeType: string | null;
} {
  if (!message) return { type: "system", body: null, mediaMimeType: null };

  if (typeof message.conversation === "string") {
    return { type: "text", body: message.conversation, mediaMimeType: null };
  }
  const extended = asRecord(message.extendedTextMessage);
  if (extended && typeof extended.text === "string") {
    return { type: "text", body: extended.text, mediaMimeType: null };
  }
  const image = asRecord(message.imageMessage);
  if (image) {
    return {
      type: "image",
      body: readString(image, "caption"),
      mediaMimeType: readString(image, "mimetype"),
    };
  }
  const video = asRecord(message.videoMessage);
  if (video) {
    return {
      type: "video",
      body: readString(video, "caption"),
      mediaMimeType: readString(video, "mimetype"),
    };
  }
  const audio = asRecord(message.audioMessage);
  if (audio) {
    return {
      type: "audio",
      body: null,
      mediaMimeType: readString(audio, "mimetype"),
    };
  }
  const document = asRecord(message.documentMessage);
  if (document) {
    return {
      type: "document",
      body: readString(document, "fileName"),
      mediaMimeType: readString(document, "mimetype"),
    };
  }
  if (asRecord(message.stickerMessage)) {
    return { type: "sticker", body: null, mediaMimeType: null };
  }
  if (asRecord(message.locationMessage)) {
    return { type: "location", body: null, mediaMimeType: null };
  }
  return { type: "system", body: null, mediaMimeType: null };
}

function parseStatusUpdate(
  instanceName: string,
  data: unknown,
): { instanceName: string; waMessageId: string; status: MessageStatus } | null {
  const record = asRecord(data);
  if (!record) return null;
  const key = asRecord(record.key);
  const waMessageId = key ? readString(key, "id") : null;
  if (!waMessageId) return null;

  const status = mapMessageStatus(
    readString(record, "status") ?? readString(record, "update"),
  );
  if (!status) return null;
  return { instanceName, waMessageId, status };
}

function mapMessageStatus(raw: string | null): MessageStatus | null {
  switch ((raw ?? "").toUpperCase()) {
    case "SERVER_ACK":
    case "SENT":
      return "sent";
    case "DELIVERY_ACK":
    case "DELIVERED":
      return "delivered";
    case "READ":
    case "PLAYED":
      return "read";
    default:
      return null;
  }
}

function mapConnectionState(
  raw: string | null,
): "connected" | "connecting" | "disconnected" | null {
  switch ((raw ?? "").toLowerCase()) {
    case "open":
      return "connected";
    case "connecting":
      return "connecting";
    case "close":
    case "closed":
      return "disconnected";
    default:
      return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value ? value : null;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}
