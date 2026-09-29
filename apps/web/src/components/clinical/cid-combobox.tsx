"use client";

import { useEffect, useId, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  formatCidCode,
  normalizeCidQuery,
  type Cid10SearchItem,
} from "@/lib/clinical/cid10";
import { cn } from "@/lib/utils";

// Mesma busca repetida na sessão (trocar de diagnóstico, reabrir a ficha) não
// volta ao servidor. A tabela CID é fixa.
const resultCache = new Map<string, Cid10SearchItem[]>();

type Results = {
  query: string;
  items: Cid10SearchItem[];
  error: string | null;
};

/**
 * Campo de CID com busca: aceita o código (J00, J00.0, j000) ou palavras da
 * descrição ("resfriado", "dengue") e sugere da tabela CID-10. Escolher uma
 * sugestão preenche código e descrição. Um código digitado que não está na
 * lista também vale (formatado), para não travar quem sabe o que quer.
 */
export function CidCombobox({
  ariaLabel,
  code,
  disabled,
  name,
  onSelect,
}: {
  ariaLabel: string;
  code: string;
  disabled?: boolean;
  name: string;
  onSelect: (value: { code: string; description?: string }) => void;
}) {
  const listboxId = useId();
  const optionIdPrefix = useId();
  const [text, setText] = useState(code);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [active, setActive] = useState({ query: "", index: 0 });
  const query = normalizeCidQuery(text);
  const searching = open && query.length >= 2 && text !== code;

  // Mantém o texto em sincronia quando o código muda por fora (escolha).
  const [codeSource, setCodeSource] = useState(code);
  if (codeSource !== code) {
    setCodeSource(code);
    setText(code);
  }

  // Resultado da busca atual: do cache da sessão ou da última resposta.
  const cached = resultCache.get(query);
  const current: Results | null = cached
    ? { query, items: cached, error: null }
    : results?.query === query
      ? results
      : null;
  const items = current?.items ?? [];
  const loading = searching && !current;
  const activeIndex = items.length
    ? Math.min(active.query === query ? active.index : 0, items.length - 1)
    : -1;

  useEffect(() => {
    if (!searching || resultCache.has(query)) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/cid10/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        const payload = (await response.json()) as {
          items?: Cid10SearchItem[];
          error?: string;
        };
        const next = payload.items ?? [];
        if (response.ok) resultCache.set(query, next);
        setResults({ query, items: next, error: payload.error ?? null });
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") return;
        setResults({
          query,
          items: [],
          error: "Não foi possível buscar agora. Digite o código, se souber.",
        });
      }
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, searching]);

  function moveActive(step: number) {
    if (!items.length) return;
    setOpen(true);
    setActive({
      query,
      index: (Math.max(activeIndex, 0) + step + items.length) % items.length,
    });
  }

  function choose(item: Cid10SearchItem) {
    setText(item.code);
    setOpen(false);
    onSelect({ code: item.code, description: item.description });
  }

  /** Ao sair do campo sem escolher: código válido fica; texto solto volta. */
  function commitTyped() {
    setOpen(false);
    const trimmed = text.trim();
    if (!trimmed) {
      if (code) onSelect({ code: "" });
      return;
    }
    const formatted = formatCidCode(trimmed);
    if (formatted) {
      setText(formatted);
      if (formatted !== code) onSelect({ code: formatted });
      return;
    }
    setText(code);
  }

  const showPanel = searching;
  const error = current?.error ?? null;
  const activeId =
    activeIndex >= 0 ? `${optionIdPrefix}-${activeIndex}` : undefined;

  return (
    <div className="relative">
      <input type="hidden" name={name} value={code} />
      <MagnifyingGlass
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={Boolean(showPanel)}
        aria-controls={listboxId}
        aria-activedescendant={showPanel ? activeId : undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        value={text}
        placeholder="Código ou descrição"
        maxLength={80}
        // O formulário salva sozinho a cada mudança: o texto da busca não é
        // dado do prontuário, então não deve disparar o salvamento.
        onChange={(event) => {
          event.stopPropagation();
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (text !== code) setOpen(true);
        }}
        onBlur={(event) => {
          // Clique numa sugestão: a escolha acontece no onMouseDown dela.
          if (
            event.relatedTarget instanceof HTMLElement &&
            event.relatedTarget.closest(`#${CSS.escape(listboxId)}`)
          ) {
            return;
          }
          commitTyped();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && items.length) {
            event.preventDefault();
            moveActive(1);
          } else if (event.key === "ArrowUp" && items.length) {
            event.preventDefault();
            moveActive(-1);
          } else if (event.key === "Enter") {
            // Enter não envia o formulário do atendimento.
            event.preventDefault();
            const item = items[activeIndex];
            if (showPanel && item) choose(item);
            else commitTyped();
          } else if (event.key === "Escape" && showPanel) {
            event.preventDefault();
            setOpen(false);
            setText(code);
          }
        }}
        className="h-10 min-w-0 w-full touch-manipulation rounded-md border border-border bg-card pl-9 pr-9 font-sans text-control font-normal text-foreground shadow-[var(--shadow-soft)] outline-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] placeholder:text-placeholder focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_15%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
      />
      {loading && searching ? (
        <span
          aria-hidden="true"
          className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-primary/25 border-t-primary motion-reduce:animate-none"
        />
      ) : null}

      {showPanel ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Sugestões de CID"
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-[min(34rem,calc(100vw-3rem))] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-md)]"
        >
          {items.map((item, index) => (
            <button
              key={item.code}
              id={`${optionIdPrefix}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              tabIndex={-1}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(item);
              }}
              onMouseEnter={() => setActive({ query, index })}
              className={cn(
                "flex w-full items-baseline gap-3 rounded-md px-2.5 py-2 text-left text-body-sm",
                index === activeIndex ? "bg-muted" : "",
              )}
            >
              <span className="w-12 shrink-0 font-semibold tabular-nums text-foreground">
                {item.code}
              </span>
              <span className="min-w-0 text-secondary-foreground">
                <HighlightWords text={item.description} query={query} />
              </span>
            </button>
          ))}
          {!loading && !items.length ? (
            <p className="px-2.5 py-2 text-body-sm text-muted-foreground">
              {error ??
                `Nenhum CID para “${text.trim()}”. ${
                  formatCidCode(text)
                    ? "Enter mantém o código digitado."
                    : "Tente o código ou outra palavra."
                }`}
            </p>
          ) : null}
          {loading && !items.length ? (
            <p className="px-2.5 py-2 text-body-sm text-muted-foreground">
              Buscando…
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Realça as palavras buscadas na descrição (sem diferenciar acentos). */
function HighlightWords({ query, text }: { query: string; text: string }) {
  const words = query
    .split(" ")
    .filter((word) => word.length >= 2 && !/\d/.test(word));
  if (!words.length) return <>{text}</>;
  const folded = text
    .split("")
    .map(
      (char) =>
        char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()[0] ?? char,
    )
    .join("");
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    let from = folded.indexOf(word);
    while (from >= 0) {
      for (let i = from; i < from + word.length; i += 1) marks[i] = true;
      from = folded.indexOf(word, from + word.length);
    }
  }
  const parts: React.ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i += 1) {
    if (i === text.length || marks[i] !== marks[start]) {
      const chunk = text.slice(start, i);
      parts.push(
        marks[start] ? (
          <mark
            key={start}
            className="rounded-[3px] bg-warning-muted px-px text-inherit"
          >
            {chunk}
          </mark>
        ) : (
          chunk
        ),
      );
      start = i;
    }
  }
  return <>{parts}</>;
}
