"use server";

import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { draftReply } from "@/lib/whatsapp/ai-draft";
import { sendTextMessage } from "@/lib/whatsapp/evolution-client";
import { getOrganizationEvolutionConfig } from "@/lib/whatsapp/credentials";
import { ingestInboundMessage } from "@/lib/whatsapp/ingest";
import {
  toMessagePreview,
  type ConversationStatus,
} from "@/lib/whatsapp/types";

export type AttendanceResult = { ok: boolean; error?: string };

async function requireAttendant() {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !context.effectiveUser ||
    !context.permissionCodes.has("atendimento.atender")
  ) {
    return null;
  }
  return {
    organizationId: context.organization.id,
    userId: context.effectiveUser.id,
  };
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

type ConversationContext = {
  conversationId: string;
  contactId: string;
  phone: string;
  patientId: string | null;
};

async function loadConversationContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  conversationId: string,
): Promise<ConversationContext | null> {
  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("id, contact_id")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle<{ id: string; contact_id: string }>();
  if (!conversation) return null;

  const { data: contact } = await supabase
    .from("whatsapp_contacts")
    .select("id, phone, patient_id")
    .eq("organization_id", organizationId)
    .eq("id", conversation.contact_id)
    .maybeSingle<{ id: string; phone: string; patient_id: string | null }>();
  if (!contact) return null;

  return {
    conversationId: conversation.id,
    contactId: contact.id,
    phone: contact.phone,
    patientId: contact.patient_id,
  };
}

async function isOptedOut(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  phone: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("communication_opt_outs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("channel", "whatsapp")
    .eq("normalized_recipient", onlyDigits(phone))
    .is("revoked_at", null)
    .maybeSingle();
  return Boolean(data);
}

export async function sendMessageAction(
  conversationId: string,
  text: string,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Mensagem vazia." };
  const evolutionConfig = await getOrganizationEvolutionConfig(auth.organizationId);
  if (!evolutionConfig) {
    return {
      ok: false,
      error: "Integração do WhatsApp não configurada. Verifique o .env.local.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const context = await loadConversationContext(
    supabase,
    auth.organizationId,
    conversationId,
  );
  if (!context) return { ok: false, error: "Conversa não encontrada." };

  if (await isOptedOut(supabase, auth.organizationId, context.phone)) {
    return {
      ok: false,
      error: "Este contato optou por não receber mensagens (opt-out).",
    };
  }

  let waMessageId: string | null = null;
  try {
    const result = await sendTextMessage(context.phone, trimmed, evolutionConfig);
    waMessageId = result.waMessageId;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao enviar.",
    };
  }

  const nowIso = new Date().toISOString();
  await supabase.from("whatsapp_messages").insert({
    organization_id: auth.organizationId,
    conversation_id: conversationId,
    wa_message_id: waMessageId,
    direction: "outbound",
    sender_user_id: auth.userId,
    message_type: "text",
    body: trimmed,
    status: "sent",
    sent_at: nowIso,
  });

  await supabase
    .from("whatsapp_conversations")
    .update({
      status: "open",
      unread_count: 0,
      last_message_at: nowIso,
      last_message_preview: toMessagePreview("text", trimmed),
    })
    .eq("organization_id", auth.organizationId)
    .eq("id", conversationId);

  return { ok: true };
}

export async function assignToMeAction(
  conversationId: string,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ assigned_user_id: auth.userId, status: "open" })
    .eq("organization_id", auth.organizationId)
    .eq("id", conversationId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setConversationStatusAction(
  conversationId: string,
  status: ConversationStatus,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ status })
    .eq("organization_id", auth.organizationId)
    .eq("id", conversationId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function markConversationReadAction(
  conversationId: string,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ unread_count: 0 })
    .eq("organization_id", auth.organizationId)
    .eq("id", conversationId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function setConversationTagAction(
  conversationId: string,
  tagId: string,
  attach: boolean,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const supabase = await createSupabaseServerClient();
  if (attach) {
    const { error } = await supabase.from("conversation_tags").upsert(
      {
        organization_id: auth.organizationId,
        conversation_id: conversationId,
        tag_id: tagId,
      },
      { onConflict: "conversation_id,tag_id", ignoreDuplicates: true },
    );
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const { error } = await supabase
    .from("conversation_tags")
    .delete()
    .eq("organization_id", auth.organizationId)
    .eq("conversation_id", conversationId)
    .eq("tag_id", tagId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function linkPatientAction(
  contactId: string,
  patientId: string | null,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("whatsapp_contacts")
    .update({ patient_id: patientId })
    .eq("organization_id", auth.organizationId)
    .eq("id", contactId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export type SuggestReplyResult = {
  ok: boolean;
  suggestion?: string;
  error?: string;
};

export async function suggestReplyAction(
  conversationId: string,
): Promise<SuggestReplyResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const supabase = await createSupabaseServerClient();
  const { data: messages } = await supabase
    .from("whatsapp_messages")
    .select("direction, body, message_type, created_at")
    .eq("organization_id", auth.organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(12)
    .returns<
      {
        direction: "inbound" | "outbound";
        body: string | null;
        message_type: string;
        created_at: string;
      }[]
    >();

  if (!messages?.length) {
    return { ok: false, error: "Sem histórico para sugerir resposta." };
  }

  try {
    const suggestion = await draftReply(
      messages
        .slice()
        .reverse()
        .map((message) => ({
          role: message.direction === "inbound" ? "patient" : "clinic",
          text: message.body ?? toMessagePreview("text", message.body),
        })),
    );
    return { ok: true, suggestion };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha na sugestão.",
    };
  }
}

/**
 * Helper de teste/demo: injeta uma mensagem recebida como se tivesse chegado
 * pela Evolution, para exercitar o inbox e o realtime sem depender de um envio
 * real. Restrito a ambientes de desenvolvimento.
 */
export async function simulateInboundAction(
  phone: string,
  text: string,
): Promise<AttendanceResult> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "Indisponível em produção." };
  }
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const supabase = await createSupabaseServerClient();
  const { data: instance } = await supabase
    .from("whatsapp_instances")
    .select("evolution_instance_name")
    .eq("organization_id", auth.organizationId)
    .limit(1)
    .maybeSingle<{ evolution_instance_name: string }>();
  if (!instance) {
    return { ok: false, error: "Nenhuma instância cadastrada." };
  }

  await ingestInboundMessage({
    instanceName: instance.evolution_instance_name,
    phone: onlyDigits(phone),
    waName: null,
    waMessageId: `sim-${Date.now()}`,
    type: "text",
    body: text,
    mediaUrl: null,
    mediaMimeType: null,
    timestampMs: Date.now(),
  });

  return { ok: true };
}
