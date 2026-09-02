"use server";

import { getRequestContext } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { draftReply } from "@/lib/whatsapp/ai-draft";
import {
  sendMediaMessage,
  sendTextMessage,
  sendWhatsAppAudio,
} from "@/lib/whatsapp/evolution-client";
import { getOrganizationEvolutionConfig } from "@/lib/whatsapp/credentials";
import {
  CONVERSATION_PAGE_SIZE,
  loadConversationPage,
} from "@/lib/whatsapp/conversation-list";
import { ingestInboundMessage } from "@/lib/whatsapp/ingest";
import {
  toMessagePreview,
  type ConversationListItem,
  type ConversationMessage,
  type ConversationStatus,
} from "@/lib/whatsapp/types";

export type AttendanceResult = {
  ok: boolean;
  error?: string;
  message?: ConversationMessage;
};

type AttendantAuth = {
  organizationId: string;
  userId: string;
  impersonating: boolean;
};

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
    impersonating: Boolean(context.impersonation),
  };
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function brazilianPhoneCandidates(value: string): string[] {
  const digits = onlyDigits(value);
  const national =
    digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits;
  if (national.length !== 10 && national.length !== 11) {
    return [];
  }

  const nationalVariants = new Set([national]);
  if (national.length === 11 && national[2] === "9") {
    nationalVariants.add(`${national.slice(0, 2)}${national.slice(3)}`);
  } else if (national.length === 10) {
    nationalVariants.add(`${national.slice(0, 2)}9${national.slice(2)}`);
  }

  return [
    ...new Set([...nationalVariants].flatMap((phone) => [phone, `55${phone}`])),
  ];
}

function mediaFileExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,10}$/.test(fromName)) return fromName;
  const fromMime = file.type.split("/")[1]?.split(";")[0]?.toLowerCase();
  return fromMime?.replace(/[^a-z0-9]/g, "") || "bin";
}

type ConversationContext = {
  conversationId: string;
  contactId: string;
  phone: string;
  patientId: string | null;
  patientDeceasedAt: string | null;
  status: ConversationStatus;
  assignedUserId: string | null;
};

async function loadConversationContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  conversationId: string,
): Promise<ConversationContext | null> {
  const { data: conversation } = await supabase
    .from("whatsapp_conversations")
    .select("id, contact_id, status, assigned_user_id")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle<{
      id: string;
      contact_id: string;
      status: ConversationStatus;
      assigned_user_id: string | null;
    }>();
  if (!conversation) return null;

  const { data: contact } = await supabase
    .from("whatsapp_contacts")
    .select("id, phone, patient_id")
    .eq("organization_id", organizationId)
    .eq("id", conversation.contact_id)
    .maybeSingle<{ id: string; phone: string; patient_id: string | null }>();
  if (!contact) return null;

  let patientDeceasedAt: string | null = null;
  const admin = createSupabaseAdminClient();
  if (contact.patient_id) {
    const { data: patient, error: patientError } = await admin
      .from("patients")
      .select("deceased_at")
      .eq("organization_id", organizationId)
      .eq("id", contact.patient_id)
      .maybeSingle<{ deceased_at: string | null }>();
    if (patientError || !patient) {
      console.error(
        "[whatsapp patient life status]",
        patientError?.message ?? "Linked patient not found.",
      );
      return null;
    }
    patientDeceasedAt = patient.deceased_at;
  } else {
    // O vínculo pode ser removido manualmente. Ainda assim, um contato com o
    // mesmo telefone de um paciente falecido não pode contornar o bloqueio.
    const phoneCandidates = brazilianPhoneCandidates(contact.phone);
    if (phoneCandidates.length) {
      const phoneFilter = phoneCandidates
        .flatMap((phone) => [`phone.eq.${phone}`, `whatsapp.eq.${phone}`])
        .join(",");
      const { data: deceasedPatient, error: patientError } = await admin
        .from("patients")
        .select("deceased_at")
        .eq("organization_id", organizationId)
        .not("deceased_at", "is", null)
        .or(phoneFilter)
        .limit(1)
        .maybeSingle<{ deceased_at: string | null }>();
      if (patientError) {
        console.error(
          "[whatsapp patient life status by phone]",
          patientError.message,
        );
        return null;
      }
      patientDeceasedAt = deceasedPatient?.deceased_at ?? null;
    }
  }

  return {
    conversationId: conversation.id,
    contactId: contact.id,
    phone: contact.phone,
    patientId: contact.patient_id,
    patientDeceasedAt,
    status: conversation.status,
    assignedUserId: conversation.assigned_user_id,
  };
}

