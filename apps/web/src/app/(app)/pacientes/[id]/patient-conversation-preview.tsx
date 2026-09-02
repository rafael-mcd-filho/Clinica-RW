"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowSquareOut,
  ChatCentered as MessageSquare,
} from "@phosphor-icons/react";
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
}: {
  conversationId: string;
  organizationId: string;
  contactName: string;
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
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Abrir conversa
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Conversa com ${contactName}`}
        description={`Últimas ${PREVIEW_LIMIT} mensagens, somente leitura.`}
        className="max-w-2xl"
        footer={
          <>
            <Button asChild variant="secondary">
              <a href={href} target="_blank" rel="noopener noreferrer">
                <ArrowSquareOut className="size-4" aria-hidden="true" />
                Abrir em nova aba
              </a>
            </Button>
            <Button type="button" onClick={() => router.push(href)}>
              <ArrowRight className="size-4" aria-hidden="true" />
              Abrir no atendimento
            </Button>
          </>
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
                      "min-w-0 max-w-[86%] rounded-lg px-3 pb-1 pt-2 text-body leading-5 shadow-sm",
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
