import { AttendanceInbox } from "./attendance-inbox";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrganizationEvolutionConfig } from "@/lib/whatsapp/credentials";
import { createPatientPhotoSignedUrl } from "@/lib/storage/patient-photos";
import type {
  ConversationListItem,
  ConversationStatus,
  ConversationTagView,
} from "@/lib/whatsapp/types";

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

export default async function AtendimentoPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireCompanyPermission(["atendimento.ver"]);
  const canAttend = context.permissionCodes.has("atendimento.atender");
  const canConfigure = context.permissionCodes.has("atendimento.configurar");
  const organizationId = context.organization.id;
  const currentUserId = context.effectiveUser?.id ?? null;
  const rawConversationId = (await searchParams)?.conversation;
  const requestedConversationId =
    typeof rawConversationId === "string" && isUuid(rawConversationId)
      ? rawConversationId
      : null;

  const supabase = await createSupabaseServerClient();

  // Onda única para tudo que depende só da organização.
  const [evolutionConfig, { data: conversationRows }, { data: tagRows }] =
    await Promise.all([
      getOrganizationEvolutionConfig(organizationId),
      supabase
        .from("whatsapp_conversations")
        .select(
          "id, status, contact_id, assigned_user_id, funnel_card_id, unread_count, last_message_at, last_message_preview",
        )
        .eq("organization_id", organizationId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200)
        .returns<ConversationRow[]>(),
      supabase
        .from("tags")
        .select("id, name, color")
        .eq("organization_id", organizationId)
        .order("name")
        .returns<ConversationTagView[]>(),
    ]);
  const evolutionReady = Boolean(evolutionConfig);

  let conversations = conversationRows ?? [];
  if (
    requestedConversationId &&
    !conversations.some((row) => row.id === requestedConversationId)
  ) {
    const { data: requestedConversation } = await supabase
      .from("whatsapp_conversations")
      .select(
        "id, status, contact_id, assigned_user_id, funnel_card_id, unread_count, last_message_at, last_message_preview",
      )
      .eq("organization_id", organizationId)
      .eq("id", requestedConversationId)
      .maybeSingle<ConversationRow>();

    if (requestedConversation) {
      conversations = [requestedConversation, ...conversations];
    }
  }
  const contactIds = [...new Set(conversations.map((row) => row.contact_id))];
  const conversationIds = conversations.map((row) => row.id);

  const resolvedConversationIds = conversations
    .filter((row) => row.status === "resolved")
    .map((row) => row.id);

  const [{ data: contacts }, { data: conversationTags }, { data: sessions }] =
    await Promise.all([
      contactIds.length
        ? supabase
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
            >()
        : Promise.resolve({ data: [] }),
      conversationIds.length
        ? supabase
            .from("conversation_tags")
            .select("conversation_id, tag_id")
            .eq("organization_id", organizationId)
            .in("conversation_id", conversationIds)
            .returns<{ conversation_id: string; tag_id: string }[]>()
        : Promise.resolve({ data: [] }),
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

  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));
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
        .map((c) => c.patient_id)
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

  const [{ data: patients }, { data: assignedUsers }] = await Promise.all([
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
  ]);

  const patientById = new Map((patients ?? []).map((p) => [p.id, p]));
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
  const userById = new Map((assignedUsers ?? []).map((u) => [u.id, u]));
  const tagById = new Map((tagRows ?? []).map((t) => [t.id, t]));
  const tagsByConversation = new Map<string, ConversationTagView[]>();
  for (const link of conversationTags ?? []) {
    const tag = tagById.get(link.tag_id);
    if (!tag) continue;
    const list = tagsByConversation.get(link.conversation_id) ?? [];
    list.push(tag);
    tagsByConversation.set(link.conversation_id, list);
  }

  const items: ConversationListItem[] = conversations.map((row) => {
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
    };
  });

  return (
    <div className="h-full min-h-0">
      <AttendanceInbox
        key={requestedConversationId ?? "attendance-inbox"}
        organizationId={organizationId}
        currentUserId={currentUserId}
        currentUserName={context.effectiveUser?.name ?? null}
        canAttend={canAttend}
        canConfigure={canConfigure}
        evolutionReady={evolutionReady}
        initialConversations={items}
        initialConversationId={
          requestedConversationId &&
          items.some((item) => item.id === requestedConversationId)
            ? requestedConversationId
            : null
        }
        availableTags={tagRows ?? []}
      />
    </div>
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
