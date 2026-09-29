"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowSquareOut as ExternalLink,
  MagnifyingGlass as Search,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input, Select } from "@/components/ui/field";
import { formatPhoneBR } from "@/lib/validation/br";

export type MedicalRecordRow = {
  id: string;
  full_name: string;
  social_name: string | null;
  birth_date: string | null;
  cpf: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  lastEncounterId: string | null;
  lastEncounterAt: string | null;
  lastEncounterStatus: string | null;
  lastProfessionalId: string | null;
  lastProfessionalName: string | null;
  lastInsuranceName: string | null;
};

export type ProfessionalFilterOption = {
  id: string;
  name: string;
};

export function RecordsList({
  rows,
  professionals,
  canCreatePatient,
}: {
  rows: MedicalRecordRow[];
  professionals: ProfessionalFilterOption[];
  canCreatePatient: boolean;
}) {
  const [query, setQuery] = useState("");
  const [professionalId, setProfessionalId] = useState("all");
  const normalizedQuery = query.trim().toLowerCase();
  const queryDigits = normalizedQuery.replace(/\D/g, "");

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (
          professionalId !== "all" &&
          row.lastProfessionalId !== professionalId
        ) {
          return false;
        }

        if (!normalizedQuery) return true;

        const textMatch = [
          row.full_name,
          row.social_name ?? "",
          row.email ?? "",
          row.id,
          row.lastProfessionalName ?? "",
          row.lastInsuranceName ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
        const digitMatch = queryDigits
          ? [row.cpf ?? "", row.phone ?? "", row.whatsapp ?? "", row.id]
              .join(" ")
              .replace(/\D/g, "")
              .includes(queryDigits)
          : false;

        return textMatch || digitMatch;
      }),
    [normalizedQuery, professionalId, queryDigits, rows],
  );

  const columns = useMemo<ColumnDef<MedicalRecordRow>[]>(
    () => [
      {
        accessorFn: (row) => row.social_name || row.full_name,
        header: "Nome",
        cell: ({ row }) => {
          const record = row.original;
          const name = record.social_name || record.full_name;
          return (
            <div className="min-w-0">
              <Link
                href={`/pacientes/${record.id}`}
                className="font-medium text-primary hover:underline"
              >
                {name}
              </Link>
              {record.social_name ? (
                <p className="mt-0.5 text-caption text-muted-foreground">
                  {record.full_name}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorFn: (row) => row.phone ?? row.whatsapp ?? "",
        header: "Telefone",
        cell: ({ row }) => {
          const record = row.original;
          return record.phone || record.whatsapp
            ? formatPhoneBR(record.phone ?? record.whatsapp ?? "")
            : "Não informado";
        },
      },
      {
        accessorFn: (row) => row.id.slice(0, 8),
        header: "Código",
        cell: ({ row }) => (
          <span className="font-mono text-caption uppercase">
            {row.original.id.slice(0, 8)}
          </span>
        ),
      },
      {
        accessorFn: (row) => row.lastEncounterAt ?? "",
        header: "Último atendimento",
        cell: ({ row }) => {
          const record = row.original;
          return (
            <div className="flex flex-col gap-1">
              <span>
                {record.lastEncounterAt
                  ? formatDate(record.lastEncounterAt)
                  : "---"}
              </span>
              {record.lastEncounterId ? (
                <Link
                  href={`/prontuario/${record.lastEncounterId}`}
                  className="w-fit text-caption font-medium text-primary hover:underline"
                >
                  Ver atendimento
                </Link>
              ) : null}
              {record.lastEncounterStatus ? (
                <Badge
                  variant={
                    record.lastEncounterStatus === "finalized"
                      ? "success"
                      : "warning"
                  }
                  className="w-fit"
                >
                  {record.lastEncounterStatus === "finalized"
                    ? "Finalizado"
                    : "Rascunho"}
                </Badge>
              ) : null}
            </div>
          );
        },
      },
      {
        accessorKey: "birth_date",
        header: "Nascimento",
        cell: ({ row }) =>
          row.original.birth_date ? formatDate(row.original.birth_date) : "---",
      },
      {
        accessorFn: (row) => row.lastInsuranceName ?? "Particular",
        header: "Convênio",
      },
      {
        id: "actions",
        header: "Ação",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Button asChild size="sm" variant="secondary">
              <Link href={`/pacientes/${row.original.id}`}>
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Abrir
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem_auto] lg:items-center">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Digite nome, codigo, telefone, e-mail ou CPF..."
            className="w-full pl-9"
            aria-label="Buscar prontuarios"
          />
        </div>
        <Select
          value={professionalId}
          onValueChange={setProfessionalId}
          aria-label="Filtrar profissional"
        >
          <option value="all">Todos os profissionais</option>
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.name}
            </option>
          ))}
        </Select>
        {canCreatePatient ? (
          <Button asChild className="h-10">
            <Link href="/pacientes/novo">Novo paciente</Link>
          </Button>
        ) : null}
      </section>

      <DataTable
        ariaLabel="Prontuários dos pacientes"
        columns={columns}
        data={filtered}
        emptyTitle="Nenhum prontuário encontrado"
        emptyDescription="Ajuste a busca ou o filtro de profissional."
        pageSize={12}
        renderMobileRow={(record) => (
          <MedicalRecordMobileCard record={record} />
        )}
      />
    </div>
  );
}

function MedicalRecordMobileCard({ record }: { record: MedicalRecordRow }) {
  const name = record.social_name || record.full_name;
  const phone = record.phone || record.whatsapp;

  return (
    <article className="grid gap-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/pacientes/${record.id}`}
            className="block truncate font-semibold hover:text-primary"
          >
            {name}
          </Link>
          {record.social_name ? (
            <p className="truncate text-caption text-muted-foreground">
              {record.full_name}
            </p>
          ) : null}
          <p className="mt-1 text-body-sm text-muted-foreground">
            {phone ? formatPhoneBR(phone) : "Telefone não informado"}
          </p>
        </div>
        {record.lastEncounterStatus ? (
          <Badge
            variant={
              record.lastEncounterStatus === "finalized" ? "success" : "warning"
            }
          >
            {record.lastEncounterStatus === "finalized"
              ? "Finalizado"
              : "Rascunho"}
          </Badge>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted/40 p-3 text-body-sm">
        <div>
          <dt className="text-caption text-muted-foreground">Nascimento</dt>
          <dd className="mt-0.5 font-medium">
            {record.birth_date
              ? formatDate(record.birth_date)
              : "Não informado"}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-muted-foreground">
            Último atendimento
          </dt>
          <dd className="mt-0.5 font-medium">
            {record.lastEncounterAt
              ? formatDate(record.lastEncounterAt)
              : "Nenhum"}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-caption text-muted-foreground">Convênio</dt>
          <dd className="mt-0.5 font-medium">
            {record.lastInsuranceName ?? "Particular"}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild size="sm" variant="secondary">
          <Link href={`/pacientes/${record.id}`}>Abrir paciente</Link>
        </Button>
        {record.lastEncounterId ? (
          <Button asChild size="sm">
            <Link href={`/prontuario/${record.lastEncounterId}`}>
              Abrir atendimento
            </Link>
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
