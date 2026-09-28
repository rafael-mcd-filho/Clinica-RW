"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type {
  DocumentMeasurement,
  DocumentRenderInput,
} from "@/lib/pdf/clinical-document";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const DocumentPages = dynamic(
  () =>
    import("./document-preview-pages").then(
      (module) => module.DocumentPreviewPages,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="text-body-sm text-muted-foreground">
        Carregando páginas...
      </p>
    ),
  },
);

type PreviewState = {
  input: DocumentRenderInput;
  url?: string;
  measurement?: DocumentMeasurement;
  error?: string;
};
export function useDocumentPreview(input: DocumentRenderInput, enabled = true) {
  const [result, setResult] = useState<PreviewState>();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const { renderClinicalDocument } =
          await import("@/lib/pdf/clinical-document");
        if (cancelled) return;
        const { bytes, measurement } = await renderClinicalDocument(input);
        if (cancelled) return;
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
        );
        setResult({ input, url, measurement });
      } catch {
        if (!cancelled)
          setResult({
            input,
            error:
              "Não foi possível calcular a prévia. O texto continua no editor; altere o layout ou tente novamente.",
          });
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [input, enabled]);
  useEffect(() => {
    const url = result?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [result?.url]);
  return { ...result, pending: enabled && result?.input !== input };
}

type Preview = ReturnType<typeof useDocumentPreview>;

export function DocumentFitFeedback({
  preview,
  characters,
  id,
  sample = false,
}: {
  preview: Preview;
  characters: number;
  id: string;
  sample?: boolean;
}) {
  const measurement = preview.measurement;
  const overflow = measurement && measurement.documentPages > 1;
  return (
    <div
      id={id}
      aria-busy={preview.pending}
      className="grid gap-2 text-caption"
    >
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "font-medium",
            overflow && !preview.pending
              ? "text-amber-800 dark:text-amber-300"
              : "text-muted-foreground",
          )}
        >
          {preview.pending
            ? "Calculando espaço e quebras de página..."
            : preview.error
              ? "Prévia indisponível"
              : measurement
                ? `${measurement.documentPages} ${measurement.documentPages === 1 ? "página de documento" : "páginas de documento"}${measurement.totalPages > measurement.documentPages ? ` + ${measurement.totalPages - measurement.documentPages} de registro do consentimento` : ""}`
                : "Preparando prévia..."}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {characters.toLocaleString("pt-BR")} / 30.000 caracteres
        </span>
      </div>
      {preview.error ? (
        <p role="alert" className="text-destructive">
          {preview.error}
        </p>
      ) : measurement ? (
        <div className={cn("grid gap-2", preview.pending && "opacity-60")}>
          <div
            role="meter"
            aria-label="Ocupação do texto na primeira página"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(
              100,
              Math.round(
                (measurement.bodyLines /
                  Math.max(1, measurement.firstPageCapacity)) *
                  100,
              ),
            )}
            aria-valuetext={`${measurement.bodyLines} linhas de texto; cabem ${measurement.firstPageCapacity} na primeira página com este layout`}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={cn(
                "h-full rounded-full",
                overflow ? "bg-amber-500" : "bg-primary",
              )}
              style={{
                width: `${Math.min(100, (measurement.bodyLines / Math.max(1, measurement.firstPageCapacity)) * 100)}%`,
              }}
            />
          </div>
          <p className="text-muted-foreground">
            {overflow
              ? `O documento terá ${measurement.documentPages} páginas, sem corte do conteúdo. Confira as quebras na prévia.`
              : `Cabem aproximadamente mais ${measurement.remainingFirstPageLines} linhas na primeira página com este layout.`}
            {measurement.signatureOnSeparatePage
              ? " A assinatura profissional ficará em uma página adicional."
              : ""}
          </p>
        </div>
      ) : (
        <div className="grid gap-2" aria-hidden="true">
          <div className="h-1.5 rounded-full bg-muted" />
          <p className="text-muted-foreground">
            Conferindo o espaço disponível com o layout selecionado.
          </p>
        </div>
      )}
      <p className="text-muted-foreground">
        O espaço considera papel, fonte, cabeçalho, título, dados do paciente,
        assinatura e rodapé.{" "}
        {sample
          ? "A prévia usa exemplos; os dados reais podem mudar a paginação."
          : "Alterações nos dados até a emissão podem mudar a paginação."}
      </p>
    </div>
  );
}

export function DocumentPreviewCard({
  preview,
  sample = false,
  paperSize,
}: {
  preview: Preview;
  sample?: boolean;
  paperSize: "A4" | "LETTER";
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Prévia de impressão</h2>
          {preview.url && !preview.pending ? (
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm text-control font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Ampliar PDF<span className="sr-only"> (nova aba)</span>
            </a>
          ) : null}
        </div>
        <p className="mt-1 text-body-sm text-muted-foreground">
          {sample
            ? "Os dados da clínica são reais; paciente, profissional e atendimento usam exemplos."
            : "Prévia com os dados deste atendimento."}{" "}
          Todas as páginas e quebras aparecem abaixo.
        </p>
      </CardHeader>
      <CardContent
        aria-busy={preview.pending}
        className="max-h-[75dvh] overflow-y-auto bg-muted/45 p-3 sm:p-5"
      >
        {preview.pending ? (
          <p
            role="status"
            className="mb-3 text-center text-caption text-muted-foreground"
          >
            Atualizando páginas...
          </p>
        ) : null}
        {preview.error && !preview.pending ? (
          <p className="text-body-sm text-destructive">{preview.error}</p>
        ) : preview.url && preview.measurement ? (
          <div className={preview.pending ? "opacity-60" : undefined}>
            <DocumentPages
              file={preview.url}
              count={preview.measurement.totalPages}
              paperSize={paperSize}
            />
          </div>
        ) : (
          <p className="py-8 text-center text-body-sm text-muted-foreground">
            Preparando documento...
          </p>
        )}
      </CardContent>
    </Card>
  );
}
