"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import type { AgendaSearchResult } from "@/app/api/agenda/search/route";
import { Input } from "@/components/ui/field";
import { localDateKey } from "@/lib/agenda/slots";
import { cn } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  waiting: "Aguardando",
  in_progress: "Em atendimento",
  attended: "Atendido",
  no_show: "Faltou",
  cancelled: "Cancelado",
};

type RemoteResults = {
  query: string;
  upcoming: AgendaSearchResult[];
  past: AgendaSearchResult[];
  error?: string;
};

/**
 * Busca de paciente na agenda.
 *
 * Na tela, filtra na hora os agendamentos carregados (a semana ou o mês
 * visível). Ao mesmo tempo, pergunta ao servidor pelos agendamentos da pessoa
 * em qualquer data e mostra, num painel, só os que estão FORA da tela — com
 * um clique a agenda vai até a data e abre o agendamento.
 */
export function AgendaPatientSearch({
  value,
  onChange,
  timeZone,
  isInView,
  visibleCount,
  onOpenAppointment,
}: {
  value: string;
  onChange: (value: string) => void;
  timeZone: string;
  isInView: (dateKey: string) => boolean;
  /** Agendamentos da busca que já estão na tela. */
  visibleCount: number;
  onOpenAppointment: (result: AgendaSearchResult) => void;
}) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<RemoteResults | null>(null);
  const query = value.trim();
  const active = query.length >= 3;
  const current = results?.query === query ? results : null;
  const loading = active && !current;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/agenda/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as {
          upcoming?: AgendaSearchResult[];
          past?: AgendaSearchResult[];
          error?: string;
        };
        setResults({
          query,
          upcoming: payload.upcoming ?? [],
          past: payload.past ?? [],
          error: response.ok ? undefined : payload.error,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setResults({
          query,
          upcoming: [],
          past: [],
          error: "Não foi possível buscar fora desta tela agora.",
        });
      }
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [active, query]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const outside = (list: AgendaSearchResult[]) =>
    list.filter((item) => !isInView(localDateKey(item.startAt, timeZone)));
  const upcoming = current ? outside(current.upcoming) : [];
  const past = current ? outside(current.past) : [];
  const outsideCount = upcoming.length + past.length;
  const showPanel = open && active;

  const statusText = loading
    ? `Buscando “${query}”…`
    : current?.error
      ? current.error
      : `${visibleCount} nesta tela · ${outsideCount} em outras datas`;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 basis-48 sm:max-w-80">
      <span
        className="pointer-events-none absolute left-3 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center"
        aria-hidden="true"
      >
        {loading ? (
          <span className="size-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary motion-reduce:animate-none" />
        ) : (
          <MagnifyingGlass className="size-4 text-muted-foreground" />
        )}
      </span>
      <Input
        type="search"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (showPanel) setOpen(false);
            else if (value) onChange("");
          }
        }}
        placeholder="Buscar paciente"
        className="w-full pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        aria-label="Buscar paciente na agenda"
        aria-expanded={showPanel}
        aria-controls={panelId}
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          aria-label="Limpar busca"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}

      {showPanel ? (
        <div
          id={panelId}
          className="absolute right-0 top-full z-30 mt-1 w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--shadow-md)]"
        >
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground"
          >
            {statusText}
          </p>
          {!loading && !current?.error ? (
            outsideCount ? (
              <div className="max-h-80 overflow-y-auto p-1">
                <ResultGroup
                  title="Próximos"
                  items={upcoming}
                  timeZone={timeZone}
                  onSelect={(item) => {
                    setOpen(false);
                    onOpenAppointment(item);
                  }}
                />
                <ResultGroup
                  title="Anteriores"
                  items={past}
                  timeZone={timeZone}
                  onSelect={(item) => {
                    setOpen(false);
                    onOpenAppointment(item);
                  }}
                />
              </div>
            ) : (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                {visibleCount
                  ? "Os agendamentos encontrados já estão nesta tela."
                  : `Nenhum agendamento para “${query}”.`}
              </p>
            )
          ) : null}
          {outsideCount && !loading ? (
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Clique para ir até a data e abrir o agendamento.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ResultGroup({
  title,
  items,
  timeZone,
  onSelect,
}: {
  title: string;
  items: AgendaSearchResult[];
  timeZone: string;
  onSelect: (item: AgendaSearchResult) => void;
}) {
  if (!items.length) return null;
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    timeZone,
  });
  const dayMonth = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone,
  });
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return (
    <div className="grid gap-0.5 py-1">
      <p className="px-2 py-1 text-caption font-semibold uppercase text-muted-foreground">
        {title}
      </p>
      {items.map((item) => {
        const start = new Date(item.startAt);
        const inactive =
          item.status === "cancelled" || item.status === "no_show";
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className="flex w-full min-w-0 items-center gap-3 rounded-md py-2 pl-2 pr-3 text-left transition-colors duration-[var(--motion-fast)] hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <span className="grid w-14 shrink-0 justify-items-center rounded-md border border-border bg-card py-1 leading-tight">
              <span className="text-caption uppercase text-muted-foreground">
                {weekday.format(start).replace(".", "")}
              </span>
              <span className="text-xs font-semibold tabular-nums">
                {dayMonth.format(start)}
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-sm font-medium",
                  inactive && "text-muted-foreground line-through",
                )}
              >
                {item.patientName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[time.format(start), item.procedureName, item.professionalName]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {statusLabel[item.status] ?? item.status}
            </span>
          </button>
        );
      })}
    </div>
  );
}
