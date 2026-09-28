"use client";

import {
  documentTypeLabels,
  documentTypeStarters,
  documentFields,
} from "@/lib/clinical/document-types";

import {
  Archive,
  ArrowCounterClockwise as ArchiveRestore,
  Copy,
  FilePlus as FilePlus2,
  FileText,
  DotsThree as MoreHorizontal,
  PencilSimple as Pencil,
  FloppyDisk as Save,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  saveDocumentTemplate,
  setDocumentTemplateActive,
  type ModelActionState,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSubmitItem,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_DOCUMENT_TEMPLATE_LAYOUT,
  DOCUMENT_TEMPLATE_VARIABLES,
  type ClinicalDocumentType,
  type DocumentTemplateLayout,
  type DocumentVariableKey,
  inspectDocumentTemplateVariables,
  normalizeDocumentTemplateLayout,
  resolveDocumentTemplate,
} from "@/lib/clinical/document-templates";
import {
  DocumentFitFeedback,
  DocumentPreviewCard,
  useDocumentPreview,
} from "@/components/clinical/document-preview";
import { documentPreviewInput } from "@/lib/clinical/document-preview";
import type { RenderContext } from "@/lib/pdf/clinical-document";
import { formatCNPJ, formatPhoneBR } from "@/lib/validation/br";

export type DocumentClinicBranding = {
  name: string;
  legalName: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  logoUrl: string | null;
};

export type ClinicalDocumentTemplateVersionSummary = {
  id: string;
  version_number: number;
  title_template: string;
  body_template: string;
  layout_schema: unknown;
  published_at: string;
};

export type ClinicalDocumentTemplateSummary = {
  id: string;
  document_type: ClinicalDocumentType;
  name: string;
  description: string | null;
  active: boolean;
  versions: ClinicalDocumentTemplateVersionSummary[];
};

type EditorMode = "new" | "edit" | "duplicate";

type TemplateDraft = {
  mode: EditorMode;
  templateId: string;
  expectedVersionNumber: number;
  documentType: ClinicalDocumentType;
  name: string;
  description: string;
  title: string;
  body: string;
  layout: DocumentTemplateLayout;
};

const initialActionState: ModelActionState = {};
const variableGroups = [
  ...new Set(DOCUMENT_TEMPLATE_VARIABLES.map(({ group }) => group)),
];
const sampleVariableValues = Object.fromEntries(
  DOCUMENT_TEMPLATE_VARIABLES.map(({ key, example }) => [key, example]),
) as Record<DocumentVariableKey, string>;

