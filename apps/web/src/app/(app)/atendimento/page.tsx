import { AttendanceInbox } from "./attendance-inbox";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrganizationEvolutionConfig } from "@/lib/whatsapp/credentials";
import {
  CONVERSATION_INITIAL_SIZE,
  loadConversationPage,
} from "@/lib/whatsapp/conversation-list";
import type { ConversationTagView } from "@/lib/whatsapp/types";

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
  const [evolutionConfig, { data: tagRows }] = await Promise.all([
    getOrganizationEvolutionConfig(organizationId),
    supabase
      .from("tags")
      .select("id, name, color")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<ConversationTagView[]>(),
  ]);
  const evolutionReady = Boolean(evolutionConfig);

  const { items, hasMore } = await loadConversationPage({
    supabase,
    organizationId,
    limit: CONVERSATION_INITIAL_SIZE,
    tags: tagRows ?? [],
    includeConversationId: requestedConversationId,
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
        initialHasMore={hasMore}
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
