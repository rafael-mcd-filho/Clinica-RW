import { createPatientPhotoSignedUrl } from "@/lib/storage/patient-photos";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ConversationListItem,
  ConversationStatus,
  ConversationTagView,
} from "@/lib/whatsapp/types";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type ConversationRow = {
  id: string;
  status: ConversationStatus;
  contact_id: string;
  assigned_user_id: string | null;
  funnel_card_id: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
};

const conversationSelect =
  "id, status, contact_id, assigned_user_id, funnel_card_id, unread_count, last_message_at, last_message_preview";

/** Quanto a primeira carga da página traz. */
export const CONVERSATION_INITIAL_SIZE = 200;
/** Quanto cada "Carregar mais" busca depois dela. */
export const CONVERSATION_PAGE_SIZE = 100;

/**
 * Uma página da fila de atendimento já montada: contato, paciente vinculado
 * (com foto), responsável, etiquetas e o fim do atendimento concluído.
 *
 * Vive fora da página porque o "Carregar mais" precisa da mesma montagem: sem
 * isso, ou o cliente refazia todas essas junções na mão, ou a fila ficava
 * presa no teto da primeira carga.
 */
export async function loadConversationPage({
  supabase,
  organizationId,
  offset = 0,
  limit = CONVERSATION_PAGE_SIZE,
  tags,
  includeConversationId = null,
}: {
  supabase: ServerClient;
  organizationId: string;
  offset?: number;
  limit?: number;
  /** Etiquetas da organização, quando quem chama já as carregou. */
  tags?: ConversationTagView[];
  /** Garante uma conversa específica na página (link direto para ela). */
  includeConversationId?: string | null;
}): Promise<{ items: ConversationListItem[]; hasMore: boolean }> {
  const { data: conversationRows } = await supabase
    .from("whatsapp_conversations")
    .select(conversationSelect)
    .eq("organization_id", organizationId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1)
    .returns<ConversationRow[]>();

  let conversations = conversationRows ?? [];
  const hasMore = conversations.length === limit;

  if (
    includeConversationId &&
    !conversations.some((row) => row.id === includeConversationId)
  ) {
    const { data: requested } = await supabase
      .from("whatsapp_conversations")
      .select(conversationSelect)
      .eq("organization_id", organizationId)
      .eq("id", includeConversationId)
      .maybeSingle<ConversationRow>();

    if (requested) conversations = [requested, ...conversations];
  }

  if (!conversations.length) return { items: [], hasMore: false };

  const contactIds = [...new Set(conversations.map((row) => row.contact_id))];
  const conversationIds = conversations.map((row) => row.id);
  const resolvedConversationIds = conversations
    .filter((row) => row.status === "resolved")
    .map((row) => row.id);

  const [{ data: contacts }, { data: conversationTags }, { data: sessions }] =
    await Promise.all([
      supabase
        .from("whatsapp_contacts")
        .select("id, phone, wa_name, patient_id")
        .eq("organization_id", organizationId)
        .in("id", contactIds)
        .returns<
          {
            id: string;
            phone: string;
            wa_name: string | null;
            patient_id: string | null;
          }[]
        >(),
      supabase
        .from("conversation_tags")
        .select("conversation_id, tag_id")
        .eq("organization_id", organizationId)
        .in("conversation_id", conversationIds)
        .returns<{ conversation_id: string; tag_id: string }[]>(),
      // A conclusão do atendimento vive na sessão, não na conversa: a fila de
      // concluídos mostra esse fim no lugar da última mensagem.
      resolvedConversationIds.length
        ? supabase
            .from("whatsapp_attendance_sessions")
            .select("conversation_id, ended_at")
            .eq("organization_id", organizationId)
            .eq("end_reason", "completed")
            .not("ended_at", "is", null)
            .in("conversation_id", resolvedConversationIds)
            .order("ended_at", { ascending: false })
            .returns<{ conversation_id: string; ended_at: string }[]>()
        : Promise.resolve({ data: [] }),
    ]);

  const contactById = new Map((contacts ?? []).map((item) => [item.id, item]));
  // A query vem do fim mais recente para o mais antigo, então o primeiro
  // registro de cada conversa é a conclusão que interessa.
  const resolvedAtByConversation = new Map<string, string>();
  for (const session of sessions ?? []) {
    if (!resolvedAtByConversation.has(session.conversation_id)) {
      resolvedAtByConversation.set(session.conversation_id, session.ended_at);
    }
  }

  const patientIds = [
    ...new Set(
      (contacts ?? [])
        .map((item) => item.patient_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const assignedUserIds = [
    ...new Set(
      conversations
        .map((row) => row.assigned_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const missingTags = !tags;

  const [{ data: patients }, { data: assignedUsers }, { data: loadedTags }] =
    await Promise.all([
      patientIds.length
        ? supabase
            .from("patients")
            .select("id, full_name, social_name, photo_path")
            .eq("organization_id", organizationId)
            .in("id", patientIds)
            .returns<
              {
                id: string;
                full_name: string;
                social_name: string | null;
                photo_path: string | null;
              }[]
            >()
        : Promise.resolve({ data: [] }),
      assignedUserIds.length
        ? supabase
            .from("app_users")
            .select("id, name")
            .eq("organization_id", organizationId)
            .in("id", assignedUserIds)
            .returns<{ id: string; name: string }[]>()
        : Promise.resolve({ data: [] }),
      missingTags
        ? supabase
            .from("tags")
            .select("id, name, color")
            .eq("organization_id", organizationId)
            .order("name")
            .returns<ConversationTagView[]>()
        : Promise.resolve({ data: [] as ConversationTagView[] }),
    ]);

  const patientById = new Map((patients ?? []).map((item) => [item.id, item]));
  const photoByPatientId = new Map(
    await Promise.all(
      (patients ?? []).map(
        async (patient) =>
          [
            patient.id,
            await createPatientPhotoSignedUrl(patient.photo_path),
          ] as const,
      ),
    ),
  );
  const userById = new Map(
    (assignedUsers ?? []).map((item) => [item.id, item]),
  );
  const tagById = new Map(
    (tags ?? loadedTags ?? []).map((tag) => [tag.id, tag]),
  );
  const tagsByConversation = new Map<string, ConversationTagView[]>();
  for (const link of conversationTags ?? []) {
    const tag = tagById.get(link.tag_id);
    if (!tag) continue;
    const list = tagsByConversation.get(link.conversation_id) ?? [];
    list.push(tag);
    tagsByConversation.set(link.conversation_id, list);
  }

  const items = conversations.map((row) => {
    const contact = contactById.get(row.contact_id);
    const patient = contact?.patient_id
      ? patientById.get(contact.patient_id)
      : undefined;
    const patientPhotoUrl = contact?.patient_id
      ? (photoByPatientId.get(contact.patient_id) ?? null)
      : null;

    return {
      id: row.id,
      status: row.status,
      contactId: row.contact_id,
      contactName: contact?.wa_name || contact?.phone || "Contato",
      contactPhone: contact?.phone ?? "",
      contactPhotoUrl:
        patientPhotoUrl ??
        (contact ? `/api/whatsapp/contact-photo/${contact.id}` : null),
      patientId: contact?.patient_id ?? null,
      patientName: patient ? patient.social_name || patient.full_name : null,
      assignedUserId: row.assigned_user_id,
      assignedUserName: row.assigned_user_id
        ? (userById.get(row.assigned_user_id)?.name ?? null)
        : null,
      funnelCardId: row.funnel_card_id,
      unreadCount: row.unread_count,
      lastMessageAt: row.last_message_at,
      lastMessagePreview: row.last_message_preview,
      resolvedAt: resolvedAtByConversation.get(row.id) ?? null,
      tags: tagsByConversation.get(row.id) ?? [],
    } satisfies ConversationListItem;
  });

  return { items, hasMore };
}
