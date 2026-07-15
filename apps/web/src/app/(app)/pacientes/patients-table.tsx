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
  ExternalLink,
  FileText,
  Plus,
  RotateCcw,
  Search,
  UsersRound,
} from "lucide-react";
import { setPatientArchived } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input, Select } from "@/components/ui/field";
import { initialsFromName } from "@/lib/utils";
import { formatPhoneBR } from "@/lib/validation/br";

export type PatientTagOption = { id: string; name: string; color: string };

export type PatientListRow = {
  id: string;
  full_name: string;
  social_name: string | null;
  birth_date: string | null;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  status: string;
  source: string | null;
  deleted_at: string | null;
  created_at: string;
  tagIds: string[];
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
    status: "active" | "archived" | "all";
    tagId: string;
  };
  pagination: { page: number; pageSize: number; total: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.query);
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

  useEffect(() => {
    if (query.trim() === filters.query) return;
    const timeout = window.setTimeout(() => {
      navigate({ page: null, q: query.trim() || null });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [filters.query, navigate, query]);

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
            .slice(0, 4);
          const remainingTags = Math.max(0, patient.tagIds.length - 4);

          const displayName = patient.social_name || patient.full_name;

          return (
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-muted text-xs font-semibold text-primary">
                {initialsFromName(displayName)}
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1">
                  {visibleTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex h-5 max-w-20 items-center rounded px-1.5 text-caption font-semibold uppercase leading-none text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      <span className="truncate">{tag.name}</span>
                    </span>
                  ))}
                  {remainingTags > 0 ? (
                    <span className="inline-flex h-5 items-center rounded bg-muted px-1.5 text-caption font-semibold leading-none text-muted-foreground">
                      +{remainingTags}
                    </span>
                  ) : null}
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-caption uppercase text-muted-foreground">
                    #{patient.id.slice(0, 8)}
                  </span>
                  <Link
                    href={`/pacientes/${patient.id}`}
                    className="block truncate text-sm font-semibold hover:text-primary"
                  >
                    {displayName}
                  </Link>
                </div>
                {patient.social_name ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {patient.full_name}
                  </p>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        accessorFn: (patient) => patient.phone ?? patient.whatsapp ?? "",
        header: "Telefone",
        cell: ({ row }) => {
          const patient = row.original;
          const phone = patient.phone || patient.whatsapp;

          return (
            <p className="min-w-0 truncate">
              {phone ? formatPhoneBR(phone) : "Sem telefone"}
            </p>
          );
        },
      },
      {
        accessorKey: "birth_date",
        header: "Nascimento",
        cell: ({ row }) =>
          row.original.birth_date ? (
            <div>
              <p>{formatDate(row.original.birth_date)}</p>
              <p className="text-xs text-muted-foreground">
                {calculateAge(row.original.birth_date)} anos
              </p>
            </div>
          ) : (
            "---"
          ),
      },
      {
        accessorFn: (patient) => patient.lastInsuranceName ?? "Particular",
        header: "Convênio",
        cell: ({ row }) => row.original.lastInsuranceName ?? "Particular",
      },
      {
        accessorFn: (patient) => patient.lastEncounterAt ?? "",
        header: "Último atendimento",
        cell: ({ row }) => {
          const patient = row.original;

          return (
            <div className="grid gap-1">
              <div className="flex items-center gap-2">
                <span>
                  {patient.lastEncounterAt
                    ? formatDate(patient.lastEncounterAt)
                    : "---"}
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
                <span className="truncate text-xs text-muted-foreground">
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
            <div className="flex justify-end gap-1">
              <Button
                asChild
                size="icon"
                variant="ghost"
                aria-label="Abrir paciente"
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
                  aria-label="Abrir atendimento"
                >
                  <Link
                    href={`/prontuario/${patient.lastEncounterId}?from=pacientes`}
                  >
                    <FileText className="size-4" aria-hidden />
                  </Link>
                </Button>
              ) : null}
              {canArchive ? (
                <form
                  action={setPatientArchived.bind(null, patient.id, !archived)}
                >
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    aria-label={
                      archived ? "Restaurar paciente" : "Arquivar paciente"
                    }
                  >
                    {archived ? (
                      <RotateCcw className="size-4" />
                    ) : (
                      <Archive className="size-4" />
                    )}
                  </Button>
                </form>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canArchive, canViewClinicalRecords, tagById],
  );

  function renderMobilePatient(patient: PatientListRow) {
    const displayName = patient.social_name || patient.full_name;
    const archived = Boolean(patient.deleted_at);
    const visibleTags = patient.tagIds
      .map((id) => tagById.get(id))
      .filter((tag): tag is PatientTagOption => Boolean(tag))
      .slice(0, 3);

    return (
      <article className="grid gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-muted text-xs font-semibold text-primary">
            {initialsFromName(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <Link
              href={`/pacientes/${patient.id}`}
              className="block truncate font-semibold hover:text-primary"
            >
              {displayName}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {patient.phone || patient.whatsapp
                ? formatPhoneBR(patient.phone || patient.whatsapp || "")
                : "Sem telefone"}
            </p>
          </div>
          {archived ? <Badge variant="neutral">Arquivado</Badge> : null}
        </div>
        {visibleTags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex h-5 max-w-28 items-center rounded px-1.5 text-caption font-semibold uppercase text-white"
                style={{ backgroundColor: tag.color }}
              >
                <span className="truncate">{tag.name}</span>
              </span>
            ))}
          </div>
        ) : null}
        <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Nascimento</dt>
            <dd className="mt-0.5 font-medium">
              {patient.birth_date ? formatDate(patient.birth_date) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Último atendimento</dt>
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
            <form action={setPatientArchived.bind(null, patient.id, !archived)}>
              <Button type="submit" size="sm" variant="ghost">
                {archived ? "Restaurar" : "Arquivar"}
              </Button>
            </form>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <div className="grid gap-4" aria-busy={pending}>
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              canSeeSensitive
                ? "Buscar por nome, código, CPF, telefone ou e-mail"
                : "Buscar por nome, código, telefone ou e-mail"
            }
            className="w-full pl-9"
            aria-label="Buscar pacientes"
          />
        </div>
        <Select
          value={filters.status}
          onValueChange={(value) => {
            const next = value as typeof filters.status;
            navigate({ page: null, status: next });
          }}
          aria-label="Filtrar status"
          className="lg:w-44"
        >
          <option value="active">Ativos</option>
          <option value="archived">Arquivados</option>
          <option value="all">Todos</option>
        </Select>
        <Select
          value={filters.tagId}
          onValueChange={(value) => {
            navigate({ page: null, tag: value });
          }}
          aria-label="Filtrar tag"
          className="lg:w-48"
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
          className="lg:w-44"
        >
          <option value="name">Nome A–Z</option>
          <option value="newest">Mais recentes</option>
          <option value="oldest">Mais antigos</option>
        </Select>
        {canCreate ? (
          <Button asChild>
            <Link href="/pacientes/novo">
              <Plus className="size-4" aria-hidden="true" /> Novo paciente
            </Link>
          </Button>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-lg border border-border bg-card px-5 py-8 text-sm text-destructive">
          {error}
        </div>
      ) : patients.length ||
        filters.query ||
        filters.status !== "active" ||
        filters.tagId !== "all" ? (
        <DataTable
          columns={columns}
          data={patients}
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
        <div className="rounded-lg border border-border bg-card px-5 py-12 text-center shadow-[var(--shadow-soft)]">
          <UsersRound
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-medium">Nenhum paciente cadastrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre o primeiro paciente ou carregue os dados demonstrativos.
          </p>
        </div>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function calculateAge(value: string) {
  const birthDate = new Date(`${value}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hadBirthday =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate());

  if (!hadBirthday) age -= 1;
  return age;
}
