"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowsLeftRight,
  Checks as CheckCheck,
  CheckCircle,
  Archive,
  ClockCounterClockwise as SortClock,
  Eye,
  Note,
  Play,
  Tray as Inbox,
  ChatsCircle as MessagesSquare,
  DotsThreeVertical as MoreVertical,
  Microphone as Mic,
  Paperclip,
  MagnifyingGlass as Search,
  PaperPlaneRight as Send,
  Smiley as Smile,
  Square,
  Trash,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  ContactDetailsPanel,
  preloadContactDetails,
} from "./contact-details-panel";
import {
  addInternalNoteAction,
  assignToMeAction,
  sendMediaMessageAction,
  sendMessageAction,
  setConversationStatusAction,
} from "./actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/field";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  getAttendanceCapabilities,
  getAttendanceQueue,
  getAttendanceQueueCounts,
} from "@/lib/whatsapp/attendance-state";
import type {
  ConversationListItem,
  ConversationMessage,
  ConversationStatus,
  ConversationTagView,
  MessageType,
} from "@/lib/whatsapp/types";
import { conversationStatusLabels } from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";

type InboxView = "new" | "mine" | "others" | "resolved";
type ConversationReadFilter = "all" | "unread";
type ConversationSortOrder = "newest" | "oldest";
const tabs: InboxView[] = ["new", "mine", "others"];
const tabLabels: Record<InboxView, string> = {
  new: "Novos",
  mine: "Meus",
  others: "Outros",
  resolved: "Concluídos",
};

type MessageRow = {
  id: string;
  conversation_id: string;
  wa_message_id: string | null;
  direction: "inbound" | "outbound";
  message_type: MessageType;
  body: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  status: ConversationMessage["status"];
  ai_suggested: boolean;
  sender_user_id: string | null;
  created_at: string;
  sent_at: string | null;
};

type AttendanceEventRow = {
  id: string;
  event_type: "started" | "transferred" | "completed" | "reopened";
  actor_user_id: string | null;
  from_user_id: string | null;
  to_user_id: string | null;
  occurred_at: string;
};

type AttendanceTimelineEvent = {
  id: string;
  eventType: AttendanceEventRow["event_type"];
  actorName: string | null;
  fromUserName: string | null;
  toUserName: string | null;
  occurredAt: string;
};

