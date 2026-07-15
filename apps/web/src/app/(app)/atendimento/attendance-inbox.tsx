"use client";

import Link from "next/link";
import Image from "next/image";
import {
  CheckCheck,
  Archive,
  Inbox,
  MessagesSquare,
  MoreVertical,
  Mic,
  Paperclip,
  Search,
  Send,
  Smile,
  Square,
  Sparkles,
  Tag as TagIcon,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";
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
import {
  assignToMeAction,
  markConversationReadAction,
  sendMediaMessageAction,
  sendMessageAction,
  setConversationStatusAction,
  setConversationTagAction,
  suggestReplyAction,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Textarea } from "@/components/ui/field";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
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

export function AttendanceInbox({
  organizationId,
  currentUserId,
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

  const selected = useMemo(
    () => conversations.find((item) => item.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const counts = useMemo(() => {
    const base: Record<InboxView, number> = { new: 0, mine: 0, others: 0, resolved: 0 };
    for (const item of conversations) {
      if (item.status === "pending") base.new += 1;
      else if (item.status === "resolved") base.resolved += 1;
      else if (item.assignedUserId === currentUserId) base.mine += 1;
      else base.others += 1;
    }
    return base;
  }, [conversations, currentUserId]);

  const visibleConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return conversations
      .filter((item) => {
        if (tab === "new") return item.status === "pending";
        if (tab === "resolved") return item.status === "resolved";
        if (tab === "mine") return item.status === "open" && item.assignedUserId === currentUserId;
        return item.status === "open" && item.assignedUserId !== currentUserId;
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
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId, upsertConversation]);

  async function openConversation(id: string) {
    selectedIdRef.current = id;
    setSelectedId(id);
    setMessages([]);
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
    setMessages((data ?? []).map(toMessage));

    if (canAttend) {
      void markConversationReadAction(id);
      upsertConversation({ id, unreadCount: 0 });
    }
  }

  function addOptimisticMessage(message: ConversationMessage) {
    setMessages((current) => [...current, message]);
    if (selectedIdRef.current) {
      upsertConversation({
        id: selectedIdRef.current,
        lastMessageAt: message.createdAt,
        lastMessagePreview: message.body,
        status: "open",
      });
    }
  }

  function confirmOptimisticMessage(tempId: string, message: ConversationMessage) {
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
      />

      {selected ? (
        <ConversationThread
          key={selected.id}
          conversation={selected}
          messages={messages}
          canAttend={canAttend}
          quickReplies={quickReplies}
          onToggleDetails={() => setDetailsOpen((value) => !value)}
          onOptimisticMessage={addOptimisticMessage}
          onMessageConfirmed={confirmOptimisticMessage}
          onMessageFailed={removeOptimisticMessage}
          onStatusChange={(status) =>
            upsertConversation({ id: selected.id, status })
          }
        />
      ) : (
        <EmptyPanel
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
        <ContactPanel
          conversation={selected}
          organizationId={organizationId}
          currentUserId={currentUserId}
          canAttend={canAttend}
          availableTags={availableTags}
          onTagsChange={(tags) => upsertConversation({ id: selected.id, tags })}
          onAssigned={(userId) =>
            upsertConversation({
              id: selected.id,
              assignedUserId: userId,
              status: "open",
            })
          }
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
}) {
  const connected = instance?.status === "connected";
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-border bg-card">
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
        active ? "border-l-2 border-primary bg-primary-muted pl-2.5 hover:bg-primary-muted" : "",
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
  quickReplies,
  onToggleDetails,
  onOptimisticMessage,
  onMessageConfirmed,
  onMessageFailed,
  onStatusChange,
}: {
  conversation: ConversationListItem;
  messages: ConversationMessage[];
  canAttend: boolean;
  quickReplies: QuickReplyTemplate[];
  onToggleDetails: () => void;
  onOptimisticMessage: (message: ConversationMessage) => void;
  onMessageConfirmed: (tempId: string, message: ConversationMessage) => void;
  onMessageFailed: (tempId: string) => void;
  onStatusChange: (status: ConversationStatus) => void;
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
        onStatusChange(status);
      } else {
        toast.error(result.error ?? "Não foi possível atualizar.");
      }
    });
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden bg-card">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ContactAvatar name={conversation.contactName} photoUrl={conversation.contactPhotoUrl} enlargeable />
          <button type="button" onClick={onToggleDetails} className="min-w-0 rounded-lg p-1.5 text-left hover:bg-muted/70">
          <div className="min-w-0">
          <p className="truncate text-body-sm font-semibold">
            {conversation.contactName}
          </p>
          <p className="truncate text-label tabular-nums text-muted-foreground">
            {formatPhone(conversation.contactPhone)}
          </p>
          </div>
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="neutral" className="hidden sm:inline-flex">
            {conversationStatusLabels[conversation.status]}
          </Badge>
          {canAttend ? (
            <>
            {conversation.status !== "resolved" ? (
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
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => changeStatus("open")}
              >
                Reabrir
              </Button>
            )}
            </>
          ) : null}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-surface-sunken px-4 py-5 sm:px-6"
      >
        {messages.length ? (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        ) : (
          <p className="py-8 text-center text-label text-muted-foreground">
            Carregando mensagens…
          </p>
        )}
      </div>

      {canAttend ? (
        <MessageComposer
          conversationId={conversation.id}
          quickReplies={quickReplies}
          onOptimisticMessage={onOptimisticMessage}
          onMessageConfirmed={onMessageConfirmed}
          onMessageFailed={onMessageFailed}
        />
      ) : (
        <div className="border-t border-border px-4 py-3 text-label text-muted-foreground">
          Você tem acesso somente de leitura a este atendimento.
        </div>
      )}
    </section>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const outbound = message.direction === "outbound";
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-xl px-3 py-2 text-body-sm shadow-[var(--shadow-soft)] sm:max-w-[68%]",
          outbound
            ? "rounded-br-sm bg-primary-muted text-foreground"
            : "rounded-bl-sm border border-border bg-card text-foreground",
        )}
      >
        <div className="flex items-start gap-2">
        {message.body ? (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        ) : (
          <p className="italic opacity-80">{labelForType(message.type)}</p>
        )}
        <button type="button" onClick={() => setDetailsOpen(true)} className="-mr-1 -mt-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-black/5" aria-label="Detalhes da mensagem">
          <MoreVertical className="size-3.5" />
        </button>
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
        <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Detalhes da mensagem" className="max-w-md">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <MessageDetail label="Direção" value={outbound ? "Enviada" : "Recebida"} />
            <MessageDetail label="Status" value={messageStatusLabel(message.status)} />
            <MessageDetail label="Criada" value={formatMessageDateTime(message.createdAt)} />
            <MessageDetail label="Enviada" value={formatMessageDateTime(message.sentAt)} />
            <MessageDetail label="Tipo" value={labelForType(message.type)} />
            <MessageDetail label="Origem" value={outbound ? "Usuário" : "Contato"} />
            <div className="col-span-2"><MessageDetail label="ID da mensagem" value={message.waMessageId ?? message.id} /></div>
          </dl>
        </Modal>
      </div>
    </div>
  );
}

