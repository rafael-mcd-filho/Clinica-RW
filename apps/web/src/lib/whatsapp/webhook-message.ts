import type { InboundMessageInput } from "@/lib/whatsapp/ingest";
import type { MessageType } from "@/lib/whatsapp/types";

export type ParsedEvolutionMessage = InboundMessageInput & {
  direction: "inbound" | "outbound";
};

/**
 * Normaliza um MESSAGES_UPSERT da Evolution. `fromMe` não significa
 * necessariamente que a mensagem saiu do sistema: ela também é usada quando
 * alguém envia pelo celular conectado, por isso a direção faz parte do retorno.
 */
export function parseEvolutionUpsertMessage(
  instanceName: string,
  data: unknown,
): ParsedEvolutionMessage | null {
  const record = asRecord(Array.isArray(data) ? data[0] : data);
  if (!record) return null;

  const key = asRecord(record.key);
  const remoteJid = key ? readString(key, "remoteJid") : null;
  if (
    !remoteJid ||
    remoteJid.endsWith("@g.us") ||
    remoteJid === "status@broadcast"
  ) {
    return null;
  }

  const phone = remoteJid.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (!phone) return null;

  const direction = key && readBoolean(key, "fromMe") ? "outbound" : "inbound";
  const message = unwrapMessage(asRecord(record.message));
  const { type, body, mediaMimeType } = extractContent(message);
  const timestampSeconds = readNumber(record, "messageTimestamp");

  return {
    direction,
    instanceName,
    phone,
    // Em mensagens próprias, pushName identifica a clínica/aparelho.
    waName: direction === "inbound" ? readString(record, "pushName") : null,
    waMessageId: key ? readString(key, "id") : null,
    type,
    body,
    mediaUrl: null,
    mediaMimeType,
    timestampMs: timestampSeconds ? timestampSeconds * 1000 : null,
  };
}

function unwrapMessage(
  message: Record<string, unknown> | null,
): Record<string, unknown> | null {
  let current = message;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const wrapper =
      asRecord(current.ephemeralMessage) ??
      asRecord(current.viewOnceMessage) ??
      asRecord(current.viewOnceMessageV2);
    const nested = wrapper ? asRecord(wrapper.message) : null;
    if (!nested) return current;
    current = nested;
  }
  return current;
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
  if (asRecord(message.contactMessage)) {
    return { type: "contact", body: null, mediaMimeType: null };
  }
  return { type: "system", body: null, mediaMimeType: null };
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
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}
