"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
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
}: {
  patients: PatientListRow[];
  tags: PatientTagOption[];
  error?: string;
  canCreate: boolean;
  canArchive: boolean;
  canSeeSensitive: boolean;
  canViewClinicalRecords: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [tagId, setTagId] = useState("all");
  const tagById = useMemo(
    () => new Map(tags.map((tag) => [tag.id, tag])),
    [tags],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase().replace(/\D/g, "");
    const rawTerm = query.trim().toLowerCase();

    return patients.filter((patient) => {
      const archived = Boolean(patient.deleted_at);
      if (status === "active" && archived) return false;
      if (status === "archived" && !archived) return false;
      if (tagId !== "all" && !patient.tagIds.includes(tagId)) return false;
      if (!rawTerm) return true;

      const textMatch = [
        patient.full_name,
        patient.social_name ?? "",
        patient.email ?? "",
        patient.source ?? "",
        patient.id,
        patient.lastProfessionalName ?? "",
        patient.lastInsuranceName ?? "",
        ...patient.tagIds.map((id) => tagById.get(id)?.name ?? ""),
      ]
        .join(" ")
        .toLowerCase()
        .includes(rawTerm);
      const digitMatch = term
        ? [patient.cpf ?? "", patient.phone ?? "", patient.whatsapp ?? ""]
            .join(" ")
            .includes(term)
        : false;
      return textMatch || digitMatch;
    });
  }, [patients, query, status, tagById, tagId]);

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
                  <Link href={`/prontuario/${patient.lastEncounterId}`}>
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

  return (
    <div className="grid gap-4">
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
          value={status}
          onValueChange={setStatus}
          aria-label="Filtrar status"
          className="lg:w-44"
        >
          <option value="active">Ativos</option>
          <option value="archived">Arquivados</option>
          <option value="all">Todos</option>
        </Select>
        <Select
          value={tagId}
          onValueChange={setTagId}
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
      ) : patients.length ? (
        <DataTable
          columns={columns}
          data={filtered}
          emptyTitle="Nenhum paciente encontrado"
          emptyDescription="Ajuste a busca ou os filtros."
          pageSize={12}
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