function MessageComposer({
  conversationId,
  quickReplies,
  onOptimisticMessage,
  onMessageConfirmed,
  onMessageFailed,
}: {
  conversationId: string;
  quickReplies: QuickReplyTemplate[];
  onOptimisticMessage: (message: ConversationMessage) => void;
  onMessageConfirmed: (tempId: string, message: ConversationMessage) => void;
  onMessageFailed: (tempId: string) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  async function send() {
    const value = text.trim();
    if (!value || sending) return;
    const tempId = `optimistic-${crypto.randomUUID()}`;
    onOptimisticMessage({
      id: tempId,
      direction: "outbound",
      type: "text",
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
    const result = await sendMessageAction(conversationId, value);
    setSending(false);
    if (result.ok && result.message) {
      onMessageConfirmed(tempId, result.message);
    } else {
      onMessageFailed(tempId);
      setText((current) => current || value);
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
    const type: MessageType = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "document";
    onOptimisticMessage({ id: tempId, direction: "outbound", type, body: file.name, mediaUrl: null, mediaMimeType: file.type || null, status: "queued", aiSuggested: false, senderUserName: null, createdAt: new Date().toISOString() });
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
      recorder.ondataavailable = (event) => event.data.size && audioChunksRef.current.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        void sendAttachment(new File([blob], `audio-${Date.now()}.webm`, { type: blob.type }));
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
          {["😀", "😂", "😊", "😍", "🙏", "👍", "❤️", "🎉", "✅", "📅", "👋", "🤝"].map((emoji) => (
            <button key={emoji} type="button" onClick={() => setText((value) => `${value}${emoji}`)} className="rounded p-1.5 text-xl hover:bg-muted">{emoji}</button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendAttachment(file); event.target.value = ""; }} />
        <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} title="Enviar imagem ou arquivo"><Paperclip className="size-4" /><span className="sr-only">Anexar arquivo</span></Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => setShowEmojis((value) => !value)} title="Emojis"><Smile className="size-4" /><span className="sr-only">Escolher emoji</span></Button>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Escreva uma mensagem…"
          rows={1}
          className="min-h-10 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center gap-1">
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
          <Button
            type="button"
            size="icon"
            disabled={sending}
            onClick={text.trim() ? send : toggleRecording}
            variant={recording ? "destructive" : "primary"}
          >
            {text.trim() ? <Send className="size-4" aria-hidden="true" /> : recording ? <Square className="size-4" /> : <Mic className="size-4" />}
            <span className="sr-only">{text.trim() ? "Enviar mensagem" : recording ? "Parar gravação" : "Gravar áudio"}</span>
          </Button>
        </div>
      </div>
      {quickReplies.length ? (
        <button
          type="button"
          onClick={() => setShowTemplates((value) => !value)}
          className="mt-1 text-caption text-muted-foreground hover:text-foreground"
        >
          {showTemplates ? "Ocultar" : "Respostas rápidas"}
        </button>
      ) : null}
    </div>
  );
}

function ContactPanel({
  conversation,
  organizationId,
  currentUserId,
  canAttend,
  availableTags,
  onTagsChange,
  onAssigned,
}: {
  conversation: ConversationListItem;
  organizationId: string;
  currentUserId: string | null;
  canAttend: boolean;
  availableTags: ConversationTagView[];
  onTagsChange: (tags: ConversationTagView[]) => void;
  onAssigned: (userId: string | null) => void;
}) {
  const [bookings, setBookings] = useState<
    { id: string; status: string; requested_start_at: string }[]
  >([]);
  const supabaseRef = useRef(createSupabaseBrowserClient());

  useEffect(() => {
    let active = true;
    const load = async () => {
      const supabase = supabaseRef.current;
      const digits = conversation.contactPhone.replace(/\D/g, "").slice(-8);
      const base = supabase
        .from("online_booking_requests")
        .select("id, status, requested_start_at")
        .eq("organization_id", organizationId);
      const filtered = conversation.patientId
        ? base.eq("patient_id", conversation.patientId)
        : base.ilike("patient_phone", `%${digits}%`);
      const { data } = await filtered
        .order("requested_start_at", { ascending: false })
        .limit(5)
        .returns<
          { id: string; status: string; requested_start_at: string }[]
        >();
      if (active) setBookings(data ?? []);
    };
    void load();
    return () => {
      active = false;
    };
  }, [conversation.contactPhone, conversation.patientId, organizationId]);

  const selectedTagIds = new Set(conversation.tags.map((tag) => tag.id));

  function toggleTag(tag: ConversationTagView) {
    const attach = !selectedTagIds.has(tag.id);
    const nextTags = attach
      ? [...conversation.tags, tag]
      : conversation.tags.filter((item) => item.id !== tag.id);
    onTagsChange(nextTags);
    void setConversationTagAction(conversation.id, tag.id, attach).then(
      (result) => {
        if (!result.ok) toast.error(result.error ?? "Falha ao etiquetar.");
      },
    );
  }

  function assignToMe() {
    void assignToMeAction(conversation.id).then((result) => {
      if (result.ok) {
        onAssigned(currentUserId);
      } else {
        toast.error(result.error ?? "Falha ao assumir.");
      }
    });
  }

  return (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-border bg-card xl:flex">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-3">
          <ContactAvatar name={conversation.contactName} photoUrl={conversation.contactPhotoUrl} enlargeable />
          <div className="min-w-0">
            <p className="truncate text-body-sm font-semibold">
              {conversation.contactName}
            </p>
            <p className="truncate text-label tabular-nums text-muted-foreground">
              {formatPhone(conversation.contactPhone)}
            </p>
          </div>
        </div>

        {conversation.patientId ? (
          <Button asChild variant="secondary" size="sm" className="mt-3 w-full">
            <Link href={`/pacientes/${conversation.patientId}`}>
              <UserRound className="size-4" aria-hidden="true" />
              Ver ficha do paciente
            </Link>
          </Button>
        ) : (
          <p className="mt-3 rounded-md border border-dashed border-border px-3 py-2 text-label text-muted-foreground">
            Contato ainda não vinculado a um paciente.
          </p>
        )}

        {canAttend && !conversation.assignedUserId ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2 w-full"
            onClick={assignToMe}
          >
            Assumir atendimento
          </Button>
        ) : conversation.assignedUserName ? (
          <p className="mt-2 text-label text-muted-foreground">
            Responsável: {conversation.assignedUserName}
          </p>
        ) : null}
      </div>

      <div className="border-b border-border p-4">
        <p className="mb-2 flex items-center gap-1.5 text-label font-medium uppercase tracking-wide text-muted-foreground">
          <TagIcon className="size-3.5" aria-hidden="true" />
          Etiquetas
        </p>
        {availableTags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {availableTags.map((tag) => {
              const selected = selectedTagIds.has(tag.id);
              return (
                <Button
                  key={tag.id}
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canAttend}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    "gap-1.5 shadow-none",
                    selected ? "" : "opacity-70",
                  )}
                  style={{
                    borderColor: tag.color,
                    color: tag.color,
                    backgroundColor: selected ? `${tag.color}14` : undefined,
                  }}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden="true"
                  />
                  {tag.name}
                </Button>
              );
            })}
          </div>
        ) : (
          <p className="text-label text-muted-foreground">
            Nenhuma etiqueta cadastrada.
          </p>
        )}
      </div>

      <div className="p-4">
        <p className="mb-2 text-label font-medium uppercase tracking-wide text-muted-foreground">
          Reservas
        </p>
        {bookings.length ? (
          <ul className="grid gap-2">
            {bookings.map((booking) => (
              <li
                key={booking.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-label"
              >
                <span className="tabular-nums text-foreground">
                  {formatDateTime(booking.requested_start_at)}
                </span>
                <Badge variant={bookingVariant(booking.status)}>
                  {bookingStatusLabel(booking.status)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-label text-muted-foreground">
            Nenhuma reserva para este contato.
          </p>
        )}
      </div>
    </aside>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Inbox;
  title: string;
  description: string;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
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

  if (!enlargeable || !photoUrl) return <span className="row-span-3 shrink-0">{content}</span>;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2" aria-label={`Ampliar foto de ${name}`}>
        {content}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Foto de ${name}`} className="max-w-2xl">
        <Image unoptimized src={photoUrl} alt={`Foto ampliada de ${name}`} width={900} height={900} className="max-h-[70vh] w-full rounded-lg object-contain" />
      </Modal>
    </>
  );
}

function MessageDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all rounded-md bg-muted px-2.5 py-2 text-xs">{value}</dd>
    </div>
  );
}

function messageStatusLabel(status: ConversationMessage["status"]) {
  return ({ queued: "Enviando", sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falhou", received: "Recebida" } as const)[status];
}

function formatMessageDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
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
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return timeFormatter.format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

function bookingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    requested: "Solicitada",
    confirmed: "Confirmada",
    rejected: "Recusada",
    cancelled: "Cancelada",
  };
  return labels[status] ?? status;
}

function bookingVariant(
  status: string,
): "neutral" | "primary" | "success" | "warning" | "destructive" {
  if (status === "confirmed") return "success";
  if (status === "requested") return "primary";
  if (status === "rejected" || status === "cancelled") return "neutral";
  return "neutral";
}
