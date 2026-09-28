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
  Archive,
  ArrowSquareOut as ExternalLink,
  FileText,
  Plus,
  ArrowCounterClockwise as RotateCcw,
  MagnifyingGlass as Search,
  UsersThree as UsersRound,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { setPatientArchived } from "./actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { PatientCompletenessRing } from "@/components/patients/patient-completeness-ring";
import { cn } from "@/lib/utils";
import { formatPhoneBR } from "@/lib/validation/br";

export type PatientTagOption = { id: string; name: string; color: string };

export type PatientListRow = {
  id: string;
  full_name: string;
  social_name: string | null;
  birth_date: string | null;
  sex_at_birth: string | null;
  cpf?: string | null;
  rg?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  preferred_contact: string;
  allow_whatsapp: boolean;
  allow_email: boolean;
  status: string;
  source: string | null;
  photo_path: string | null;
  /** URL assinada da foto (o bucket é privado); null cai nas iniciais. */
  photoUrl: string | null;
  deceased_at: string | null;
  deleted_at: string | null;
  created_at: string;
  tagIds: string[];
  completenessAvailable: boolean;
  completenessMissing: string[];
  completenessPercentage: number;
  lastEncounterId: string | null;
  lastEncounterAt: string | null;
  lastEncounterStatus: string | null;
  lastProfessionalName: string | null;
  lastInsuranceName: string | null;
};

