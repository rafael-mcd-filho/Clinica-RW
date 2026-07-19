"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Checks as CheckCheck,
  Archive,
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
  Sparkle as Sparkles,
  UserSwitch,
  WifiHigh as Wifi,
  WifiSlash as WifiOff,
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
import type { QuickReplyTemplate } from "./page";
import { ContactDetailsPanel } from "./contact-details-panel";
import {
  addInternalNoteAction,
  assignToMeAction,
  markConversationReadAction,
  sendMediaMessageAction,
  sendMessageAction,
  setConversationStatusAction,
  suggestReplyAction,
  transferConversationAction,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/field";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  getAttendanceCapabilities,
  getAttendanceQueue,
} from "@/lib/whatsapp/attendance-state";
import type {
  AttendanceInstance,
  ConversationListItem,
  ConversationMessage,
  ConversationStatus,
  ConversationTagView,
  MessageType,
} from "@/lib/whatsapp/types";
import { conversationStatusLabels } from "@/lib/whatsapp/types";
import { cn } from "@/lib/utils";

type InboxView = "new" | "mine" | "others" | "resolved";
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

export type AttendantOption = { id: string; name: string };

export function AttendanceInbox({
  organizationId,
  currentUserId,
  currentUserName,
  attendants,
  canAttend,
  canConfigure,
  evolutionReady,
  initialConversations,
  availableTags,
  quickReplies,
  instance,
}: {
  organizationId: string;
  currentUserId: string | null;
  currentUserName: string | null;
  attendants: AttendantOption[];
  canAttend: boolean;
  canConfigure: boolean;
  evolutionReady: boolean;
  initialConversations: ConversationListItem[];
  availableTags: ConversationTagView[];
  quickReplies: QuickReplyTemplate[];
  instance: AttendanceInstance | null;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [tab, setTab] = useState<InboxView>("new");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selectedIdRef = useRef<string | null>(null);
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

  const counts = useMemo(() => {
    const base: Record<InboxView, number> = {
      new: 0,
      mine: 0,
      others: 0,
      resolved: 0,
    };
    for (const item of conversations) {
      base[
        getAttendanceQueue(item.status, item.assignedUserId, currentUserId)
      ] += 1;
    }
    return base;
  }, [conversations, currentUserId]);

  const visibleConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return conversations
      .filter((item) => {
        return (
          getAttendanceQueue(
            item.status,
            item.assignedUserId,
            currentUserId,
          ) === tab
        );
      })
      .filter((item) =>
        normalized
          ? [item.contactName, item.patientName ?? "", item.contactPhone]
              .join(" ")
              .toLowerCase()
              .includes(normalized)
          : true,
      );
  }, [conversations, currentUserId, tab, query]);

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
      const { data } = await supabaseRef.current
        .from("whatsapp_messages")
        .select(
          "id, conversation_id, wa_message_id, direction, message_type, body, media_url, media_mime_type, status, ai_suggested, sender_user_id, created_at, sent_at",
        )
        .eq("organization_id", organizationId)
        .eq("conversation_id", id)
        .order("created_at", { ascending: true })
        .limit(300)
        .returns<MessageRow[]>();
      if (selectedIdRef.current === id) {
        setMessages((current) => [
          ...(data ?? []).map(toMessage),
          ...current.filter((message) => message.id.startsWith("optimistic-")),
        ]);
      }
    },
    [organizationId],
  );

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
    await reloadMessages(id);

    if (canAttend) {
      void markConversationReadAction(id);
      upsertConversation({ id, unreadCount: 0 });
    }
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
  }

  function removeOptimisticMessage(tempId: string) {
    setMessages((current) => current.filter((item) => item.id !== tempId));
  }

  return (
    <div
      className={cn(
        "grid h-[calc(100svh-var(--app-sticky-offset))] min-h-[36rem] grid-cols-1 overflow-hidden bg-card lg:grid-cols-[21rem_minmax(0,1fr)]",
        detailsOpen && "xl:grid-cols-[21rem_minmax(0,1fr)_19rem]",
      )}
    >
      <ConversationListColumn
        tab={tab}
        counts={counts}
        onTabChange={setTab}
        query={query}
        onQueryChange={setQuery}
        conversations={visibleConversations}
        selectedId={selectedId}
        onSelect={openConversation}
        instance={instance}
        evolutionReady={evolutionReady}
        mobileHidden={Boolean(selected)}
      />

      {selected ? (
        <ConversationThread
          key={selected.id}
          conversation={selected}
          messages={messages}
          canAttend={canAttend}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          attendants={attendants}
          quickReplies={quickReplies}
          onBack={() => {
            selectedIdRef.current = null;
            setSelectedId(null);
          }}
          onToggleDetails={() => setDetailsOpen((value) => !value)}
          onOptimisticMessage={addOptimisticMessage}
          onMessageConfirmed={confirmOptimisticMessage}
          onMessageFailed={removeOptimisticMessage}
          onStatusChange={(status) =>
            upsertConversation({ id: selected.id, status })
          }
          onReopened={() =>
            upsertConversation({
              id: selected.id,
              status: "pending",
              assignedUserId: null,
              assignedUserName: null,
            })
          }
          onAssigned={(userId) =>
            upsertConversation({
              id: selected.id,
              assignedUserId: userId,
              assignedUserName:
                attendants.find((item) => item.id === userId)?.name ?? null,
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
  conversations,
  selectedId,
  onSelect,
  instance,
  evolutionReady,
  mobileHidden,
}: {
  tab: InboxView;
  counts: Record<InboxView, number>;
  onTabChange: (tab: InboxView) => void;
  query: string;
  onQueryChange: (value: string) => void;
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  instance: AttendanceInstance | null;
  evolutionReady: boolean;
  /** No mobile (master-detail), a lista sai de cena quando há conversa aberta. */
  mobileHidden?: boolean;
}) {
  const connected = instance?.status === "connected";
  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border-r border-border bg-card",
        mobileHidden && "hidden lg:flex",
      )}
    >
      <div className="flex h-12 items-center justify-between gap-2 border-b border-border px-4">
        <span className="inline-flex items-center gap-1.5 text-label text-muted-foreground">
          {connected ? (
            <Wifi className="size-3.5 text-success" aria-hidden="true" />
          ) : (
            <WifiOff
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          {instance?.phoneNumber ??
            (evolutionReady ? "Aguardando conexão" : "Não configurado")}
        </span>
        <Button
          type="button"
          variant={tab === "resolved" ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={() => onTabChange("resolved")}
          aria-label={`Concluídos (${counts.resolved})`}
          title="Concluídos"
          className="relative"
        >
          <Archive className="size-4" />
          {counts.resolved > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
              {counts.resolved}
            </span>
          ) : null}
        </Button>
      </div>
      <div className="border-b border-border p-3">
        <label className="relative block">
          <span className="sr-only">Pesquisar conversas</span>
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Pesquisar"
            className="w-full pl-9"
          />
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-placeholder"
            aria-hidden="true"
          />
        </label>
        <div className="mt-3 grid w-full grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {tabs.map((item) => (
            <Button
              key={item}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onTabChange(item)}
              className={cn(
                "min-w-0 gap-1 px-1 text-label",
                tab === item
                  ? "bg-card text-foreground shadow-[var(--shadow-soft)] hover:bg-card"
                  : "",
              )}
            >
              {tabLabels[item]}
              {counts[item] > 0 ? (
                <span className="tabular-nums text-muted-foreground">
                  {counts[item]}
                </span>
              ) : null}
            </Button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length ? (
          <ul className="divide-y divide-border">
            {conversations.map((item) => (
              <li key={item.id}>
                <ConversationRow
                  item={item}
                  active={item.id === selectedId}
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

function ConversationRow({
  item,
  active,
  onSelect,
}: {
  item: ConversationListItem;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        "grid h-auto min-h-[4.5rem] w-full grid-cols-[2.5rem_1fr_auto] gap-x-2 gap-y-0.5 rounded-none px-3 py-2.5 text-left font-normal",
        active
          ? "border-l-2 border-primary bg-primary-muted pl-2.5 hover:bg-primary-muted"
          : "",
      )}
    >
      <ContactAvatar name={item.contactName} photoUrl={item.contactPhotoUrl} />
      <span className="truncate text-body-sm font-semibold text-foreground">
        {item.contactName}
      </span>
      <span className="text-caption tabular-nums text-muted-foreground">
        {formatTime(item.lastMessageAt)}
      </span>
      <span className="col-start-2 col-end-4 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-label text-muted-foreground">
          {item.lastMessagePreview ?? "Sem mensagens"}
        </span>
        {item.unreadCount > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-semibold text-primary-foreground">
            {item.unreadCount}
          </span>
        ) : null}
      </span>
      {item.patientName || item.tags.length ? (
        <span className="col-start-2 col-end-4 flex flex-wrap items-center gap-1">
          {item.patientName ? (
            <Badge variant="neutral" className="h-5 px-1.5 text-caption">
              {item.patientName}
            </Badge>
          ) : null}
          {item.tags.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex h-5 items-center rounded px-1.5 text-caption font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </span>
      ) : null}
    </Button>
  );
}

function ConversationThread({
  conversation,
  messages,
  canAttend,
  currentUserId,
  currentUserName,
  attendants,
  quickReplies,
  onBack,
  onToggleDetails,
  onOptimisticMessage,
  onMessageConfirmed,
  onMessageFailed,
  onStatusChange,
  onReopened,
  onAssigned,
}: {
  conversation: ConversationListItem;
  messages: ConversationMessage[];
  canAttend: boolean;
  currentUserId: string | null;
  currentUserName: string | null;
  attendants: AttendantOption[];
  quickReplies: QuickReplyTemplate[];
  /** Master-detail no mobile: volta para a lista de conversas. */
  onBack: () => void;
  onToggleDetails: () => void;
  onOptimisticMessage: (message: ConversationMessage) => void;
  onMessageConfirmed: (tempId: string, message: ConversationMessage) => void;
  onMessageFailed: (tempId: string) => void;
  onStatusChange: (status: ConversationStatus) => void;
  onReopened: () => void;
  onAssigned: (userId: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function changeStatus(status: ConversationStatus) {
    startTransition(async () => {
      const result = await setConversationStatusAction(conversation.id, status);
      if (result.ok) {
        if (status === "pending") onReopened();
        else onStatusChange(status);
      } else {
        toast.error(result.error ?? "Não foi possível atualizar.");
      }
    });
  }

  function startAttendance() {
    startTransition(async () => {
      const result = await assignToMeAction(conversation.id);
      if (result.ok) {
        onAssigned(currentUserId);
      } else {
        toast.error(result.error ?? "Falha ao iniciar o atendimento.");
      }
    });
  }

  function transferTo(userId: string) {
    startTransition(async () => {
      const result = await transferConversationAction(conversation.id, userId);
      if (result.ok) {
        onAssigned(userId);
        toast.success("Conversa transferida.");
      } else {
        toast.error(result.error ?? "Falha ao transferir.");
      }
    });
  }

  const transferTargets = attendants.filter(
    (item) => item.id !== conversation.assignedUserId,
  );
  const capabilities = getAttendanceCapabilities(
    conversation.status,
    conversation.assignedUserId,
    currentUserId,
    canAttend,
  );

  return (
    <section className="flex min-h-0 flex-col overflow-hidden bg-card">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 py-2">
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
          <ContactAvatar
            name={conversation.contactName}
            photoUrl={conversation.contactPhotoUrl}
            enlargeable
          />
          <Button
            type="button"
            variant="ghost"
            onClick={onToggleDetails}
            className="h-auto min-w-0 justify-start p-1.5 text-left font-normal hover:bg-muted/70"
          >
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold">
                {conversation.contactName}
              </p>
              <p className="truncate text-label tabular-nums text-muted-foreground">
                {formatPhone(conversation.contactPhone)}
              </p>
            </div>
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {conversation.assignedUserName ? (
            <Badge variant="primary" className="hidden md:inline-flex">
              {conversation.assignedUserId === currentUserId
                ? "Com você"
                : conversation.assignedUserName}
            </Badge>
          ) : (
            <Badge variant="neutral" className="hidden sm:inline-flex">
              {conversationStatusLabels[conversation.status]}
            </Badge>
          )}
        </div>
      </header>

      {capabilities.start ||
      capabilities.transfer ||
      capabilities.complete ||
      capabilities.reopen ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-foreground">
              {conversation.status === "pending"
                ? "Atendimento aguardando responsável"
                : conversation.status === "open"
                  ? `Em atendimento${conversation.assignedUserName ? ` com ${conversation.assignedUserName}` : ""}`
                  : "Atendimento concluído"}
            </p>
            {conversation.status === "pending" ? (
              <p className="text-caption text-muted-foreground">
                As mensagens ficam somente para leitura até alguém iniciar.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {capabilities.start ? (
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={startAttendance}
              >
                <Play className="size-4" weight="fill" aria-hidden="true" />
                Iniciar
              </Button>
            ) : null}
            {capabilities.transfer ? (
              transferTargets.length ? (
                <DropdownMenu
                  trigger={
                    <>
                      <UserSwitch className="size-4" aria-hidden="true" />
                      Transferir
                    </>
                  }
                  triggerLabel="Transferir atendimento"
                  triggerClassName="h-8 w-auto gap-1.5 border border-border px-3 text-label font-semibold text-foreground hover:bg-muted"
                >
                  {(close) => (
                    <>
                      {transferTargets.map((attendant) => (
                        <DropdownMenuItem
                          key={attendant.id}
                          onSelect={() => {
                            close();
                            transferTo(attendant.id);
                          }}
                        >
                          {attendant.id === currentUserId
                            ? `${attendant.name} (você)`
                            : attendant.name}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenu>
              ) : (
                <Button type="button" variant="secondary" size="sm" disabled>
                  <UserSwitch className="size-4" aria-hidden="true" />
                  Transferir
                </Button>
              )
            ) : null}
            {capabilities.complete ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => changeStatus("resolved")}
              >
                <CheckCheck className="size-4" aria-hidden="true" />
                Concluir
              </Button>
            ) : null}
            {capabilities.reopen ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => changeStatus("pending")}
              >
                Reabrir
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-surface-sunken px-4 py-5 sm:px-6"
      >
        {messages.length ? (
          groupMessagesByDay(messages).map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="sticky top-0 z-10 flex justify-center py-1">
                <span className="rounded-full border border-border bg-card px-3 py-0.5 text-caption font-medium text-muted-foreground shadow-[var(--shadow-soft)]">
                  {group.label}
                </span>
              </div>
              {group.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          ))
        ) : (
          <p className="py-8 text-center text-label text-muted-foreground">
            Carregando mensagens…
          </p>
        )}
      </div>

      {capabilities.compose ? (
        <MessageComposer
          conversationId={conversation.id}
          currentUserName={currentUserName}
          quickReplies={quickReplies}
          onOptimisticMessage={onOptimisticMessage}
          onMessageConfirmed={onMessageConfirmed}
          onMessageFailed={onMessageFailed}
        />
      ) : (
        <div className="border-t border-border bg-card px-4 py-3 text-label text-muted-foreground">
          {!canAttend
            ? "Você tem acesso somente de leitura a este atendimento."
            : conversation.status === "pending"
              ? "Inicie ou transfira o atendimento para liberar o campo de mensagem."
              : conversation.status === "resolved"
                ? "Este atendimento foi concluído. Reabra para iniciar um novo ciclo."
                : `Somente ${conversation.assignedUserName ?? "o responsável"} pode responder neste atendimento.`}
        </div>
      )}
    </section>
  );
}

type MessageDayGroup = {
  key: string;
  label: string;
  messages: ConversationMessage[];
};

function groupMessagesByDay(
  messages: ConversationMessage[],
): MessageDayGroup[] {
  const groups: MessageDayGroup[] = [];
  for (const message of messages) {
    const date = new Date(message.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.messages.push(message);
    } else {
      groups.push({ key, label: dayLabel(date), messages: [message] });
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

function MessageBubble({ message }: { message: ConversationMessage }) {
  const outbound = message.direction === "outbound";
  const isNote = message.type === "note";
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-xl px-3 py-2 text-body-sm shadow-[var(--shadow-soft)] sm:max-w-[68%]",
          isNote
            ? "rounded-br-sm border border-warning/40 bg-warning-muted text-warning-foreground"
            : outbound
              ? "rounded-br-sm bg-primary-muted text-foreground"
              : "rounded-bl-sm border border-border bg-card text-foreground",
        )}
      >
        {isNote ? (
          <p className="mb-1 flex items-center gap-1 text-caption font-semibold uppercase tracking-wide">
            <Note className="size-3.5" weight="fill" aria-hidden="true" />
            Nota interna
          </p>
        ) : null}
        <div className="relative grid gap-2 pr-4">
          {message.mediaUrl && message.type === "image" ? (
            <a
              href={`/api/whatsapp/media/${message.id}`}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg"
            >
              <Image
                unoptimized
                src={`/api/whatsapp/media/${message.id}`}
                alt={message.body ?? "Imagem recebida"}
                width={420}
                height={320}
                className="max-h-80 w-auto max-w-full object-contain"
              />
            </a>
          ) : message.mediaUrl && message.type === "audio" ? (
            <audio
              controls
              preload="metadata"
              src={`/api/whatsapp/media/${message.id}`}
              className="max-w-full"
            />
          ) : message.mediaUrl ? (
            <a
              href={`/api/whatsapp/media/${message.id}`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline"
            >
              Abrir arquivo
            </a>
          ) : null}
          {message.body ? (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          ) : (
            <p className="italic opacity-80">{labelForType(message.type)}</p>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setDetailsOpen(true)}
            className="absolute -right-1 -top-1 h-auto w-auto rounded p-1 text-muted-foreground hover:bg-foreground/5"
            aria-label="Detalhes da mensagem"
          >
            <MoreVertical className="size-3.5" />
          </Button>
        </div>
        <p
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-caption tabular-nums",
            "text-muted-foreground",
          )}
        >
          {formatTime(message.createdAt)}
          {outbound && message.status === "queued" ? (
            <span className="italic">enviando…</span>
          ) : outbound && message.status === "read" ? (
            <CheckCheck className="size-3.5" aria-hidden="true" />
          ) : null}
        </p>
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

const signatureStorageKey = "hi-clinic-atendimento-assinatura";

function MessageComposer({
  conversationId,
  currentUserName,
  quickReplies,
  onOptimisticMessage,
  onMessageConfirmed,
  onMessageFailed,
}: {
  conversationId: string;
  currentUserName: string | null;
  quickReplies: QuickReplyTemplate[];
  onOptimisticMessage: (message: ConversationMessage) => void;
  onMessageConfirmed: (tempId: string, message: ConversationMessage) => void;
  onMessageFailed: (tempId: string) => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [recording, setRecording] = useState(false);
  const [signatureEnabled, setSignatureEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      setSignatureEnabled(
        window.localStorage.getItem(signatureStorageKey) === "true",
      );
    }, 0);
    return () => window.clearTimeout(task);
  }, []);

  function toggleSignature() {
    setSignatureEnabled((value) => {
      window.localStorage.setItem(signatureStorageKey, String(!value));
      return !value;
    });
  }

  const isNoteMode = mode === "note";

  async function send() {
    const raw = text.trim();
    if (!raw || sending) return;

    const value =
      !isNoteMode && signatureEnabled && currentUserName
        ? `*${currentUserName}:*\n${raw}`
        : raw;

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
    } else {
      onMessageFailed(tempId);
      setText((current) => current || raw);
      toast.error(result.error ?? "Falha ao enviar.");
    }
  }

  async function suggest() {
    setSuggesting(true);
    const result = await suggestReplyAction(conversationId);
    setSuggesting(false);
    if (result.ok && result.suggestion) {
      setText(result.suggestion);
    } else {
      toast.error(result.error ?? "Não foi possível sugerir.");
    }
  }

  async function sendAttachment(file: File) {
    const tempId = `optimistic-${crypto.randomUUID()}`;
    const type: MessageType = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
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
    const data = new FormData();
    data.set("conversation_id", conversationId);
    data.set("file", file);
    const result = await sendMediaMessageAction(data);
    if (result.ok && result.message) onMessageConfirmed(tempId, result.message);
    else {
      onMessageFailed(tempId);
      toast.error(result.error ?? "Falha ao enviar arquivo.");
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) =>
        event.data.size && audioChunksRef.current.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        void sendAttachment(
          new File([blob], `audio-${Date.now()}.webm`, { type: blob.type }),
        );
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  }

  return (
    <div className="border-t border-border bg-card px-3 py-2.5">
      <div className="mb-2 inline-flex rounded-md bg-muted p-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMode("reply")}
          className={cn(
            "h-7 px-3 text-label",
            !isNoteMode
              ? "bg-card text-foreground shadow-[var(--shadow-soft)] hover:bg-card"
              : "",
          )}
        >
          <Send className="size-3.5" aria-hidden="true" />
          Responder
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMode("note")}
          className={cn(
            "h-7 px-3 text-label",
            isNoteMode
              ? "bg-warning-muted text-warning-foreground shadow-[var(--shadow-soft)] hover:bg-warning-muted"
              : "",
          )}
        >
          <Note className="size-3.5" aria-hidden="true" />
          Nota interna
        </Button>
      </div>
      {showTemplates && quickReplies.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quickReplies.map((template) => (
            <Button
              key={template.id}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setText(template.body);
                setShowTemplates(false);
              }}
            >
              {template.name}
            </Button>
          ))}
        </div>
      ) : null}
      {showEmojis ? (
        <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-border bg-popover p-2 shadow-sm">
          {[
            "😀",
            "😂",
            "😊",
            "😍",
            "🙏",
            "👍",
            "❤️",
            "🎉",
            "✅",
            "📅",
            "👋",
            "🤝",
          ].map((emoji) => (
            <Button
              key={emoji}
              type="button"
              variant="ghost"
              onClick={() => setText((value) => `${value}${emoji}`)}
              className="h-auto w-auto rounded p-1.5 text-xl"
            >
              {emoji}
            </Button>
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          "flex items-end gap-2 rounded-2xl border p-1.5 focus-within:ring-2",
          isNoteMode
            ? "border-warning/50 bg-warning-muted/40 focus-within:border-warning focus-within:ring-warning/15"
            : "border-border bg-background focus-within:border-primary focus-within:ring-primary/15",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void sendAttachment(file);
            event.target.value = "";
          }}
        />
        {!isNoteMode ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title="Enviar imagem ou arquivo"
          >
            <Paperclip className="size-4" />
            <span className="sr-only">Anexar arquivo</span>
          </Button>
        ) : null}
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
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={
            isNoteMode
              ? "Escreva uma nota interna (visível só para a equipe)…"
              : "Escreva uma mensagem…"
          }
          rows={1}
          className="min-h-10 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center gap-1">
          {!isNoteMode ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={suggesting}
              onClick={suggest}
              title="Sugerir resposta com IA"
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {suggesting ? "…" : "IA"}
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon"
            disabled={sending}
            onClick={text.trim() || isNoteMode ? send : toggleRecording}
            variant={recording ? "destructive" : "primary"}
          >
            {text.trim() || isNoteMode ? (
              <Send className="size-4" aria-hidden="true" />
            ) : recording ? (
              <Square className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
            <span className="sr-only">
              {text.trim() || isNoteMode
                ? "Enviar"
                : recording
                  ? "Parar gravação"
                  : "Gravar áudio"}
            </span>
          </Button>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        {quickReplies.length && !isNoteMode ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowTemplates((value) => !value)}
            className="h-auto p-0 text-caption font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            {showTemplates ? "Ocultar" : "Respostas rápidas"}
          </Button>
        ) : (
          <span />
        )}
        {!isNoteMode && currentUserName ? (
          <Checkbox
            checked={signatureEnabled}
            onChange={toggleSignature}
            label={`Assinar como ${currentUserName.split(" ")[0]}`}
          />
        ) : null}
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
  const content = photoUrl ? (
    <Image
      unoptimized
      src={photoUrl}
      alt={`Foto de ${name}`}
      width={40}
      height={40}
      className="size-10 rounded-full object-cover"
    />
  ) : (
    <span className="flex size-10 items-center justify-center rounded-full bg-primary-muted text-sm font-semibold text-primary">
      {initials(name)}
    </span>
  );

  if (!enlargeable || !photoUrl)
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

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});
function formatTime(iso: string | null): string {
  if (!iso) return "";
  return timeFormatter.format(new Date(iso));
}
