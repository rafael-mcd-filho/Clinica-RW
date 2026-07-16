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

export type QuickReplyTemplate = { id: string; name: string; body: string };

export default async function AtendimentoPage() {
  const context = await requireCompanyPermission(["atendimento.ver"]);
  const canAttend = context.permissionCodes.has("atendimento.atender");
  const canConfigure = context.permissionCodes.has("atendimento.configurar");
  const organizationId = context.organization.id;
  const evolutionReady = Boolean(
    await getOrganizationEvolutionConfig(organizationId),
  );
  const currentUserId = context.effectiveUser?.id ?? null;

  const supabase = await createSupabaseServerClient();

  const [{ data: conversationRows }, { data: tagRows }, { data: instanceRow }] =
    await Promise.all([
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
      supabase
        .from("whatsapp_instances")
        .select("status, phone_number, display_name")
        .eq("organization_id", organizationId)
        .limit(1)
        .maybeSingle<{
          status: "disconnected" | "connecting" | "connected" | "error";
          phone_number: string | null;
          display_name: string | null;
        }>(),
    ]);

  const conversations = conversationRows ?? [];
  const contactIds = [...new Set(conversations.map((row) => row.contact_id))];
  const conversationIds = conversations.map((row) => row.id);

  const [{ data: contacts }, { data: conversationTags }, { data: templates }] =
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
      supabase
        .from("message_templates")
        .select("id, name, body_template")
        .eq("organization_id", organizationId)
        .eq("channel", "whatsapp")
        .eq("active", true)
        .order("name")
        .returns<{ id: string; name: string; body_template: string }[]>(),
    ]);

  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));
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

  const [{ data: patients }, { data: assignedUsers }, { data: attendants }] =
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
      supabase
        .from("app_users")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("name")
        .returns<{ id: string; name: string }[]>(),
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
    return {
      id: row.id,
      status: row.status,
      contactId: row.contact_id,
      contactName: contact?.wa_name || contact?.phone || "Contato",
      contactPhone: contact?.phone ?? "",
      contactPhotoUrl: contact?.patient_id
        ? (photoByPatientId.get(contact.patient_id) ?? null)
        : null,
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
      tags: tagsByConversation.get(row.id) ?? [],
    };
  });

  const quickReplies: QuickReplyTemplate[] = (templates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    body: t.body_template,
  }));

  return (
    <div className="min-h-0">
      <AttendanceInbox
        organizationId={organizationId}
        currentUserId={currentUserId}
        currentUserName={context.effectiveUser?.name ?? null}
        attendants={attendants ?? []}
        canAttend={canAttend}
        canConfigure={canConfigure}
        evolutionReady={evolutionReady}
        initialConversations={items}
        availableTags={tagRows ?? []}
        quickReplies={quickReplies}
        instance={
          instanceRow
            ? {
                status: instanceRow.status,
                phoneNumber: instanceRow.phone_number,
                displayName: instanceRow.display_name,
              }
            : null
        }
      />
    </div>
  );
}
