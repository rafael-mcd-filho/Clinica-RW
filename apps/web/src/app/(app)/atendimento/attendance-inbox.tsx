"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowBendUpLeft,
  ArrowLeft,
  ArrowsLeftRight,
  ChatCircleDots,
  Checks as CheckCheck,
  CheckCircle,
  ClockCounterClockwise as SortClock,
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
  UserCircle,
  UsersThree,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  Fragment,
  memo,
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
  loadMoreConversationsAction,
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
const messageSelectWithoutReply =
  "id, conversation_id, wa_message_id, direction, message_type, body, media_url, media_mime_type, status, ai_suggested, sender_user_id, created_at, sent_at";
const messageSelectWithReply = `${messageSelectWithoutReply}, reply_to_message_id`;

/** Linhas por página da fila; o resto entra pelo "Carregar mais". */
const conversationPageSize = 100;
/** Janela de agrupamento dos refreshes disparados pelo realtime. */
const REFRESH_INTERVAL_MS = 2500;
/** Rede de segurança da thread aberta, caso um evento do realtime se perca. */
const MESSAGE_POLL_INTERVAL_MS = 8000;
const tabLabels: Record<InboxView, string> = {
  new: "Novos",
  mine: "Meus",
  others: "Outros",
  resolved: "Fechados",
};

