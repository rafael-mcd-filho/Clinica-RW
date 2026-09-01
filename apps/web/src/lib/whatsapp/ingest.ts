import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  toMessagePreview,
  type MessageStatus,
  type MessageType,
} from "@/lib/whatsapp/types";

/**
 * Ingestão de eventos da Evolution (webhook). Usa o service role — roda fora de
 * uma sessão autenticada, então NÃO passa pela RLS; por isso todo acesso é
 * escopado explicitamente por organization_id resolvido a partir da instância.
 */

export type InboundMessageInput = {
  instanceName: string;
  phone: string;
  waName: string | null;
  waMessageId: string | null;
  type: MessageType;
  body: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  timestampMs: number | null;
};

export type OutboundMessageInput = InboundMessageInput;

type ResolvedInstance = { id: string; organization_id: string };

async function resolveInstance(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  instanceName: string,
): Promise<ResolvedInstance | null> {
  const { data } = await admin
    .from("whatsapp_instances")
    .select("id, organization_id")
    .eq("evolution_instance_name", instanceName)
    .maybeSingle();
  return (data as ResolvedInstance | null) ?? null;
}

async function findPatientByPhone(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  phone: string,
): Promise<{ id: string } | null> {
  const digits = phone.replace(/\D/g, "");
  const last8 = digits.slice(-8);
  if (last8.length < 8) return null;

  const { data } = await admin
    .from("patients")
    .select("id")
    .eq("organization_id", organizationId)
    .or(`phone.ilike.%${last8}%,whatsapp.ilike.%${last8}%`)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

/**
 * Registra uma mensagem recebida: garante contato (com auto-vínculo a paciente),
 * garante conversa (reabrindo se estava concluída) e grava a mensagem.
 * Idempotente por wa_message_id.
 */
async function ingestMessage(
  input: InboundMessageInput,
  direction: "inbound" | "outbound",
): Promise<{ ignored: boolean }> {
  const admin = createSupabaseAdminClient();
  const instance = await resolveInstance(admin, input.instanceName);
  if (!instance) {
    return { ignored: true };
  }

  const organizationId = instance.organization_id;
  const nowIso = input.timestampMs
    ? new Date(input.timestampMs).toISOString()
    : new Date().toISOString();

  // Webhooks podem ser reenviados. Além disso, mensagens disparadas pelo
  // sistema retornam como `fromMe`; interromper aqui evita duplicar a
  // atividade da conversa e o contador de não lidas.
  if (input.waMessageId) {
    const { data: existingMessage } = await admin
      .from("whatsapp_messages")
      .select("id, media_url")
      .eq("organization_id", organizationId)
      .eq("wa_message_id", input.waMessageId)
      .maybeSingle<{ id: string; media_url: string | null }>();

    if (existingMessage) {
      if (input.mediaUrl && !existingMessage.media_url) {
        await admin
          .from("whatsapp_messages")
          .update({
            media_url: input.mediaUrl,
            media_mime_type: input.mediaMimeType,
          })
          .eq("organization_id", organizationId)
          .eq("id", existingMessage.id);
      }
      return { ignored: true };
    }
  }

  // Contato (upsert por telefone).
  const contactPayload: Record<string, unknown> = {
    organization_id: organizationId,
    phone: input.phone,
  };
  if (input.waName) {
    contactPayload.wa_name = input.waName;
  }
  const { data: contactRow } = await admin
    .from("whatsapp_contacts")
    .upsert(contactPayload, { onConflict: "organization_id,phone" })
    .select("id, patient_id")
    .single();
  const contact = contactRow as { id: string; patient_id: string | null };

  // Auto-vínculo com paciente existente por telefone.
  if (!contact.patient_id) {
    const patient = await findPatientByPhone(
      admin,
      organizationId,
      input.phone,
    );
    if (patient) {
      await admin
        .from("whatsapp_contacts")
        .update({ patient_id: patient.id })
        .eq("organization_id", organizationId)
        .eq("id", contact.id);
    }
  }

  // Conversa (uma por contato+instância).
  const preview = toMessagePreview(input.type, input.body);
  const { data: existing } = await admin
    .from("whatsapp_conversations")
    .select("id, unread_count, status")
    .eq("organization_id", organizationId)
    .eq("instance_id", instance.id)
    .eq("contact_id", contact.id)
    .maybeSingle();

  let conversationId: string;
  if (existing) {
    const current = existing as {
      id: string;
      unread_count: number;
      status: string;
    };
    conversationId = current.id;
    const inbound = direction === "inbound";
    const reopening = current.status === "resolved";
    await admin
      .from("whatsapp_conversations")
      .update({
        // Uma resposta enviada pelo aparelho também lê todas as mensagens que
        // estavam aguardando retorno nessa conversa.
        unread_count: inbound ? current.unread_count + 1 : 0,
        last_message_at: nowIso,
        last_message_preview: preview,
        // Uma nova atividade externa, recebida ou enviada pelo aparelho,
        // devolve a conversa concluída para a fila.
        status: reopening ? "pending" : current.status,
        assigned_user_id: reopening ? null : undefined,
      })
      .eq("organization_id", organizationId)
      .eq("id", conversationId);
  } else {
    const { data: created } = await admin
      .from("whatsapp_conversations")
      .insert({
        organization_id: organizationId,
        instance_id: instance.id,
        contact_id: contact.id,
        status: "pending",
        unread_count: direction === "inbound" ? 1 : 0,
        last_message_at: nowIso,
        last_message_preview: preview,
      })
      .select("id")
      .single();
    conversationId = (created as { id: string }).id;
  }

  // Mensagem (idempotente por wa_message_id).
  await admin.from("whatsapp_messages").upsert(
    {
      organization_id: organizationId,
      conversation_id: conversationId,
      wa_message_id: input.waMessageId,
      direction,
      message_type: input.type,
      body: input.body,
      media_url: input.mediaUrl,
      media_mime_type: input.mediaMimeType,
      status: direction === "inbound" ? "received" : "sent",
      created_at: nowIso,
      sent_at: direction === "outbound" ? nowIso : null,
    },
    { onConflict: "organization_id,wa_message_id", ignoreDuplicates: true },
  );

  return { ignored: false };
}

/**
 * Registra uma mensagem recebida e reabre a conversa quando necessário.
 */
export async function ingestInboundMessage(
  input: InboundMessageInput,
): Promise<{ ignored: boolean }> {
  return ingestMessage(input, "inbound");
}

/**
 * Registra mensagens enviadas diretamente pelo aparelho conectado. Ecos de
 * mensagens enviadas pelo sistema são ignorados pelo mesmo wa_message_id.
 */
export async function ingestOutboundMessage(
  input: OutboundMessageInput,
): Promise<{ ignored: boolean }> {
  return ingestMessage(input, "outbound");
}

/** Atualiza o status de entrega/leitura de uma mensagem enviada. */
export async function updateMessageStatus(input: {
  instanceName: string;
  waMessageId: string;
  status: MessageStatus;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const instance = await resolveInstance(admin, input.instanceName);
  if (!instance) return;

  await admin
    .from("whatsapp_messages")
    .update({ status: input.status })
    .eq("organization_id", instance.organization_id)
    .eq("wa_message_id", input.waMessageId);
}

/** Atualiza o estado de conexão da instância (CONNECTION_UPDATE). */
export async function updateInstanceConnection(input: {
  instanceName: string;
  state: "connected" | "connecting" | "disconnected" | "error";
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const instance = await resolveInstance(admin, input.instanceName);
  if (!instance) return;

  await admin
    .from("whatsapp_instances")
    .update({
      status: input.state,
      last_connected_at:
        input.state === "connected" ? new Date().toISOString() : undefined,
    })
    .eq("id", instance.id);
}
