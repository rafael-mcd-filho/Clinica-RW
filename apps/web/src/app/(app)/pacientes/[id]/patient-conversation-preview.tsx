"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowSquareOut,
  ChatCentered as MessageSquare,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type PreviewMessage = {
  id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  created_at: string;
  sent_at: string | null;
};

const PREVIEW_LIMIT = 50;

const mediaLabels: Record<string, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contact: "Contato",
  note: "Nota interna",
  system: "Mensagem do sistema",
};

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Espiada na conversa sem sair do paciente: abre as últimas mensagens em um
 * modal e deixa a decisão de ir para o atendimento (na aba atual ou em outra)
 * para quem está lendo. Somente leitura — responder é no atendimento.
 */
export function PatientConversationPreview({
  conversationId,
  organizationId,
  contactName,
  row,
}: {
  conversationId: string;
  organizationId: string;
  contactName: string;
  /** Com os dados da linha, a linha inteira abre a conversa (Resumo). */
  row?: {
    initials: string | null;
    statusLabel: string;
    statusVariant:
      | "neutral"
      | "primary"
      | "success"
      | "warning"
      | "destructive";
    preview: string;
    dateLabel: string | null;
    timeLabel: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<PreviewMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const href = `/atendimento?conversation=${conversationId}`;

  useEffect(() => {
    if (!open || messages || error) return;

    let active = true;
    void (async () => {
      const { data, error: queryError } = await createSupabaseBrowserClient()
        .from("whatsapp_messages")
        .select("id, direction, message_type, body, created_at, sent_at")
        .eq("organization_id", organizationId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(PREVIEW_LIMIT)
        .returns<PreviewMessage[]>();

      if (!active) return;
      if (queryError) {
        setError("Não foi possível carregar a conversa.");
        return;
      }
      setMessages([...(data ?? [])].reverse());
    })();

    return () => {
      active = false;
    };
  }, [conversationId, error, messages, open, organizationId]);

  // A conversa é lida de baixo para cima, como no atendimento.
  useEffect(() => {
    if (!messages?.length) return;
    const frame = window.requestAnimationFrame(() => {
      const area = scrollRef.current;
      if (area) area.scrollTo({ top: area.scrollHeight });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages]);

  return (
    <>
      {row ? (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          aria-label={`Conversa com ${contactName}, ${row.statusLabel}: ${row.preview}`}
          className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              row.initials
                ? "bg-primary-muted text-primary"
                : "bg-success-muted text-success-foreground",
            )}
            aria-hidden="true"
          >
            {row.initials ?? <WhatsappLogo className="size-5" weight="fill" />}
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {contactName}
              </span>
              <Badge
                variant={row.statusVariant}
                className="h-5 rounded-full px-1.5"
              >
                {row.statusLabel}
              </Badge>
            </span>
            <span className="truncate text-caption text-muted-foreground">
              {row.preview}
            </span>
          </span>
          {row.dateLabel ? (
            <span className="grid shrink-0 text-right text-caption tabular-nums text-muted-foreground">
              <span>{row.dateLabel}</span>
              <span>{row.timeLabel}</span>
            </span>
          ) : null}
        </button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setOpen(true)}
        >
          Abrir conversa
        </Button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Conversa com ${contactName}`}
        // "Últimas 50" numa conversa de 3 mensagens prometia o que não há.
        description={`Até as ${PREVIEW_LIMIT} mensagens mais recentes, somente leitura.`}
        className="max-w-2xl"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <ArrowSquareOut className="size-4" aria-hidden="true" />
                Abrir em nova aba
              </a>
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => router.push(href)}
            >
              <ArrowRight className="size-4" aria-hidden="true" />
              Abrir no atendimento
            </Button>
          </div>
        }
      >
        <div
          ref={scrollRef}
          className="grid max-h-[60vh] gap-1.5 overflow-y-auto overscroll-contain rounded-md bg-surface-sunken p-3"
        >
          {error ? (
            <p className="py-6 text-center text-body text-destructive">
              {error}
            </p>
          ) : !messages ? (
            <p className="py-6 text-center text-body text-muted-foreground">
              Carregando mensagens...
            </p>
          ) : !messages.length ? (
            <p className="flex flex-col items-center gap-2 py-6 text-center text-body text-muted-foreground">
              <MessageSquare
                className="size-5 text-muted-foreground"
                aria-hidden="true"
              />
              Esta conversa ainda não tem mensagens.
            </p>
          ) : (
            messages.map((message) => {
              const outbound = message.direction === "outbound";
              const text =
                message.body?.trim() ||
                mediaLabels[message.message_type] ||
                "Mensagem";

              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex min-w-0 max-w-full",
                    outbound ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "min-w-0 max-w-[86%] rounded-lg px-3 pb-1 pt-2 text-body leading-5 shadow-[var(--shadow-soft)]",
                      outbound
                        ? "rounded-tr-sm border border-primary/30 bg-primary-muted-hover"
                        : "rounded-tl-sm border border-border bg-card",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{text}</p>
                    <p className="mt-0.5 text-right text-caption tabular-nums text-muted-foreground">
                      {timeFormatter.format(
                        new Date(message.sent_at ?? message.created_at),
                      )}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Modal>
    </>
  );
}
