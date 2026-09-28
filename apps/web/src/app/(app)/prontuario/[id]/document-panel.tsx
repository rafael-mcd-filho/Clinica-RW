"use client";
import {
  documentTypeLabels as documentLabels,
  documentFields,
  documentTypeStarters,
} from "@/lib/clinical/document-types";
import {
  ConsentDetailsButton,
  ConsentStatusBadge,
} from "@/components/clinical/consent-details";
import type { ConsentEventSummary } from "@/lib/clinical/consent";
import {
  DocumentFitFeedback,
  DocumentPreviewCard,
  useDocumentPreview,
} from "@/components/clinical/document-preview";
import { documentPreviewInput } from "@/lib/clinical/document-preview";
import type { RenderContext } from "@/lib/pdf/clinical-document";

import { FileText, Printer } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { issueClinicalDocument, type ClinicalActionState } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  type ClinicalDocumentType,
  type DocumentVariableValues,
  inspectDocumentTemplateVariables,
  resolveDocumentTemplate,
  normalizeDocumentTemplateLayout,
} from "@/lib/clinical/document-templates";

export type ClinicalDocumentTemplate = {
  id: string;
  template_version_id: string;
  version_number: number;
  document_type: ClinicalDocumentType;
  name: string;
  title_template: string;
  body_template: string;
  layout_schema: unknown;
};

export type ClinicalDocument = {
  id: string;
  document_type: ClinicalDocumentType;
  title: string;
  issued_at: string;
  consent_events: ConsentEventSummary[];
};

const initialState: ClinicalActionState = {};

