/** Tipos do domínio de Atendimento WhatsApp (Fase B–D). */

export type ConversationStatus = "pending" | "open" | "resolved";

export type MessageDirection = "inbound" | "outbound";

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "system";

export type MessageStatus =
  | "received"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type ConversationTagView = {
  id: string;
  name: string;
  color: string;
};

/** Item da lista de conversas (coluna esquerda). */
export type ConversationListItem = {
  id: string;
  status: ConversationStatus;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactPhotoUrl: string | null;
  patientId: string | null;
  patientName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  funnelCardId: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  tags: ConversationTagView[];
};

/** Uma mensagem renderizada na thread (coluna central). */
export type ConversationMessage = {
  id: string;
  direction: MessageDirection;
  type: MessageType;
  body: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  status: MessageStatus;
  aiSuggested: boolean;
  senderUserName: string | null;
  createdAt: string;
  waMessageId?: string | null;
  sentAt?: string | null;
};

export type AttendanceInstance = {
  status: "disconnected" | "connecting" | "connected" | "error";
  phoneNumber: string | null;
  displayName: string | null;
};

export const conversationStatusLabels: Record<ConversationStatus, string> = {
  pending: "Pendentes",
  open: "Em atendimento",
  resolved: "Concluídos",
};

/** Prévia curta usada em last_message_preview e na lista. */
export function toMessagePreview(
  type: MessageType,
  body: string | null,
): string {
  if (body && body.trim()) {
    return body.trim().slice(0, 120);
  }
  switch (type) {
    case "image":
      return "Imagem";
    case "audio":
      return "Áudio";
    case "video":
      return "Vídeo";
    case "document":
      return "Documento";
    case "location":
      return "Localização";
    case "contact":
      return "Contato";
    default:
      return "Mensagem";
  }
}
