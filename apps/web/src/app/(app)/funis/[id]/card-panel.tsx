"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  Archive,
  CalendarPlus,
  ExternalLink,
  MessageSquarePlus,
  Paperclip,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addCardNote,
  archiveCard,
  getCardTimeline,
  type CardNoteEntry,
  type CardTimelineEntry,
} from "../actions";
import type { FunnelBoardCard } from "./funnel-board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/field";
import { cn, initialsFromName } from "@/lib/utils";

export function CardPanel({
  funnelId,
  card,
  canManage,
  onClose,
}: {
  funnelId: string;
  card: FunnelBoardCard;
  canManage: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"notes" | "history">("notes");
  const [noteText, setNoteText] = useState("");
  const [timeline, setTimeline] = useState<{
    movements: CardTimelineEntry[];
    notes: CardNoteEntry[];
  } | null>(null);
  const [noteState, noteAction, notePending] = useActionState(
    addCardNote.bind(null, card.id),
    {},
  );

  useEffect(() => {
    let active = true;
    void getCardTimeline(card.id).then((result) => {
      if (active) setTimeline(result);
    });
    return () => {
      active = false;
    };
  }, [card.id]);

  useEffect(() => {
    if (noteState.success) {
      toast.success(noteState.success);
      void getCardTimeline(card.id).then(setTimeline);
    }
    if (noteState.error) toast.error(noteState.error);
  }, [card.id, noteState]);

  async function handleArchive() {
    const result = await archiveCard(funnelId, card.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.success);
    onClose();
  }

  function submitNote(formData: FormData) {
    setNoteText("");
    noteAction(formData);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        aria-label="Fechar detalhes do card"
        className="fixed inset-0 z-40 h-auto animate-fade-in rounded-none bg-slate-950/30 p-0 hover:bg-slate-950/30"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-[39rem] max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-secondary shadow-[var(--shadow-lg)]"
        aria-label="Detalhes do card"
      >
        <header className="flex items-start justify-between gap-4 px-8 py-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-muted text-sm font-semibold text-primary">
              {initialsFromName(card.patient_name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-heading font-semibold text-foreground">
                {card.patient_name}
              </p>
              <Link
                href={`/pacientes/${card.patient_id}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Ver ficha do paciente
                <ExternalLink className="size-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="size-5" aria-hidden="true" />
          </Button>
        </header>

        <div className="flex flex-wrap gap-2 px-8 pb-5">
          <Button asChild variant="secondary" size="sm">
            <Link href="/agenda">
              <CalendarPlus className="size-4" aria-hidden="true" />
              Agenda
            </Link>
          </Button>
          {canManage && !card.archived_at ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleArchive}
            >
              <Archive className="size-4" aria-hidden="true" />
              Arquivar card
            </Button>
          ) : null}
          {card.archived_at ? <Badge variant="neutral">Arquivado</Badge> : null}
          {card.value != null ? (
            <Badge variant="neutral">{formatCurrency(card.value)}</Badge>
          ) : null}
        </div>

        <div className="flex gap-3 px-8">
          <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>
            Anotações/Anexos
          </TabButton>
          <TabButton
            active={tab === "history"}
            onClick={() => setTab("history")}
          >
            Histórico
          </TabButton>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {tab === "notes" ? (
            <section className="grid gap-5">
              {canManage ? (
                <form action={submitNote} className="grid gap-3">
                  <div className="relative">
                    <Textarea
                      name="note"
                      value={noteText}
                      onChange={(event) =>
                        setNoteText(event.currentTarget.value.slice(0, 8000))
                      }
                      placeholder="Adicionar anotação..."
                      className="min-h-28 resize-none bg-card pr-20"
                    />
                    <span className="absolute bottom-3 right-4 text-xs text-placeholder">
                      {noteText.length}/8000
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Adicionar anexo"
                      onClick={() =>
                        toast.info("Anexos serao salvos em uma etapa dedicada.")
                      }
                    >
                      <Paperclip className="size-5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="submit"
                      disabled={notePending || !noteText.trim()}
                      className="rounded-full px-6"
                    >
                      <MessageSquarePlus
                        className="size-4"
                        aria-hidden="true"
                      />
                      {notePending ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </form>
              ) : null}

              <div className="rounded-lg border border-dashed border-border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Paperclip
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  Anexos
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhum anexo registrado neste card.
                </p>
              </div>

              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">Notas internas</h3>
                {timeline === null ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : timeline.notes.length ? (
                  <div className="grid gap-2">
                    {timeline.notes.map((entry) => (
                      <TimelineNote key={entry.id} entry={entry} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma nota registrada.
                  </p>
                )}
              </section>
            </section>
          ) : (
            <section className="grid gap-3">
              {timeline === null ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : timeline.movements.length ? (
                timeline.movements.map((entry) => (
                  <MovementEntry key={entry.id} entry={entry} />
                ))
              ) : (
                <EmptyState title="Sem movimentações registradas" />
              )}
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "h-10 px-6",
        active ? "bg-muted text-foreground hover:bg-muted" : "",
      )}
    >
      {children}
    </Button>
  );
}

function TimelineNote({ entry }: { entry: CardNoteEntry }) {
  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm">
      <p className="whitespace-pre-wrap text-foreground">{entry.note}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {entry.author_name ?? "Equipe"} · {formatDateTime(entry.created_at)}
      </p>
    </div>
  );
}

function MovementEntry({ entry }: { entry: CardTimelineEntry }) {
  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm">
      <p className="font-medium text-foreground">
        {entry.from_stage_name
          ? `${entry.from_stage_name} -> ${entry.to_stage_name}`
          : `Entrou em ${entry.to_stage_name}`}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {entry.moved_by_name ?? "Sistema"} · {formatDateTime(entry.moved_at)}
      </p>
      {entry.note ? (
        <p className="mt-2 text-sm text-muted-foreground">
          &quot;{entry.note}&quot;
        </p>
      ) : null}
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
