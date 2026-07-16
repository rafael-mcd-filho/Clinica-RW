"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  CheckCircle as CircleCheck,
  FileText as FileCheck,
  Plus,
  FloppyDisk as Save,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  addEncounterAddendum,
  finalizeEncounter,
  saveAndFinalizeEncounter,
  saveEncounterDraft,
  type ClinicalActionState,
} from "../actions";
import { ClinicalFormRenderer } from "@/components/clinical/clinical-form-renderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

type Addendum = {
  id: string;
  content: string;
  created_at: string;
  author: string;
};

const initialState: ClinicalActionState = {};

export function EncounterEditor({
  encounterId,
  status,
  canEdit,
  canFinalize,
  schema,
  structuredData,
  freeNotes,
  cidCode,
  cidDescription,
  addenda,
}: {
  encounterId: string;
  status: string;
  canEdit: boolean;
  canFinalize: boolean;
  schema: unknown;
  structuredData: Record<string, unknown>;
  freeNotes: string | null;
  cidCode: string;
  cidDescription: string;
  addenda: Addendum[];
}) {
  const router = useRouter();
  const formId = useId().replaceAll(":", "");
  const [dirty, setDirty] = useState(false);
  const revisionRef = useRef(0);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );
  const draftAction = saveEncounterDraft.bind(null, encounterId);
  const finalizeAction = saveAndFinalizeEncounter.bind(null, encounterId);
  const finalizeOnlyAction = finalizeEncounter.bind(null, encounterId);
  const addendumAction = addEncounterAddendum.bind(null, encounterId);
  const [draftState, saveDraft, saving] = useActionState(
    async (previousState: ClinicalActionState, formData: FormData) => {
      const submittedRevision = revisionRef.current;
      const result = await draftAction(previousState, formData);
      if (result.success && revisionRef.current === submittedRevision) {
        setDirty(false);
      }
      return result;
    },
    initialState,
  );
  const [finalizeState, submitFinalize, finalizing] = useActionState(
    async (previousState: ClinicalActionState, formData: FormData) => {
      const submittedRevision = revisionRef.current;
      const result = await finalizeAction(previousState, formData);
      if (result.success) {
        if (revisionRef.current === submittedRevision) setDirty(false);
        setConfirmingFinalize(false);
      }
      return result;
    },
    initialState,
  );
  const [finalizeOnlyState, submitFinalizeOnly, finalizingOnly] =
    useActionState(async (previousState: ClinicalActionState) => {
      const result = await finalizeOnlyAction(previousState);
      if (result.success) {
        setDirty(false);
        setConfirmingFinalize(false);
      }
      return result;
    }, initialState);
  const [addendumState, submitAddendum, adding] = useActionState(
    addendumAction,
    initialState,
  );
  const finalized = status === "finalized";
  const finalizationPending = finalizing || finalizingOnly;
  const editingLocked = saving || finalizationPending;
  const readOnly = finalized || !canEdit;

  function markDirty() {
    revisionRef.current += 1;
    setDirty(true);
  }

  useEffect(() => {
    for (const state of [
      draftState,
      finalizeState,
      finalizeOnlyState,
      addendumState,
    ]) {
      if (state.success) toast.success(state.success);
    }
  }, [draftState, finalizeState, finalizeOnlyState, addendumState]);

  useEffect(() => {
    if (!dirty) return;
    function warnAboutPendingChanges(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnAboutPendingChanges);
    return () =>
      window.removeEventListener("beforeunload", warnAboutPendingChanges);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;

    function protectInternalNavigation(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.href === window.location.href) return;

      event.preventDefault();
      setPendingNavigation(
        `${destination.pathname}${destination.search}${destination.hash}`,
      );
    }

    document.addEventListener("click", protectInternalNavigation, true);
    return () =>
      document.removeEventListener("click", protectInternalNavigation, true);
  }, [dirty]);

  return (
    <div className="grid gap-5">
      <form
        id={formId}
        action={saveDraft}
        className="grid gap-5"
        onChange={markDirty}
      >
        <ClinicalFormRenderer
          schema={schema}
          values={structuredData}
          mode={readOnly ? "readonly" : "edit"}
          disabled={editingLocked}
          onValueChange={markDirty}
        />

        <Card>
          <CardHeader>
            <h2 className="font-semibold">CID e notas livres</h2>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[10rem_1fr]">
            <label className="grid gap-2 text-sm font-medium">
              CID
              <Input
                name="cid_code"
                defaultValue={cidCode}
                disabled={readOnly || editingLocked}
                placeholder="J00"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Descrição
              <Input
                name="cid_description"
                defaultValue={cidDescription}
                disabled={readOnly || editingLocked}
                placeholder="Descrição inicial"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium md:col-span-2">
              Notas livres
              {readOnly ? (
                <div className="min-h-24 rounded-md border border-border bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
                  {freeNotes || "—"}
                </div>
              ) : (
                <RichTextEditor
                  name="free_notes"
                  defaultValue={freeNotes ?? ""}
                  minHeightClassName="min-h-40"
                  placeholder="Notas livres do atendimento"
                  disabled={editingLocked}
                  onChange={markDirty}
                />
              )}
            </label>
            {draftState.error ? (
              <p className="text-sm text-destructive md:col-span-2">
                {draftState.error}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {!finalized && (canEdit || canFinalize) ? (
          <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-lg border border-border-strong bg-card/95 p-3 shadow-[var(--shadow-lg)] backdrop-blur md:flex-row md:items-center md:justify-between">
            <div aria-live="polite">
              <p
                className={
                  dirty
                    ? "inline-flex items-center gap-2 text-sm font-medium text-warning-foreground"
                    : "inline-flex items-center gap-2 text-sm font-medium text-success-foreground"
                }
              >
                <span
                  className={
                    dirty
                      ? "size-2 rounded-full bg-warning"
                      : "size-2 rounded-full bg-success"
                  }
                />
                {saving
                  ? "Salvando..."
                  : finalizationPending
                    ? "Salvando e finalizando..."
                    : dirty
                      ? "Pendente — alterações não salvas"
                      : "Salvo"}
              </p>
              <p className="text-xs text-muted-foreground">
                {canEdit
                  ? "Finalizar salva o conteúdo atual em uma única operação segura."
                  : "Revise o conteúdo salvo antes de finalizar."}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {canEdit ? (
                <Button
                  type="submit"
                  variant="secondary"
                  formNoValidate
                  disabled={saving || finalizationPending}
                >
                  <Save className="size-4" />
                  {saving ? "Salvando..." : "Salvar rascunho"}
                </Button>
              ) : null}
              {canFinalize ? (
                <Button
                  type="button"
                  disabled={saving || finalizationPending}
                  onClick={() => setConfirmingFinalize(true)}
                >
                  <FileCheck className="size-4" />
                  {canEdit ? "Salvar e finalizar" : "Finalizar prontuário"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>

      {finalized ? (
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Adendos</h2>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form action={submitAddendum} className="grid gap-3">
              <RichTextEditor
                name="content"
                placeholder="Registrar adendo clínico"
                required
              />
              {addendumState.error ? (
                <p className="text-sm text-destructive">
                  {addendumState.error}
                </p>
              ) : null}
              <div className="flex justify-end">
                <Button type="submit" disabled={adding}>
                  <Plus className="size-4" />
                  {adding ? "Registrando..." : "Adicionar adendo"}
                </Button>
              </div>
            </form>
            {addenda.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-border p-3"
              >
                <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.author} · {formatDateTime(item.created_at)}
                </p>
              </div>
            ))}
            {!addenda.length ? (
              <p className="text-sm text-muted-foreground">
                Nenhum adendo registrado.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Modal
        open={confirmingFinalize}
        onClose={() => setConfirmingFinalize(false)}
        title="Confirmar finalização"
        description="Revise esta decisão. Depois de finalizado, o prontuário só poderá receber adendos."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={finalizationPending}
              onClick={() => setConfirmingFinalize(false)}
            >
              Continuar editando
            </Button>
            <Button
              type="submit"
              form={formId}
              formAction={canEdit ? submitFinalize : submitFinalizeOnly}
              disabled={finalizationPending || saving}
            >
              <CircleCheck className="size-4" />
              {finalizationPending
                ? "Salvando e finalizando..."
                : "Confirmar e finalizar"}
            </Button>
          </>
        }
      >
        <div className="rounded-md border border-border bg-muted/50 p-4 text-sm">
          <p className="font-medium">
            {canEdit && dirty
              ? "As alterações pendentes serão incluídas."
              : "O conteúdo salvo será confirmado."}
          </p>
          <p className="mt-1 text-muted-foreground">
            A operação só será concluída se todos os dados obrigatórios forem
            válidos.
          </p>
        </div>
        {finalizeState.error || finalizeOnlyState.error ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {finalizeState.error || finalizeOnlyState.error}
          </p>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingNavigation)}
        onClose={() => setPendingNavigation(null)}
        title="Alterações não salvas"
        description="Sair agora descartará as mudanças feitas desde o último salvamento."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPendingNavigation(null)}
            >
              Continuar editando
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!pendingNavigation) return;
                const destination = pendingNavigation;
                revisionRef.current = 0;
                setDirty(false);
                setPendingNavigation(null);
                router.push(destination);
              }}
            >
              Descartar e sair
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Para manter o conteúdo, feche esta mensagem e use “Salvar rascunho”.
        </p>
      </Modal>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
