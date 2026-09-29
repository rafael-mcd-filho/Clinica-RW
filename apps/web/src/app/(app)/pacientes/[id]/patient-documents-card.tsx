"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowSquareOut,
  CheckCircle,
  CircleNotch,
  CloudArrowUp,
  DotsThreeVertical,
  DownloadSimple,
  FileImage,
  FilePdf,
  FileText,
  Files,
  Plus,
  Signature,
  Stethoscope,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  confirmPatientAttachmentUpload,
  preparePatientAttachmentUpload,
  removePatientAttachment,
} from "./overview-actions";
import { OverviewCard, ViewAllTab } from "./patient-overview-card";
import { ConsentDetailsModal } from "@/components/clinical/consent-details";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export type DocumentCategory = "exam" | "report" | "other";

export type PatientDocumentItem = {
  id: string;
  kind: "document" | "attachment";
  name: string;
  typeLabel: string;
  typeTone: "primary" | "success" | "warning" | "neutral";
  category: DocumentCategory;
  dateLabel: string;
  /** Para ordenar: documentos emitidos e arquivos enviados juntos. */
  sortKey: string;
  openHref: string | null;
  downloadHref: string | null;
  fileKind: "pdf" | "image" | "other";
  removable: boolean;
  /** Termo de consentimento: abre o termo com a assinatura. */
  consentDocumentId?: string;
  encounterHref?: string | null;
};

const filters: Array<{ id: "all" | DocumentCategory; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "exam", label: "Exames" },
  { id: "report", label: "Laudos" },
  { id: "other", label: "Outros" },
];

const toneClass: Record<PatientDocumentItem["typeTone"], string> = {
  primary: "bg-primary-muted text-primary-hover",
  success: "bg-success-muted text-success-foreground",
  warning: "bg-warning-muted text-warning-foreground",
  neutral: "bg-muted text-secondary-foreground",
};

/**
 * Documentos do paciente num lugar só: os emitidos nos atendimentos
 * (prescrições, atestados, termos) e os arquivos enviados (exames, laudos).
 * No Resumo mostra os mais recentes; na aba Documentos, todos.
 */