function writableConversationError(
  context: ConversationContext,
  userId: string,
): string | null {
  if (context.patientDeceasedAt) {
    return "Paciente registrado como falecido. O envio de mensagens está bloqueado.";
  }
  return ownedOpenConversationError(context, userId);
}

function ownedOpenConversationError(
  context: ConversationContext,
  userId: string,
): string | null {
  if (context.status !== "open") {
    return "Inicie o atendimento antes de enviar mensagens.";
  }
  if (context.assignedUserId !== userId) {
    return "Somente o responsável pelo atendimento pode enviar mensagens.";
  }
  return null;
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

async function recordOutboundActivity({
  auth,
  conversationId,
  preview,
  sentAt,
}: {
  auth: AttendantAuth;
  conversationId: string;
  preview: string;
  sentAt: string;
}): Promise<void> {
  if (!auth.impersonating) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc(
      "record_whatsapp_outbound_activity",
      {
        p_conversation_id: conversationId,
        p_preview: preview,
        p_sent_at: sentAt,
      },
    );
    if (!error && data) return;
    if (error) {
      console.error("[whatsapp outbound activity]", error.message);
    }
  }

  // Na impersonaÃ§Ã£o o JWT continua sendo do Super Admin. A identidade efetiva
  // jÃ¡ foi autorizada e validada como dona da conversa antes do envio.
  const { error } = await createSupabaseAdminClient()
    .from("whatsapp_conversations")
    .update({
      unread_count: 0,
      last_message_at: sentAt,
      last_message_preview: preview,
    })
    .eq("organization_id", auth.organizationId)
    .eq("id", conversationId)
    .eq("status", "open")
    .eq("assigned_user_id", auth.userId);
  if (error) {
    console.error("[whatsapp outbound activity fallback]", error.message);
  }
}

export async function sendMessageAction(
  conversationId: string,
  text: string,
  replyToMessageId?: string | null,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Mensagem vazia." };

  const supabase = await createSupabaseServerClient();
  const context = await loadConversationContext(
    supabase,
    auth.organizationId,
    conversationId,
  );
  if (!context) return { ok: false, error: "Conversa não encontrada." };
  const writeError = writableConversationError(context, auth.userId);
  if (writeError) return { ok: false, error: writeError };

  const evolutionConfig = await getOrganizationEvolutionConfig(
    auth.organizationId,
  );
  if (!evolutionConfig) {
    return {
      ok: false,
      error: "Integração do WhatsApp não configurada. Verifique o .env.local.",
    };
  }

  if (await isOptedOut(supabase, auth.organizationId, context.phone)) {
    return {
      ok: false,
      error: "Este contato optou por não receber mensagens (opt-out).",
    };
  }

  // Citação: a Evolution precisa da chave que o WhatsApp deu à mensagem
  // original. Sem wa_message_id (nota interna, ou envio que nunca voltou do
  // provedor) a resposta segue sem citar, em vez de falhar.
  let quoted: {
    waMessageId: string;
    fromMe: boolean;
    body: string | null;
  } | null = null;
  if (replyToMessageId) {
    const { data: quotedRow } = await supabase
      .from("whatsapp_messages")
      .select("id, wa_message_id, direction, body, message_type")
      .eq("organization_id", auth.organizationId)
      .eq("conversation_id", conversationId)
      .eq("id", replyToMessageId)
      .maybeSingle<{
        id: string;
        wa_message_id: string | null;
        direction: "inbound" | "outbound";
        body: string | null;
        message_type: string;
      }>();

    if (quotedRow?.wa_message_id && quotedRow.message_type !== "note") {
      quoted = {
        waMessageId: quotedRow.wa_message_id,
        fromMe: quotedRow.direction === "outbound",
        body: quotedRow.body,
      };
    }
  }

  let waMessageId: string | null = null;
  try {
    const result = await sendTextMessage(
      context.phone,
      trimmed,
      evolutionConfig,
      quoted,
    );
    waMessageId = result.waMessageId;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao enviar.",
    };
  }

  const nowIso = new Date().toISOString();
  const { data: storedMessage, error: insertError } =
    await createSupabaseAdminClient()
      .from("whatsapp_messages")
      .insert({
        organization_id: auth.organizationId,
        conversation_id: conversationId,
        wa_message_id: waMessageId,
        direction: "outbound",
        sender_user_id: auth.userId,
        message_type: "text",
        body: trimmed,
        status: "sent",
        sent_at: nowIso,
        // Só entra no insert quando há citação: assim um banco sem a migration
        // da coluna continua registrando os envios normais.
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      })
      .select("id, created_at")
      .single<{ id: string; created_at: string }>();

  if (insertError || !storedMessage) {
    return {
      ok: false,
      error:
        insertError?.message ??
        "A mensagem foi enviada, mas não pôde ser registrada.",
    };
  }

  await recordOutboundActivity({
    auth,
    conversationId,
    preview: toMessagePreview("text", trimmed),
    sentAt: nowIso,
  });

  return {
    ok: true,
    message: {
      id: storedMessage.id,
      direction: "outbound",
      type: "text",
      body: trimmed,
      mediaUrl: null,
      mediaMimeType: null,
      status: "sent",
      aiSuggested: false,
      senderUserName: null,
      createdAt: storedMessage.created_at,
      waMessageId,
      sentAt: nowIso,
      replyToMessageId: replyToMessageId ?? null,
    },
  };
}