// Abas da fila: ícone com a cor do estado + rótulo + contador flutuante no
// canto. Concluídos deixou de ser um botão só de ícone e entrou na mesma
// régua — quatro pílulas iguais, sem trilho cinza em volta.
const inboxTabs: Array<{
  id: InboxView;
  icon: PhosphorIcon;
  tone: string;
  /** Fechados vira só o ícone (maior, para compensar): o rótulo roubaria
      largura dos três filtros do dia a dia, e o contador não diz nada — o
      arquivo só cresce. O nome fica no aria-label e no title. */
  iconOnly?: boolean;
}> = [
  { id: "new", icon: ChatCircleDots, tone: "text-success-foreground" },
  { id: "mine", icon: UserCircle, tone: "text-primary" },
  { id: "others", icon: UsersThree, tone: "text-warning-foreground" },
  {
    id: "resolved",
    icon: Archive,
    tone: "text-muted-foreground",
    iconOnly: true,
  },
];

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
  reply_to_message_id?: string | null;
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
  initialHasMore,
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
  /** Ainda há conversas além da primeira carga (o "Carregar mais" busca). */
  initialHasMore: boolean;
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
  // Vira false se o banco ainda não tem a coluna de citação (migration nova).
  const replySupportedRef = useRef(true);
  const router = useRouter();

  // Cada router.refresh() re-executa a página inteira no servidor (conversas,
  // contatos, tags, sessões, URLs assinadas das fotos) e remonta a lista. Numa
  // caixa movimentada os eventos do realtime chegam em rajada, e um refresh
  // por evento é o que fazia a rolagem e a digitação travarem. Aqui eles são
  // agrupados: no máximo um refresh a cada REFRESH_INTERVAL_MS, e nenhum
  // enquanto a aba está em segundo plano — ao voltar, o refresh pendente sai.
  const refreshTimerRef = useRef<number | null>(null);
  const lastRefreshRef = useRef(0);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) return;
    const elapsed = Date.now() - lastRefreshRef.current;
    const delay = Math.max(0, REFRESH_INTERVAL_MS - elapsed);

    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      lastRefreshRef.current = Date.now();
      router.refresh();
    }, delay);
  }, [router]);

  useEffect(
    () => () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }
    },
    [],
  );

  // A carga do servidor manda sobre o que ela cobre, mas não apaga as páginas
  // que o "Carregar mais" trouxe: ela é só o topo da fila por recência.
  useEffect(() => {
    const task = window.setTimeout(() => {
      setConversations((current) => {
        if (!current.length) return initialConversations;
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of initialConversations) byId.set(item.id, item);
        return [...byId.values()];
      });
    }, 0);
    return () => window.clearTimeout(task);
  }, [initialConversations]);

  const serverOffsetRef = useRef(initialConversations.length);
  const [hasMoreOnServer, setHasMoreOnServer] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMoreConversations = useCallback(async () => {
    setLoadingMore(true);
    const result = await loadMoreConversationsAction(serverOffsetRef.current);
    setLoadingMore(false);

    if (!result.ok || !result.conversations) {
      toast.error(result.error ?? "Não foi possível carregar mais conversas.");
      return;
    }

    serverOffsetRef.current += result.conversations.length;
    setHasMoreOnServer(Boolean(result.hasMore));
    setConversations((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      for (const item of result.conversations ?? []) {
        if (!byId.has(item.id)) byId.set(item.id, item);
      }
      return [...byId.values()];
    });
  }, []);

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
          scheduleRefresh();
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
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_contacts",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_instances",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => scheduleRefresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId, scheduleRefresh, upsertConversation]);

  const reloadMessages = useCallback(
    async (id: string) => {
      const loadMessages = async (withReply: boolean) =>
        supabaseRef.current
          .from("whatsapp_messages")
          .select(
            withReply ? messageSelectWithReply : messageSelectWithoutReply,
          )
          .eq("organization_id", organizationId)
          .eq("conversation_id", id)
          .order("created_at", { ascending: false })
          .limit(300)
          .returns<MessageRow[]>();

      const [messagesResult, { data: eventRows }] = await Promise.all([
        // A citação depende da coluna reply_to_message_id. Enquanto a migration
        // não estiver aplicada, a consulta cai para o conjunto antigo em vez de
        // deixar a thread vazia — só as respostas ficam sem a citação.
        loadMessages(replySupportedRef.current).then(async (result) => {
          if (result.error && replySupportedRef.current) {
            replySupportedRef.current = false;
            return loadMessages(false);
          }
          return result;
        }),
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
          ...(messagesResult.data ?? []).map(toMessage).reverse(),
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

  // Rede de segurança para o realtime da conversa aberta. Só as mensagens: a
  // lista já vem pelo canal do postgres_changes, e recarregar a página inteira
  // a cada 5s era o outro motivo de a thread engasgar. Em segundo plano nem
  // isso roda.
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void reloadMessages(selectedId);
    }, MESSAGE_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reloadMessages, selectedId]);

  // Identidade estável: é o que permite o memo das linhas da fila segurar o
  // re-render de 100 itens a cada tecla digitada na busca.
  const openConversation = useCallback(
    async (id: string) => {
      selectedIdRef.current = id;
      setSelectedId(id);
      setMessages([]);
      setAttendanceEvents([]);
      syncConversationUrl(id);
      await reloadMessages(id);
    },
    [reloadMessages],
  );

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
        // 23rem: largura mínima para as abas (três rótulos + o ícone de
        // fechados) caberem sem truncar em 12px.
        "grid h-full min-h-0 grid-cols-1 overflow-hidden overscroll-none bg-card lg:grid-cols-[23rem_minmax(0,1fr)]",
        detailsOpen && "xl:grid-cols-[23rem_minmax(0,1fr)_24rem]",
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
        onLoadMore={() => void loadMoreConversations()}
        loadingMore={loadingMore}
        hasMoreOnServer={hasMoreOnServer}
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
            syncConversationUrl(null);
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
  onLoadMore,
  loadingMore,
  hasMoreOnServer,
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
  /** Busca a próxima página no servidor quando a memória se esgota. */
  onLoadMore: () => void;
  loadingMore: boolean;
  hasMoreOnServer: boolean;
  /** No mobile (master-detail), a lista sai de cena quando há conversa aberta. */
  mobileHidden?: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(Boolean(query));
  // A fila inteira fica em memória, mas só uma página vai para o DOM: com
  // muitos atendimentos, montar mil linhas trava a rolagem. Trocar de aba ou
  // de filtro volta para a primeira página — ajuste em render, não em efeito,
  // para não renderizar a lista longa antes de cortá-la.
  const [visibleCount, setVisibleCount] = useState(conversationPageSize);
  const queueKey = `${tab}|${readFilter}|${sortOrder}|${query}`;
  const [lastQueueKey, setLastQueueKey] = useState(queueKey);
  if (queueKey !== lastQueueKey) {
    setLastQueueKey(queueKey);
    setVisibleCount(conversationPageSize);
  }

  const pageConversations = conversations.slice(0, visibleCount);
  const remainingCount = conversations.length - pageConversations.length;

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-card",
        mobileHidden && "hidden lg:flex",
      )}
    >
      <div className="shrink-0 border-b border-border bg-card p-3">
        {/* O contador é um disco flutuante no canto da pílula, então a régua
            precisa de folga no topo para ele não ser cortado. */}
        <div
          className="flex items-center gap-0.5 pt-1.5"
          role="tablist"
          aria-label="Filtrar atendimentos"
        >
          {inboxTabs.map(({ id, icon: Icon, tone, iconOnly }) => {
            const active = tab === id;
            const count = counts[id];

            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                role="tab"
                aria-selected={active}
                aria-label={iconOnly ? tabLabels[id] : undefined}
                title={tabLabels[id]}
                className={cn(
                  "relative inline-flex h-9 cursor-pointer items-center justify-center gap-1 rounded-lg border text-label leading-none transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2",
                  iconOnly ? "w-9 shrink-0" : "min-w-0 flex-1 px-2",
                  active
                    ? "border-border-strong bg-card font-semibold text-foreground shadow-[var(--shadow-soft)]"
                    : "border-transparent font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "shrink-0",
                    iconOnly ? "size-5" : "size-4",
                    tone,
                  )}
                  weight={active ? "fill" : "regular"}
                  aria-hidden="true"
                />
                <span className={iconOnly ? "sr-only" : "truncate"}>
                  {tabLabels[id]}
                </span>
                {!iconOnly && count > 0 ? (
                  <span className="absolute -right-1 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-caption font-semibold leading-none tabular-nums text-primary-foreground ring-2 ring-card">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
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
                    "cursor-pointer rounded px-2.5 py-1 text-body-sm leading-5 transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
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
          <>
            <ul className="divide-y divide-border">
              {pageConversations.map((item) => (
                // content-visibility deixa o navegador pular o layout das
                // linhas fora da viewport; com o tamanho intrínseco declarado
                // a barra de rolagem não pula. É o que segura a rolagem rápida
                // de uma fila longa sem virtualizar a lista.
                <li
                  key={item.id}
                  className="[content-visibility:auto] [contain-intrinsic-size:auto_76px]"
                >
                  <ConversationRow
                    item={item}
                    active={item.id === selectedId}
                    resolved={tab === "resolved"}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex items-center justify-center p-6 text-center">
            <div>
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="size-5" aria-hidden="true" />
              </div>
              <p className="mt-3 text-body font-medium">Nenhuma conversa</p>
              <p className="mt-1 text-label text-muted-foreground">
                As conversas aparecerão aqui em tempo real.
              </p>
            </div>
          </div>
        )}

        {/* Primeiro mostra o que já está em memória; esgotado isso, busca a
            próxima página no servidor. */}
        {remainingCount > 0 || hasMoreOnServer ? (
          <div className="border-t border-border p-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={loadingMore}
              onClick={() => {
                if (remainingCount > 0) {
                  setVisibleCount((current) => current + conversationPageSize);
                  return;
                }
                void onLoadMore();
              }}
            >
              {loadingMore
                ? "Carregando..."
                : remainingCount > 0
                  ? `Carregar mais (${remainingCount})`
                  : "Carregar mais"}
            </Button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

// A linha da fila é um <button> cru de propósito: o Button do design system
// afunda 1px no :active e, num alvo desta altura, o clique parecia um tranco.
// Aqui a seleção é só cor + barra lateral, que aparecem sem mover nada.
const ConversationRow = memo(function ConversationRow({
  item,
  active,
  resolved,
  onSelect,
}: {
  item: ConversationListItem;
  active: boolean;
  /** Fila de concluídos: sem prévia, sem não lidos — só contato e fim. */
  resolved: boolean;
  onSelect: (id: string) => void;
}) {
  const unread = !resolved && item.unreadCount > 0;
  // Conversa fechada sem sessão de atendimento concluída (encerrada direto no
  // status, ou anterior ao registro de sessões) não tem hora de conclusão: aí
  // a última atividade entra no lugar, avisada pelo title.
  const missingResolvedAt = resolved && !item.resolvedAt;
  const stamp = resolved
    ? formatResolvedAt(item.resolvedAt ?? item.lastMessageAt)
    : formatTime(item.lastMessageAt);

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
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

      {/* Item de grid nasce com min-width:auto, então uma linha com nome
          comprido (ou um número sem espaços) esticava a coluna inteira e
          empurrava o horário para fora da lista. Daí o min-w-0 em cada
          linha, sem o qual nem o truncate abaixo entra em ação. */}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-body-sm text-foreground",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {item.contactName}
          </span>
          {/* Coluna do horário: nunca encolhe nem quebra, então nome comprido
              e prévia longa não empurram a hora para fora da linha. */}
          <span
            className={cn(
              "shrink-0 whitespace-nowrap text-caption tabular-nums",
              // Na fila de fechados o carimbo é referência, não chamada: mesmo
              // tamanho da escala, só que apagado.
              unread
                ? "font-semibold text-primary"
                : resolved
                  ? "font-normal text-muted-foreground/60"
                  : "text-muted-foreground",
            )}
            title={
              missingResolvedAt
                ? "Sem registro de conclusão: última atividade da conversa"
                : resolved
                  ? "Conclusão do atendimento"
                  : undefined
            }
          >
            {stamp}
          </span>
        </span>

        {resolved ? (
          <span className="flex min-w-0 items-center gap-1.5 text-label text-muted-foreground">
            <CheckCircle className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {item.patientName ?? formatPhone(item.contactPhone)}
            </span>
          </span>
        ) : (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-label",
                  unread ? "text-foreground" : "text-muted-foreground",
                )}
                title={item.lastMessagePreview ?? undefined}
              >
                {previewText(item.lastMessagePreview)}
              </span>
              {unread ? (
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-primary-foreground">
                  {item.unreadCount}
                </span>
              ) : null}
            </span>

            {/* Paciente vinculado tem a linha dele: emendar o nome com as
                etiquetas fazia os dois parecerem a mesma informação. */}
            {item.patientName ? (
              <span className="flex min-w-0 pt-0.5">
                <Badge
                  variant="neutral"
                  className="h-4 max-w-full truncate px-1.5 text-caption leading-none"
                  title={item.patientName}
                >
                  {item.patientName}
                </Badge>
              </span>
            ) : null}

            {item.tags.length ? (
              <span className="flex min-w-0 flex-wrap items-center gap-1 pt-0.5">
                {/* No resumo valem até quatro etiquetas; o resto vira "+N"
                    para o card não crescer sobre a próxima conversa. */}
                {item.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex h-4 max-w-full shrink-0 items-center truncate whitespace-nowrap rounded px-1.5 text-caption font-medium leading-none text-white"
                    style={{ backgroundColor: tag.color }}
                    title={tag.name}
                  >
                    {tag.name}
                  </span>
                ))}
                {item.tags.length > 4 ? (
                  <span
                    className="text-caption text-muted-foreground"
                    title={item.tags
                      .slice(4)
                      .map((tag) => tag.name)
                      .join(", ")}
                  >
                    +{item.tags.length - 4}
                  </span>
                ) : null}
              </span>
            ) : null}
          </>
        )}
      </span>
    </button>
  );
});

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
  const threadContentRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const nearBottomFrameRef = useRef<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmingCompletion, setConfirmingCompletion] = useState(false);
  const timelineGroups = useMemo(
    () => groupTimelineByDay(messages, attendanceEvents),
    [attendanceEvents, messages],
  );
  const messageById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );
  const [replyingTo, setReplyingTo] = useState<ConversationMessage | null>(
    null,
  );
  // Trocar de conversa já zera a citação: a thread é remontada por conversa
  // (key no pai), então não há estado sobrando de uma para a outra.

  // Marca de "não lidas": quantas havia quando a conversa foi aberta. O valor
  // é congelado na montagem porque a marca tem de continuar no mesmo lugar
  // enquanto a pessoa lê — ela só sai quando a conversa é dada como lida, e
  // aí sai desbotando, sem sumir de um quadro para o outro.
  const [initialUnread] = useState(conversation.unreadCount);
  // Arrastar mídia para qualquer ponto da conversa entrega os arquivos ao
  // compositor, que é quem sabe montar a fila de envio.
  const fileDropRef = useRef<((files: File[]) => void) | null>(null);
  const registerFileDrop = useCallback(
    (handler: ((files: File[]) => void) | null) => {
      fileDropRef.current = handler;
    },
    [],
  );
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [unreadMark, setUnreadMark] = useState<"visible" | "leaving" | "gone">(
    conversation.unreadCount > 0 ? "visible" : "gone",
  );
  if (unreadMark === "visible" && conversation.unreadCount === 0) {
    setUnreadMark("leaving");
  }
  useEffect(() => {
    if (unreadMark !== "leaving") return;
    const timer = window.setTimeout(() => setUnreadMark("gone"), 400);
    return () => window.clearTimeout(timer);
  }, [unreadMark]);

  const firstUnreadId = useMemo(() => {
    const count = initialUnread;
    if (count <= 0) return null;
    const received = messages.filter(
      (message) => message.direction === "inbound" && message.type !== "note",
    );
    return received.slice(-count)[0]?.id ?? null;
  }, [initialUnread, messages]);

  // Abrir a conversa e enviar mensagem têm de terminar no fim da thread, e um
  // `scrollTo` único não dava conta: as bolhas usam `content-visibility`, então
  // até o navegador renderizar cada uma o `scrollHeight` é uma estimativa
  // (44px por bolha), e imagem, áudio e vídeo só ganham altura depois de
  // carregar. As duas coisas fazem a altura crescer *depois* do scroll, e a
  // conversa parava no meio. Enquanto estiver colada no fim, toda mudança de
  // altura reposiciona; quem rolar para trás solta a trava e é deixado em paz.
  useEffect(() => {
    const scrollArea = scrollRef.current;
    const content = threadContentRef.current;
    if (!scrollArea || !content) return;

    const pinToBottom = () => {
      if (!isNearBottomRef.current) return;
      scrollArea.scrollTop = scrollArea.scrollHeight;
    };

    pinToBottom();
    const observer = new ResizeObserver(pinToBottom);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

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

  // A thread é remontada a cada conversa (key no pai), então o fade de 150ms
  // marca a troca de contato sem atrasar a leitura.
  return (
    <section
      className="relative flex h-full min-h-0 animate-fade-in flex-col overflow-hidden bg-card"
      onDragOver={(event) => {
        if (!fileDropRef.current) return;
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDraggingFiles(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDraggingFiles(false);
      }}
      onDrop={(event) => {
        if (!fileDropRef.current) return;
        const files = [...event.dataTransfer.files];
        event.preventDefault();
        setDraggingFiles(false);
        if (files.length) fileDropRef.current(files);
      }}
    >
      {draggingFiles ? (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary-muted/80 text-body-sm font-semibold text-primary">
          Solte para anexar
        </div>
      ) : null}
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
          {/* O nome e o telefone são o alvo: clicar ali abre os dados do
              contato, no lugar do olho que ficava ao lado. */}
          <button
            type="button"
            onClick={onToggleDetails}
            aria-label="Abrir dados do contato"
            title="Ver dados do contato"
            className="flex min-w-0 cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors duration-[var(--motion-fast)] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold">
                {conversation.contactName}
              </p>
              <p className="truncate text-label tabular-nums text-muted-foreground">
                {formatPhone(conversation.contactPhone)}
              </p>
              {conversation.tags.length ? (
                // Etiqueta cortada não identifica nada, então aqui elas saem
                // inteiras: o corte é no número delas (até três no cabeçalho,
                // o resto no "+N"), não no nome.
                <span className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden">
                  {conversation.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex h-4 shrink-0 items-center whitespace-nowrap rounded px-1.5 text-caption font-medium leading-none text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                  {conversation.tags.length > 3 ? (
                    <span
                      className="shrink-0 text-caption text-muted-foreground"
                      title={conversation.tags
                        .slice(3)
                        .map((tag) => tag.name)
                        .join(", ")}
                    >
                      +{conversation.tags.length - 3}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </button>
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
        // Ler scrollHeight força o layout; a cada evento de rolagem, numa
        // thread de centenas de bolhas, isso é o suficiente para engasgar.
        // Um quadro por vez basta para saber se ainda estamos no fim.
        onScroll={() => {
          if (nearBottomFrameRef.current !== null) return;
          nearBottomFrameRef.current = window.requestAnimationFrame(() => {
            nearBottomFrameRef.current = null;
            const target = scrollRef.current;
            if (!target) return;
            isNearBottomRef.current =
              target.scrollHeight - target.scrollTop - target.clientHeight <=
              24;
          });
        }}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-surface-sunken px-4 py-5 sm:px-8"
        style={{
          backgroundImage:
            "radial-gradient(color-mix(in srgb, var(--foreground) 5%, transparent) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      >
        {/* O conteúdo tem o seu próprio elemento porque é a altura dele que o
            ResizeObserver acompanha para manter a conversa colada no fim. */}
        <div ref={threadContentRef} className="space-y-1.5">
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
                  <Fragment key={`message-${item.message.id}`}>
                    {unreadMark !== "gone" &&
                    item.message.id === firstUnreadId ? (
                      <div
                        className={cn(
                          "flex justify-center py-1 transition-opacity duration-[var(--motion-normal)] ease-[var(--ease-out)]",
                          unreadMark === "leaving"
                            ? "opacity-0"
                            : "opacity-100",
                        )}
                      >
                        <span className="rounded-full border border-border bg-card px-3 py-1 text-caption font-semibold text-muted-foreground shadow-[var(--shadow-soft)]">
                          {initialUnread === 1
                            ? "1 mensagem não lida"
                            : `${initialUnread} mensagens não lidas`}
                        </span>
                      </div>
                    ) : null}
                    <MessageBubble
                      message={item.message}
                      quoted={
                        item.message.replyToMessageId
                          ? (messageById.get(item.message.replyToMessageId) ??
                            null)
                          : null
                      }
                      onReply={capabilities.compose ? setReplyingTo : undefined}
                    />
                  </Fragment>
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
      </div>

      {/* O campo de digitação só existe depois que o atendimento começa; até
          lá o rodapé carrega a ação que destrava a conversa. */}
      {capabilities.compose ? (
        <MessageComposer
          conversationId={conversation.id}
          currentUserName={currentUserName}
          // Quem envia quer ver o que enviou: mesmo lendo o histórico lá em
          // cima, mandar mensagem volta a prender a thread no fim.
          onOptimisticMessage={(message) => {
            isNearBottomRef.current = true;
            onOptimisticMessage(message);
          }}
          onMessageConfirmed={onMessageConfirmed}
          onMessageFailed={onMessageFailed}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          registerFileDrop={registerFileDrop}
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
      <div className="flex max-w-[min(90%,48rem)] items-center justify-center gap-1.5 text-center text-caption leading-4">
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

const MessageBubble = memo(function MessageBubble({
  message,
  quoted,
  onReply,
}: {
  message: ConversationMessage;
  /** Mensagem citada por esta, já resolvida na thread carregada. */
  quoted?: ConversationMessage | null;
  onReply?: (message: ConversationMessage) => void;
}) {
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
  // Nota interna não existe no WhatsApp do contato: não há o que citar.
  const canReply = Boolean(onReply) && !isNote;
  // Fora da bolha, centralizado na altura dela e do lado de dentro da tela:
  // à esquerda no que a clínica enviou, à direita no que o contato mandou.
  const replyButton = (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onReply?.(message)}
      className="size-7 shrink-0 self-center rounded-full p-0 text-muted-foreground hover:bg-foreground/5"
      aria-label="Responder citando esta mensagem"
      title="Responder"
    >
      <ArrowBendUpLeft className="size-4" aria-hidden="true" />
    </Button>
  );
  const mediaEndpoint = `/api/whatsapp/media/${message.id}`;

  return (
    <div
      className={cn(
        // Mesma contencao da fila: numa thread longa o navegador pula o
        // layout das bolhas fora da viewport durante a rolagem.
        "flex min-w-0 max-w-full items-center gap-1.5 [contain-intrinsic-size:auto_44px] [content-visibility:auto]",
        isNote
          ? "justify-center py-2"
          : outbound
            ? "justify-end"
            : "justify-start",
      )}
    >
      {canReply && outbound ? replyButton : null}
      <div
        className={cn(
          "relative min-w-0 max-w-[86%] overflow-hidden rounded-lg px-3 pb-1.5 pt-2 text-body leading-5 shadow-sm sm:max-w-[72%] lg:max-w-[66%]",
          isNote
            ? "w-[min(92%,42rem)] border border-warning/40 bg-warning-muted px-4 py-3 text-warning-foreground shadow-[var(--shadow-md)]"
            : outbound
              ? // O fundo da thread é uma superfície rebaixada, quase da cor
                // do primary a 8%: a bolha enviada sumia nele. Fica no tom
                // seguinte da escala e ganha a borda que a recebida já tinha.
                "rounded-tr-sm border border-primary/30 bg-primary-muted-hover text-foreground"
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
            "grid min-w-0 max-w-full gap-2",
            "pr-5",
            isNote && "text-center",
          )}
        >
          {quoted ? (
            // Citação: mesma leitura do WhatsApp — um bloco menor, com barra
            // lateral, acima do corpo da resposta.
            <div className="min-w-0 rounded-md border-l-2 border-primary bg-foreground/5 px-2 py-1 text-label">
              <p className="font-semibold text-foreground/80">
                {quoted.direction === "outbound" ? "Você" : "Contato"}
              </p>
              <p className="line-clamp-2 break-words text-muted-foreground">
                {quoted.body?.trim() || labelForType(quoted.type)}
              </p>
            </div>
          ) : null}
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
            // "Abrir arquivo" sozinho não diz o que se vai abrir: o nome e o
            // tipo saem do corpo da mensagem e do mime.
            <a
              href={mediaEndpoint}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card/70 px-2 py-1.5 transition-colors duration-[var(--motion-fast)] hover:border-border-strong"
            >
              <Paperclip
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block truncate font-medium text-primary underline">
                  {attachmentName(message)}
                </span>
                <span className="block text-caption text-muted-foreground">
                  {attachmentKind(message)}
                </span>
              </span>
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
        {/* O horário é uma marca de rodapé da bolha, não parte da leitura: em
            algarismos, a altura cheia dos dígitos já compete com o texto da
            mensagem, então fica abaixo da menor medida da escala e com o tom
            rebaixado. */}
        <p className="mt-0.5 flex min-h-3 items-center justify-end gap-1 text-[10px] leading-3 tabular-nums text-muted-foreground/75">
          {formatTime(message.createdAt)}
          {outbound && !isNote && message.status === "queued" ? (
            <span className="italic">enviando…</span>
          ) : outbound && !isNote && message.status === "read" ? (
            <CheckCheck className="size-3" aria-hidden="true" />
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
          <dl className="grid grid-cols-2 gap-3 text-body">
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
      {canReply && !outbound ? replyButton : null}
    </div>
  );
});

/** Nome do arquivo para exibir na bolha: o corpo da mensagem carrega o nome
    (ou a legenda) e, quando não há nada, o tipo vira o rótulo. */
function attachmentName(message: ConversationMessage) {
  const body = message.body?.trim();
  if (body) return body;
  const extension = attachmentExtension(message);
  return extension ? `arquivo.${extension}` : labelForType(message.type);
}

/** Linha de apoio: extensão em caixa alta e, na falta dela, o tipo. */
function attachmentKind(message: ConversationMessage) {
  const extension = attachmentExtension(message);
  return extension
    ? `${extension.toUpperCase()} · ${labelForType(message.type)}`
    : labelForType(message.type);
}

function attachmentExtension(message: ConversationMessage) {
  const fromName = message.body?.trim().split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  const fromMime = message.mediaMimeType
    ?.split("/")[1]
    ?.split(";")[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return fromMime || null;
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
  replyingTo,
  onCancelReply,
  registerFileDrop,
}: {
  conversationId: string;
  currentUserName: string | null;
  onOptimisticMessage: (message: ConversationMessage) => void;
  onMessageConfirmed: (tempId: string, message: ConversationMessage) => void;
  onMessageFailed: (tempId: string) => void;
  /** Mensagem que está sendo citada, escolhida pelo botão de responder. */
  replyingTo: ConversationMessage | null;
  onCancelReply: () => void;
  /** A thread registra aqui o recebimento de arquivos arrastados. */
  registerFileDrop?: (handler: ((files: File[]) => void) | null) => void;
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
  // Anexos ficam em espera antes do envio: dá para colar (Ctrl+V), arrastar
  // para cima da conversa ou escolher pelo clipe, revisar e só então mandar.
  // Legenda só existe com um arquivo — o WhatsApp prende a legenda a uma
  // mídia, e repetir a mesma frase em cada uma seria outra coisa.
  const [attachments, setAttachments] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const attachmentPreviews = useMemo(
    () =>
      attachments.map((file) =>
        file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      ),
    [attachments],
  );
  useEffect(
    () => () => {
      for (const url of attachmentPreviews) {
        if (url) URL.revokeObjectURL(url);
      }
    },
    [attachmentPreviews],
  );
  const addFiles = useCallback((files: File[]) => {
    const accepted = files.filter((file) => file.size > 0);
    if (!accepted.length) return;
    setAttachments((current) =>
      [...current, ...accepted].slice(0, MAX_ATTACHMENTS),
    );
  }, []);

  useEffect(() => {
    registerFileDrop?.(addFiles);
    return () => registerFileDrop?.(null);
  }, [addFiles, registerFileDrop]);

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

    // Nota interna não vai para o WhatsApp, então não cita ninguém.
    const quotedId = isNoteMode ? null : (replyingTo?.id ?? null);
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
      replyToMessageId: quotedId,
    });
    setText("");
    onCancelReply();
    setSending(true);
    const result = isNoteMode
      ? await addInternalNoteAction(conversationId, value)
      : await sendMessageAction(conversationId, value, quotedId);
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

  async function sendAttachment(
    file: File,
    caption?: string,
  ): Promise<boolean> {
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
      body: caption?.trim() || file.name,
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
      if (caption) data.set("caption", caption);
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

  async function sendAttachments() {
    if (!attachments.length || sendingAttachment) return;
    const files = attachments;
    const single = files.length === 1;
    const captionValue = single ? caption.trim() : "";
    setAttachments([]);
    setCaption("");

    for (const file of files) {
      const sent = await sendAttachment(file, captionValue || undefined);
      if (!sent) break;
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
      {replyingTo && !isNoteMode ? (
        <div className="mb-2 flex animate-fade-in items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2">
          <span className="flex min-w-0 items-center gap-2">
            <ArrowBendUpLeft
              className="size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                Respondendo{" "}
                {replyingTo.direction === "outbound" ? "você" : "o contato"}
              </span>
              <span className="block truncate text-label text-foreground">
                {replyingTo.body?.trim() || labelForType(replyingTo.type)}
              </span>
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancelReply}
            aria-label="Cancelar resposta"
            title="Cancelar resposta"
            className="shrink-0"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      {isNoteMode ? (
        <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-muted px-3 py-2 text-body text-warning-foreground">
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
      {attachments.length ? (
        <div className="mb-2 grid animate-fade-in gap-2 rounded-xl border border-border bg-card p-2 shadow-[var(--shadow-soft)]">
          <ul className="flex flex-wrap gap-2">
            {attachments.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="relative flex min-w-0 max-w-48 items-center gap-2 rounded-lg border border-border bg-muted/50 py-1.5 pl-2 pr-8"
              >
                {attachmentPreviews[index] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachmentPreviews[index] ?? undefined}
                    alt=""
                    className="size-8 shrink-0 rounded object-cover"
                  />
                ) : (
                  <Paperclip
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 truncate text-label" title={file.name}>
                  {file.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-0.5 top-1/2 -translate-y-1/2"
                  aria-label={`Remover ${file.name}`}
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            {attachments.length === 1 ? (
              <Input
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Legenda (opcional)"
                aria-label="Legenda do arquivo"
                className="min-w-0 flex-1"
                maxLength={1000}
              />
            ) : (
              <p className="min-w-0 flex-1 text-label text-muted-foreground">
                {attachments.length} arquivos — a legenda só vale para envio de
                um arquivo.
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sendingAttachment}
              onClick={() => {
                setAttachments([]);
                setCaption("");
              }}
            >
              Descartar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={sendingAttachment}
              onClick={() => void sendAttachments()}
            >
              <Send className="size-4" aria-hidden="true" />
              {sendingAttachment ? "Enviando…" : "Enviar"}
            </Button>
          </div>
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
          multiple
          className="hidden"
          accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={(event) => {
            addFiles([...(event.target.files ?? [])]);
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
          onPaste={(event) => {
            // Print, imagem copiada de outra conversa, arquivo do explorador:
            // tudo que vier como arquivo entra na área de anexos.
            const files = [...(event.clipboardData?.files ?? [])];
            if (!files.length) return;
            event.preventDefault();
            addFiles(files);
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
          <p className="mt-3 text-body font-medium">{title}</p>
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
      <dt className="text-label font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all rounded-md bg-muted px-2.5 py-2 text-label">
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
    replyToMessageId: row.reply_to_message_id ?? null,
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

/**
 * Espelha a conversa aberta em `?conversation=`, para recarregar a página (ou
 * mandar o link para alguém) cair na mesma conversa — a página já lê esse
 * parâmetro e traz a conversa mesmo que ela esteja fora da primeira página.
 *
 * Escreve direto no histórico do navegador em vez de navegar pelo router: a
 * página monta a caixa de entrada com `key` no id da conversa, então uma
 * navegação de verdade remontaria tudo e jogaria fora mensagens carregadas,
 * rascunho e posição de rolagem. `replaceState` mantém o Voltar saindo da
 * tela, e não empilhando uma entrada por conversa aberta.
 */
function syncConversationUrl(conversationId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (conversationId) {
    url.searchParams.set("conversation", conversationId);
  } else {
    url.searchParams.delete("conversation");
  }
  window.history.replaceState(window.history.state, "", url);
}

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});
function formatTime(iso: string | null): string {
  if (!iso) return "";
  return timeFormatter.format(new Date(iso));
}

// Cabe na coluna de 23rem (avatar + prévia + selo de não lidas) sem o texto
// encostar na borda: acima disso o corte fica por conta do CSS, no meio da
// palavra.
/** Teto de arquivos por envio; acima disso o WhatsApp começa a recusar. */
const MAX_ATTACHMENTS = 10;

const previewCharLimit = 40;

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

const resolvedYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

// Conclusão do atendimento: dia e hora sempre juntos (o ano entra só quando
// não for o corrente), porque na fila de encerrados o que se procura é
// exatamente quando aquele atendimento terminou.
function formatResolvedAt(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const day =
    date.getFullYear() === new Date().getFullYear()
      ? resolvedDateFormatter.format(date)
      : resolvedYearFormatter.format(date);

  return `${day} ${timeFormatter.format(date)}`;
}