export function DocumentTemplateManager({
  clinicBranding,
  templates,
}: {
  clinicBranding: DocumentClinicBranding;
  templates: ClinicalDocumentTemplateSummary[];
}) {
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const closeEditor = useCallback(() => setDraft(null), []);

  function startNew() {
    setDraft(emptyDraft());
  }

  function startEditing(template: ClinicalDocumentTemplateSummary) {
    const version = template.versions[0];
    if (!version) {
      toast.error("Este modelo ainda não possui uma versão publicada.");
      return;
    }

    setDraft({
      mode: "edit",
      templateId: template.id,
      expectedVersionNumber: version.version_number,
      documentType: template.document_type,
      name: template.name,
      description: template.description ?? "",
      title: version.title_template,
      body: version.body_template,
      layout: normalizeDocumentTemplateLayout(version.layout_schema),
    });
  }

  function startDuplicating(template: ClinicalDocumentTemplateSummary) {
    const version = template.versions[0];
    if (!version) {
      toast.error("Este modelo ainda não possui uma versão publicada.");
      return;
    }

    setDraft({
      mode: "duplicate",
      templateId: "",
      expectedVersionNumber: 0,
      documentType: template.document_type,
      name: `${template.name} (cópia)`,
      description: template.description ?? "",
      title: version.title_template,
      body: version.body_template,
      layout: normalizeDocumentTemplateLayout(version.layout_schema),
    });
  }

  if (draft) {
    const editorKey = [
      draft.mode,
      draft.templateId,
      draft.expectedVersionNumber,
      draft.name,
    ].join(":");

    return (
      <DocumentTemplateEditor
        key={editorKey}
        initialDraft={draft}
        clinicBranding={clinicBranding}
        onCancel={closeEditor}
        onSaved={closeEditor}
      />
    );
  }

  // Mesmo desenho da aba de fichas: cabeçalho solto, um cartão por modelo,
  // "Editar" à vista e o resto no menu. Antes eram linhas com borda dentro de
  // outro cartão e três botões soltos por linha.
  return (
    <div className="grid gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold">Modelos de documentos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Modelos de documentos clínicos e termos de consentimento. As
            variáveis são preenchidas com os dados do atendimento na hora de
            emitir.
          </p>
        </div>
        <Button type="button" className="shrink-0" onClick={startNew}>
          <FilePlus2 className="size-4" aria-hidden="true" />
          Novo modelo
        </Button>
      </div>

      {templates.length ? (
        <div className="grid gap-3">
          {templates.map((template) => (
            <DocumentTemplateListItem
              key={template.id}
              template={template}
              onEdit={() => startEditing(template)}
              onDuplicate={() => startDuplicating(template)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={FileText}
            title="Nenhum modelo de documento"
            description="Crie o primeiro modelo e use as variáveis para trazer os dados do paciente e do atendimento automaticamente."
            actions={
              <Button type="button" onClick={startNew}>
                <FilePlus2 className="size-4" aria-hidden="true" />
                Novo modelo
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}

function DocumentTemplateListItem({
  onDuplicate,
  onEdit,
  template,
}: {
  onDuplicate: () => void;
  onEdit: () => void;
  template: ClinicalDocumentTemplateSummary;
}) {
  const [state, action, pending] = useActionState(
    setDocumentTemplateActive,
    initialActionState,
  );
  // O diálogo guarda o resultado que existia quando abriu: chegou um novo
  // sem erro, ele fecha sozinho; com erro, fica aberto mostrando a mensagem.
  // (Com um booleano, um sucesso antigo impedia de abrir de novo.)
  const [archiveOpenedAt, setArchiveOpenedAt] =
    useState<ModelActionState | null>(null);
  const archiveDialogOpen =
    archiveOpenedAt !== null &&
    (archiveOpenedAt === state || Boolean(state.error));
  const currentVersion = template.versions[0];
  const typeLabel = documentTypeLabels[template.document_type];

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Card className={template.active ? undefined : "opacity-75"}>
      <CardContent className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{template.name}</p>
            {/* O tipo só aparece quando o nome não o repete: "Declaração de
                comparecimento" com o selo "Declaração de comparecimento"
                dizia a mesma coisa duas vezes. */}
            {template.name.trim() !== typeLabel ? (
              <Badge variant="neutral">{typeLabel}</Badge>
            ) : null}
            <Badge variant={template.active ? "success" : "neutral"}>
              {template.active ? "Ativo" : "Arquivado"}
            </Badge>
          </div>
          {template.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {template.description}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {currentVersion
              ? `Versão ${currentVersion.version_number} · publicada em ${formatDateTime(currentVersion.published_at)}`
              : "Sem versão publicada"}
          </p>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!currentVersion || !template.active}
            onClick={onEdit}
          >
            <Pencil className="size-4" aria-hidden="true" /> Editar
          </Button>
          <DropdownMenu
            trigger={<MoreHorizontal className="size-4" aria-hidden="true" />}
            triggerLabel={`Ações de ${template.name}`}
          >
            {(close) => (
              <>
                <DropdownMenuItem
                  icon={Copy}
                  onSelect={() => {
                    close();
                    onDuplicate();
                  }}
                >
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {template.active ? (
                  <DropdownMenuItem
                    icon={Archive}
                    variant="destructive"
                    onSelect={() => {
                      close();
                      setArchiveOpenedAt(state);
                    }}
                  >
                    Arquivar
                  </DropdownMenuItem>
                ) : (
                  <form action={action} onSubmit={close} className="contents">
                    <input
                      type="hidden"
                      name="template_id"
                      value={template.id}
                    />
                    <input type="hidden" name="active" value="true" />
                    <DropdownMenuSubmitItem
                      icon={ArchiveRestore}
                      disabled={pending}
                    >
                      Reativar
                    </DropdownMenuSubmitItem>
                  </form>
                )}
              </>
            )}
          </DropdownMenu>
        </div>
      </CardContent>

      <ConfirmDialog
        open={archiveDialogOpen}
        onClose={() => setArchiveOpenedAt(null)}
        title="Arquivar modelo de documento?"
        description={`${template.name} deixa de aparecer para novas emissões. Documentos já emitidos continuam preservados.`}
        confirmLabel="Arquivar modelo"
        pendingLabel="Arquivando..."
        destructive
        pending={pending}
        error={state.error}
        formAction={action}
      >
        <input type="hidden" name="template_id" value={template.id} />
        <input type="hidden" name="active" value="false" />
      </ConfirmDialog>
    </Card>
  );
}

function DocumentTemplateEditor({
  clinicBranding,
  initialDraft,
  onCancel,
  onSaved,
}: {
  clinicBranding: DocumentClinicBranding;
  initialDraft: TemplateDraft;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    saveDocumentTemplate,
    initialActionState,
  );
  const [documentType, setDocumentType] = useState(initialDraft.documentType);
  const [name, setName] = useState(initialDraft.name);
  const [description, setDescription] = useState(initialDraft.description);
  const [title, setTitle] = useState(initialDraft.title);
  const [body, setBody] = useState(initialDraft.body);
  const [layout, setLayout] = useState(initialDraft.layout);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const activeEditor = useRef<"title" | "body">("body");
  const inspection = useMemo(
    () => inspectDocumentTemplateVariables(title, body),
    [body, title],
  );
  const previewVariableValues = useMemo(
    () => buildPreviewVariableValues(clinicBranding),
    [clinicBranding],
  );
  const previewTitle = useMemo(
    () => resolveDocumentTemplate(title, previewVariableValues).value,
    [previewVariableValues, title],
  );
  const previewBody = useMemo(
    () => resolveDocumentTemplate(body, previewVariableValues).value,
    [body, previewVariableValues],
  );
  const previewContext = useMemo<RenderContext>(
    () => ({
      timezone: "America/Sao_Paulo",
      clinic: clinicBranding,
      unit: { name: null, address: null, city: null, state: null },
      patient: {
        displayName: "Maria de Souza Silva",
        fullName: "Maria de Souza Silva",
        cpf: "123.456.789-00",
        rg: "12.345.678-9",
        birthDate: "1987-04-15",
      },
      professional: {
        name: "Dra. Ana Martins",
        councilType: "CRM",
        councilNumber: "12345",
        councilState: "RN",
        registry: "CRM 12345 RN",
      },
    }),
    [clinicBranding],
  );
  const previewInput = useMemo(
    () =>
      documentPreviewInput({
        title: previewTitle,
        body: previewBody,
        type: documentType,
        layout,
        context: previewContext,
        fields: Object.fromEntries(
          (documentFields[documentType] ?? []).map((field) => [
            field.key,
            "Preenchido na emissão",
          ]),
        ),
        issuedAt: "2026-07-14T17:50:00.000Z",
      }),
    [documentType, layout, previewBody, previewContext, previewTitle],
  );
  const preview = useDocumentPreview(previewInput);
  const dirty = useMemo(
    () =>
      JSON.stringify({
        documentType,
        name,
        description,
        title,
        body,
        layout,
      }) !==
      JSON.stringify({
        documentType: initialDraft.documentType,
        name: initialDraft.name,
        description: initialDraft.description,
        title: initialDraft.title,
        body: initialDraft.body,
        layout: initialDraft.layout,
      }),
    [body, description, documentType, initialDraft, layout, name, title],
  );
  const starter = documentTypeStarters[documentType];
  // Trocou o tipo mas o texto é próprio: oferece o texto-base em vez de
  // apagar o que a pessoa escreveu.
  const offerStarter =
    initialDraft.mode !== "edit" &&
    documentType !== initialDraft.documentType &&
    (title !== starter.title || body !== starter.body);

  function changeDocumentType(nextType: ClinicalDocumentType) {
    const currentStarter = documentTypeStarters[documentType];
    const untouched =
      title === currentStarter.title && body === currentStarter.body;
    setDocumentType(nextType);
    // Texto ainda intocado: acompanha o tipo, e a prévia mostra o documento
    // certo. Era aqui que a declaração de comparecimento ficava presa.
    if (untouched) {
      setTitle(documentTypeStarters[nextType].title);
      setBody(documentTypeStarters[nextType].body);
    }
  }

  function applyStarterText() {
    setTitle(starter.title);
    setBody(starter.body);
  }

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onSaved();
    }
  }, [onSaved, state.success]);

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
      if (
        destination.origin !== window.location.origin ||
        destination.href === window.location.href
      ) {
        return;
      }

      event.preventDefault();
      setPendingNavigation(
        `${destination.pathname}${destination.search}${destination.hash}`,
      );
    }

    document.addEventListener("click", protectInternalNavigation, true);
    return () =>
      document.removeEventListener("click", protectInternalNavigation, true);
  }, [dirty]);

  function requestCancel() {
    if (dirty) {
      setConfirmingCancel(true);
      return;
    }
    onCancel();
  }

  function insertVariable(token: string) {
    const target = activeEditor.current;
    const element = target === "title" ? titleRef.current : bodyRef.current;
    const currentValue = target === "title" ? title : body;
    const selectionStart = element?.selectionStart ?? currentValue.length;
    const selectionEnd = element?.selectionEnd ?? selectionStart;
    const nextValue = `${currentValue.slice(0, selectionStart)}${token}${currentValue.slice(selectionEnd)}`;
    const nextCursor = selectionStart + token.length;

    if (target === "title") setTitle(nextValue);
    else setBody(nextValue);

    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function updateLayout(
    updater: (current: DocumentTemplateLayout) => DocumentTemplateLayout,
  ) {
    setLayout((current) => updater(current));
  }

  const heading =
    initialDraft.mode === "edit"
      ? `Editar ${initialDraft.name}`
      : initialDraft.mode === "duplicate"
        ? "Duplicar modelo"
        : "Criar modelo de documento";

  return (
    <>
      <form
        action={action}
        className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]"
      >
        <input
          type="hidden"
          name="template_id"
          value={initialDraft.templateId}
        />
        <input
          type="hidden"
          name="expected_version_number"
          value={initialDraft.expectedVersionNumber}
        />
        <input
          type="hidden"
          name="layout_json"
          value={JSON.stringify(layout)}
        />

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold">{heading}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {initialDraft.mode === "edit"
                    ? "Ao salvar, o sistema publica uma nova versão sem alterar os documentos já emitidos."
                    : initialDraft.mode === "duplicate"
                      ? "A cópia vira um modelo novo; o original continua como está."
                      : "Escolha o tipo, ajuste o texto e confira na prévia como o documento sai impresso."}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <DocumentTemplateEditorActions
                  mode={initialDraft.mode}
                  pending={pending}
                  hasUnknownVariables={inspection.unknownVariables.length > 0}
                  onCancel={requestCancel}
                />
              </div>
            </div>
            <FormError message={state.error} className="mt-3" />
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Tipo de documento
                {initialDraft.mode === "edit" ? (
                  <input
                    type="hidden"
                    name="document_type"
                    value={documentType}
                  />
                ) : null}
                <Select
                  name={
                    initialDraft.mode === "edit" ? undefined : "document_type"
                  }
                  value={documentType}
                  disabled={initialDraft.mode === "edit"}
                  onValueChange={(value) =>
                    changeDocumentType(value as ClinicalDocumentType)
                  }
                >
                  {Object.entries(documentTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Nome do modelo
                <Input
                  name="name"
                  value={name}
                  maxLength={160}
                  placeholder={documentTypeLabels[documentType]}
                  required
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            </div>

            {offerStarter ? (
              <div className="flex animate-content-enter flex-col gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground">
                  O título e o texto continuam os que você escreveu.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={applyStarterText}
                >
                  Usar o texto-base de {documentTypeLabels[documentType]}
                </Button>
              </div>
            ) : null}

            <label className="grid gap-2 text-sm font-medium">
              Descrição
              <Input
                name="description"
                value={description}
                maxLength={500}
                placeholder="Quando este modelo deve ser utilizado"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Título do documento
              <Input
                ref={titleRef}
                name="title_template"
                value={title}
                maxLength={300}
                required
                aria-invalid={inspection.unknownVariables.length > 0}
                aria-describedby={
                  inspection.unknownVariables.length > 0
                    ? "document-template-variable-error"
                    : undefined
                }
                onFocus={() => {
                  activeEditor.current = "title";
                }}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            {/* Fonte do app, não monoespaçada: é um texto corrido, e as
              variáveis já se destacam pelas chaves. */}
            <label className="grid gap-2 text-sm font-medium">
              Corpo do texto
              <Textarea
                ref={bodyRef}
                name="body_template"
                value={body}
                maxLength={30_000}
                required
                className="min-h-56 resize-y leading-6"
                aria-invalid={inspection.unknownVariables.length > 0}
                aria-describedby={
                  inspection.unknownVariables.length > 0
                    ? "document-template-variable-error document-template-fit"
                    : "document-template-fit"
                }
                onFocus={() => {
                  activeEditor.current = "body";
                }}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>

            <DocumentFitFeedback
              id="document-template-fit"
              preview={preview}
              characters={body.length}
              sample
            />

            {inspection.unknownVariables.length ? (
              <FormError
                id="document-template-variable-error"
                message={`Variáveis não reconhecidas: ${inspection.unknownVariables
                  .map((key) => `{{${key}}}`)
                  .join(", ")}. Remova-as ou escolha uma opção da lista.`}
              />
            ) : null}

            {/* Logo abaixo do texto, onde a variável entra. Antes elas vinham
              antes do título e empurravam o corpo do texto para baixo. */}
            <div className="grid gap-3 rounded-md border border-border bg-muted/25 p-4">
              <div>
                <p className="text-sm font-medium">Variáveis automáticas</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clique no título ou no texto, onde a variável deve entrar, e
                  escolha uma abaixo. Na emissão ela vira o dado do atendimento.
                </p>
              </div>
              <div className="grid gap-3">
                {variableGroups.map((group) => (
                  <div key={group} className="grid gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {DOCUMENT_TEMPLATE_VARIABLES.filter(
                        (variable) => variable.group === group,
                      ).map((variable) => (
                        <Button
                          key={variable.key}
                          type="button"
                          variant="secondary"
                          title={`${variable.token} · Exemplo: ${variable.example}`}
                          onClick={() => insertVariable(variable.token)}
                          className="h-auto rounded-full px-2.5 py-1 text-control font-normal shadow-none hover:border-primary hover:bg-primary-muted hover:text-primary"
                        >
                          {variable.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <LayoutSettings layout={layout} onChange={updateLayout} />

            <FormError message={state.error} />
            <div className="flex flex-wrap justify-end gap-2">
              <DocumentTemplateEditorActions
                mode={initialDraft.mode}
                pending={pending}
                hasUnknownVariables={inspection.unknownVariables.length > 0}
                onCancel={requestCancel}
              />
            </div>
          </CardContent>
        </Card>

        <div className="xl:sticky xl:top-5 xl:self-start">
          <DocumentPreviewCard
            preview={preview}
            paperSize={layout.paperSize}
            sample
          />
        </div>
      </form>
      <ConfirmDialog
        open={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        title="Descartar alterações do modelo?"
        description="O texto, as variáveis e o layout alterados ainda não foram publicados."
        confirmLabel="Descartar alterações"
        destructive
        onConfirm={() => {
          setConfirmingCancel(false);
          onCancel();
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingNavigation)}
        onClose={() => setPendingNavigation(null)}
        title="Sair sem publicar o modelo?"
        description="As alterações do documento serão perdidas."
        confirmLabel="Descartar e sair"
        destructive
        onConfirm={() => {
          if (!pendingNavigation) return;
          const destination = pendingNavigation;
          setPendingNavigation(null);
          router.push(destination);
        }}
      />
    </>
  );
}

function DocumentTemplateEditorActions({
  hasUnknownVariables,
  mode,
  onCancel,
  pending,
}: {
  hasUnknownVariables: boolean;
  mode: EditorMode;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={onCancel}
      >
        Cancelar
      </Button>
      <Button type="submit" disabled={pending || hasUnknownVariables}>
        <Save className="size-4" aria-hidden="true" />
        {pending
          ? "Salvando..."
          : mode === "edit"
            ? "Publicar nova versão"
            : "Criar modelo"}
      </Button>
    </>
  );
}

function LayoutSettings({
  layout,
  onChange,
}: {
  layout: DocumentTemplateLayout;
  onChange: (
    updater: (current: DocumentTemplateLayout) => DocumentTemplateLayout,
  ) => void;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <h3 className="font-semibold">Layout de impressão</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Estas opções ficam vinculadas à versão publicada.
        </p>
      </div>

      <div className="grid gap-4 rounded-md border border-border p-4">
        <label className="grid gap-2 text-sm font-medium sm:max-w-xs">
          Tamanho do papel
          <Select
            value={layout.paperSize}
            onValueChange={(value) =>
              onChange((current) => ({
                ...current,
                paperSize: value === "LETTER" ? "LETTER" : "A4",
              }))
            }
          >
            <option value="A4">A4</option>
            <option value="LETTER">Papel carta</option>
          </Select>
        </label>
      </div>

      <LayoutSection title="Cabeçalho">
        <Switch
          label="Mostrar cabeçalho"
          checked={layout.header.enabled}
          onCheckedChange={(enabled) =>
            onChange((current) => ({
              ...current,
              header: { ...current.header, enabled },
            }))
          }
        />
        <Switch
          label="Mostrar logo"
          checked={layout.header.showLogo}
          disabled={!layout.header.enabled}
          onCheckedChange={(showLogo) =>
            onChange((current) => ({
              ...current,
              header: { ...current.header, showLogo },
            }))
          }
        />
        <Switch
          label="Mostrar contato e endereço da clínica"
          checked={layout.header.showClinicDetails}
          disabled={!layout.header.enabled}
          onCheckedChange={(showClinicDetails) =>
            onChange((current) => ({
              ...current,
              header: { ...current.header, showClinicDetails },
            }))
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Posição da logo
            <Select
              value={layout.header.logoPosition}
              disabled={!layout.header.enabled || !layout.header.showLogo}
              onValueChange={(value) =>
                onChange((current) => ({
                  ...current,
                  header: {
                    ...current.header,
                    logoPosition: value === "right" ? "right" : "left",
                  },
                }))
              }
            >
              <option value="left">Esquerda</option>
              <option value="right">Direita</option>
            </Select>
          </label>
          <FontSizeSelect
            label="Tamanho do texto"
            value={layout.header.fontSize}
            disabled={!layout.header.enabled}
            onChange={(fontSize) =>
              onChange((current) => ({
                ...current,
                header: { ...current.header, fontSize },
              }))
            }
          />
        </div>
      </LayoutSection>

      <LayoutSection title="Corpo do documento">
        <Switch
          label="Mostrar resumo do paciente"
          checked={layout.body.showPatientSummary}
          onCheckedChange={(showPatientSummary) =>
            onChange((current) => ({
              ...current,
              body: { ...current.body, showPatientSummary },
            }))
          }
        />
        <FontSizeSelect
          label="Tamanho do texto"
          value={layout.body.fontSize}
          onChange={(fontSize) =>
            onChange((current) => ({
              ...current,
              body: { ...current.body, fontSize },
            }))
          }
        />
      </LayoutSection>

      <LayoutSection title="Assinatura">
        <Switch
          label="Mostrar linha de assinatura"
          checked={layout.signature.enabled}
          onCheckedChange={(enabled) =>
            onChange((current) => ({
              ...current,
              signature: { ...current.signature, enabled },
            }))
          }
        />
        <Switch
          label="Mostrar registro profissional"
          checked={layout.signature.showCouncil}
          disabled={!layout.signature.enabled}
          onCheckedChange={(showCouncil) =>
            onChange((current) => ({
              ...current,
              signature: { ...current.signature, showCouncil },
            }))
          }
        />
      </LayoutSection>

      <LayoutSection title="Rodapé">
        <Switch
          label="Mostrar rodapé"
          checked={layout.footer.enabled}
          onCheckedChange={(enabled) =>
            onChange((current) => ({
              ...current,
              footer: { ...current.footer, enabled },
            }))
          }
        />
        <Switch
          label="Mostrar nome do paciente"
          checked={layout.footer.showPatientName}
          disabled={!layout.footer.enabled}
          onCheckedChange={(showPatientName) =>
            onChange((current) => ({
              ...current,
              footer: { ...current.footer, showPatientName },
            }))
          }
        />
        <Switch
          label="Mostrar número da página"
          checked={layout.footer.showPageNumber}
          disabled={!layout.footer.enabled}
          onCheckedChange={(showPageNumber) =>
            onChange((current) => ({
              ...current,
              footer: { ...current.footer, showPageNumber },
            }))
          }
        />
        <FontSizeSelect
          label="Tamanho do texto"
          value={layout.footer.fontSize}
          disabled={!layout.footer.enabled}
          onChange={(fontSize) =>
            onChange((current) => ({
              ...current,
              footer: { ...current.footer, fontSize },
            }))
          }
        />
      </LayoutSection>
    </div>
  );
}

function LayoutSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <fieldset className="grid gap-3 rounded-md border border-border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function FontSizeSelect({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: "small" | "medium" | "large") => void;
  value: "small" | "medium" | "large";
}) {
  return (
    <label className="grid gap-2 text-sm font-medium sm:max-w-xs">
      {label}
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(nextValue) =>
          onChange(nextValue as "small" | "medium" | "large")
        }
      >
        <option value="small">Pequeno</option>
        <option value="medium">Médio</option>
        <option value="large">Grande</option>
      </Select>
    </label>
  );
}

function buildPreviewVariableValues(
  clinic: DocumentClinicBranding,
): Record<DocumentVariableKey, string> {
  return {
    ...sampleVariableValues,
    "clinica.nome": clinic.name,
    "clinica.razao_social": clinic.legalName || "Razão social não cadastrada",
    "clinica.cnpj": clinic.document
      ? formatCNPJ(clinic.document)
      : "CNPJ não cadastrado",
    "clinica.endereco": clinic.address || "Endereço não cadastrado",
    "clinica.cidade": clinic.city || "Cidade não cadastrada",
    "clinica.uf": clinic.state || "UF não cadastrada",
    "clinica.telefone": clinic.phone
      ? formatPhoneBR(clinic.phone)
      : "Telefone não cadastrado",
    "clinica.email": clinic.email || "E-mail não cadastrado",
  };
}

/**
 * Texto-base de cada tipo. O modelo novo nascia sempre com o texto da
 * declaração de comparecimento, e trocar o tipo não mudava o texto: a prévia
 * seguia mostrando a declaração qualquer que fosse o tipo escolhido.
 *
 * As linhas "____" são para completar na emissão: lá o texto já resolvido
 * vai para um campo editável, onde o profissional preenche medicamentos,
 * exames e dias de afastamento.
 */

function emptyDraft(): TemplateDraft {
  const starter = documentTypeStarters.attendance_declaration;
  return {
    mode: "new",
    templateId: "",
    expectedVersionNumber: 0,
    documentType: "attendance_declaration",
    name: "",
    description: "",
    title: starter.title,
    body: starter.body,
    layout: normalizeDocumentTemplateLayout(DEFAULT_DOCUMENT_TEMPLATE_LAYOUT),
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "data não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