export function AttendanceInbox({
  organizationId,
  currentUserId,
  currentUserName,
  canAttend,
  canConfigure,
  evolutionReady,
  initialConversations,
  initialConversationId,
  availableTags,
}: {
  organizationId: string;
  currentUserId: string | null;
  currentUserName: string | null;
  canAttend: boolean;
  canConfigure: boolean;
  evolutionReady: boolean;
  initialConversations: ConversationListItem[];
  initialConversationId: string | null;
  availableTags: ConversationTagView[];
}) {
  const initialConversation = initialConversationId
    ? (initialConversations.find((item) => item.id === initialConversationId) ??
      null)
    : null;
  const [conversations, setConversations] = useState(initialConversations);
  const [tab, setTab] = useState<InboxView>(() => {
    if (!initialConversation) return "new";
    const initialQueue = getAttendanceQueue(
      initialConversation.status,
      initialConversation.assignedUserId,
      currentUserId,
    );
    return initialQueue === "resolved" ? "mine" : initialQueue;
  });
  const [query, setQuery] = useState("");
  const [readFilter, setReadFilter] = useState<ConversationReadFilter>("all");
  const [sortOrder, setSortOrder] = useState<ConversationSortOrder>("newest");
  const [messageSearch, setMessageSearch] = useState<{
    query: string;
    conversationIds: string[];
  }>({ query: "", conversationIds: [] });
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversation?.id ?? null,
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [attendanceEvents, setAttendanceEvents] = useState<
    AttendanceTimelineEvent[]
  >([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selectedIdRef = useRef<string | null>(initialConversation?.id ?? null);
  const supabaseRef = useRef(createSupabaseBrowserClient());
  const router = useRouter();

  useEffect(() => {
    const task = window.setTimeout(
      () => setConversations(initialConversations),
      0,
    );
    return () => window.clearTimeout(task);
  }, [initialConversations]);

  const selected = useMemo(
    () => conversations.find((item) => item.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  useEffect(() => {
    if (selectedId) void preloadContactDetails(selectedId, organizationId);
  }, [organizationId, selectedId]);

  const counts = useMemo(
    () => getAttendanceQueueCounts(conversations, currentUserId),
    [conversations, currentUserId],
  );

  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const messageSearchIds = useMemo(
    () =>
      messageSearch.query === normalizedQuery
        ? new Set(messageSearch.conversationIds)
        : new Set<string>(),
    [messageSearch, normalizedQuery],
  );
  const searchingMessages =
    normalizedQuery.length >= 2 && messageSearch.query !== normalizedQuery;

  useEffect(() => {
    if (normalizedQuery.length < 2) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      const { data } = await supabaseRef.current
        .from("whatsapp_messages")
        .select("conversation_id")
        .eq("organization_id", organizationId)
        .ilike("body", `%${escapeLikePattern(query.trim())}%`)
        .limit(500)
        .returns<{ conversation_id: string }[]>();

      if (!active) return;
      setMessageSearch({
        query: normalizedQuery,
        conversationIds: [
          ...new Set((data ?? []).map((row) => row.conversation_id)),
        ],
      });
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [normalizedQuery, organizationId, query]);

  const visibleConversations = useMemo(() => {
    return (
      conversations
        .filter((item) => {
          return (
            getAttendanceQueue(
              item.status,
              item.assignedUserId,
              currentUserId,
            ) === tab
          );
        })
        // Em concluídos o filtro de leitura não se aplica (e nem aparece).
        .filter(
          (item) =>
            tab === "resolved" || readFilter === "all" || item.unreadCount > 0,
        )
        .filter((item) => {
          if (!normalizedQuery) return true;
          const localMatch = [
            item.contactName,
            item.patientName ?? "",
            item.contactPhone,
            item.lastMessagePreview ?? "",
            ...item.tags.map((tag) => tag.name),
          ]
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedQuery);
          return localMatch || messageSearchIds.has(item.id);
        })
        .sort((first, second) =>
          compareConversationActivity(first, second, sortOrder),
        )
    );
  }, [
    conversations,
    currentUserId,
    messageSearchIds,
    normalizedQuery,
    readFilter,
    sortOrder,
    tab,
  ]);

  const upsertConversation = useCallback(
    (partial: Partial<ConversationListItem> & { id: string }) => {
      setConversations((current) => {
        const index = current.findIndex((item) => item.id === partial.id);
        if (index === -1) return current;
        const next = [...current];
        next[index] = { ...next[index], ...partial };
        return next;
      });
    },
    [],
  );

  // Realtime: novas mensagens e mudanças de conversa da organização.
  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`atendimento:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (rowBelongsToSelected(payload.new, selectedIdRef.current)) {
            setMessages((current) =>
              current.some((m) => m.id === row.id)
                ? current
                : [...current, toMessage(row)],
            );
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_messages",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((current) =>
            current.map((message) =>
              message.id === row.id ? toMessage(row) : message,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversations",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            status: ConversationStatus;
            unread_count: number;
            last_message_at: string | null;
            last_message_preview: string | null;
            assigned_user_id: string | null;
          };
          if (!row?.id) return;
          upsertConversation({
            id: row.id,
            status: row.status,
            unreadCount: row.unread_count,
            lastMessageAt: row.last_message_at,
            lastMessagePreview: row.last_message_preview,
            assignedUserId: row.assigned_user_id,
          });
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_tags",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_contacts",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_instances",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router, upsertConversation]);

  const reloadMessages = useCallback(
    async (id: string) => {
      const [{ data }, { data: eventRows }] = await Promise.all([
        supabaseRef.current
          .from("whatsapp_messages")
          .select(
            "id, conversation_id, wa_message_id, direction, message_type, body, media_url, media_mime_type, status, ai_suggested, sender_user_id, created_at, sent_at",
          )
          .eq("organization_id", organizationId)
          .eq("conversation_id", id)
          .order("created_at", { ascending: false })
          .limit(300)
          .returns<MessageRow[]>(),
        supabaseRef.current
          .from("whatsapp_attendance_events")
          .select(
            "id, event_type, actor_user_id, from_user_id, to_user_id, occurred_at",
          )
          .eq("organization_id", organizationId)
          .eq("conversation_id", id)
          .order("occurred_at", { ascending: true })
          .limit(100)
          .returns<AttendanceEventRow[]>(),
      ]);

      const events = eventRows ?? [];
      const eventUserIds = [
        ...new Set(
          events
            .flatMap((event) => [
              event.actor_user_id,
              event.from_user_id,
              event.to_user_id,
            ])
            .filter((userId): userId is string => Boolean(userId)),
        ),
      ];
      const { data: eventUsers } = eventUserIds.length
        ? await supabaseRef.current
            .from("app_users")
            .select("id, name")
            .eq("organization_id", organizationId)
            .in("id", eventUserIds)
            .returns<{ id: string; name: string }[]>()
        : { data: [] as { id: string; name: string }[] };
      const eventUserName = new Map(
        (eventUsers ?? []).map((user) => [user.id, user.name]),
      );

      if (selectedIdRef.current === id) {
        setMessages((current) => [
          ...(data ?? []).map(toMessage).reverse(),
          ...current.filter((message) => message.id.startsWith("optimistic-")),
        ]);
        setAttendanceEvents(
          events.map((event) => ({
            id: event.id,
            eventType: event.event_type,
            actorName: event.actor_user_id
              ? (eventUserName.get(event.actor_user_id) ?? null)
              : null,
            fromUserName: event.from_user_id
              ? (eventUserName.get(event.from_user_id) ?? null)
              : null,
            toUserName: event.to_user_id
              ? (eventUserName.get(event.to_user_id) ?? null)
              : null,
            occurredAt: event.occurred_at,
          })),
        );
      }
    },
    [organizationId],
  );

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`attendance-timeline-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_attendance_events",
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const conversationId = (payload.new as { conversation_id?: string })
            .conversation_id;
          if (conversationId && selectedIdRef.current === conversationId) {
            void reloadMessages(conversationId);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId, reloadMessages]);

  useEffect(() => {
    if (!initialConversationId) return;
    void reloadMessages(initialConversationId);
  }, [initialConversationId, reloadMessages]);

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setInterval(() => {
      void reloadMessages(selectedId);
      router.refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [reloadMessages, router, selectedId]);

  async function openConversation(id: string) {
    selectedIdRef.current = id;
    setSelectedId(id);
    setMessages([]);
    setAttendanceEvents([]);
    await reloadMessages(id);
  }

  function addOptimisticMessage(message: ConversationMessage) {
    setMessages((current) => [...current, message]);
    // Notas internas não alteram preview nem status da conversa.
    if (selectedIdRef.current && message.type !== "note") {
      upsertConversation({
        id: selectedIdRef.current,
        lastMessageAt: message.createdAt,
        lastMessagePreview: message.body,
        status: "open",
      });
    }
  }

  function confirmOptimisticMessage(
    tempId: string,
    message: ConversationMessage,
  ) {
    setMessages((current) => {
      const withoutServerDuplicate = current.filter(
        (item) => item.id !== message.id,
      );
      return withoutServerDuplicate.map((item) =>
        item.id === tempId ? message : item,
      );
    });
    if (message.type !== "note" && selectedIdRef.current) {
      upsertConversation({
        id: selectedIdRef.current,
        unreadCount: 0,
      });
    }
  }

  function removeOptimisticMessage(tempId: string) {
    setMessages((current) => current.filter((item) => item.id !== tempId));
  }

  return (
    <div
      className={cn(
        "grid h-full min-h-0 grid-cols-1 overflow-hidden overscroll-none bg-card lg:grid-cols-[21rem_minmax(0,1fr)]",
        detailsOpen && "xl:grid-cols-[21rem_minmax(0,1fr)_24rem]",
      )}
    >
      <ConversationListColumn
        tab={tab}
        counts={counts}
        onTabChange={setTab}
        query={query}
        onQueryChange={setQuery}
        readFilter={readFilter}
        onReadFilterChange={setReadFilter}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        searchingMessages={searchingMessages}
        conversations={visibleConversations}
        selectedId={selectedId}
        onSelect={openConversation}
        mobileHidden={Boolean(selected)}
      />

      {selected ? (
        <ConversationThread
          key={selected.id}
          conversation={selected}
          messages={messages}
          attendanceEvents={attendanceEvents}
          canAttend={canAttend}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onBack={() => {
            selectedIdRef.current = null;
            setSelectedId(null);
          }}
          onToggleDetails={() => setDetailsOpen((value) => !value)}
          onOptimisticMessage={addOptimisticMessage}
          onMessageConfirmed={confirmOptimisticMessage}
          onMessageFailed={removeOptimisticMessage}
          onTimelineRefresh={() => void reloadMessages(selected.id)}
          onStatusChange={(status) =>
            upsertConversation({
              id: selected.id,
              status,
              // A sessão só é lida do servidor no carregamento da página; ao
              // concluir aqui, marca a hora para a fila já mostrar a data.
              ...(status === "resolved"
                ? { resolvedAt: new Date().toISOString() }
                : {}),
            })
          }
          onReopened={() =>
            upsertConversation({
              id: selected.id,
              status: "pending",
              assignedUserId: null,
              assignedUserName: null,
              resolvedAt: null,
            })
          }
          onAssigned={() =>
            upsertConversation({
              id: selected.id,
              assignedUserId: currentUserId,
              assignedUserName: currentUserName,
              status: "open",
            })
          }
        />
      ) : (
        <EmptyPanel
          className="hidden lg:flex"
          icon={MessagesSquare}
          title="Selecione uma conversa"
          description={
            canConfigure && !evolutionReady
              ? "Configure a integração do WhatsApp no .env.local para começar."
              : "Escolha um contato à esquerda para ver as mensagens."
          }
        />
      )}

      {selected && detailsOpen ? (
        <ContactDetailsPanel
          conversation={selected}
          organizationId={organizationId}
          canAttend={canAttend}
          availableTags={availableTags}
          onClose={() => setDetailsOpen(false)}
          onTagsChange={(tags) => upsertConversation({ id: selected.id, tags })}
        />
      ) : null}
    </div>
  );
}

function ConversationListColumn({
  tab,
  counts,
  onTabChange,
  query,
  onQueryChange,
  readFilter,
  onReadFilterChange,
  sortOrder,
  onSortOrderChange,
  searchingMessages,
  conversations,
  selectedId,
  onSelect,
  mobileHidden,
}: {
  tab: InboxView;
  counts: Record<InboxView, number>;
  onTabChange: (tab: InboxView) => void;
  query: string;
  onQueryChange: (value: string) => void;
  readFilter: ConversationReadFilter;
  onReadFilterChange: (value: ConversationReadFilter) => void;
  sortOrder: ConversationSortOrder;
  onSortOrderChange: (value: ConversationSortOrder) => void;
  searchingMessages: boolean;
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** No mobile (master-detail), a lista sai de cena quando há conversa aberta. */
  mobileHidden?: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(Boolean(query));
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-card",
        mobileHidden && "hidden lg:flex",
      )}
    >
      <div className="shrink-0 border-b border-border bg-card p-3">
        {/* Mesma casca das abas do painel de contato: trilho em bg-muted com
            borda, item ativo em card elevado e sublinhado no primary. */}
        <div
          className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1 shadow-[var(--shadow-soft)]"
          role="tablist"
          aria-label="Filtrar atendimentos"
        >
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onTabChange(item)}
              role="tab"
              aria-selected={tab === item}
              className={cn(
                "relative inline-flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 text-[13px] font-medium leading-none transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2",
                tab === item
                  ? "border-border-strong bg-card text-foreground shadow-[var(--shadow-soft)] after:absolute after:inset-x-2.5 after:bottom-1 after:h-0.5 after:rounded-full after:bg-primary"
                  : "border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground",
              )}
            >
              <span className="truncate">{tabLabels[item]}</span>
              {counts[item] > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums",
                    tab === item
                      ? "bg-primary text-primary-foreground"
                      : "bg-border text-secondary-foreground",
                  )}
                >
                  {counts[item]}
                </span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onTabChange("resolved")}
            role="tab"
            aria-selected={tab === "resolved"}
            aria-label={`Concluídos (${counts.resolved})`}
            title="Concluídos"
            className={cn(
              "relative inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border px-2 transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2",
              tab === "resolved"
                ? "border-border-strong bg-card text-foreground shadow-[var(--shadow-soft)] after:absolute after:inset-x-2 after:bottom-1 after:h-0.5 after:rounded-full after:bg-primary"
                : "border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground",
            )}
          >
            <Archive className="size-4 shrink-0" aria-hidden="true" />
            {counts.resolved > 0 ? (
              <span className="text-[10px] font-semibold leading-none tabular-nums">
                {counts.resolved}
              </span>
            ) : null}
          </button>
        </div>

        <div className="mt-2 flex min-h-8 items-center justify-between gap-2 border-t border-border pt-2">
          {/* Concluídos não têm "não lido": o atendimento já foi encerrado. */}
          {tab === "resolved" ? (
            <p className="min-w-0 truncate text-label text-muted-foreground">
              Atendimentos encerrados
            </p>
          ) : (
            <div
              className="flex rounded-md border border-border bg-muted p-0.5"
              role="group"
              aria-label="Filtrar por leitura"
            >
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "unread", label: "Não lidos" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={readFilter === option.id}
                  onClick={() => onReadFilterChange(option.id)}
                  className={cn(
                    "cursor-pointer rounded px-2.5 py-1 text-[13px] leading-5 transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                    readFilter === option.id
                      ? "bg-card font-medium text-foreground shadow-[var(--shadow-soft)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant={searchOpen ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={
                searchOpen ? "Fechar pesquisa" : "Pesquisar atendimentos"
              }
              aria-expanded={searchOpen}
              title={searchOpen ? "Fechar pesquisa" : "Pesquisar"}
              onClick={() => {
                if (searchOpen) onQueryChange("");
                setSearchOpen((value) => !value);
              }}
            >
              <Search className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={
                sortOrder === "newest"
                  ? "Ordenado por mensagens mais recentes. Mostrar mais antigas primeiro"
                  : "Ordenado por mensagens mais antigas. Mostrar mais recentes primeiro"
              }
              title={
                sortOrder === "newest"
                  ? "Mais recentes primeiro"
                  : "Mais antigas primeiro"
              }
              onClick={() =>
                onSortOrderChange(sortOrder === "newest" ? "oldest" : "newest")
              }
            >
              <SortClock
                className={cn(
                  "size-4 transition-transform duration-[var(--motion-fast)]",
                  sortOrder === "oldest" ? "rotate-180" : "",
                )}
                aria-hidden="true"
              />
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity,margin] duration-[var(--motion-normal)] ease-[var(--ease-out)]",
            searchOpen
              ? "mt-2 grid-rows-[1fr] opacity-100"
              : "mt-0 grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <label className="relative block">
              <span className="sr-only">
                Pesquisar por contato ou texto das mensagens
              </span>
              <Input
                autoFocus={searchOpen}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Contato ou texto da mensagem"
                className="w-full pl-9 pr-9"
                tabIndex={searchOpen ? 0 : -1}
              />
              {searchingMessages ? (
                <span
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-primary border-t-transparent"
                  aria-hidden="true"
                />
              ) : (
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-placeholder"
                  aria-hidden="true"
                />
              )}
              {query ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Limpar pesquisa"
                  title="Limpar pesquisa"
                  onClick={() => onQueryChange("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  tabIndex={searchOpen ? 0 : -1}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </label>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {conversations.length ? (
          <ul className="divide-y divide-border">
            {conversations.map((item) => (
              <li key={item.id}>
                <ConversationRow
                  item={item}
                  active={item.id === selectedId}
                  resolved={tab === "resolved"}
                  onSelect={() => onSelect(item.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-5" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-medium">Nenhuma conversa</p>
              <p className="mt-1 text-label text-muted-foreground">
                As conversas aparecerão aqui em tempo real.
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// A linha da fila é um <button> cru de propósito: o Button do design system
// afunda 1px no :active e, num alvo desta altura, o clique parecia um tranco.
// Aqui a seleção é só cor + barra lateral, que aparecem sem mover nada.
function ConversationRow({
  item,
  active,
  resolved,
  onSelect,
}: {
  item: ConversationListItem;
  active: boolean;
  /** Fila de concluídos: sem prévia, sem não lidos — só contato e fim. */
  resolved: boolean;
  onSelect: () => void;
}) {
  const unread = !resolved && item.unreadCount > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
        active ? "bg-primary-muted" : "hover:bg-muted",
      )}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[3px] bg-primary"
        />
      ) : null}

      <ContactAvatar name={item.contactName} photoUrl={item.contactPhotoUrl} />

      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-body-sm text-foreground",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {item.contactName}
          </span>
          <span
            className={cn(
              "shrink-0 text-caption tabular-nums",
              unread ? "font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            {resolved
              ? formatResolvedAt(item.resolvedAt)
              : formatTime(item.lastMessageAt)}
          </span>
        </span>

        {resolved ? (
          <span className="flex items-center gap-1.5 text-label text-muted-foreground">
            <CheckCircle className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {item.patientName ?? formatPhone(item.contactPhone)}
            </span>
          </span>
        ) : (
          <>
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-label",
                  unread ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {previewText(item.lastMessagePreview)}
              </span>
              {unread ? (
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-primary-foreground">
                  {item.unreadCount}
                </span>
              ) : null}
            </span>

            {item.patientName || item.tags.length ? (
              <span className="flex flex-wrap items-center gap-1 pt-0.5">
                {item.patientName ? (
                  <Badge
                    variant="neutral"
                    className="h-4 max-w-full truncate px-1.5 text-[10px] leading-none"
                    title={item.patientName}
                  >
                    {item.patientName}
                  </Badge>
                ) : null}
                {item.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex h-4 max-w-full shrink-0 items-center truncate whitespace-nowrap rounded px-1.5 text-[10px] font-medium leading-none text-white"
                    style={{ backgroundColor: tag.color }}
                    title={tag.name}
                  >
                    {tag.name}
                  </span>
                ))}
              </span>
            ) : null}
          </>
        )}
      </span>
    </button>
  );
}

function ConversationThread({
  conversation,
  messages,
  attendanceEvents,
  canAttend,
  currentUserId,
  currentUserName,
  onBack,
  onToggleDetails,
  onOptimisticMessage,
  onMessageConfirmed,
  onMessageFailed,
  onTimelineRefresh,
  onStatusChange,
  onReopened,
  onAssigned,
}: {
  conversation: ConversationListItem;
  messages: ConversationMessage[];
  attendanceEvents: AttendanceTimelineEvent[];
  canAttend: boolean;
  currentUserId: string | null;
  currentUserName: string | null;
  /** Master-detail no mobile: volta para a lista de conversas. */
  onBack: () => void;
  onToggleDetails: () => void;
  onOptimisticMessage: (message: ConversationMessage) => void;
  onMessageConfirmed: (tempId: string, message: ConversationMessage) => void;
  onMessageFailed: (tempId: string) => void;
  onTimelineRefresh: () => void;
  onStatusChange: (status: ConversationStatus) => void;
  onReopened: () => void;
  onAssigned: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const hasPositionedInitiallyRef = useRef(false);
  const [pending, startTransition] = useTransition();
  const [confirmingCompletion, setConfirmingCompletion] = useState(false);
  const timelineGroups = useMemo(
    () => groupTimelineByDay(messages, attendanceEvents),
    [attendanceEvents, messages],
  );
  const lastTimelineItem = timelineGroups.at(-1)?.items.at(-1);
  const lastTimelineKey = lastTimelineItem
    ? `${lastTimelineItem.kind}:${lastTimelineItem.id}`
    : null;

  useEffect(() => {
    const scrollArea = scrollRef.current;
    if (!scrollArea || !lastTimelineKey) return;
    const initialPosition = !hasPositionedInitiallyRef.current;
    if (!initialPosition && !isNearBottomRef.current) return;
    hasPositionedInitiallyRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      if (!initialPosition && !isNearBottomRef.current) return;
      scrollArea.scrollTo({ top: scrollArea.scrollHeight });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lastTimelineKey]);

  function changeStatus(status: ConversationStatus) {
    startTransition(async () => {
      const result = await setConversationStatusAction(conversation.id, status);
      if (result.ok) {
        if (status === "pending") onReopened();
        else onStatusChange(status);
        onTimelineRefresh();
      } else {
        toast.error(result.error ?? "Não foi possível atualizar.");
      }
    });
  }

  async function completeAttendance() {
    const result = await setConversationStatusAction(
      conversation.id,
      "resolved",
    );
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível concluir.");
      return false;
    }
    onStatusChange("resolved");
    onTimelineRefresh();
    return true;
  }

  function startAttendance() {
    startTransition(async () => {
      const result = await assignToMeAction(conversation.id);
      if (result.ok) {
        onAssigned();
        onTimelineRefresh();
      } else {
        toast.error(result.error ?? "Falha ao iniciar o atendimento.");
      }
    });
  }

  const capabilities = getAttendanceCapabilities(
    conversation.status,
    conversation.assignedUserId,
    currentUserId,
    canAttend,
  );

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <ConfirmDialog
        open={confirmingCompletion}
        onClose={() => setConfirmingCompletion(false)}
        title="Concluir atendimento?"
        description="A conversa sairá da fila ativa e será movida para os atendimentos concluídos. Ela poderá ser reaberta depois."
        confirmLabel="Concluir atendimento"
        onConfirm={completeAttendance}
      />
      <header className="flex h-16 min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Voltar para a lista de conversas"
            className="-ml-2 shrink-0 lg:hidden"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Button>
          <div className="relative shrink-0">
            <ContactAvatar
              name={conversation.contactName}
              photoUrl={conversation.contactPhotoUrl}
              enlargeable
            />
            <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-card bg-success text-white">
              <WhatsappLogo className="size-2.5" weight="fill" aria-hidden />
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold">
                {conversation.contactName}
              </p>
              <p className="truncate text-label tabular-nums text-muted-foreground">
                {formatPhone(conversation.contactPhone)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onToggleDetails}
              aria-label="Abrir dados do contato"
              title="Ver dados do contato"
              className="shrink-0 text-muted-foreground"
            >
              <Eye className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {conversation.assignedUserName &&
          conversation.assignedUserId !== currentUserId ? (
            <Badge variant="primary" className="hidden md:inline-flex">
              {conversation.assignedUserName}
            </Badge>
          ) : !conversation.assignedUserName ? (
            <Badge variant="neutral" className="hidden sm:inline-flex">
              {conversationStatusLabels[conversation.status]}
            </Badge>
          ) : null}
          {capabilities.complete ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmingCompletion(true)}
              className="px-4"
            >
              <CheckCheck className="size-4" aria-hidden="true" />
              Concluir
            </Button>
          ) : null}
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={(event) => {
          const target = event.currentTarget;
          isNearBottomRef.current =
            target.scrollHeight - target.scrollTop - target.clientHeight <= 24;
        }}
        className="min-h-0 flex-1 space-y-1.5 overflow-x-hidden overflow-y-auto overscroll-contain bg-surface-sunken px-4 py-5 sm:px-8"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in srgb, var(--foreground) 5%, transparent) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        {messages.length || attendanceEvents.length ? (
          timelineGroups.map((group) => (
            <div key={group.key} className="w-full min-w-0 space-y-1.5">
              <div className="sticky top-0 z-10 flex justify-center py-1">
                <span className="rounded-full border border-border bg-card/95 px-3 py-1 text-caption font-medium text-muted-foreground shadow-[var(--shadow-soft)] backdrop-blur">
                  {group.label}
                </span>
              </div>
              {group.items.map((item) =>
                item.kind === "message" ? (
                  <MessageBubble
                    key={`message-${item.message.id}`}
                    message={item.message}
                  />
                ) : (
                  <AttendanceEventNotice
                    key={`event-${item.event.id}`}
                    event={item.event}
                  />
                ),
              )}
            </div>
          ))
        ) : (
          <p className="py-8 text-center text-label text-muted-foreground">
            Carregando mensagens…
          </p>
        )}
      </div>

      {/* O campo de digitação só existe depois que o atendimento começa; até
          lá o rodapé carrega a ação que destrava a conversa. */}
      {capabilities.compose ? (
        <MessageComposer
          conversationId={conversation.id}
          currentUserName={currentUserName}
          onOptimisticMessage={onOptimisticMessage}
          onMessageConfirmed={onMessageConfirmed}
          onMessageFailed={onMessageFailed}
        />
      ) : (
        <AttendanceActionBar
          pending={pending}
          onStart={capabilities.start ? startAttendance : undefined}
          onReopen={
            capabilities.reopen ? () => changeStatus("pending") : undefined
          }
          message={
            !canAttend
              ? "Você tem acesso somente de leitura a este atendimento."
              : conversation.status === "pending"
                ? "As mensagens ficam somente para leitura até alguém iniciar."
                : conversation.status === "resolved"
                  ? "Atendimento concluído. Reabra para iniciar um novo ciclo."
                  : `Somente ${conversation.assignedUserName ?? "o responsável"} pode responder neste atendimento.`
          }
        />
      )}
    </section>
  );
}

type TimelineItem =
  | {
      kind: "message";
      id: string;
      occurredAt: string;
      message: ConversationMessage;
    }
  | {
      kind: "attendance-event";
      id: string;
      occurredAt: string;
      event: AttendanceTimelineEvent;
    };

type TimelineDayGroup = {
  key: string;
  label: string;
  items: TimelineItem[];
};

function groupTimelineByDay(
  messages: ConversationMessage[],
  events: AttendanceTimelineEvent[],
): TimelineDayGroup[] {
  const items: TimelineItem[] = [
    ...messages.map(
      (message): TimelineItem => ({
        kind: "message",
        id: message.id,
        occurredAt: message.createdAt,
        message,
      }),
    ),
    ...events.map(
      (event): TimelineItem => ({
        kind: "attendance-event",
        id: event.id,
        occurredAt: event.occurredAt,
        event,
      }),
    ),
  ].sort(
    (first, second) =>
      new Date(first.occurredAt).getTime() -
        new Date(second.occurredAt).getTime() ||
      first.id.localeCompare(second.id),
  );

  const groups: TimelineDayGroup[] = [];
  for (const item of items) {
    const date = new Date(item.occurredAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: dayLabel(date), items: [item] });
    }
  }
  return groups;
}