export async function sendMediaMessageAction(
  formData: FormData,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };
  const conversationId = String(formData.get("conversation_id") ?? "");
  const file = formData.get("file");
  if (!conversationId || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Selecione um arquivo para enviar." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, error: "O arquivo deve ter no máximo 10 MB." };
  }
  const mediaType = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("audio/")
      ? "audio"
      : file.type.startsWith("video/")
        ? "video"
        : "document";
  const supabase = await createSupabaseServerClient();
  const context = await loadConversationContext(
    supabase,
    auth.organizationId,
    conversationId,
  );
  if (!context) return { ok: false, error: "Conversa não encontrada." };
  const writeError = writableConversationError(context, auth.userId);
  if (writeError) return { ok: false, error: writeError };

  const evolutionConfig = await getOrganizationEvolutionConfig(
    auth.organizationId,
  );
  if (!evolutionConfig)
    return { ok: false, error: "Integração do WhatsApp não configurada." };

  const fileBytes = Buffer.from(await file.arrayBuffer());
  const base64 = fileBytes.toString("base64");
  let waMessageId: string | null = null;
  try {
    const result =
      mediaType === "audio"
        ? await sendWhatsAppAudio(context.phone, base64, evolutionConfig)
        : await sendMediaMessage(
            {
              phone: context.phone,
              media: base64,
              mediaType,
              fileName: file.name,
              caption:
                String(formData.get("caption") ?? "").trim() || undefined,
            },
            evolutionConfig,
          );
    waMessageId = result.waMessageId;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Falha ao enviar arquivo.",
    };
  }

  const storagePath = `${auth.organizationId}/outbound/${crypto.randomUUID()}.${mediaFileExtension(file)}`;
  const admin = createSupabaseAdminClient();
  const { error: storageError } = await admin.storage
    .from("whatsapp-media")
    .upload(storagePath, fileBytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  const persistedMediaPath = storageError ? null : storagePath;

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("whatsapp_messages")
    .insert({
      organization_id: auth.organizationId,
      conversation_id: conversationId,
      wa_message_id: waMessageId,
      direction: "outbound",
      sender_user_id: auth.userId,
      message_type: mediaType,
      body: file.name,
      media_url: persistedMediaPath,
      media_mime_type: file.type || null,
      status: "sent",
      sent_at: nowIso,
    })
    .select("id, created_at")
    .single<{ id: string; created_at: string }>();
  if (error || !data)
    return {
      ok: false,
      error: error?.message ?? "Arquivo enviado, mas não registrado.",
    };
  await recordOutboundActivity({
    auth,
    conversationId,
    preview: toMessagePreview(mediaType, file.name),
    sentAt: nowIso,
  });
  return {
    ok: true,
    message: {
      id: data.id,
      direction: "outbound",
      type: mediaType,
      body: file.name,
      mediaUrl: persistedMediaPath,
      mediaMimeType: file.type || null,
      status: "sent",
      aiSuggested: false,
      senderUserName: null,
      createdAt: data.created_at,
      waMessageId,
      sentAt: nowIso,
    },
  };
}