export function DocumentPanel({
  encounterId,
  templates,
  documents,
  allowedTypes,
  variables,
  renderContext,
  timeZone,
  showHeader = true,
}: {
  encounterId: string;
  templates: ClinicalDocumentTemplate[];
  documents: ClinicalDocument[];
  allowedTypes: ClinicalDocumentType[];
  variables: DocumentVariableValues;
  renderContext: RenderContext;
  timeZone: string;
  showHeader?: boolean;
}) {
  const router = useRouter();
  const initialDocumentType = allowedTypes[0] ?? "prescription";
  const initialTemplate = templates.find(
    (template) => template.document_type === initialDocumentType,
  );
  const initialContent = resolveTemplateContent(initialTemplate, variables);
  const [documentType, setDocumentType] =
    useState<ClinicalDocumentType>(initialDocumentType);
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const [templateVersionId, setTemplateVersionId] = useState(
    initialTemplate?.template_version_id ?? "",
  );
  const [title, setTitle] = useState(
    initialContent.title || documentLabels[initialDocumentType],
  );
  const [body, setBody] = useState(
    initialContent.body ||
      resolveDocumentTemplate(
        documentTypeStarters[initialDocumentType].body,
        variables,
      ).value,
  );
  const [details, setDetails] = useState<Record<string, string>>({});
  const [previewIssuedAt] = useState(() => new Date().toISOString());
  const selectedTemplate = templates.find(
    (template) => template.id === templateId,
  );
  const previewInput = useMemo(
    () =>
      documentPreviewInput({
        title,
        body,
        fields: details,
        type: documentType,
        context: renderContext,
        layout: normalizeDocumentTemplateLayout(
          selectedTemplate?.layout_schema,
        ),
        issuedAt: previewIssuedAt,
      }),
    [
      title,
      body,
      details,
      documentType,
      renderContext,
      selectedTemplate?.layout_schema,
      previewIssuedAt,
    ],
  );
  const preview = useDocumentPreview(previewInput, allowedTypes.length > 0);
  const [historyType, setHistoryType] = useState("all");
  const [dirty, setDirty] = useState(false);
  const [pendingChange, setPendingChange] = useState<
    | { kind: "type"; value: ClinicalDocumentType }
    | { kind: "template"; value: string }
    | null
  >(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  );
  const typeTemplates = templates.filter(
    (template) => template.document_type === documentType,
  );
  const unresolved = useMemo(
    () => inspectDocumentTemplateVariables(title, body),
    [body, title],
  );
  const issueAction = issueClinicalDocument.bind(null, encounterId);
  const [state, submit, issuing] = useActionState(
    async (previousState: ClinicalActionState, formData: FormData) => {
      const result = await issueAction(previousState, formData);
      if (result.success) setDirty(false);
      return result;
    },
    initialState,
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state.success]);

  useEffect(() => {
    if (!dirty) return;
    function warnAboutPendingDocument(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnAboutPendingDocument);
    return () =>
      window.removeEventListener("beforeunload", warnAboutPendingDocument);
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

  function applyDocumentType(nextType: ClinicalDocumentType) {
    setDocumentType(nextType);
    setDetails({});
    const nextTemplate = templates.find(
      (template) => template.document_type === nextType,
    );
    const nextContent = resolveTemplateContent(nextTemplate, variables);

    setTemplateId(nextTemplate?.id ?? "");
    setTemplateVersionId(nextTemplate?.template_version_id ?? "");
    setTitle(nextContent.title || documentLabels[nextType]);
    setBody(
      nextContent.body ||
        resolveDocumentTemplate(documentTypeStarters[nextType].body, variables)
          .value,
    );
    setDirty(false);
  }

  function applyTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    const nextTemplate = templates.find(
      (template) => template.id === nextTemplateId,
    );
    const nextContent = resolveTemplateContent(nextTemplate, variables);

    setTemplateVersionId(nextTemplate?.template_version_id ?? "");
    setTitle(nextContent.title || documentLabels[documentType]);
    setBody(nextContent.body);
    setDirty(false);
  }

  function requestDocumentType(nextType: ClinicalDocumentType) {
    if (nextType === documentType) return;
    if (dirty) {
      setPendingChange({ kind: "type", value: nextType });
      return;
    }
    applyDocumentType(nextType);
  }

  function requestTemplate(nextTemplateId: string) {
    if (nextTemplateId === templateId) return;
    if (dirty) {
      setPendingChange({ kind: "template", value: nextTemplateId });
      return;
    }
    applyTemplate(nextTemplateId);
  }

  const hasUnresolvedVariables =
    unresolved.variables.length > 0 || unresolved.unknownVariables.length > 0;

  return (
    <Card>
      {showHeader ? (
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Documentos clínicos</h2>
              <p className="text-sm text-muted-foreground">
                Documentos e termos de consentimento vinculados a este
                atendimento.
              </p>
            </div>
            <FileText className="size-5 text-muted-foreground" />
          </div>
        </CardHeader>
      ) : null}
      <CardContent className="grid gap-5">
        {allowedTypes.length ? (
          <form action={submit} className="grid gap-4 rounded-md border p-4">
            <input type="hidden" name="document_type" value={documentType} />
            <input type="hidden" name="template_id" value={templateId} />
            <input
              type="hidden"
              name="template_version_id"
              value={templateVersionId}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Tipo
                <Select
                  value={documentType}
                  onValueChange={(nextValue) =>
                    requestDocumentType(nextValue as ClinicalDocumentType)
                  }
                >
                  {allowedTypes.map((type) => (
                    <option key={type} value={type}>
                      {documentLabels[type]}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Modelo
                <Select
                  value={templateId}
                  onValueChange={requestTemplate}
                  allowEmptyOption
                >
                  <option value="">Sem modelo</option>
                  {typeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} · v{template.version_number}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            {(documentFields[documentType] ?? []).map((field) => (
              <label
                key={field.key}
                className="grid gap-2 text-label font-medium"
              >
                {field.label}
                <Input
                  name={"detail:" + field.key}
                  value={details[field.key] ?? ""}
                  onChange={(event) => {
                    setDetails((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }));
                    setDirty(true);
                  }}
                  placeholder={field.placeholder}
                  minLength={3}
                  maxLength={1000}
                  required
                />
              </label>
            ))}
            {documentType === "informed_consent" ? (
              <p className="text-body-sm text-muted-foreground">
                Revise o conteúdo para este procedimento. Depois de preparar o
                termo, use “Ver termo e assinatura” para apresentá-lo ao
                paciente ou responsável e coletar a assinatura.
              </p>
            ) : null}
            <label className="grid gap-2 text-sm font-medium">
              Título
              <Input
                name="title"
                value={title}
                maxLength={300}
                required
                aria-invalid={hasUnresolvedVariables}
                aria-describedby={
                  hasUnresolvedVariables
                    ? "clinical-document-variable-error clinical-document-fit"
                    : "clinical-document-fit"
                }
                onChange={(event) => {
                  setTitle(event.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Conteúdo
              <Textarea
                name="body"
                value={body}
                maxLength={30_000}
                required
                className="min-h-48 resize-y leading-6"
                aria-invalid={hasUnresolvedVariables}
                aria-describedby={
                  hasUnresolvedVariables
                    ? "clinical-document-variable-error clinical-document-fit"
                    : "clinical-document-fit"
                }
                onChange={(event) => {
                  setBody(event.target.value);
                  setDirty(true);
                }}
              />
            </label>
            {hasUnresolvedVariables ? (
              <FormError
                id="clinical-document-variable-error"
                message={`Substitua ou remova as variáveis sem dados antes de emitir: ${[
                  ...unresolved.variables.map((key) => `{{${key}}}`),
                  ...unresolved.unknownVariables.map((key) => `{{${key}}}`),
                ].join(", ")}.`}
              />
            ) : null}
            <DocumentFitFeedback
              id="clinical-document-fit"
              preview={preview}
              characters={body.length}
            />
            <details className="rounded-md border border-border">
              <summary className="cursor-pointer rounded-md p-3 text-control font-medium focus-visible:outline-2 focus-visible:outline-primary">
                Conferir páginas antes de emitir
              </summary>
              <DocumentPreviewCard
                preview={preview}
                paperSize={previewInput.layout.paperSize}
              />
            </details>
            <FormError message={state.error} />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={issuing || hasUnresolvedVariables}
              >
                <FileText className="size-4" />
                {issuing
                  ? "Salvando..."
                  : documentType === "informed_consent"
                    ? "Preparar termo"
                    : "Emitir documento"}
              </Button>
            </div>
          </form>
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Seu perfil pode consultar documentos, mas não possui permissão de
            emissão.
          </p>
        )}

        <div className="grid gap-3">
          {documents.length > 1 ? (
            <label className="grid max-w-xs gap-2 text-label font-medium">
              Filtrar documentos
              <Select value={historyType} onValueChange={setHistoryType}>
                <option value="all">Todos os tipos</option>
                {Array.from(
                  new Set(documents.map((doc) => doc.document_type)),
                ).map((type) => (
                  <option key={type} value={type}>
                    {documentLabels[type]}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          {documents
            .filter(
              (doc) =>
                historyType === "all" || doc.document_type === historyType,
            )
            .map((document) => (
              <div
                key={document.id}
                className="flex flex-col justify-between gap-3 rounded-md border p-3 md:flex-row md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{document.title}</p>
                    <Badge variant="neutral">
                      {documentLabels[document.document_type]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {document.document_type === "informed_consent"
                      ? "Preparado"
                      : "Emitido"}{" "}
                    em {formatDateTime(document.issued_at, timeZone)}
                  </p>
                </div>
                {document.document_type === "informed_consent" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <ConsentStatusBadge
                      events={document.consent_events ?? []}
                    />
                    <ConsentDetailsButton documentId={document.id} />
                  </div>
                ) : (
                  <Button asChild variant="secondary" size="sm">
                    <Link
                      href={`/documentos/${document.id}/pdf`}
                      target="_blank"
                    >
                      <Printer className="size-4" /> Abrir PDF
                    </Link>
                  </Button>
                )}
              </div>
            ))}
          {!documents.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhum documento emitido para este atendimento.
            </p>
          ) : null}
        </div>
      </CardContent>
      <ConfirmDialog
        open={Boolean(pendingChange)}
        onClose={() => setPendingChange(null)}
        title="Descartar alterações do documento?"
        description="Trocar o tipo ou o modelo substitui o título e o conteúdo que você editou."
        confirmLabel="Descartar e trocar"
        destructive
        onConfirm={() => {
          if (!pendingChange) return;
          if (pendingChange.kind === "type") {
            applyDocumentType(pendingChange.value);
          } else {
            applyTemplate(pendingChange.value);
          }
          setPendingChange(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingNavigation)}
        onClose={() => setPendingNavigation(null)}
        title="Descartar documento não emitido?"
        description="O título e o conteúdo editados ainda não foram emitidos."
        confirmLabel="Descartar e sair"
        destructive
        onConfirm={() => {
          if (!pendingNavigation) return;
          const destination = pendingNavigation;
          setDirty(false);
          setPendingNavigation(null);
          router.push(destination);
        }}
      />
    </Card>
  );
}

function resolveTemplateContent(
  template: ClinicalDocumentTemplate | undefined,
  variables: DocumentVariableValues,
) {
  if (!template) return { title: "", body: "" };

  return {
    title: resolveDocumentTemplate(template.title_template, variables).value,
    body: resolveDocumentTemplate(template.body_template, variables).value,
  };
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}