const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return dayFormatter.format(date);
}

function AttendanceEventNotice({ event }: { event: AttendanceTimelineEvent }) {
  const actorName =
    event.actorName ??
    (event.eventType === "started"
      ? event.toUserName
      : event.eventType === "completed" || event.eventType === "reopened"
        ? event.fromUserName
        : null) ??
    "O sistema/API";
  const description =
    event.eventType === "started"
      ? "iniciou o atendimento"
      : event.eventType === "completed"
        ? "concluiu o atendimento"
        : event.eventType === "reopened"
          ? "reabriu o atendimento"
          : [
              "transferiu o atendimento",
              event.fromUserName ? `de ${event.fromUserName}` : null,
              event.toUserName ? `para ${event.toUserName}` : null,
            ]
              .filter(Boolean)
              .join(" ");
  const icon =
    event.eventType === "started" ? (
      <Play className="size-3.5" weight="fill" aria-hidden="true" />
    ) : event.eventType === "completed" ? (
      <CheckCheck className="size-3.5" aria-hidden="true" />
    ) : event.eventType === "transferred" ? (
      <ArrowsLeftRight className="size-3.5" aria-hidden="true" />
    ) : (
      <SortClock className="size-3.5" aria-hidden="true" />
    );

  return (
    <div className="flex min-w-0 items-center gap-3 py-2 text-muted-foreground">
      <span className="h-px min-w-4 flex-1 bg-border-strong/60" />
      <div className="flex max-w-[min(90%,48rem)] items-center justify-center gap-1.5 text-center text-[11px] leading-4">
        <span className="shrink-0 text-primary">{icon}</span>
        <span>
          <strong className="font-semibold text-foreground">{actorName}</strong>{" "}
          {description} em {formatAttendanceEventDateTime(event.occurredAt)}
        </span>
      </div>
      <span className="h-px min-w-4 flex-1 bg-border-strong/60" />
    </div>
  );
}

const attendanceEventDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatAttendanceEventDateTime(value: string): string {
  const date = new Date(value);
  return `${attendanceEventDateFormatter.format(date)} às ${timeFormatter.format(date)}`;
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const outbound = message.direction === "outbound";
  const isNote = message.type === "note";
  const isMediaMessage = [
    "image",
    "audio",
    "video",
    "document",
    "sticker",
  ].includes(message.type);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const mediaEndpoint = `/api/whatsapp/media/${message.id}`;

  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full",
        isNote
          ? "justify-center py-2"
          : outbound
            ? "justify-end"
            : "justify-start",
      )}
    >
      <div
        className={cn(
          "relative min-w-0 max-w-[86%] overflow-hidden rounded-lg px-3 pb-1.5 pt-2 text-sm leading-5 shadow-sm sm:max-w-[72%] lg:max-w-[66%]",
          isNote
            ? "w-[min(92%,42rem)] border border-warning/40 bg-warning-muted px-4 py-3 text-warning-foreground shadow-[var(--shadow-md)]"
            : outbound
              ? "rounded-tr-sm bg-primary-muted text-foreground"
              : "rounded-tl-sm border border-border bg-card text-foreground",
        )}
      >
        {isNote ? (
          <p className="mb-2 flex items-center justify-center gap-1.5 text-caption font-bold uppercase tracking-[0.08em]">
            <Note className="size-3.5" weight="fill" aria-hidden="true" />
            Nota interna
          </p>
        ) : null}
        <div
          className={cn(
            "grid min-w-0 max-w-full gap-2 pr-5",
            isNote && "text-center",
          )}
        >
          {message.mediaUrl && message.type === "image" ? (
            <button
              type="button"
              onClick={() => setImageOpen(true)}
              className="block cursor-zoom-in overflow-hidden rounded-lg text-left outline-none ring-primary focus-visible:ring-2 focus-visible:ring-offset-2"
              aria-label="Expandir imagem"
            >
              <Image
                unoptimized
                src={mediaEndpoint}
                alt={message.body ?? "Imagem recebida"}
                width={420}
                height={320}
                className="max-h-80 w-auto max-w-full object-contain"
              />
            </button>
          ) : message.mediaUrl && message.type === "audio" ? (
            <audio
              controls
              preload="metadata"
              src={mediaEndpoint}
              className="min-w-0 max-w-full"
            />
          ) : message.mediaUrl ? (
            <a
              href={mediaEndpoint}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline"
            >
              Abrir arquivo
            </a>
          ) : null}
          {message.body && !isMediaMessage ? (
            <MessageText body={message.body} />
          ) : !isMediaMessage ? (
            <p className="italic opacity-80">{labelForType(message.type)}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDetailsOpen(true)}
          className="absolute right-1 top-1 h-6 w-6 rounded p-0 text-muted-foreground hover:bg-foreground/5"
          aria-label="Detalhes da mensagem"
        >
          <MoreVertical className="size-3.5" />
        </Button>
        <p
          className={cn(
            "mt-0.5 flex min-h-3 items-center justify-end gap-1 text-[10px] leading-3 tabular-nums",
            "text-muted-foreground",
          )}
        >
          {formatTime(message.createdAt)}
          {outbound && !isNote && message.status === "queued" ? (
            <span className="italic">enviando…</span>
          ) : outbound && !isNote && message.status === "read" ? (
            <CheckCheck className="size-3.5" aria-hidden="true" />
          ) : null}
        </p>
        <Modal
          open={imageOpen}
          onClose={() => setImageOpen(false)}
          title="Visualizar imagem"
          className="max-w-[min(72rem,calc(100vw-2rem))]"
        >
          <div className="flex max-h-[calc(100vh-9rem)] min-h-64 items-center justify-center overflow-hidden rounded-lg bg-surface-sunken">
            <Image
              unoptimized
              src={mediaEndpoint}
              alt={message.body ?? "Imagem da conversa"}
              width={1600}
              height={1200}
              className="max-h-[calc(100vh-10rem)] h-auto w-auto max-w-full object-contain"
            />
          </div>
        </Modal>
        <Modal
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          title="Detalhes da mensagem"
          className="max-w-md"
        >
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <MessageDetail
              label="Direção"
              value={outbound ? "Enviada" : "Recebida"}
            />
            <MessageDetail
              label="Status"
              value={messageStatusLabel(message.status)}
            />
            <MessageDetail
              label="Criada"
              value={formatMessageDateTime(message.createdAt)}
            />
            <MessageDetail
              label="Enviada"
              value={formatMessageDateTime(message.sentAt)}
            />
            <MessageDetail label="Tipo" value={labelForType(message.type)} />
            <MessageDetail
              label="Origem"
              value={outbound ? "Usuário" : "Contato"}
            />
            <div className="col-span-2">
              <MessageDetail
                label="ID da mensagem"
                value={message.waMessageId ?? message.id}
              />
            </div>
          </dl>
        </Modal>
      </div>
    </div>
  );
}

