"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  ClipboardText,
  MagnifyingGlass as Search,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DateRangePickerInput } from "@/components/ui/date-picker-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export type ProntuarioFilters = {
  query: string;
  status: "all" | "draft" | "finalized";
  from: string;
  to: string;
  professionalId: string;
  templateId: string;
  procedureId: string;
  page: number;
};

export type ProntuarioRow = {
  id: string;
  status: "draft" | "finalized";
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  professionalName?: string;
  templateName: string;
  /** Procedimento do agendamento; atendimentos avulsos não têm. */
  procedureName?: string;
  startedDate: string;
  startedTime: string;
};

type Option = { id: string; name: string };

/** O que está sendo carregado agora, para dizer isso na tela. */
type Activity = { kind: "search" | "filter" | "page"; message: string };

type ActiveFilter = {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
};

const statusTabs = [
  { value: "all", label: "Todos" },
  { value: "draft", label: "Em andamento" },
  { value: "finalized", label: "Finalizados" },
] as const;

export function EncountersBrowser({
  canSearchCpf,
  canSeeAll,
  counts,
  error,
  filters,
  options,
  pagination,
  rows,
}: {
  canSearchCpf: boolean;
  canSeeAll: boolean;
  counts: { all: number; draft: number; finalized: number };
  error?: string;
  filters: ProntuarioFilters;
  options: {
    professionals: Option[];
    templates: Option[];
    procedures: Option[];
  };
  pagination: { page: number; pageSize: number; total: number };
  rows: ProntuarioRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [activity, setActivity] = useState<Activity | null>(null);
  // Última busca pedida ao servidor: evita pedir de novo a mesma enquanto a
  // resposta não chega (Enter, limpar e o debounce podem coincidir).
  const [requestedQuery, setRequestedQuery] = useState(filters.query);
  const [query, setQuery] = useState(filters.query);
  // A busca aplicada vem da URL. Se ela mudar por fora (voltar do navegador),
  // o campo acompanha; a resposta de uma busca pedida daqui não mexe no campo,
  // para não atropelar o que a pessoa continuou digitando.
  const [querySource, setQuerySource] = useState(filters.query);
  if (querySource !== filters.query) {
    setQuerySource(filters.query);
    if (filters.query !== requestedQuery) {
      setQuery(filters.query);
      setRequestedQuery(filters.query);
    }
  }
  const [range, setRange] = useState({ from: filters.from, to: filters.to });
  const appliedRange = `${filters.from}|${filters.to}`;
  const [rangeSource, setRangeSource] = useState(appliedRange);
  if (rangeSource !== appliedRange) {
    setRangeSource(appliedRange);
    setRange({ from: filters.from, to: filters.to });
  }

  const navigate = useCallback(
    (updates: Record<string, string | null>, nextActivity: Activity) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (!value || value === "all") next.delete(key);
        else next.set(key, value);
      });
      // Qualquer filtro novo volta para a primeira página.
      if (!("pagina" in updates)) next.delete("pagina");
      if ("q" in updates) setRequestedQuery(updates.q ?? "");
      const search = next.toString();
      setActivity(nextActivity);
      startTransition(() => {
        router.replace(search ? `${pathname}?${search}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams],
  );

  const typedQuery = query.trim();
  // Entre a última tecla e a resposta do servidor a busca já "está
  // acontecendo": o retorno visual começa na hora, não depois do debounce.
  const typing = typedQuery !== filters.query;
  const searching = typing || (pending && activity?.kind === "search");
  const busy = typing || pending;

  useEffect(() => {
    if (!typing || typedQuery === requestedQuery) return;
    const timeout = window.setTimeout(() => {
      navigate({ q: typedQuery || null }, searchActivity(typedQuery));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [navigate, requestedQuery, typedQuery, typing]);

  // O "Voltar" do atendimento retorna para esta mesma busca e página.
  const listSearch = searchParams.toString();
  const encounterHref = useCallback(
    (id: string) =>
      listSearch
        ? `/prontuario/${id}?from=prontuario&return_to=${encodeURIComponent(
            `/prontuario?${listSearch}`,
          )}`
        : `/prontuario/${id}`,
    [listSearch],
  );

  function clearSearch() {
    setQuery("");
    if (filters.query) navigate({ q: null }, searchActivity(""));
  }

  const optionName = (list: Option[], id: string) =>
    list.find((option) => option.id === id)?.name ?? "Selecionado";
  const activeFilters: ActiveFilter[] = [];
  if (filters.query) {
    activeFilters.push({
      key: "q",
      label: "Busca",
      value: `“${filters.query}”`,
      onRemove: clearSearch,
    });
  }
  if (filters.from || filters.to) {
    activeFilters.push({
      key: "periodo",
      label: "Período",
      value: formatRange(filters.from, filters.to),
      onRemove: () =>
        navigate({ de: null, ate: null }, filterActivity("Removendo período")),
    });
  }
  if (filters.professionalId) {
    activeFilters.push({
      key: "profissional",
      label: "Profissional",
      value: optionName(options.professionals, filters.professionalId),
      onRemove: () =>
        navigate(
          { profissional: null },
          filterActivity("Removendo profissional"),
        ),
    });
  }
  if (filters.procedureId) {
    activeFilters.push({
      key: "tipo",
      label: "Tipo",
      value: optionName(options.procedures, filters.procedureId),
      onRemove: () =>
        navigate({ tipo: null }, filterActivity("Removendo tipo")),
    });
  }
  if (filters.templateId) {
    activeFilters.push({
      key: "ficha",
      label: "Ficha",
      value: optionName(options.templates, filters.templateId),
      onRemove: () =>
        navigate({ ficha: null }, filterActivity("Removendo ficha")),
    });
  }
  const hasFilters = activeFilters.length > 0;

  function clearFilters() {
    setQuery("");
    navigate(
      {
        q: null,
        de: null,
        ate: null,
        profissional: null,
        ficha: null,
        tipo: null,
      },
      filterActivity("Limpando filtros"),
    );
  }

  const highlight = filters.query;
  const columns = useMemo<ColumnDef<ProntuarioRow>[]>(() => {
    const list: ColumnDef<ProntuarioRow>[] = [
      {
        id: "patient",
        header: "Paciente",
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/pacientes/${row.original.patientId}`}
              className="block truncate font-medium text-foreground hover:text-primary"
            >
              <Highlight text={row.original.patientName} query={highlight} />
            </Link>
            <p className="truncate text-caption tabular-nums text-muted-foreground">
              {row.original.patientPhone ? (
                <Highlight text={row.original.patientPhone} query={highlight} />
              ) : (
                "Sem telefone"
              )}
            </p>
          </div>
        ),
      },
      {
        id: "encounter",
        header: "Atendimento",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p
              className={cn(
                "truncate",
                !row.original.procedureName && "text-muted-foreground",
              )}
            >
              {row.original.procedureName ?? "Sem agendamento"}
            </p>
            <p className="truncate text-caption text-muted-foreground">
              {row.original.templateName}
            </p>
          </div>
        ),
      },
    ];
    if (canSeeAll) {
      list.push({
        id: "professional",
        header: "Profissional",
        cell: ({ row }) => (
          <p className="truncate">{row.original.professionalName ?? "—"}</p>
        ),
      });
    }
    list.push(
      {
        id: "started",
        header: "Início",
        meta: { align: "center" },
        cell: ({ row }) => (
          <div className="tabular-nums">
            <p>{row.original.startedDate}</p>
            <p className="text-caption text-muted-foreground">
              {row.original.startedTime}
            </p>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        meta: { align: "center" },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "Ação",
        meta: { align: "center" },
        cell: ({ row }) => (
          <Button
            asChild
            size="sm"
            variant={row.original.status === "draft" ? "primary" : "secondary"}
            className="min-w-24"
          >
            <Link href={encounterHref(row.original.id)}>
              {row.original.status === "draft" ? "Continuar" : "Abrir"}
            </Link>
          </Button>
        ),
      },
    );
    return list;
  }, [canSeeAll, encounterHref, highlight]);

  function renderMobileRow(row: ProntuarioRow) {
    return (
      <article className="grid gap-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/pacientes/${row.patientId}`}
              className="block truncate font-semibold hover:text-primary"
            >
              <Highlight text={row.patientName} query={highlight} />
            </Link>
            <p className="mt-0.5 truncate text-caption tabular-nums text-muted-foreground">
              {row.patientPhone ? (
                <Highlight text={row.patientPhone} query={highlight} />
              ) : (
                "Sem telefone"
              )}
            </p>
          </div>
          <StatusBadge status={row.status} />
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-body-sm">
          <div className="min-w-0">
            <dt className="text-caption text-muted-foreground">Atendimento</dt>
            <dd className="mt-0.5 truncate font-medium">
              {row.procedureName ?? "Sem agendamento"}
            </dd>
            <dd className="truncate text-caption text-muted-foreground">
              {row.templateName}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Início</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {row.startedDate}
            </dd>
            <dd className="text-caption tabular-nums text-muted-foreground">
              {row.startedTime}
            </dd>
          </div>
          {canSeeAll ? (
            <div className="col-span-2 min-w-0">
              <dt className="text-caption text-muted-foreground">
                Profissional
              </dt>
              <dd className="mt-0.5 truncate font-medium">
                {row.professionalName ?? "Não informado"}
              </dd>
            </div>
          ) : null}
        </dl>

        <Button
          asChild
          size="sm"
          variant={row.status === "draft" ? "primary" : "secondary"}
          className="justify-self-end"
        >
          <Link href={encounterHref(row.id)}>
            {row.status === "draft"
              ? "Continuar atendimento"
              : "Abrir prontuário"}
          </Link>
        </Button>
      </article>
    );
  }

  const selectClassName = cn(
    "w-full 2xl:w-52 2xl:shrink-0",
    canSeeAll ? "sm:col-span-2" : "sm:col-span-3",
  );
  const searchPlaceholder = canSearchCpf
    ? "Buscar paciente por nome, CPF ou telefone"
    : "Buscar paciente por nome ou telefone";
  const statusMessage = typing
    ? searchActivity(typedQuery).message
    : pending
      ? (activity?.message ?? "Atualizando a lista")
      : resultSummary(pagination.total, filters);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4">
      <section
        aria-label="Filtros do prontuário"
        // Duas linhas alinhadas em telas médias; tudo numa linha só quando cabe.
        className="grid grid-cols-1 gap-3 sm:grid-cols-6 2xl:flex 2xl:items-center"
      >
        <div className="relative min-w-0 sm:col-span-4 2xl:flex-1">
          <span
            className="pointer-events-none absolute left-3 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center"
            aria-hidden="true"
          >
            {searching ? (
              <InlineSpinner />
            ) : (
              <Search className="size-4 text-muted-foreground" />
            )}
          </span>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter busca na hora, sem esperar a pausa na digitação.
              if (
                event.key === "Enter" &&
                typing &&
                typedQuery !== requestedQuery
              ) {
                event.preventDefault();
                navigate({ q: typedQuery || null }, searchActivity(typedQuery));
              }
              if (event.key === "Escape" && query) {
                event.preventDefault();
                clearSearch();
              }
            }}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
            aria-label={searchPlaceholder}
            aria-describedby="prontuario-status"
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={clearSearch}
              className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground active:translate-y-[-50%]"
              aria-label="Limpar busca"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <DateRangePickerInput
          className="w-full sm:col-span-2 2xl:w-60 2xl:shrink-0"
          fromName="de"
          toName="ate"
          value={range}
          weekStartsOn={0}
          onValueChange={(next) => {
            setRange(next);
            // "Limpar" no calendário não passa por "Concluir": o filtro sai já.
            if (!next.from && !next.to && (filters.from || filters.to)) {
              navigate(
                { de: null, ate: null },
                filterActivity("Removendo período"),
              );
            }
          }}
          onApply={(next) =>
            navigate(
              { de: next.from, ate: next.to },
              filterActivity("Aplicando período"),
            )
          }
        />
        {canSeeAll ? (
          <Select
            value={filters.professionalId || "all"}
            onValueChange={(value) =>
              navigate(
                { profissional: value },
                filterActivity("Filtrando por profissional"),
              )
            }
            aria-label="Filtrar por profissional"
            className={selectClassName}
            searchable={options.professionals.length > 8}
            searchPlaceholder="Buscar profissional"
          >
            <option value="all">Todos os profissionais</option>
            {options.professionals.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          value={filters.procedureId || "all"}
          onValueChange={(value) =>
            navigate({ tipo: value }, filterActivity("Filtrando por tipo"))
          }
          aria-label="Filtrar por tipo de atendimento"
          className={selectClassName}
          searchable={options.procedures.length > 8}
          searchPlaceholder="Buscar tipo de atendimento"
        >
          <option value="all">Todos os tipos</option>
          {options.procedures.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.templateId || "all"}
          onValueChange={(value) =>
            navigate({ ficha: value }, filterActivity("Filtrando por ficha"))
          }
          aria-label="Filtrar por ficha"
          className={selectClassName}
          searchable={options.templates.length > 8}
          searchPlaceholder="Buscar ficha"
        >
          <option value="all">Todas as fichas</option>
          {options.templates.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
      </section>

      {hasFilters ? (
        <ul
          aria-label="Filtros aplicados"
          className="-mt-1 flex flex-wrap items-center gap-2"
        >
          {activeFilters.map((filter) => (
            <li key={filter.key} className="animate-fade-in">
              <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-primary-muted-hover bg-primary-muted pl-2.5 pr-0.5 text-caption text-primary-hover">
                <span className="text-primary-hover/80">{filter.label}:</span>
                <span className="max-w-56 truncate font-semibold">
                  {filter.value}
                </span>
                <button
                  type="button"
                  onClick={filter.onRemove}
                  disabled={pending}
                  className="ml-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)] hover:bg-primary-muted-hover focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-50"
                  aria-label={`Remover filtro ${filter.label}: ${filter.value}`}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={clearFilters}
              disabled={pending}
              className="inline-flex h-7 items-center rounded-md px-2 text-caption font-medium text-muted-foreground underline-offset-4 transition-colors duration-[var(--motion-fast)] hover:text-foreground hover:underline disabled:opacity-50"
            >
              Limpar tudo
            </button>
          </li>
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div
          role="group"
          aria-label="Status do atendimento"
          className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted p-1 shadow-[var(--shadow-soft)]"
        >
          {statusTabs.map((tab) => {
            const active = filters.status === tab.value;
            const count = counts[tab.value];
            return (
              <button
                key={tab.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (!active) {
                    navigate(
                      { status: tab.value },
                      filterActivity(`Mostrando ${tab.label.toLowerCase()}`),
                    );
                  }
                }}
                className={cn(
                  "relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-body-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-border-strong bg-card text-foreground shadow-[var(--shadow-soft)]"
                    : "border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-caption tabular-nums leading-none",
                    tab.value === "draft" && count > 0
                      ? "bg-warning-muted text-warning-foreground"
                      : active
                        ? "bg-primary-muted text-primary"
                        : "bg-card text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Diz o que a lista está mostrando — ou o que está sendo buscado
            agora. Leitores de tela ouvem cada mudança. */}
        <p
          id="prontuario-status"
          role="status"
          aria-live="polite"
          className={cn(
            "flex min-h-5 min-w-0 items-center gap-2 text-body-sm",
            busy ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {busy ? <InlineSpinner /> : null}
          <span className="min-w-0 truncate">{statusMessage}</span>
        </p>
      </div>

      {error ? (
        <EmptyState
          className="rounded-lg border border-destructive-muted bg-card shadow-[var(--shadow-soft)]"
          icon={WarningCircle}
          title="Não foi possível carregar os atendimentos"
          description={error}
          actions={
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.refresh()}
            >
              Tentar novamente
            </Button>
          }
        />
      ) : counts.all === 0 && !hasFilters ? (
        <EmptyState
          className="rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]"
          icon={ClipboardText}
          title="Nenhum atendimento clínico ainda"
          description="Os atendimentos começam pela agenda ou pelo perfil do paciente e ficam guardados aqui, em andamento ou finalizados."
        />
      ) : (
        <div className="relative">
          {/* Barra fina no topo da tabela enquanto a lista nova chega; a
              lista atual esmaece para não parecer já ser o resultado. */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-px top-px z-10 h-0.5 overflow-hidden rounded-t-lg transition-opacity duration-[var(--motion-fast)]",
              pending ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="block h-full w-full animate-[shimmer_1.2s_linear_infinite] bg-gradient-to-r from-transparent via-primary to-transparent motion-reduce:animate-none motion-reduce:bg-primary/60" />
          </div>
          <div
            className={cn(
              "transition-opacity duration-[var(--motion-fast)] ease-[var(--ease-out)] motion-reduce:transition-none",
              busy && "opacity-55",
            )}
          >
            <DataTable
              ariaLabel="Atendimentos clínicos"
              columns={columns}
              data={rows}
              density="compact"
              enableSorting={false}
              emptyTitle={emptyTitle(filters)}
              emptyDescription={
                filters.query
                  ? canSearchCpf
                    ? "Confira a grafia do nome ou busque pelo telefone ou CPF, só com números."
                    : "Confira a grafia do nome ou busque pelo telefone, só com números."
                  : hasFilters
                    ? "Ajuste o período ou os filtros, ou limpe todos para ver a lista completa."
                    : "Troque o status acima para ver os outros atendimentos."
              }
              pageSize={pagination.pageSize}
              renderMobileRow={renderMobileRow}
              serverPagination={{
                ...pagination,
                pending,
                onPageChange: (page) =>
                  navigate(
                    { pagina: page > 1 ? String(page) : null },
                    { kind: "page", message: `Carregando a página ${page}` },
                  ),
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function InlineSpinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary motion-reduce:animate-none"
    />
  );
}

/**
 * Realça o trecho que casou com a busca. Nome: sem diferenciar maiúsculas e
 * acentos. Telefone: pelos dígitos, ignorando a máscara "(85) 99999-0000".
 */
function Highlight({ query, text }: { query: string; text: string }) {
  const range = matchRange(text, query);
  if (!range) return <>{text}</>;
  const [start, end] = range;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-[3px] bg-warning-muted px-px text-inherit">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function matchRange(text: string, query: string): [number, number] | null {
  const needle = query.trim();
  if (!needle) return null;

  if (/\p{L}/u.test(needle)) {
    const folded = foldChars(text);
    const index = folded.indexOf(foldChars(needle));
    return index >= 0 ? [index, index + needle.length] : null;
  }

  const digits = needle.replace(/\D/g, "");
  if (digits.length < 3) return null;
  const positions: number[] = [];
  let textDigits = "";
  for (let index = 0; index < text.length; index += 1) {
    if (/\d/.test(text[index])) {
      positions.push(index);
      textDigits += text[index];
    }
  }
  const index = textDigits.indexOf(digits);
  if (index < 0) return null;
  return [positions[index], positions[index + digits.length - 1] + 1];
}

/** Minúsculas e sem acento, um caractere por caractere (mantém as posições). */
function foldChars(value: string) {
  return value
    .split("")
    .map(
      (char) =>
        char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()[0] ?? char,
    )
    .join("");
}

function searchActivity(query: string): Activity {
  return {
    kind: "search",
    message: query ? `Buscando “${query}”…` : "Limpando a busca…",
  };
}

function filterActivity(message: string): Activity {
  return { kind: "filter", message: `${message}…` };
}

function resultSummary(total: number, filters: ProntuarioFilters) {
  const noun = total === 1 ? "atendimento" : "atendimentos";
  const status =
    filters.status === "draft"
      ? " em andamento"
      : filters.status === "finalized"
        ? total === 1
          ? " finalizado"
          : " finalizados"
        : "";
  const count = total === 0 ? "Nenhum atendimento" : `${total} ${noun}`;
  return (
    <>
      <strong className="font-semibold text-foreground">
        {count}
        {status}
      </strong>
      {filters.query ? <> para “{filters.query}”</> : null}
    </>
  );
}

function formatRange(from: string, to: string) {
  const format = (value: string) => value.split("-").reverse().join("/");
  if (from && to) {
    return from === to ? format(from) : `${format(from)} – ${format(to)}`;
  }
  return from ? `A partir de ${format(from)}` : `Até ${format(to)}`;
}

function StatusBadge({ status }: { status: ProntuarioRow["status"] }) {
  return (
    <Badge variant={status === "draft" ? "warning" : "success"}>
      {status === "draft" ? "Em andamento" : "Finalizado"}
    </Badge>
  );
}

function emptyTitle(filters: ProntuarioFilters) {
  if (filters.query) return `Nenhum atendimento para “${filters.query}”`;
  if (
    filters.from ||
    filters.to ||
    filters.professionalId ||
    filters.templateId ||
    filters.procedureId
  ) {
    return "Nenhum atendimento com esses filtros";
  }
  if (filters.status === "draft") return "Nenhum atendimento em andamento";
  if (filters.status === "finalized") return "Nenhum atendimento finalizado";
  return "Nenhum atendimento encontrado";
}
