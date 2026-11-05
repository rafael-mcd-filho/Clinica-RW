"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { FileArrowUp } from "@phosphor-icons/react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import {
  detectColumns,
  importFieldLabels,
  normalizeImportRows,
  parseCsv,
  type ImportField,
} from "@/lib/patients/import";
import { importPatients, type ImportPatientsResult } from "./actions";

const previewSize = 12;

export function PatientImport() {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<ImportField, number> | null>(
    null,
  );
  const [result, setResult] = useState<ImportPatientsResult | null>(null);
  const [pending, startTransition] = useTransition();
  const header = rows[0] ?? [];
  const dataRows = useMemo(() => rows.slice(1), [rows]);
  const results = useMemo(
    () => (mapping ? normalizeImportRows(dataRows, mapping) : []),
    [dataRows, mapping],
  );
  const valid = results.filter((row) => !row.errors.length);
  const invalid = results.filter((row) => row.errors.length);

  async function readFile(file: File) {
    setResult(null);
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    setRows(parsed);
    setMapping(parsed[0] ? detectColumns(parsed[0]) : null);
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 p-5">
          <p className="text-body-sm text-secondary-foreground">
            Exporte a base como <strong>CSV</strong> (no Excel: Arquivo › Salvar
            como › CSV). A primeira linha precisa ter os nomes das colunas —
            nome, CPF, nascimento, sexo, celular, telefone, e-mail. Pacientes
            com CPF já cadastrado são pulados.
          </p>
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-3 text-label font-medium text-primary hover:bg-primary-muted">
            <FileArrowUp className="size-5" aria-hidden="true" />
            {fileName || "Escolher arquivo CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
          </label>
        </CardContent>
      </Card>

      {mapping && header.length ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Colunas</h2>
            <p className="mt-1 text-body-sm text-muted-foreground">
              Confira de qual coluna vem cada informação.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(importFieldLabels) as ImportField[]).map((field) => (
              <label
                key={field}
                className="grid gap-1.5 text-label font-medium"
              >
                {importFieldLabels[field]}
                <Select
                  value={String(mapping[field])}
                  onValueChange={(value) =>
                    setMapping({ ...mapping, [field]: Number(value) })
                  }
                  aria-label={importFieldLabels[field]}
                >
                  <option value="-1">Não importar</option>
                  {header.map((cell, index) => (
                    <option key={`${index}-${cell}`} value={String(index)}>
                      {cell || `Coluna ${index + 1}`}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {results.length ? (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Prévia</h2>
              <p className="mt-1 text-body-sm text-muted-foreground">
                {valid.length} prontos para importar
                {invalid.length
                  ? ` · ${invalid.length} com erro (ficam de fora)`
                  : ""}
              </p>
            </div>
            <Button
              type="button"
              disabled={pending || !valid.length || Boolean(result?.created)}
              onClick={() =>
                startTransition(async () => {
                  setResult(
                    await importPatients(valid.map((row) => row.patient)),
                  );
                })
              }
            >
              {pending
                ? "Importando..."
                : `Importar ${valid.length} ${valid.length === 1 ? "paciente" : "pacientes"}`}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            {result?.error ? (
              <Alert variant="destructive">{result.error}</Alert>
            ) : null}
            {result && !result.error ? (
              <Alert variant="success" title="Importação concluída">
                {result.created} cadastrados
                {result.skippedExisting
                  ? ` · ${result.skippedExisting} já existiam (mesmo CPF)`
                  : ""}
                {result.failed ? ` · ${result.failed} falharam` : ""}.{" "}
                <Link href="/pacientes" className="font-medium underline">
                  Ver pacientes
                </Link>
              </Alert>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-body-sm">
                <thead className="text-caption text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Linha</th>
                    <th className="px-2 py-1.5 font-medium">Nome</th>
                    <th className="px-2 py-1.5 font-medium">Nascimento</th>
                    <th className="px-2 py-1.5 font-medium">CPF</th>
                    <th className="px-2 py-1.5 font-medium">Contato</th>
                    <th className="px-2 py-1.5 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...invalid, ...valid].slice(0, previewSize).map((row) => (
                    <tr key={row.line}>
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                        {row.line}
                      </td>
                      <td className="px-2 py-1.5">
                        {row.patient.full_name || "—"}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {row.patient.birth_date
                          ? row.patient.birth_date
                              .split("-")
                              .reverse()
                              .join("/")
                          : "—"}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {row.patient.cpf ? "Informado" : "—"}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {row.patient.whatsapp ||
                          row.patient.phone ||
                          row.patient.email ||
                          "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {row.errors.length ? (
                          <Badge variant="destructive">
                            {row.errors.join(" · ")}
                          </Badge>
                        ) : (
                          <Badge variant="success">Pronto</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {results.length > previewSize ? (
              <p className="text-caption text-muted-foreground">
                Mostrando {previewSize} de {results.length} linhas (erros
                primeiro).
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