function MessageText({ body }: { body: string }) {
  const signed = body.match(/^\*([^*\n]+)\*(?:\r?\n|[ \t]+)?([\s\S]*)$/);
  if (!signed) {
    return (
      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
        <LinkifiedText text={body} />
      </p>
    );
  }

  const [, signature, content] = signed;
  return (
    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
      <strong className="font-semibold">{signature}</strong>
      {content ? (
        <>
          {"\n"}
          <LinkifiedText text={content} />
        </>
      ) : null}
    </p>
  );
}

function LinkifiedText({ text }: { text: string }) {
  return text.split(/((?:https?:\/\/|www\.)[^\s<]+)/gi).map((part, index) => {
    if (!/^(?:https?:\/\/|www\.)/i.test(part)) return part;

    const { value, trailing } = splitLinkTrailingPunctuation(part);
    const href = /^www\./i.test(value) ? `https://${value}` : value;
    try {
      const url = new URL(href);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return part;
      }
    } catch {
      return part;
    }

    return (
      <span key={`${href}-${index}`}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        >
          {value}
        </a>
        {trailing}
      </span>
    );
  });
}

function splitLinkTrailingPunctuation(input: string): {
  value: string;
  trailing: string;
} {
  let value = input;
  let trailing = "";
  while (/[.,;!?:"'\]}]/.test(value.at(-1) ?? "")) {
    trailing = `${value.at(-1)}${trailing}`;
    value = value.slice(0, -1);
  }
  while (
    value.endsWith(")") &&
    [...value].filter((character) => character === ")").length >
      [...value].filter((character) => character === "(").length
  ) {
    trailing = `)${trailing}`;
    value = value.slice(0, -1);
  }

  return { value, trailing };
}

const emojiOptions = [
  ["😀", "feliz sorriso"],
  ["😃", "feliz alegre"],
  ["😄", "sorriso alegre"],
  ["😁", "sorriso dentes"],
  ["😆", "rir feliz"],
  ["😅", "alívio suor"],
  ["😂", "rir lágrimas"],
  ["🤣", "rolando rir"],
  ["😊", "feliz tímido"],
  ["🙂", "sorriso"],
  ["🙃", "invertido"],
  ["😉", "piscar"],
  ["😍", "amor olhos coração"],
  ["🥰", "amor carinho"],
  ["😘", "beijo amor"],
  ["😋", "delícia comida"],
  ["😎", "óculos legal"],
  ["🤩", "estrela admirado"],
  ["🥳", "festa parabéns"],
  ["😇", "anjo inocente"],
  ["🤗", "abraço"],
  ["🤔", "pensando dúvida"],
  ["🫡", "saudação respeito"],
  ["🤭", "surpresa segredo"],
  ["🫢", "surpresa boca"],
  ["😐", "neutro"],
  ["😕", "confuso"],
  ["😔", "triste"],
  ["😢", "chorando triste"],
  ["😭", "muito triste choro"],
  ["😞", "decepcionado"],
  ["😟", "preocupado"],
  ["😮", "surpreso"],
  ["😱", "medo susto"],
  ["😴", "sono dormir"],
  ["🤒", "doente febre"],
  ["🤕", "machucado"],
  ["🤢", "enjoo"],
  ["🤧", "espirro gripe"],
  ["👍", "positivo sim gostei"],
  ["👎", "negativo não"],
  ["👌", "ok perfeito"],
  ["✌️", "paz vitória"],
  ["🤞", "sorte dedos"],
  ["🤝", "acordo mãos"],
  ["🙏", "obrigado oração"],
  ["👏", "palmas parabéns"],
  ["🙌", "celebração mãos"],
  ["👋", "oi tchau"],
  ["💪", "força"],
  ["🫶", "amor mãos coração"],
  ["❤️", "coração amor vermelho"],
  ["🧡", "coração laranja"],
  ["💛", "coração amarelo"],
  ["💚", "coração verde"],
  ["💙", "coração azul"],
  ["💜", "coração roxo"],
  ["🤍", "coração branco"],
  ["💔", "coração partido"],
  ["💯", "cem perfeito"],
  ["✨", "brilho"],
  ["⭐", "estrela"],
  ["🔥", "fogo excelente"],
  ["🎉", "festa comemoração"],
  ["🎊", "confete festa"],
  ["🎁", "presente"],
  ["✅", "confirmado correto"],
  ["❌", "erro cancelar"],
  ["⚠️", "atenção alerta"],
  ["❓", "pergunta dúvida"],
  ["❗", "importante exclamação"],
  ["📌", "fixar importante"],
  ["📅", "agenda calendário"],
  ["🕐", "horário relógio"],
  ["📞", "telefone ligação"],
  ["📲", "celular mensagem"],
  ["💬", "conversa mensagem"],
  ["📎", "anexo clipe"],
  ["📄", "documento arquivo"],
  ["🩺", "médico saúde"],
  ["💊", "remédio medicamento"],
  ["💉", "vacina injeção"],
  ["🏥", "hospital clínica"],
  ["🧑‍⚕️", "profissional saúde"],
  ["🦷", "dente dentista"],
  ["👶", "bebê criança"],
  ["👨‍👩‍👧‍👦", "família"],
  ["☀️", "sol dia"],
  ["🌙", "lua noite"],
  ["🌹", "flor rosa"],
  ["☕", "café"],
  ["🍀", "sorte trevo"],
] as const;

type RecordedAudio = {
  file: File;
  previewUrl: string;
};

type RecordingPhase = "idle" | "requesting" | "recording" | "processing";

// Rodapé de conversa ainda não iniciada: sem campo, sem ícones desligados —
// só o motivo e a ação que libera a resposta.
function AttendanceActionBar({
  message,
  onStart,
  onReopen,
  pending,
}: {
  message: string;
  onStart?: () => void;
  onReopen?: () => void;
  pending: boolean;
}) {
  const action = onStart ?? onReopen;

  return (
    <div className="shrink-0 border-t border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-body-sm text-muted-foreground">
          {message}
        </p>
        {action ? (
          <Button
            type="button"
            size="lg"
            disabled={pending}
            onClick={action}
            variant={onStart ? "primary" : "secondary"}
            className="shrink-0"
          >
            {onStart ? (
              <>
                <Play className="size-4" weight="fill" aria-hidden="true" />
                Iniciar atendimento
              </>
            ) : (
              "Reabrir atendimento"
            )}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MessageComposer({
  conversationId,
  currentUserName,
  onOptimisticMessage,
  onMessageConfirmed,
  onMessageFailed,
}: {
  conversationId: string;
  currentUserName: string | null;
  onOptimisticMessage: (message: ConversationMessage) => void;
  onMessageConfirmed: (tempId: string, message: ConversationMessage) => void;
  onMessageFailed: (tempId: string) => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [sending, setSending] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState("");
  const [recordingPhase, setRecordingPhase] = useState<RecordingPhase>("idle");
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingFailedRef = useRef(false);
  const recordingPhaseRef = useRef<RecordingPhase>("idle");

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            // O navegador pode já estar finalizando a gravação.
          }
        }
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      mediaStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recordedAudio) URL.revokeObjectURL(recordedAudio.previewUrl);
    };
  }, [recordedAudio]);

  const isNoteMode = mode === "note";
  const recording = recordingPhase === "recording";
  const recordingBusy =
    recordingPhase === "requesting" || recordingPhase === "processing";
  const normalizedEmojiQuery = emojiQuery.trim().toLocaleLowerCase("pt-BR");
  const visibleEmojis = normalizedEmojiQuery
    ? emojiOptions.filter(
        ([emoji, terms]) =>
          emoji.includes(normalizedEmojiQuery) ||
          terms.includes(normalizedEmojiQuery),
      )
    : emojiOptions;

  function updateRecordingPhase(phase: RecordingPhase) {
    recordingPhaseRef.current = phase;
    setRecordingPhase(phase);
  }

  async function send() {
    const raw = text.trim();
    if (!raw || sending) return;

    const value =
      !isNoteMode && currentUserName ? `*${currentUserName}:*\n${raw}` : raw;

    const tempId = `optimistic-${crypto.randomUUID()}`;
    onOptimisticMessage({
      id: tempId,
      direction: "outbound",
      type: isNoteMode ? "note" : "text",
      body: value,
      mediaUrl: null,
      mediaMimeType: null,
      status: "queued",
      aiSuggested: false,
      senderUserName: null,
      createdAt: new Date().toISOString(),
    });
    setText("");
    setSending(true);
    const result = isNoteMode
      ? await addInternalNoteAction(conversationId, value)
      : await sendMessageAction(conversationId, value);
    setSending(false);
    if (result.ok && result.message) {
      onMessageConfirmed(tempId, result.message);
      if (isNoteMode) setMode("reply");
    } else {
      onMessageFailed(tempId);
      setText((current) => current || raw);
      toast.error(result.error ?? "Falha ao enviar.");
    }
  }

  async function sendAttachment(file: File): Promise<boolean> {
    const tempId = `optimistic-${crypto.randomUUID()}`;
    const type: MessageType = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "video"
          : "document";
    onOptimisticMessage({
      id: tempId,
      direction: "outbound",
      type,
      body: file.name,
      mediaUrl: null,
      mediaMimeType: file.type || null,
      status: "queued",
      aiSuggested: false,
      senderUserName: null,
      createdAt: new Date().toISOString(),
    });
    setSendingAttachment(true);
    try {
      const data = new FormData();
      data.set("conversation_id", conversationId);
      data.set("file", file);
      const result = await sendMediaMessageAction(data);
      if (result.ok && result.message) {
        onMessageConfirmed(tempId, result.message);
        return true;
      }
      onMessageFailed(tempId);
      toast.error(result.error ?? "Falha ao enviar arquivo.");
      return false;
    } catch {
      onMessageFailed(tempId);
      toast.error("Falha ao enviar arquivo.");
      return false;
    } finally {
      setSendingAttachment(false);
    }
  }

  async function sendRecordedAudio() {
    if (!recordedAudio || sendingAttachment) return;
    const sent = await sendAttachment(recordedAudio.file);
    if (sent) setRecordedAudio(null);
  }

  async function toggleRecording() {
    const currentPhase = recordingPhaseRef.current;
    if (currentPhase === "requesting" || currentPhase === "processing") {
      return;
    }

    if (currentPhase === "recording") {
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        updateRecordingPhase("processing");
        recorder.stop();
      }
      return;
    }

    updateRecordingPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const supportedMimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        supportedMimeType ? { mimeType: supportedMimeType } : undefined,
      );
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingFailedRef.current = false;
      recorder.ondataavailable = (event) =>
        event.data.size && audioChunksRef.current.push(event.data);
      recorder.onstop = () => {
        if (recordingFailedRef.current) return;
        const mimeType =
          recorder.mimeType || audioChunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(audioChunksRef.current, {
          type: mimeType,
        });
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        recorderRef.current = null;
        updateRecordingPhase("idle");
        if (!blob.size) {
          toast.error("Nenhum áudio foi gravado.");
          return;
        }
        const extension = blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `audio-${Date.now()}.${extension}`, {
          type: blob.type,
        });
        setRecordedAudio({
          file,
          previewUrl: URL.createObjectURL(blob),
        });
      };
      recorder.onerror = () => {
        recordingFailedRef.current = true;
        audioChunksRef.current = [];
        recorder.onstop = null;
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        recorderRef.current = null;
        updateRecordingPhase("idle");
        toast.error("A gravação de áudio foi interrompida.");
      };
      recorder.start();
      updateRecordingPhase("recording");
    } catch {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      recorderRef.current = null;
      audioChunksRef.current = [];
      updateRecordingPhase("idle");
      toast.error("Não foi possível acessar o microfone.");
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-card px-3 py-2">
      {isNoteMode ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-muted px-3 py-2 text-sm text-warning-foreground">
          <span className="flex min-w-0 items-center gap-2 font-semibold">
            <Note
              className="size-4 shrink-0"
              weight="fill"
              aria-hidden="true"
            />
            Nota interna — visível somente para a equipe
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setMode("reply")}
            aria-label="Cancelar nota interna"
            title="Cancelar nota interna"
            className="shrink-0 text-warning-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      {showEmojis ? (
        <div className="mb-2 rounded-lg border border-border bg-popover p-2 shadow-sm">
          <Input
            value={emojiQuery}
            onChange={(event) => setEmojiQuery(event.target.value)}
            placeholder="Pesquisar emoji"
            aria-label="Pesquisar emoji"
            className="mb-2 h-8"
          />
          <div className="grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain sm:grid-cols-12">
            {visibleEmojis.map(([emoji, terms]) => (
              <Button
                key={emoji}
                type="button"
                variant="ghost"
                onClick={() => setText((value) => `${value}${emoji}`)}
                className="h-9 w-9 rounded p-0 text-xl"
                title={terms}
              >
                {emoji}
              </Button>
            ))}
          </div>
          {!visibleEmojis.length ? (
            <p className="py-3 text-center text-label text-muted-foreground">
              Nenhum emoji encontrado.
            </p>
          ) : null}
        </div>
      ) : null}
      {recordedAudio ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-[var(--shadow-soft)]">
          <audio
            controls
            preload="metadata"
            src={recordedAudio.previewUrl}
            className="h-10 min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={sendingAttachment}
            onClick={() => setRecordedAudio(null)}
            aria-label="Descartar gravação"
            title="Descartar gravação"
            className="text-destructive hover:bg-destructive-muted"
          >
            <Trash className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={sendingAttachment}
            onClick={() => void sendRecordedAudio()}
          >
            <Send className="size-4" aria-hidden="true" />
            {sendingAttachment ? "Enviando…" : "Enviar áudio"}
          </Button>
        </div>
      ) : null}
      {recordingPhase !== "idle" ? (
        <div
          className={cn(
            "mb-2 flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-label font-medium",
            recording
              ? "bg-destructive-muted text-destructive"
              : "bg-muted text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              recording
                ? "animate-pulse bg-destructive"
                : "animate-pulse bg-muted-foreground",
            )}
          />
          {recordingPhase === "requesting"
            ? "Aguardando acesso ao microfone…"
            : recordingPhase === "processing"
              ? "Preparando a prévia do áudio…"
              : "Gravando áudio — clique em parar para revisar"}
        </div>
      ) : null}
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border p-1.5 focus-within:ring-2",
          isNoteMode
            ? "border-warning/50 bg-warning-muted/40 focus-within:border-warning focus-within:ring-warning/15"
            : "border-border bg-card focus-within:border-primary focus-within:ring-primary/15",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void sendAttachment(file);
            event.target.value = "";
          }}
        />
        <DropdownMenu
          trigger={<Paperclip className="size-5" aria-hidden="true" />}
          triggerLabel="Mais opções"
          triggerClassName="shrink-0"
          align="start"
        >
          {(close) => (
            <>
              <DropdownMenuItem
                icon={Paperclip}
                onSelect={() => {
                  close();
                  setMode("reply");
                  window.setTimeout(() => fileInputRef.current?.click(), 0);
                }}
              >
                Enviar arquivo
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={Note}
                onSelect={() => {
                  close();
                  setMode("note");
                }}
              >
                Nota interna
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setShowEmojis((value) => !value)}
          title="Emojis"
        >
          <Smile className="size-4" />
          <span className="sr-only">Escolher emoji</span>
        </Button>
        <Textarea
          value={text}
          disabled={recordingPhase !== "idle"}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={
            recording
              ? "Gravando áudio…"
              : recordingBusy
                ? "Preparando áudio…"
                : isNoteMode
                  ? "Escreva uma nota interna (visível só para a equipe)…"
                  : "Escreva uma mensagem…"
          }
          rows={1}
          className="min-h-10 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            disabled={
              sending ||
              sendingAttachment ||
              recordingBusy ||
              Boolean(recordedAudio)
            }
            onClick={
              recording
                ? toggleRecording
                : text.trim() || isNoteMode
                  ? send
                  : toggleRecording
            }
            variant={recording ? "destructive" : "primary"}
          >
            {recording || recordingPhase === "processing" ? (
              <Square className="size-4" />
            ) : text.trim() || isNoteMode ? (
              <Send className="size-4" aria-hidden="true" />
            ) : (
              <Mic className="size-4" />
            )}
            <span className="sr-only">
              {recording
                ? "Parar gravação"
                : recordingBusy
                  ? "Preparando áudio"
                  : text.trim() || isNoteMode
                    ? "Enviar"
                    : "Gravar áudio"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: typeof Inbox;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]",
        className,
      )}
    >
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Icon className="size-5" aria-hidden="true" />
          </div>
          <p className="mt-3 text-sm font-medium">{title}</p>
          <p className="mt-1 text-label text-muted-foreground">{description}</p>
        </div>
      </div>
    </section>
  );
}

