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
                <p className="mt-0.5 text-xs text-muted-foreground">
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
            : "Nao informado";
        },
      },
      {
        accessorFn: (row) => row.id.slice(0, 8),
        header: "Codigo",
        cell: ({ row }) => (
          <span className="font-mono text-xs uppercase">
            {row.original.id.slice(0, 8)}
          </span>
        ),
      },
      {
        accessorFn: (row) => row.lastEncounterAt ?? "",
        header: "Ultimo atendimento",
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
                  className="w-fit text-xs font-medium text-primary hover:underline"
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
        header: "Convenio",
      },
      {
        id: "actions",
        header: "Acao",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Button asChild size="sm" variant="secondary">
              <Link href={`/pacientes/${row.original.id}`}>
                <ExternalLink className="size-3.5" />
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
            className="h-12 w-full pl-9 text-base"
            aria-label="Buscar prontuarios"
          />
        </div>
        <Select
          value={professionalId}
          onValueChange={setProfessionalId}
          aria-label="Filtrar profissional"
          className="h-12"
        >
          <option value="all">Todos os profissionais</option>
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.name}
            </option>
          ))}
        </Select>
        {canCreatePatient ? (
          <Button asChild className="h-12">
            <Link href="/pacientes/novo">Novo paciente</Link>
          </Button>
        ) : null}
      </section>

      <DataTable
        columns={columns}
        data={filtered}
        emptyTitle="Nenhum prontuario encontrado"
        emptyDescription="Ajuste a busca ou o filtro de profissional."
        pageSize={12}
      />
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
