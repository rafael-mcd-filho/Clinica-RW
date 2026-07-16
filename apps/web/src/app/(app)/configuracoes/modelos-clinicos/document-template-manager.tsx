"use client";

import {
  Copy,
  FilePlus as FilePlus2,
  FileText,
  PencilSimple as Pencil,
  Power,
  FloppyDisk as Save,
} from "@phosphor-icons/react";
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
import { cn } from "@/lib/utils";
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

const documentTypeLabels: Record<ClinicalDocumentType, string> = {
  prescription: "Prescrição",
  exam_request: "Solicitação de exame",
  medical_certificate: "Atestado",
  attendance_declaration: "Declaração de comparecimento",
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

  return (
    <Card>
      <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-semibold">Modelos de documentos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Textos reutilizáveis para prescrições, solicitações, atestados e
            declarações.
          </p>
        </div>
        <Button type="button" onClick={startNew}>
          <FilePlus2 className="size-4" aria-hidden="true" />
          Novo modelo
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        {templates.map((template) => {
          const currentVersion = template.versions[0];

          return (
            <div
              key={template.id}
              className={cn(
                "flex flex-col justify-between gap-3 rounded-md border border-border p-4 md:flex-row md:items-center",
                !template.active && "bg-muted/35 opacity-75",
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{template.name}</p>
                  <Badge variant="neutral">
                    {documentTypeLabels[template.document_type]}
                  </Badge>
                  <Badge variant={template.active ? "success" : "neutral"}>
                    {template.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                {template.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {template.description}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {currentVersion
                    ? `Versão ${currentVersion.version_number} · publicada em ${formatDateTime(currentVersion.published_at)}`
                    : "Nenhuma versão publicada"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!currentVersion || !template.active}
                  onClick={() => startEditing(template)}
                >
                  <Pencil className="size-4" aria-hidden="true" /> Editar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!currentVersion}
                  onClick={() => startDuplicating(template)}
                >
                  <Copy className="size-4" aria-hidden="true" /> Duplicar
                </Button>
                <TemplateActiveForm template={template} />
              </div>
            </div>
          );
        })}
        {!templates.length ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
            <FileText
              className="mx-auto size-7 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="mt-2 font-medium">Nenhum modelo criado</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie o primeiro modelo e use variáveis para preencher os dados do
              atendimento automaticamente.
            </p>
          </div>
        ) : null}
      </CardContent>
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

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onSaved();
    }
  }, [onSaved, state.success]);

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
    <form
      action={action}
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]"
    >
      <input type="hidden" name="template_id" value={initialDraft.templateId} />
      <input
        type="hidden"
        name="expected_version_number"
        value={initialDraft.expectedVersionNumber}
      />
      <input type="hidden" name="layout_json" value={JSON.stringify(layout)} />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold">{heading}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ao editar, o sistema publica uma nova versão sem alterar os
                documentos já emitidos.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <DocumentTemplateEditorActions
                mode={initialDraft.mode}
                pending={pending}
                hasUnknownVariables={inspection.unknownVariables.length > 0}
                onCancel={onCancel}
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
                  setDocumentType(value as ClinicalDocumentType)
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
                placeholder="Declaração de comparecimento"
                required
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          </div>

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

          <div className="grid gap-3 rounded-md border border-border bg-muted/25 p-4">
            <div>
              <p className="text-sm font-medium">Variáveis automáticas</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Posicione o cursor no título ou no texto e escolha uma variável.
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
                      <button
                        key={variable.key}
                        type="button"
                        title={`${variable.token} · Exemplo: ${variable.example}`}
                        onClick={() => insertVariable(variable.token)}
                        className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-secondary-foreground transition-colors hover:border-primary hover:bg-primary-muted hover:text-primary"
                      >
                        {variable.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-sm font-medium">
            Título do documento
            <Input
              ref={titleRef}
              name="title_template"
              value={title}
              maxLength={300}
              required
              aria-invalid={inspection.unknownVariables.length > 0}
              onFocus={() => {
                activeEditor.current = "title";
              }}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Corpo do texto
            <Textarea
              ref={bodyRef}
              name="body_template"
              value={body}
              maxLength={30_000}
              required
              className="min-h-56 resize-y font-mono text-[13px] leading-6"
              aria-invalid={inspection.unknownVariables.length > 0}
              onFocus={() => {
                activeEditor.current = "body";
              }}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>

          {inspection.unknownVariables.length ? (
            <FormError
              message={`Variáveis não reconhecidas: ${inspection.unknownVariables
                .map((key) => `{{${key}}}`)
                .join(", ")}. Remova-as ou escolha uma opção da lista.`}
            />
          ) : null}

          <LayoutSettings layout={layout} onChange={updateLayout} />

          <FormError message={state.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <DocumentTemplateEditorActions
              mode={initialDraft.mode}
              pending={pending}
              hasUnknownVariables={inspection.unknownVariables.length > 0}
              onCancel={onCancel}
            />
          </div>
        </CardContent>
      </Card>

      <div className="xl:sticky xl:top-5 xl:self-start">
        <DocumentPaperPreview
          title={previewTitle}
          body={previewBody}
          layout={layout}
          clinicBranding={clinicBranding}
        />
      </div>
    </form>
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

function DocumentPaperPreview({
  body,
  clinicBranding,
  layout,
  title,
}: {
  body: string;
  clinicBranding: DocumentClinicBranding;
  layout: DocumentTemplateLayout;
  title: string;
}) {
  const headerTextSize = previewFontSize(layout.header.fontSize, "header");
  const bodyTextSize = previewFontSize(layout.body.fontSize, "body");
  const footerTextSize = previewFontSize(layout.footer.fontSize, "footer");
  const clinicDetails = formatClinicDetails(clinicBranding);

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Prévia</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Os dados da clínica são reais; paciente, profissional e atendimento
          usam exemplos.
        </p>
      </CardHeader>
      <CardContent className="bg-muted/45 p-3 sm:p-5">
        <div
          className="mx-auto flex w-full max-w-[22rem] flex-col overflow-hidden bg-white text-slate-950 shadow-md"
          style={{
            aspectRatio:
              layout.paperSize === "LETTER" ? "8.5 / 11" : "210 / 297",
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col px-[8%] pb-[7%] pt-[8%]">
            {layout.header.enabled ? (
              <div
                className={cn(
                  "flex items-center gap-3 border-b border-slate-200 pb-3",
                  layout.header.logoPosition === "right" && "flex-row-reverse",
                )}
              >
                {layout.header.showLogo && clinicBranding.logoUrl ? (
                  <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={clinicBranding.logoUrl}
                      alt={`Logo de ${clinicBranding.name}`}
                      className="size-full object-contain"
                    />
                  </div>
                ) : null}
                <div
                  className={cn(
                    "min-w-0 flex-1",
                    layout.header.logoPosition === "right" && "text-right",
                    headerTextSize,
                  )}
                >
                  <p className="font-bold">{clinicBranding.name}</p>
                  {layout.header.showClinicDetails && clinicDetails ? (
                    <p className="mt-0.5 text-[0.72em] leading-snug text-slate-600">
                      {clinicDetails}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className={cn("mt-[9%]", bodyTextSize)}>
              <h3 className="text-center text-[1.35em] font-bold leading-tight">
                {title || "Título do documento"}
              </h3>
              {layout.body.showPatientSummary ? (
                <div className="mt-[7%] border-y border-slate-200 py-2 text-[0.72em] leading-relaxed text-slate-700">
                  <p>
                    <strong>Paciente:</strong> Maria de Souza Silva
                  </p>
                  <p>CPF 123.456.789-00 · Nascimento 15/04/1987</p>
                </div>
              ) : null}
              <p className="mt-[8%] whitespace-pre-wrap break-words leading-[1.65]">
                {body || "O conteúdo do documento aparecerá aqui."}
              </p>
            </div>

            <div className="mt-auto pt-[10%]">
              {layout.signature.enabled ? (
                <div className="mx-auto w-3/4 text-center text-[9px]">
                  <div className="border-t border-slate-600 pt-1.5">
                    Dra. Ana Martins
                  </div>
                  {layout.signature.showCouncil ? (
                    <div className="mt-0.5 text-slate-600">CRM 12345 RN</div>
                  ) : null}
                </div>
              ) : null}

              {layout.footer.enabled ? (
                <div
                  className={cn(
                    "mt-[9%] flex items-end justify-between border-t border-slate-200 pt-2 text-slate-500",
                    footerTextSize,
                  )}
                >
                  <span>
                    {layout.footer.showPatientName
                      ? "Maria de Souza Silva"
                      : "Documento clínico"}
                  </span>
                  {layout.footer.showPageNumber ? (
                    <span>Página 1 de 1</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
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

function formatClinicDetails(clinic: DocumentClinicBranding) {
  return [
    clinic.legalName && clinic.legalName !== clinic.name
      ? clinic.legalName
      : null,
    clinic.document ? `CNPJ ${formatCNPJ(clinic.document)}` : null,
    clinic.address,
    clinic.phone ? formatPhoneBR(clinic.phone) : null,
    clinic.email,
  ]
    .filter(Boolean)
    .join(" · ");
}

function TemplateActiveForm({
  template,
}: {
  template: ClinicalDocumentTemplateSummary;
}) {
  const [state, action, pending] = useActionState(
    setDocumentTemplateActive,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state.error, state.success]);

  return (
    <form action={action}>
      <input type="hidden" name="template_id" value={template.id} />
      <input type="hidden" name="active" value={String(!template.active)} />
      <Button
        type="submit"
        size="sm"
        variant={template.active ? "destructive-ghost" : "secondary"}
        disabled={pending}
      >
        <Power className="size-4" aria-hidden="true" />
        {pending ? "Salvando..." : template.active ? "Desativar" : "Ativar"}
      </Button>
      <FormError className="sr-only" message={state.error} />
    </form>
  );
}

function emptyDraft(): TemplateDraft {
  return {
    mode: "new",
    templateId: "",
    expectedVersionNumber: 0,
    documentType: "attendance_declaration",
    name: "",
    description: "",
    title: "Declaração de comparecimento",
    body: "Declaro, para os devidos fins, que {{paciente.nome_completo}}, {{paciente.documento}}, compareceu a atendimento em {{atendimento.data}}, das {{atendimento.hora_inicio}} às {{atendimento.hora_fim}}.\n\n{{clinica.cidade}}, {{documento.data_emissao}}.",
    layout: normalizeDocumentTemplateLayout(DEFAULT_DOCUMENT_TEMPLATE_LAYOUT),
  };
}

function previewFontSize(
  size: "small" | "medium" | "large",
  area: "header" | "body" | "footer",
) {
  const classes = {
    header: { small: "text-[8px]", medium: "text-[10px]", large: "text-xs" },
    body: { small: "text-[9px]", medium: "text-[11px]", large: "text-[13px]" },
    footer: { small: "text-[7px]", medium: "text-[8px]", large: "text-[9px]" },
  } as const;

  return classes[area][size];
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "data não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
