"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import {
  PencilSimple as Pencil,
  Plus,
  FloppyDisk as Save,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  createSettingsTag,
  deleteSettingsTag,
  updateSettingsTag,
  type CompanyActionState,
} from "./company-actions";
import type { TagSettingsData } from "./_lib/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog, FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { categoricalColors } from "@/lib/colors";

const initialState: CompanyActionState = {};

// Único lugar onde tags nascem, mudam ou somem. Pacientes, atendimento e
// automações só aplicam as que existem aqui.
export function TagSettings({ tags }: { tags: TagSettingsData[] }) {
  // `null` = fechado; `"new"` = criando; tag = editando.
  const [editing, setEditing] = useState<TagSettingsData | "new" | null>(null);
  const [deleting, setDeleting] = useState<TagSettingsData | null>(null);
  const closeEditor = useCallback(() => setEditing(null), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Tags</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Marcadores de pacientes e conversas do WhatsApp, também usados
              pelas automações.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="neutral">{tags.length}</Badge>
            <Button type="button" size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-3.5" aria-hidden="true" />
              Adicionar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 py-3">
        <div className="app-list-table-lg overflow-hidden rounded-md border border-border">
          {tags.length ? (
            <>
              <div className="app-list-row hidden grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_8rem] border-b border-border bg-muted text-label font-semibold text-foreground lg:grid">
                <span className="app-list-cell">Nome</span>
                <span className="app-list-cell">Uso</span>
                <span className="app-list-cell">Ações</span>
              </div>
              <div className="divide-y divide-border">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="app-list-row grid gap-2 px-4 py-3 transition-colors duration-[var(--motion-fast)] hover:bg-background sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_8rem]"
                  >
                    <div className="app-list-cell min-w-0 text-sm font-medium">
                      <span
                        className="inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium"
                        style={{
                          borderColor: `${tag.color}55`,
                          color: tag.color,
                          backgroundColor: `${tag.color}0D`,
                        }}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                          aria-hidden
                        />
                        <span className="truncate">{tag.name}</span>
                      </span>
                    </div>
                    <div className="app-list-cell min-w-0 text-body-sm text-muted-foreground">
                      <span className="truncate">{usageSummary(tag)}</span>
                    </div>
                    <div className="app-list-cell flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="border border-border bg-card text-primary hover:border-primary hover:bg-primary-muted hover:text-primary"
                        aria-label={`Editar ${tag.name}`}
                        title="Editar"
                        onClick={() => setEditing(tag)}
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="destructive-ghost"
                        className="border border-border bg-card hover:border-destructive hover:bg-destructive-muted"
                        aria-label={`Excluir ${tag.name}`}
                        title="Excluir"
                        onClick={() => setDeleting(tag)}
                      >
                        <Trash
                          className="size-3.5 text-destructive"
                          aria-hidden="true"
                        />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhuma tag cadastrada. Crie a primeira para marcar pacientes e
              usar em automações.
            </p>
          )}
        </div>
      </CardContent>

      {editing ? (
        <TagFormDialog
          key={editing === "new" ? "new" : editing.id}
          tag={editing === "new" ? null : editing}
          onClose={closeEditor}
        />
      ) : null}
      {deleting ? (
        <DeleteTagDialog
          key={deleting.id}
          tag={deleting}
          onClose={closeDelete}
        />
      ) : null}
    </Card>
  );
}

function TagFormDialog({
  tag,
  onClose,
}: {
  tag: TagSettingsData | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    tag ? updateSettingsTag.bind(null, tag.id) : createSettingsTag,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onClose();
    }
  }, [state, onClose]);

  return (
    <FormDialog
      open
      onClose={onClose}
      title={tag ? "Editar tag" : "Nova tag"}
      description={
        tag
          ? "A mudança vale para todos os pacientes, conversas e automações que usam esta tag."
          : "Informe um nome curto e escolha a cor do marcador."
      }
      formAction={action}
      error={state.error}
      pending={pending}
      confirmLabel={tag ? "Salvar" : "Criar tag"}
      pendingLabel={tag ? "Salvando..." : "Criando..."}
      icon={tag ? Save : Plus}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <label className="grid gap-1.5 text-sm font-medium">
          Nome
          <Input
            name="name"
            placeholder="Ex.: Cliente VIP"
            defaultValue={tag?.name ?? ""}
            maxLength={80}
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Cor
          <Input
            name="color"
            type="color"
            className="w-full p-1"
            defaultValue={tag?.color ?? categoricalColors.blue}
            required
          />
        </label>
      </div>
    </FormDialog>
  );
}

function DeleteTagDialog({
  tag,
  onClose,
}: {
  tag: TagSettingsData;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const automationCount = tag.automationNames.length;
  const inUse =
    tag.patientCount > 0 || tag.conversationCount > 0 || automationCount > 0;

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title="Excluir tag?"
      description={
        inUse
          ? `A tag “${tag.name}” está em uso. Ao excluir, ela sai de todos os pacientes e conversas, e as automações que a usam são excluídas junto. Não dá para desfazer.`
          : `A tag “${tag.name}” não está em uso e será excluída definitivamente.`
      }
      confirmLabel={inUse ? "Excluir mesmo assim" : "Excluir tag"}
      pendingLabel="Excluindo..."
      destructive
      pending={pending}
      error={error}
      onConfirm={() =>
        new Promise<boolean>((resolve) => {
          startTransition(async () => {
            const result = await deleteSettingsTag(tag.id);
            if (result.error) {
              setError(result.error);
              resolve(false);
              return;
            }
            if (result.success) toast.success(result.success);
            resolve(true);
          });
        })
      }
    >
      {inUse ? (
        <ul className="grid gap-1.5 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
          {tag.patientCount > 0 ? (
            <li>{plural(tag.patientCount, "paciente", "pacientes")}</li>
          ) : null}
          {tag.conversationCount > 0 ? (
            <li>
              {plural(
                tag.conversationCount,
                "conversa do WhatsApp",
                "conversas do WhatsApp",
              )}
            </li>
          ) : null}
          {automationCount > 0 ? (
            <li>
              {plural(automationCount, "automação", "automações")}
              {" (serão excluídas): "}
              <span className="font-medium">
                {tag.automationNames.join(", ")}
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </ConfirmDialog>
  );
}

function usageSummary(tag: TagSettingsData) {
  const parts = [
    tag.patientCount ? plural(tag.patientCount, "paciente", "pacientes") : null,
    tag.conversationCount
      ? plural(tag.conversationCount, "conversa", "conversas")
      : null,
    tag.automationNames.length
      ? plural(tag.automationNames.length, "automação", "automações")
      : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Sem uso";
}

function plural(count: number, singular: string, pluralLabel: string) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}