export function PatientsTable({
  patients,
  tags,
  error,
  canCreate,
  canArchive,
  canSeeSensitive,
  canViewClinicalRecords,
  filters,
  pagination,
}: {
  patients: PatientListRow[];
  tags: PatientTagOption[];
  error?: string;
  canCreate: boolean;
  canArchive: boolean;
  canSeeSensitive: boolean;
  canViewClinicalRecords: boolean;
  filters: {
    query: string;
    sort: "name" | "newest" | "oldest";
    status: "active" | "archived" | "deceased" | "all";
    tagId: string;
  };
  pagination: { page: number; pageSize: number; total: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.query);
  // A busca aplicada vem da URL. Se ela mudar por fora (voltar do navegador),
  // o campo acompanha; a resposta de uma busca pedida daqui não mexe no
  // campo, para não atropelar o que a pessoa continuou digitando.
  const [querySource, setQuerySource] = useState(filters.query);
  const [requestedQuery, setRequestedQuery] = useState(filters.query);
  if (querySource !== filters.query) {
    setQuerySource(filters.query);
    if (filters.query !== requestedQuery) {
      setQuery(filters.query);
      setRequestedQuery(filters.query);
    }
  }
  const tagById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags],
  );

  const navigate = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (!value || value === "all" || (key === "sort" && value === "name")) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      });
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const typedQuery = query.trim();
  // Entre a última tecla e a resposta do servidor a busca já "está
  // acontecendo": o retorno visual começa na hora, não depois do debounce.
  const typing = typedQuery !== filters.query;
  const searching = typing || (pending && typedQuery === filters.query);
  const busy = typing || pending;

  useEffect(() => {
    if (!typing || typedQuery === requestedQuery) return;
    const timeout = window.setTimeout(() => {
      setRequestedQuery(typedQuery);
      navigate({ page: null, q: typedQuery || null });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [navigate, requestedQuery, typedQuery, typing]);

  function clearSearch() {
    setQuery("");
    if (filters.query) {
      setRequestedQuery("");
      navigate({ page: null, q: null });
    }
  }

  const columns = useMemo<ColumnDef<PatientListRow>[]>(
    () => [
      {
        accessorFn: (patient) => patient.social_name || patient.full_name,
        header: "Paciente",
        cell: ({ row }) => {
          const patient = row.original;
          const visibleTags = patient.tagIds
            .map((id) => tagById.get(id))
            .filter((tag): tag is PatientTagOption => Boolean(tag))
            .slice(0, 2);
          const remainingTags = Math.max(0, patient.tagIds.length - 2);

          const displayName = patient.social_name || patient.full_name;

          return (
            <div className="flex min-w-0 items-center gap-3">
              <PatientListAvatar patient={patient} size="sm" />
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link
                    href={`/pacientes/${patient.id}`}
                    className="block truncate text-body font-medium text-foreground hover:text-primary"
                  >
                    <Highlight text={displayName} query={filters.query} />
                  </Link>
                  {patient.deceased_at ? (
                    <Badge
                      variant="destructive"
                      className="h-5 px-1.5 text-caption"
                    >
                      Óbito
                    </Badge>
                  ) : patient.deleted_at ? (
                    // No filtro "Todos" o arquivado aparecia sem selo no
                    // desktop (o celular já mostrava).
                    <Badge
                      variant="neutral"
                      className="h-5 px-1.5 text-caption"
                    >
                      Arquivado
                    </Badge>
                  ) : patient.status !== "active" ? (
                    <Badge
                      variant="neutral"
                      className="h-5 px-1.5 text-caption"
                    >
                      Inativo
                    </Badge>
                  ) : null}
                </div>
                {patient.social_name ? (
                  <p className="truncate text-caption text-muted-foreground">
                    {patient.full_name}
                  </p>
                ) : null}
                {visibleTags.length ? (
                  // Uma linha só: as tags encolhem (reticências) em vez de quebrar e aumentar a linha.
                  <div className="mt-0.5 flex min-w-0 items-center gap-1">
                    {visibleTags.map((tag) => (
                      <span
                        key={tag.id}
                        title={tag.name}
                        className="inline-flex h-5 min-w-0 max-w-24 items-center rounded-full border px-1.5 text-caption font-medium leading-none"
                        style={{
                          borderColor: `${tag.color}55`,
                          color: tag.color,
                          backgroundColor: `${tag.color}0D`,
                        }}
                      >
                        <span className="truncate">{tag.name}</span>
                      </span>
                    ))}
                    {remainingTags > 0 ? (
                      <span
                        title={hiddenTagNames(patient.tagIds, tagById)}
                        className="inline-flex h-5 shrink-0 items-center rounded-full bg-muted px-1.5 text-caption font-medium leading-none text-muted-foreground"
                      >
                        +{remainingTags}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        accessorFn: (patient) => patient.phone ?? patient.whatsapp ?? "",
        header: "Telefone",
        meta: { align: "center" },
        cell: ({ row }) => {
          const patient = row.original;
          const phone = patient.phone || patient.whatsapp;

          return (
            <p className="min-w-0 truncate">
              {phone ? (
                <Highlight text={formatPhoneBR(phone)} query={filters.query} />
              ) : (
                "Sem telefone"
              )}
            </p>
          );
        },
      },
      {
        accessorKey: "birth_date",
        header: "Nascimento",
        meta: { align: "center" },
        cell: ({ row }) =>
          row.original.birth_date ? (
            <div>
              <p>{formatDate(row.original.birth_date)}</p>
              <p className="text-caption text-muted-foreground">
                {row.original.deceased_at
                  ? `Falecido aos ${calculateAge(
                      row.original.birth_date,
                      row.original.deceased_at,
                    )} anos`
                  : `${calculateAge(row.original.birth_date)} anos`}
              </p>
            </div>
          ) : (
            "—"
          ),
      },
      {
        accessorFn: (patient) => insuranceLabel(patient),
        header: "Convênio",
        meta: { align: "center" },
        cell: ({ row }) => insuranceLabel(row.original),
      },
      {
        accessorFn: (patient) => patient.lastEncounterAt ?? "",
        header: "Último atendimento",
        meta: { align: "center" },
        cell: ({ row }) => {
          const patient = row.original;

          return (
            <div className="grid justify-items-center gap-0.5">
              <div className="flex items-center justify-center gap-2">
                <span>
                  {patient.lastEncounterAt
                    ? formatDate(patient.lastEncounterAt)
                    : "—"}
                </span>
                {patient.lastEncounterStatus ? (
                  <Badge
                    variant={
                      patient.lastEncounterStatus === "finalized"
                        ? "success"
                        : "warning"
                    }
                  >
                    {patient.lastEncounterStatus === "finalized"
                      ? "Finalizado"
                      : "Rascunho"}
                  </Badge>
                ) : null}
              </div>
              {patient.lastProfessionalName ? (
                <span className="max-w-full truncate text-caption text-muted-foreground">
                  {patient.lastProfessionalName}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Ações",
        enableSorting: false,
        cell: ({ row }) => {
          const patient = row.original;
          const archived = Boolean(patient.deleted_at);

          return (
            <div className="flex justify-center gap-1">
              {/* Só ícone: o title dá nome à ação para quem usa o mouse. */}
              <Button
                asChild
                size="icon"
                variant="ghost"
                className="size-8 border border-border bg-card text-primary hover:border-primary hover:bg-primary-muted hover:text-primary"
                aria-label="Abrir paciente"
                title="Abrir paciente"
              >
                <Link href={`/pacientes/${patient.id}`}>
                  <ExternalLink className="size-4" aria-hidden />
                </Link>
              </Button>
              {canViewClinicalRecords && patient.lastEncounterId ? (
                <Button
                  asChild
                  size="icon"
                  variant="ghost"
                  className="size-8 border border-border bg-card text-primary hover:border-primary hover:bg-primary-muted hover:text-primary"
                  aria-label="Abrir último atendimento"
                  title="Abrir último atendimento"
                >
                  <Link
                    href={`/prontuario/${patient.lastEncounterId}?from=pacientes`}
                  >
                    <FileText className="size-4" aria-hidden />
                  </Link>
                </Button>
              ) : null}
              {canArchive ? (
                <PatientArchiveButton
                  patient={patient}
                  archived={archived}
                  compact
                />
              ) : null}
            </div>
          );
        },
      },
    ],
    [canArchive, canViewClinicalRecords, filters.query, tagById],
  );

  function renderMobilePatient(patient: PatientListRow) {
    const displayName = patient.social_name || patient.full_name;
    const archived = Boolean(patient.deleted_at);
    const visibleTags = patient.tagIds
      .map((id) => tagById.get(id))
      .filter((tag): tag is PatientTagOption => Boolean(tag))
      .slice(0, 2);
    const remainingTags = Math.max(0, patient.tagIds.length - 2);

    return (
      <article className="grid gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PatientListAvatar patient={patient} size="md" />
          <div className="min-w-0 flex-1">
            <Link
              href={`/pacientes/${patient.id}`}
              className="block truncate font-semibold hover:text-primary"
            >
              <Highlight text={displayName} query={filters.query} />
            </Link>
            <p className="truncate text-caption text-muted-foreground">
              {patient.phone || patient.whatsapp ? (
                <Highlight
                  text={formatPhoneBR(patient.phone || patient.whatsapp || "")}
                  query={filters.query}
                />
              ) : (
                "Sem telefone"
              )}
            </p>
          </div>
          {patient.deceased_at ? (
            <Badge variant="destructive">Óbito</Badge>
          ) : archived ? (
            <Badge variant="neutral">Arquivado</Badge>
          ) : patient.status !== "active" ? (
            <Badge variant="neutral">Inativo</Badge>
          ) : null}
        </div>
        {visibleTags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleTags.map((tag) => (
              <span
                key={tag.id}
                title={tag.name}
                className="inline-flex h-5 max-w-28 items-center rounded-full border px-1.5 text-caption font-medium"
                style={{
                  borderColor: `${tag.color}55`,
                  color: tag.color,
                  backgroundColor: `${tag.color}0D`,
                }}
              >
                <span className="truncate">{tag.name}</span>
              </span>
            ))}
            {remainingTags > 0 ? (
              <span
                title={hiddenTagNames(patient.tagIds, tagById)}
                className="inline-flex h-5 items-center rounded-full bg-muted px-1.5 text-caption font-medium leading-none text-muted-foreground"
              >
                +{remainingTags}
              </span>
            ) : null}
          </div>
        ) : null}
        <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-body">
          <div>
            <dt className="text-caption text-muted-foreground">Nascimento</dt>
            <dd className="mt-0.5 font-medium">
              {patient.birth_date ? formatDate(patient.birth_date) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">
              Último atendimento
            </dt>
            <dd className="mt-0.5 font-medium">
              {patient.lastEncounterAt
                ? formatDate(patient.lastEncounterAt)
                : "—"}
            </dd>
          </div>
        </dl>
        <div className="flex justify-end gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/pacientes/${patient.id}`}>Abrir paciente</Link>
          </Button>
          {canArchive ? (
            <PatientArchiveButton patient={patient} archived={archived} />
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <div className="grid gap-4" aria-busy={pending}>
      <section className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[min(100%,18rem)] flex-1 basis-72">
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
              if (event.key === "Escape" && query) {
                event.preventDefault();
                clearSearch();
              }
            }}
            placeholder={
              canSeeSensitive
                ? "Buscar por nome, CPF, telefone ou e-mail"
                : "Buscar por nome, telefone ou e-mail"
            }
            className="w-full pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
            aria-label="Buscar pacientes"
            aria-describedby="pacientes-status"
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
        <Select
          value={filters.status}
          onValueChange={(value) => {
            const next = value as typeof filters.status;
            navigate({ page: null, status: next });
          }}
          aria-label="Filtrar por status"
          className="sm:w-36 sm:shrink-0"
        >
          <option value="active">Ativos</option>
          <option value="deceased">Óbito</option>
          <option value="archived">Arquivados</option>
          <option value="all">Todos</option>
        </Select>
        <Select
          value={filters.tagId}
          onValueChange={(value) => {
            navigate({ page: null, tag: value });
          }}
          aria-label="Filtrar por tag"
          className="sm:w-44 sm:shrink-0"
        >
          <option value="all">Todas as tags</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>
        <Select
          value={filters.sort}
          onValueChange={(value) => {
            const next = value as typeof filters.sort;
            navigate({ page: null, sort: next });
          }}
          aria-label="Ordenar pacientes"
          className="sm:w-44 sm:shrink-0"
        >
          <option value="name">Nome A–Z</option>
          <option value="newest">Mais recentes</option>
          <option value="oldest">Mais antigos</option>
        </Select>
        {canCreate ? (
          <Button asChild className="h-10 shrink-0">
            <Link href="/pacientes/novo">
              <Plus className="size-4" aria-hidden="true" /> Novo paciente
            </Link>
          </Button>
        ) : null}
      </section>

      {/* Diz o que a lista está mostrando — ou o que está sendo buscado
          agora. Leitores de tela ouvem cada mudança. */}
      <p
        id="pacientes-status"
        role="status"
        aria-live="polite"
        className={cn(
          "-mt-1 flex min-h-5 min-w-0 items-center gap-2 text-body-sm",
          busy ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {busy ? <InlineSpinner /> : null}
        <span className="min-w-0 truncate">
          {typing
            ? searchStatusMessage(typedQuery)
            : pending
              ? "Atualizando a lista…"
              : resultSummary(pagination.total, filters.query)}
        </span>
      </p>

      {error ? (
        <EmptyState
          className="rounded-lg border border-destructive-muted bg-card shadow-[var(--shadow-soft)]"
          icon={WarningCircle}
          title="Não foi possível carregar os pacientes"
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
      ) : patients.length ||
        filters.query ||
        filters.status !== "active" ||
        filters.tagId !== "all" ? (
        <DataTable
          ariaLabel="Pacientes da clínica"
          columns={columns}
          data={patients}
          density="compact"
          enableSorting={false}
          emptyTitle="Nenhum paciente encontrado"
          emptyDescription="Ajuste a busca ou os filtros."
          pageSize={pagination.pageSize}
          renderMobileRow={renderMobilePatient}
          serverPagination={{
            ...pagination,
            pending,
            onPageChange: (page) => navigate({ page: String(page) }),
          }}
        />
      ) : (
        <EmptyState
          className="rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]"
          icon={UsersRound}
          title="Nenhum paciente cadastrado"
          description={
            canCreate
              ? "Cadastre o primeiro paciente para usar Agenda, Conversas e prontuário."
              : "Os pacientes cadastrados pela clínica aparecerão aqui."
          }
          actions={
            canCreate ? (
              <Button asChild>
                <Link href="/pacientes/novo">
                  <Plus className="size-4" aria-hidden="true" /> Novo paciente
                </Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

function PatientListAvatar({
  patient,
  size,
}: {
  patient: PatientListRow;
  size: "sm" | "md";
}) {
  const displayName = patient.social_name || patient.full_name;
  const avatar = (
    <Avatar name={displayName} photoUrl={patient.photoUrl} size={size} />
  );

  if (patient.completenessAvailable || patient.deceased_at) {
    return (
      <PatientCompletenessRing
        percentage={patient.completenessPercentage}
        missing={patient.completenessMissing}
        deceased={Boolean(patient.deceased_at)}
      >
        {avatar}
      </PatientCompletenessRing>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 rounded-full border-[3px] border-border bg-card p-0.5"
      title="Completude disponível para perfis com acesso aos dados cadastrais"
    >
      {avatar}
    </span>
  );
}

function PatientArchiveButton({
  archived,
  compact = false,
  patient,
}: {
  archived: boolean;
  compact?: boolean;
  patient: PatientListRow;
}) {
  const [confirming, setConfirming] = useState(false);
  const patientName = patient.social_name || patient.full_name;

  if (archived) {
    return (
      <form action={setPatientArchived.bind(null, patient.id, false)}>
        <Button
          type="submit"
          size={compact ? "icon" : "sm"}
          variant="ghost"
          className={
            compact
              ? "size-8 border border-border bg-card text-primary hover:border-primary hover:bg-primary-muted hover:text-primary"
              : undefined
          }
          aria-label={compact ? "Restaurar paciente" : undefined}
          title={compact ? "Restaurar paciente" : undefined}
        >
          {compact ? (
            <RotateCcw className="size-4" aria-hidden="true" />
          ) : (
            "Restaurar"
          )}
        </Button>
      </form>
    );
  }

  return (
    <>
      <Button
        type="button"
        size={compact ? "icon" : "sm"}
        // No celular (sem ícone) segue o vermelho do botão do desktop.
        variant={compact ? "ghost" : "destructive-ghost"}
        className={
          compact
            ? "size-8 border border-border bg-card text-destructive hover:border-destructive hover:bg-destructive-muted hover:text-destructive"
            : undefined
        }
        aria-label={compact ? "Arquivar paciente" : undefined}
        title={compact ? "Arquivar paciente" : undefined}
        onClick={() => setConfirming(true)}
      >
        {compact ? (
          <Archive className="size-4" aria-hidden="true" />
        ) : (
          "Arquivar"
        )}
      </Button>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Arquivar paciente?"
        description={`${patientName} deixará de aparecer nas listas e buscas ativas. O histórico será preservado e poderá ser restaurado depois.`}
        confirmLabel="Arquivar paciente"
        pendingLabel="Arquivando..."
        destructive
        onConfirm={() => setPatientArchived(patient.id, true)}
      />
    </>
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

function searchStatusMessage(query: string) {
  return query ? `Buscando “${query}”…` : "Limpando a busca…";
}

function resultSummary(total: number, query: string) {
  const noun = total === 1 ? "paciente" : "pacientes";
  const count = total === 0 ? "Nenhum paciente" : `${total} ${noun}`;
  return query ? `${count} para “${query}”` : count;
}

// A coluna mostra o convênio do último atendimento. Sem atendimento não há o
// que mostrar — "Particular" ali afirmava algo que o sistema não sabe. Com
// atendimento e sem convênio, o rótulo é o mesmo do painel e da agenda.
function insuranceLabel(patient: PatientListRow) {
  if (!patient.lastEncounterId) return "—";
  return patient.lastInsuranceName ?? "Sem convênio";
}

function hiddenTagNames(
  tagIds: string[],
  tagById: Map<string, PatientTagOption>,
) {
  return tagIds
    .slice(2)
    .map((id) => tagById.get(id)?.name)
    .filter(Boolean)
    .join(", ");
}

function formatDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function calculateAge(value: string, referenceDate?: string) {
  const birthDate = new Date(`${value}T00:00:00`);
  const today = referenceDate
    ? new Date(`${referenceDate}T00:00:00`)
    : new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hadBirthday =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate());

  if (!hadBirthday) age -= 1;
  return age;
}