export async function assignToMeAction(
  conversationId: string,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  // Durante a impersonação, o JWT ainda pertence ao Super Admin, enquanto a
  // tela e as permissões representam o usuário efetivo. A RPC tradicional usa
  // auth.uid() e por isso não encontra a organização do usuário efetivo.
  if (auth.impersonating) {
    return claimConversationAsEffectiveUser(
      auth.organizationId,
      auth.userId,
      conversationId,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("claim_whatsapp_conversation", {
    p_conversation_id: conversationId,
  });
  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: "Este atendimento acabou de ser assumido por outro usuário.",
    };
  }
  return { ok: true };
}

async function claimConversationAsEffectiveUser(
  organizationId: string,
  userId: string,
  conversationId: string,
): Promise<AttendanceResult> {
  const admin = createSupabaseAdminClient();
  const { data: current, error: currentError } = await admin
    .from("whatsapp_conversations")
    .select("status, assigned_user_id")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle<{
      status: ConversationStatus;
      assigned_user_id: string | null;
    }>();

  if (currentError) return { ok: false, error: currentError.message };
  if (!current) return { ok: false, error: "Conversa não encontrada." };
  if (current.status === "open" && current.assigned_user_id === userId) {
    return { ok: true };
  }
  if (current.status !== "pending" || current.assigned_user_id) {
    return {
      ok: false,
      error: "Este atendimento acabou de ser assumido por outro usuário.",
    };
  }

  // A condição no UPDATE mantém a disputa entre atendentes atômica. O trigger
  // de ciclo de atendimento registra a sessão e o evento da alteração.
  const { data: claimed, error } = await admin
    .from("whatsapp_conversations")
    .update({ status: "open", assigned_user_id: userId })
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .eq("status", "pending")
    .is("assigned_user_id", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { ok: false, error: error.message };
  return claimed
    ? { ok: true }
    : {
        ok: false,
        error: "Este atendimento acabou de ser assumido por outro usuário.",
      };
}

/**
 * Nota interna: registrada na conversa apenas para a equipe — não passa pela
 * Evolution e não altera o preview/contador da conversa.
 */
export async function addInternalNoteAction(
  conversationId: string,
  text: string,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Nota vazia." };

  const supabase = await createSupabaseServerClient();
  const context = await loadConversationContext(
    supabase,
    auth.organizationId,
    conversationId,
  );
  if (!context) return { ok: false, error: "Conversa não encontrada." };
  const writeError = ownedOpenConversationError(context, auth.userId);
  if (writeError) return { ok: false, error: writeError };

  const nowIso = new Date().toISOString();
  const { data, error } = await createSupabaseAdminClient()
    .from("whatsapp_messages")
    .insert({
      organization_id: auth.organizationId,
      conversation_id: conversationId,
      direction: "outbound",
      sender_user_id: auth.userId,
      message_type: "note",
      body: trimmed,
      status: "sent",
      sent_at: nowIso,
    })
    .select("id, created_at")
    .single<{ id: string; created_at: string }>();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Falha ao salvar a nota." };
  }

  return {
    ok: true,
    message: {
      id: data.id,
      direction: "outbound",
      type: "note",
      body: trimmed,
      mediaUrl: null,
      mediaMimeType: null,
      status: "sent",
      aiSuggested: false,
      senderUserName: null,
      createdAt: data.created_at,
      waMessageId: null,
      sentAt: nowIso,
    },
  };
}

/** Transfere a conversa para outro atendente da equipe. */
export async function transferConversationAction(
  conversationId: string,
  targetUserId: string,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("transfer_whatsapp_conversation", {
    p_conversation_id: conversationId,
    p_target_user_id: targetUserId,
  });
  if (error) return { ok: false, error: error.message };
  return data
    ? { ok: true }
    : { ok: false, error: "Não foi possível transferir o atendimento." };
}