function ContactAvatar({
  name,
  photoUrl,
  enlargeable = false,
}: {
  name: string;
  photoUrl: string | null;
  enlargeable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);

  const hasPhoto = Boolean(photoUrl && failedPhotoUrl !== photoUrl);
  const content = (
    <Avatar
      name={name}
      photoUrl={hasPhoto ? photoUrl : null}
      onPhotoError={() => setFailedPhotoUrl(photoUrl)}
    />
  );

  if (!enlargeable || !hasPhoto || !photoUrl)
    return <span className="row-span-3 shrink-0">{content}</span>;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="h-auto w-auto shrink-0 rounded-full p-0 hover:bg-transparent"
        aria-label={`Ampliar foto de ${name}`}
      >
        {content}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Foto de ${name}`}
        className="max-w-2xl"
      >
        <Image
          unoptimized
          src={photoUrl}
          alt={`Foto ampliada de ${name}`}
          width={900}
          height={900}
          onError={() => setFailedPhotoUrl(photoUrl)}
          className="max-h-[70vh] w-full rounded-lg object-contain"
        />
      </Modal>
    </>
  );
}

function MessageDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all rounded-md bg-muted px-2.5 py-2 text-xs">
        {value}
      </dd>
    </div>
  );
}

function messageStatusLabel(status: ConversationMessage["status"]) {
  return (
    {
      queued: "Enviando",
      sent: "Enviada",
      delivered: "Entregue",
      read: "Lida",
      failed: "Falhou",
      received: "Recebida",
    } as const
  )[status];
}

function formatMessageDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function toMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    direction: row.direction,
    type: row.message_type,
    body: row.body,
    mediaUrl: row.media_url,
    mediaMimeType: row.media_mime_type,
    status: row.status,
    aiSuggested: row.ai_suggested,
    senderUserName: null,
    createdAt: row.created_at,
    waMessageId: row.wa_message_id,
    sentAt: row.sent_at,
  };
}

function rowBelongsToSelected(
  row: unknown,
  conversationId: string | null,
): boolean {
  return (
    Boolean(conversationId) &&
    Boolean(row) &&
    typeof row === "object" &&
    (row as { conversation_id?: string }).conversation_id === conversationId
  );
}

function labelForType(type: MessageType): string {
  const labels: Partial<Record<MessageType, string>> = {
    image: "Imagem",
    audio: "Áudio",
    video: "Vídeo",
    document: "Documento",
    location: "Localização",
    contact: "Contato",
    sticker: "Figurinha",
    note: "Nota interna",
  };
  return labels[type] ?? "Mensagem";
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return phone;
}

function compareConversationActivity(
  first: ConversationListItem,
  second: ConversationListItem,
  order: ConversationSortOrder,
): number {
  if (!first.lastMessageAt && !second.lastMessageAt) return 0;
  if (!first.lastMessageAt) return 1;
  if (!second.lastMessageAt) return -1;

  const difference =
    new Date(first.lastMessageAt).getTime() -
    new Date(second.lastMessageAt).getTime();
  return order === "newest" ? -difference : difference;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});
function formatTime(iso: string | null): string {
  if (!iso) return "";
  return timeFormatter.format(new Date(iso));
}

const previewCharLimit = 42;

// Corta a prévia na última palavra inteira antes do limite. O `truncate` do
// CSS já cortaria na largura, mas no meio da letra e em ponto que muda com a
// fonte — aqui o corte é sempre no mesmo lugar e sempre com reticências.
function previewText(value: string | null): string {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return "Sem mensagens";
  if (text.length <= previewCharLimit) return text;

  const clipped = text.slice(0, previewCharLimit);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > previewCharLimit * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

const resolvedDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
});

// Conclusão do atendimento: hoje e ontem por nome, o resto por data. Sem hora
// em dias antigos — na fila de encerrados o dia já basta.
function formatResolvedAt(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);

  if (date >= startOfToday) return timeFormatter.format(date);
  if (date >= startOfYesterday) return `ontem ${timeFormatter.format(date)}`;
  return resolvedDateFormatter.format(date);
}
