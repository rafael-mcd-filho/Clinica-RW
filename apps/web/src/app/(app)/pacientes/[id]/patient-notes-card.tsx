"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notepad, PencilSimpleLine, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { updatePatientGeneralNotes } from "./overview-actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";

/**
 * Observações gerais da equipe sobre o paciente (adesão, preferências,
 * cuidados no contato). Texto livre, fica no rodapé do Resumo.
 */
export function PatientNotesCard({
  available,
  canEdit,
  notes,
  patientId,
}: {
  /** Falso enquanto o banco não tem o campo (migração pendente). */
  available: boolean;
  canEdit: boolean;
  notes: string | null;
  patientId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  const [error, setError] = useState<string>();
  const editable = canEdit && available;

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-warning-muted bg-warning-muted/45 px-4 py-4 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-muted text-warning-foreground"
        aria-hidden="true"
      >
        <Notepad className="size-5" weight="duotone" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-body-sm font-semibold text-foreground">
          Observações gerais
        </h2>
        <p className="mt-0.5 whitespace-pre-line break-words text-body-sm text-secondary-foreground">
          {notes ||
            (available
              ? "Nenhuma observação registrada."
              : "As observações gerais entram com a próxima atualização do sistema.")}
        </p>
      </div>
      {editable ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0 self-start sm:self-center"
          onClick={() => {
            setDraft(notes ?? "");
            setError(undefined);
            setEditing(true);
          }}
        >
          {notes ? (
            <PencilSimpleLine className="size-4" aria-hidden="true" />
          ) : (
            <Plus className="size-4" weight="bold" aria-hidden="true" />
          )}
          {notes ? "Editar" : "Adicionar"}
        </Button>
      ) : null}

      <ConfirmDialog
        open={editing}
        onClose={() => setEditing(false)}
        title="Observações gerais"
        description="Visível para quem acessa os dados sensíveis do paciente."
        confirmLabel="Salvar"
        pendingLabel="Salvando..."
        error={error}
        onConfirm={async () => {
          setError(undefined);
          const result = await updatePatientGeneralNotes(patientId, draft);
          if (result.error) {
            setError(result.error);
            return false;
          }
          toast.success(result.success);
          router.refresh();
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={6}
          maxLength={4000}
          aria-label="Observações gerais"
          placeholder="Ex.: prefere contato pelo WhatsApp à tarde; costuma chegar adiantado."
        />
        <p className="text-right text-caption text-muted-foreground tabular-nums">
          {draft.length}/4.000
        </p>
      </ConfirmDialog>
    </section>
  );
}
