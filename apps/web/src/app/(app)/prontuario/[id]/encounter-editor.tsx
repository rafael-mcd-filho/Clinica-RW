"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import {
  CheckCircle as CircleCheck,
  FileText as FileCheck,
  Plus,
  FloppyDisk as Save,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  addEncounterAddendum,
  finalizeEncounter,
  saveAndFinalizeEncounter,
  saveEncounterDraft,
  type ClinicalActionState,
} from "../actions";
import { CidCombobox } from "@/components/clinical/cid-combobox";
import { ClinicalFormRenderer } from "@/components/clinical/clinical-form-renderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { RichTextView } from "@/components/clinical/rich-text-view";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

type Addendum = {
  id: string;
  content: string;
  created_at: string;
  author: string;
};

type Diagnosis = {
  cid_code: string;
  description: string | null;
  is_primary: boolean;
};

const initialState: ClinicalActionState = {};

export function EncounterEditor({
  encounterId,
  status,
  canEdit,
  canFinalize,
  canAddAddendum,
  entryUpdatedAt,
  timeZone,
  schema,
  structuredData,
  freeNotes,
  diagnoses,
  addenda,
}: {
  encounterId: string;
  status: string;
  canEdit: boolean;
  canFinalize: boolean;
  canAddAddendum: boolean;
  entryUpdatedAt: string;
  timeZone: string;
  schema: unknown;
  structuredData: Record<string, unknown>;
  freeNotes: string | null;
  diagnoses: Diagnosis[];
  addenda: Addendum[];
}) {
  const router = useRouter();
  const formId = useId().replaceAll(":", "");
  const formRef = useRef<HTMLFormElement | null>(null);
  const autosaveSubmitRef = useRef<HTMLButtonElement | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(entryUpdatedAt);
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
      if (result.updatedAt) setLastSavedAt(result.updatedAt);
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
      } else if (result.fieldErrors) {
        setConfirmingFinalize(false);
      }
      return result;
    },
    initialState,
  );
  const [finalizeOnlyState, submitFinalizeOnly, finalizingOnly] =
    useActionState(
      async (previousState: ClinicalActionState, formData: FormData) => {
        const result = await finalizeOnlyAction(previousState, formData);
        if (result.success) {
          setDirty(false);
          setConfirmingFinalize(false);
        }
        return result;
      },
      initialState,
    );
  const [addendumState, submitAddendum, adding] = useActionState(
    addendumAction,
    initialState,
  );
  const finalized = status === "finalized";
  const finalizationPending = finalizing || finalizingOnly;
  const editingLocked = finalizationPending;
  const readOnly = finalized || !canEdit;

  function markDirty() {
    revisionRef.current += 1;
    setDirty(true);
  }

  useEffect(() => {
    for (const state of [finalizeState, finalizeOnlyState, addendumState]) {
      if (state.success) toast.success(state.success);
    }
  }, [finalizeState, finalizeOnlyState, addendumState]);

  useEffect(() => {
    if (!dirty || !canEdit || readOnly || saving || finalizationPending) return;

    const timer = window.setTimeout(() => {
      if (formRef.current && autosaveSubmitRef.current) {
        formRef.current.requestSubmit(autosaveSubmitRef.current);
      }
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [canEdit, dirty, finalizationPending, readOnly, saving]);

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
    const firstFieldId = Object.keys(
      finalizeState.fieldErrors ?? draftState.fieldErrors ?? {},
    )[0];
    if (!firstFieldId) return;
    const container = Array.from(
      document.querySelectorAll<HTMLElement>("[data-clinical-field-id]"),
    ).find((element) => element.dataset.clinicalFieldId === firstFieldId);
    const control = container?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, button, [contenteditable="true"]',
    );
    control?.focus();
    container?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [draftState.fieldErrors, finalizeState.fieldErrors]);

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
        ref={formRef}
        id={formId}
        action={saveDraft}
        className="grid gap-5"
        onChange={markDirty}
      >
        <input
          type="hidden"
          name="expected_updated_at"
          value={lastSavedAt}
          readOnly
        />
        <button
          ref={autosaveSubmitRef}
          type="submit"
          formNoValidate
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        >
          Salvar automaticamente
        </button>
        <ClinicalFormRenderer
          schema={schema}
          values={structuredData}
          mode={readOnly ? "readonly" : "edit"}
          disabled={editingLocked}
          errors={finalizeState.fieldErrors ?? draftState.fieldErrors}
          onValueChange={markDirty}
        />

        <Card>
          <CardHeader>
            <h2 className="font-semibold">Diagnósticos e notas livres</h2>
          </CardHeader>
          <CardContent className="grid gap-5">
            <DiagnosisFields
              diagnoses={diagnoses}
              readOnly={readOnly}
              disabled={editingLocked}
              onStructureChange={markDirty}
            />
            <label className="grid gap-2 text-sm font-medium">
              Notas livres
              {readOnly ? (
                <div className="min-h-24 rounded-md border border-border bg-muted px-3 py-2 text-sm font-normal">
                  {freeNotes ? <RichTextView value={freeNotes} /> : "—"}
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
              <p className="text-sm text-destructive">{draftState.error}</p>
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
                {draftState.error
                  ? "Erro ao salvar"
                  : saving
                    ? "Salvando..."
                    : finalizationPending
                      ? "Salvando e finalizando..."
                      : dirty
                        ? "Pendente — alterações não salvas"
                        : `Salvo às ${formatSavedTime(lastSavedAt, timeZone)}`}
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
            {canAddAddendum ? (
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
            ) : null}
            {addenda.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-border p-3"
              >
                <RichTextView value={item.content} className="text-sm" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.author} · {formatDateTime(item.created_at, timeZone)}
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
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              disabled={finalizationPending}
              onClick={() => setConfirmingFinalize(false)}
            >
              Continuar editando
            </Button>
            <Button
              type="submit"
              form={formId}
              formAction={canEdit ? submitFinalize : submitFinalizeOnly}
              className="w-full sm:w-auto"
              disabled={finalizationPending || saving}
            >
              <CircleCheck className="size-4" aria-hidden="true" />
              {finalizationPending
                ? "Salvando e finalizando..."
                : "Confirmar e finalizar"}
            </Button>
          </div>
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
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setPendingNavigation(null)}
            >
              Continuar editando
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
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
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Para manter o conteúdo, feche esta mensagem e use “Salvar rascunho”.
        </p>
      </Modal>
    </div>
  );
}