export async function setConversationStatusAction(
  conversationId: string,
  status: ConversationStatus,
): Promise<AttendanceResult> {
  const auth = await requireAttendant();
  if (!auth) return { ok: false, error: "Acesso negado." };

  const supabase = await createSupabaseServerClient();
  if (status === "open") {
    return {
      ok: false,
      error: "Use a ação de iniciar ou transferir para abrir o atendimento.",
    };
  }
  if (status !== "pending" && status !== "resolved") {
    return { ok: false, error: "Status de atendimento inválido." };
  }

  if (auth.impersonating) {
    return setConversationStatusAsEffectiveUser(
      auth.organizationId,
      conversationId,
      status,
    );
  }

  const functionName =
    status === "resolved"
      ? "complete_whatsapp_conversation"
      : "reopen_whatsapp_conversation";
  const { data, error } = await supabase.rpc(functionName, {
    p_conversation_id: conversationId,
  });
  if (error) return { ok: false, error: error.message };
  return data
    ? { ok: true }
    : { ok: false, error: "Não foi possível atualizar o atendimento." };
}

async function setConversationStatusAsEffectiveUser(
  organizationId: string,
  conversationId: string,
  status: "pending" | "resolved",
): Promise<AttendanceResult> {
  const admin = createSupabaseAdminClient();
  const { data: current, error: currentError } = await admin
    .from("whatsapp_conversations")
    .select("status")
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .maybeSingle<{ status: ConversationStatus }>();

  if (currentError) return { ok: false, error: currentError.message };
  if (!current) return { ok: false, error: "Conversa não encontrada." };
  if (current.status === status) return { ok: true };
  if (status === "pending" && current.status !== "resolved") {
    return { ok: false, error: "Não foi possível atualizar o atendimento." };
  }

  const changes =
    status === "pending" ? { status, assigned_user_id: null } : { status };
  const { data: updated, error } = await admin
    .from("whatsapp_conversations")
    .update(changes)
    .eq("organization_id", organizationId)
    .eq("id", conversationId)
    .eq("status", current.status)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { ok: false, error: error.message };
  return updated
    ? { ok: true }
    : {
        ok: false,
        error:
          "O atendimento foi atualizado por outro usuário. Tente novamente.",
      };
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
  const context = await loadConversationContext(
    supabase,
    auth.organizationId,
    conversationId,
  );
  if (!context) return { ok: false, error: "Conversa não encontrada." };
  const writeError = writableConversationError(context, auth.userId);
  if (writeError) return { ok: false, error: writeError };

  const { data: messages } = await supabase
    .from("whatsapp_messages")
    .select("direction, body, message_type, created_at")
    .eq("organization_id", auth.organizationId)
    .eq("conversation_id", conversationId)
    .neq("message_type", "note")
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

/**
 * Próxima página da fila, para o "Carregar mais" da lista.
 *
 * A primeira carga vem com a página (200 conversas); daí em diante a fila
 * cresce por aqui, em vez de ficar presa naquele teto. Só leitura: exige
 * `atendimento.ver`, e a montagem é a mesma da página.
 */
export async function loadMoreConversationsAction(offset: number): Promise<{
  ok: boolean;
  conversations?: ConversationListItem[];
  hasMore?: boolean;
  error?: string;
}> {
  const context = await getRequestContext();
  if (
    !context.organization ||
    !context.permissionCodes.has("atendimento.ver")
  ) {
    return { ok: false, error: "Acesso negado." };
  }

  const safeOffset = Number.isFinite(offset)
    ? Math.min(Math.max(Math.trunc(offset), 0), 100_000)
    : 0;
  const supabase = await createSupabaseServerClient();

  try {
    const { items, hasMore } = await loadConversationPage({
      supabase,
      organizationId: context.organization.id,
      offset: safeOffset,
      limit: CONVERSATION_PAGE_SIZE,
    });
    return { ok: true, conversations: items, hasMore };
  } catch {
    return { ok: false, error: "Não foi possível carregar mais conversas." };
  }
}
