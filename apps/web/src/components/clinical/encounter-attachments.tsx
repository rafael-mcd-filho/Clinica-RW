"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  CheckCircle,
  CloudArrowUp,
  File as FileIcon,
  FilePdf,
  ImageSquare,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  confirmAttachmentUpload,
  prepareAttachmentUpload,
  removeAttachment,
} from "@/app/(app)/prontuario/[id]/attachment-actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { EncounterAttachment } from "@/lib/storage/clinical-attachments";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const MAX_BYTES = 20 * 1024 * 1024;

type QueueItem = {
  key: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

/**
 * Exames e documentos do atendimento (PDF, fotos de exames, laudos).
 *
 * O arquivo sobe direto do navegador para o Storage, com um link de envio
 * que o servidor gera depois de conferir o acesso — assim cabem arquivos de
 * até 20 MB. Depois o servidor confirma que o arquivo chegou e o registra.
 */
export function EncounterAttachments({
  encounterId,
  attachments,
  available = true,
  canUpload,
  timeZone,
}: {
  encounterId: string;
  attachments: EncounterAttachment[];
  /** Falso enquanto o banco não tem a tabela de anexos (migração pendente). */
  available?: boolean;
  canUpload: boolean;
  timeZone: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [removing, setRemoving] = useState<EncounterAttachment | null>(null);
  const [, startRefresh] = useTransition();
  const uploading = queue.some((item) => item.status === "uploading");

  function updateItem(key: string, patch: Partial<QueueItem>) {
    setQueue((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  async function uploadOne(file: File, key: string) {
    const contentType = file.type || typeFromName(file.name);
    if (file.size > MAX_BYTES) {
      updateItem(key, {
        status: "error",
        error: "Passa de 20 MB. Reduza ou divida antes de enviar.",
      });
      return false;
    }
    const prepared = await prepareAttachmentUpload(encounterId, {
      fileName: file.name,
      sizeBytes: file.size,
      contentType,
    });
    if (!prepared.path || !prepared.token) {
      updateItem(key, { status: "error", error: prepared.error });
      return false;
    }
    const { error } = await createSupabaseBrowserClient()
      .storage.from("clinical-attachments")
      .uploadToSignedUrl(prepared.path, prepared.token, file, {
        contentType,
      });
    if (error) {
      updateItem(key, {
        status: "error",
        error: "O envio falhou. Confira a conexão e tente de novo.",
      });
      return false;
    }
    const confirmed = await confirmAttachmentUpload(encounterId, {
      path: prepared.path,
      fileName: file.name,
      sizeBytes: file.size,
      contentType,
    });
    if (confirmed.error) {
      updateItem(key, { status: "error", error: confirmed.error });
      return false;
    }
    updateItem(key, { status: "done" });
    return true;
  }

  async function handleFiles(files: FileList | File[]) {
    const list = [...files];
    if (!list.length || !canUpload) return;
    const items = list.map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`,
      name: file.name,
      size: file.size,
      status: "uploading" as const,
    }));
    setQueue((current) => [...items, ...current]);
    let sent = 0;
    // Um de cada vez: evita estourar a conexão com vários exames grandes.
    for (const [index, file] of list.entries()) {
      if (await uploadOne(file, items[index].key)) sent += 1;
    }
    if (sent) {
      toast.success(
        sent === 1 ? "Arquivo anexado." : `${sent} arquivos anexados.`,
      );
      startRefresh(() => router.refresh());
      // Os concluídos saem da fila: já aparecem na lista abaixo.
      setQueue((current) => current.filter((item) => item.status !== "done"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Exames e documentos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Resultados de exames, laudos e documentos trazidos pelo paciente.
          Ficam também na ficha do paciente.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        {canUpload ? (
          <label
            htmlFor={inputId}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFiles(event.dataTransfer.files);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-[border-color,background-color] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary",
              dragging
                ? "border-primary bg-primary-muted/40"
                : "border-border hover:border-primary/50 hover:bg-muted/30",
            )}
          >
            <CloudArrowUp
              className={cn(
                "size-7 transition-colors duration-[var(--motion-fast)]",
                dragging ? "text-primary" : "text-muted-foreground",
              )}
              aria-hidden="true"
            />
            <span className="text-sm font-medium">
              {dragging
                ? "Solte para enviar"
                : "Arraste arquivos aqui ou clique para escolher"}
            </span>
            <span className="text-xs text-muted-foreground">
              PDF ou imagem (JPG, PNG, WEBP, HEIC), até 20 MB cada
            </span>
            <input
              id={inputId}
              type="file"
              multiple
              accept={ACCEPT}
              disabled={uploading}
              className="sr-only"
              onChange={(event) => {
                const files = event.target.files;
                if (files) void handleFiles(files);
                event.target.value = "";
              }}
            />
          </label>
        ) : null}

        {queue.length ? (
          <ul aria-live="polite" className="grid gap-2">
            {queue.map((item) => (
              <li
                key={item.key}
                className={cn(
                  "flex animate-content-enter items-center gap-3 rounded-md border px-3 py-2 text-sm",
                  item.status === "error"
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border",
                )}
              >
                {item.status === "uploading" ? (
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary motion-reduce:animate-none"
                  />
                ) : item.status === "error" ? (
                  <WarningCircle
                    className="size-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle
                    className="size-4 shrink-0 text-success-foreground"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {item.name}
                  </span>
                  <span
                    className={cn(
                      "block text-xs",
                      item.status === "error"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {item.status === "uploading"
                      ? `Enviando… ${formatSize(item.size)}`
                      : item.status === "error"
                        ? item.error
                        : "Enviado"}
                  </span>
                </span>
                {item.status === "error" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setQueue((current) =>
                        current.filter((entry) => entry.key !== item.key),
                      )
                    }
                  >
                    Dispensar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {attachments.length ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {attachments.map((attachment) => (
              <AttachmentRow
                key={attachment.id}
                attachment={attachment}
                timeZone={timeZone}
                onRemove={canUpload ? () => setRemoving(attachment) : undefined}
              />
            ))}
          </ul>
        ) : !available ? (
          <p className="rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
            O envio de exames e documentos entra com a próxima atualização do
            sistema.
          </p>
        ) : !canUpload ? (
          <p className="text-sm text-muted-foreground">
            Nenhum exame ou documento anexado.
          </p>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remover da lista?"
        description={`${removing?.fileName ?? "O arquivo"} deixa de aparecer no atendimento e na ficha do paciente. Ele continua guardado no prontuário e a remoção fica registrada.`}
        confirmLabel="Remover"
        pendingLabel="Removendo..."
        destructive
        onConfirm={async () => {
          if (!removing) return false;
          const result = await removeAttachment(removing.id);
          if (result.error) {
            toast.error(result.error);
            return false;
          }
          toast.success(result.success ?? "Arquivo removido da lista.");
          startRefresh(() => router.refresh());
        }}
      />
    </Card>
  );
}

export function AttachmentRow({
  attachment,
  timeZone,
  onRemove,
  context,
}: {
  attachment: EncounterAttachment;
  timeZone: string;
  onRemove?: () => void;
  /** Texto extra, ex.: de qual atendimento veio (na ficha do paciente). */
  context?: React.ReactNode;
}) {
  const isPdf = attachment.contentType === "application/pdf";
  const Icon = isPdf
    ? FilePdf
    : attachment.contentType.startsWith("image/")
      ? ImageSquare
      : FileIcon;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          isPdf
            ? "bg-destructive-muted text-destructive-foreground"
            : "bg-primary-muted text-primary",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        {attachment.url ? (
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-medium hover:text-primary hover:underline"
          >
            {attachment.fileName}
          </a>
        ) : (
          <span className="block truncate text-sm font-medium">
            {attachment.fileName}
          </span>
        )}
        <span className="block truncate text-xs text-muted-foreground">
          {[
            isPdf ? "PDF" : "Imagem",
            formatSize(attachment.sizeBytes),
            formatDateTime(attachment.createdAt, timeZone),
            attachment.uploadedByName,
          ]
            .filter(Boolean)
            .join(" · ")}
          {context ? <> · {context}</> : null}
        </span>
      </span>
      {attachment.url ? (
        <Button asChild variant="secondary" size="sm">
          <a href={attachment.url} target="_blank" rel="noopener noreferrer">
            Abrir
          </a>
        </Button>
      ) : null}
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remover ${attachment.fileName}`}
          title="Remover da lista"
          onClick={onRemove}
        >
          <Trash className="size-4 text-destructive" aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}

function typeFromName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return "application/octet-stream";
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  })
    .format(new Date(value))
    .replace(",", " às");
}