function DiagnosisFields({
  diagnoses,
  readOnly,
  disabled,
  onStructureChange,
}: {
  diagnoses: Diagnosis[];
  readOnly: boolean;
  disabled: boolean;
  onStructureChange: () => void;
}) {
  const nextKey = useRef(diagnoses.length);
  const [rows, setRows] = useState(() =>
    diagnoses.length
      ? diagnoses.map((diagnosis, index) => ({
          ...diagnosis,
          key: `diagnosis-${index}`,
        }))
      : readOnly
        ? []
        : [
            {
              cid_code: "",
              description: "",
              is_primary: true,
              key: "diagnosis-0",
            },
          ],
  );
  const [primaryKey, setPrimaryKey] = useState(
    rows.find((row) => row.is_primary)?.key ?? rows[0]?.key ?? "",
  );

  function addRow() {
    const key = `diagnosis-${++nextKey.current}`;
    setRows((current) => [
      ...current,
      { cid_code: "", description: "", is_primary: false, key },
    ]);
    if (!primaryKey) setPrimaryKey(key);
    onStructureChange();
  }

  function removeRow(key: string) {
    const remaining = rows.filter((row) => row.key !== key);
    setRows(remaining);
    if (primaryKey === key) setPrimaryKey(remaining[0]?.key ?? "");
    onStructureChange();
  }

  if (readOnly && !rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum diagnóstico registrado.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Diagnósticos</h3>
          <p className="text-xs text-muted-foreground">
            Registre um ou mais CIDs e indique o diagnóstico principal.
          </p>
        </div>
        {!readOnly ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={addRow}
          >
            <Plus className="size-4" aria-hidden="true" />
            Adicionar CID
          </Button>
        ) : null}
      </div>

      {rows.map((row, index) => (
        <div
          key={row.key}
          className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto_auto] md:items-end"
        >
          <input type="hidden" name="diagnosis_key" value={row.key} />
          {/* Busca por código ou descrição na tabela CID-10; escolher uma
              sugestão preenche a descrição, que continua editável. */}
          <label className="grid gap-1.5 text-sm font-medium">
            CID
            <CidCombobox
              name="diagnosis_code"
              code={row.cid_code}
              disabled={readOnly || disabled}
              ariaLabel={`CID ${index + 1}: buscar por código ou descrição`}
              onSelect={(selection) => {
                setRows((current) =>
                  current.map((item) =>
                    item.key === row.key
                      ? {
                          ...item,
                          cid_code: selection.code,
                          description:
                            selection.description ?? item.description,
                        }
                      : item,
                  ),
                );
                onStructureChange();
              }}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Descrição
            <Input
              name="diagnosis_description"
              value={row.description ?? ""}
              onChange={(event) => {
                const description = event.target.value;
                setRows((current) =>
                  current.map((item) =>
                    item.key === row.key ? { ...item, description } : item,
                  ),
                );
              }}
              disabled={readOnly || disabled}
              placeholder="Preenchida ao escolher o CID"
              maxLength={300}
            />
          </label>
          <label className="inline-flex h-10 items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="primary_diagnosis_key"
              value={row.key}
              checked={primaryKey === row.key}
              disabled={readOnly || disabled}
              onChange={() => setPrimaryKey(row.key)}
              className="size-4 accent-primary"
            />
            Principal
          </label>
          {!readOnly ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label={`Remover CID ${index + 1}`}
              onClick={() => removeRow(row.key)}
            >
              <Trash className="size-4 text-destructive" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function formatSavedTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}