export function PatientDocumentsCard({
  canUpload,
  items,
  limit,
  patientId,
  uploadAvailable,
}: {
  canUpload: boolean;
  items: PatientDocumentItem[];
  /** No Resumo, quantas linhas mostrar. Sem limite, lista tudo. */
  limit?: number;
  patientId: string;
  /** Falso enquanto o banco não aceita arquivo direto na ficha. */
  uploadAvailable: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | DocumentCategory>("all");
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<PatientDocumentItem | null>(null);
  const [consentId, setConsentId] = useState<string | null>(null);
  const counts = {
    all: items.length,
    exam: items.filter((item) => item.category === "exam").length,
    report: items.filter((item) => item.category === "report").length,
    other: items.filter((item) => item.category === "other").length,
  };
  const filtered =
    filter === "all" ? items : items.filter((item) => item.category === filter);
  const visible = limit ? filtered.slice(0, limit) : filtered;

  return (
    <OverviewCard
      icon={Files}
      title="Documentos"
      bodyClassName="pt-0"
      action={
        canUpload && uploadAvailable ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setUploading(true)}
          >
            <Plus className="size-4" weight="bold" aria-hidden="true" />
            Adicionar
          </Button>
        ) : null
      }
    >
      <div
        role="tablist"
        aria-label="Filtrar documentos"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--color-border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {filters.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(item.id)}
              className={cn(
                "relative shrink-0 px-3 py-2.5 text-body-sm font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                active
                  ? "text-primary after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label} ({counts[item.id]})
            </button>
          );
        })}
      </div>

      {visible.length ? (
        <ul className="divide-y divide-border">
          {visible.map((item) => (
            <DocumentRow
              key={`${item.kind}-${item.id}`}
              item={item}
              onRemove={() => setRemoving(item)}
              onConsent={() =>
                item.consentDocumentId && setConsentId(item.consentDocumentId)
              }
            />
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {filter === "all"
            ? "Nenhum documento do paciente ainda."
            : "Nenhum documento nesta categoria."}
        </p>
      )}

      {limit && filtered.length > visible.length ? (
        <div className="flex justify-end border-t border-border pt-2">
          <ViewAllTab
            tab="documents"
            label={`Ver todos (${filtered.length})`}
          />
        </div>
      ) : null}

      {uploading ? (
        <UploadDialog
          patientId={patientId}
          onClose={() => setUploading(false)}
          onUploaded={() => router.refresh()}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remover arquivo da ficha?"
        description={
          removing
            ? `${removing.name} sai das listas do paciente. O arquivo continua guardado no prontuário e a remoção fica registrada.`
            : undefined
        }
        confirmLabel="Remover"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          const result = await removePatientAttachment(patientId, removing.id);
          if (result.error) {
            toast.error(result.error);
            return false;
          }
          toast.success(result.success);
          router.refresh();
        }}
      />
      {consentId ? (
        <ConsentDetailsModal
          documentId={consentId}
          onClose={() => setConsentId(null)}
        />
      ) : null}
    </OverviewCard>
  );
}

function DocumentRow({
  item,
  onConsent,
  onRemove,
}: {
  item: PatientDocumentItem;
  onConsent: () => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const Icon =
    item.fileKind === "pdf"
      ? FilePdf
      : item.fileKind === "image"
        ? FileImage
        : FileText;

  return (
    <li className="flex min-w-0 items-center gap-3 py-2.5">
      <Icon
        className={cn(
          "size-5 shrink-0",
          item.fileKind === "pdf" ? "text-destructive" : "text-primary",
        )}
        weight="duotone"
        aria-hidden="true"
      />
      {item.openHref ? (
        <a
          href={item.openHref}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
          title={item.name}
        >
          {item.name}
        </a>
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={item.name}
        >
          {item.name}
        </span>
      )}
      <span
        className={cn(
          "hidden h-6 shrink-0 items-center rounded-md px-2 text-caption font-medium sm:inline-flex",
          toneClass[item.typeTone],
        )}
      >
        {item.typeLabel}
      </span>
      <span className="hidden w-20 shrink-0 text-right text-body-sm tabular-nums text-muted-foreground md:inline">
        {item.dateLabel}
      </span>
      {item.downloadHref ? (
        <a
          href={item.downloadHref}
          aria-label={`Baixar ${item.name}`}
          title="Baixar"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-secondary-foreground transition-colors duration-[var(--motion-fast)] hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <DownloadSimple className="size-4" aria-hidden="true" />
        </a>
      ) : (
        <span className="size-8 shrink-0" aria-hidden="true" />
      )}
      <DropdownMenu
        trigger={
          <DotsThreeVertical
            className="size-4"
            weight="bold"
            aria-hidden="true"
          />
        }
        triggerLabel={`Opções de ${item.name}`}
        triggerClassName="border-transparent shadow-none"
      >
        {(close) => (
          <>
            {item.openHref ? (
              <DropdownMenuItem
                icon={ArrowSquareOut}
                onSelect={() => {
                  close();
                  window.open(item.openHref!, "_blank", "noopener");
                }}
              >
                Abrir
              </DropdownMenuItem>
            ) : null}
            {item.consentDocumentId ? (
              <DropdownMenuItem
                icon={Signature}
                onSelect={() => {
                  close();
                  onConsent();
                }}
              >
                Ver termo e assinatura
              </DropdownMenuItem>
            ) : null}
            {item.encounterHref ? (
              <DropdownMenuItem
                icon={Stethoscope}
                onSelect={() => {
                  close();
                  router.push(item.encounterHref!);
                }}
              >
                Ver atendimento
              </DropdownMenuItem>
            ) : null}
            {item.removable ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  icon={Trash}
                  variant="destructive"
                  onSelect={() => {
                    close();
                    onRemove();
                  }}
                >
                  Remover da ficha
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        )}
      </DropdownMenu>
    </li>
  );
}

const ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const MAX_BYTES = 20 * 1024 * 1024;

type QueueItem = {
  key: string;
  name: string;
  status: "waiting" | "uploading" | "done" | "error";
  error?: string;
};

function typeFromName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function UploadDialog({
  onClose,
  onUploaded,
  patientId,
}: {
  onClose: () => void;
  onUploaded: () => void;
  patientId: string;
}) {
  const inputId = useId();
  const [category, setCategory] = useState<DocumentCategory>("exam");
  const [files, setFiles] = useState<File[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = queue.some(
    (item) => item.status === "uploading" || item.status === "waiting",
  );

  function update(key: string, patch: Partial<QueueItem>) {
    setQueue((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  async function uploadOne(file: File, key: string) {
    update(key, { status: "uploading" });
    const contentType = file.type || typeFromName(file.name);
    if (file.size > MAX_BYTES) {
      update(key, { status: "error", error: "Passa de 20 MB." });
      return false;
    }
    const prepared = await preparePatientAttachmentUpload(patientId, {
      fileName: file.name,
      sizeBytes: file.size,
      contentType,
    });
    if (!prepared.path || !prepared.token) {
      update(key, { status: "error", error: prepared.error });
      return false;
    }
    const { error } = await createSupabaseBrowserClient()
      .storage.from("clinical-attachments")
      .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType });
    if (error) {
      update(key, {
        status: "error",
        error: "O envio falhou. Confira a conexão e tente de novo.",
      });
      return false;
    }
    const confirmed = await confirmPatientAttachmentUpload(patientId, {
      path: prepared.path,
      fileName: file.name,
      sizeBytes: file.size,
      contentType,
      category,
    });
    if (confirmed.error) {
      update(key, { status: "error", error: confirmed.error });
      return false;
    }
    update(key, { status: "done" });
    return true;
  }

  async function send() {
    if (!files.length) return;
    const items = files.map((file, index) => ({
      key: `${index}-${file.name}-${file.size}`,
      name: file.name,
      status: "waiting" as const,
    }));
    setQueue(items);
    let sent = 0;
    // Um de cada vez: evita estourar a conexão com vários exames grandes.
    for (const [index, file] of files.entries()) {
      if (await uploadOne(file, items[index].key)) sent += 1;
    }
    if (sent) {
      toast.success(
        sent === 1 ? "Arquivo adicionado." : `${sent} arquivos adicionados.`,
      );
      onUploaded();
    }
    if (sent === files.length) onClose();
  }

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="Adicionar documento"
      description="Exames, laudos e outros arquivos do paciente. PDF ou imagem, até 20 MB cada."
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={busy || !files.length}
            onClick={() => void send()}
          >
            {busy
              ? "Enviando..."
              : files.length > 1
                ? `Enviar ${files.length} arquivos`
                : "Enviar"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">Categoria</legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["exam", "Exame"],
                ["report", "Laudo"],
                ["other", "Outro"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
                  category === value
                    ? "border-primary bg-primary-muted text-primary"
                    : "border-border hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="category"
                  value={value}
                  checked={category === value}
                  onChange={() => setCategory(value)}
                  className="sr-only"
                  disabled={busy}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

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
            if (!busy) setFiles([...event.dataTransfer.files]);
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
              "size-7",
              dragging ? "text-primary" : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
          <span className="text-sm font-medium">
            {files.length
              ? files.length === 1
                ? files[0].name
                : `${files.length} arquivos escolhidos`
              : "Arraste arquivos aqui ou clique para escolher"}
          </span>
          <span className="text-xs text-muted-foreground">
            PDF, JPG, PNG, WEBP ou HEIC
          </span>
          <input
            id={inputId}
            type="file"
            multiple
            accept={ACCEPT}
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              setFiles([...(event.target.files ?? [])]);
              setQueue([]);
              event.target.value = "";
            }}
          />
        </label>

        {queue.length ? (
          <ul className="grid gap-1.5">
            {queue.map((item) => (
              <li
                key={item.key}
                className="flex min-w-0 items-center gap-2 text-sm"
              >
                {item.status === "done" ? (
                  <CheckCircle
                    className="size-4 shrink-0 text-success-foreground"
                    weight="fill"
                    aria-hidden="true"
                  />
                ) : item.status === "error" ? (
                  <WarningCircle
                    className="size-4 shrink-0 text-destructive"
                    weight="fill"
                    aria-hidden="true"
                  />
                ) : (
                  <CircleNotch
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground",
                      item.status === "uploading" &&
                        "animate-spin text-primary",
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {item.error ? (
                  <span className="shrink-0 text-caption text-destructive">
                    {item.error}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Modal>
  );
}
