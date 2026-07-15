"use client";

import { FileText, Printer } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { issueClinicalDocument, type ClinicalActionState } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import {
  type ClinicalDocumentType,
  type DocumentVariableValues,
  inspectDocumentTemplateVariables,
  resolveDocumentTemplate,
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
};

type IssuePermissions = {
  prescription: boolean;
  examRequest: boolean;
  certificate: boolean;
};

const documentLabels: Record<ClinicalDocumentType, string> = {
  prescription: "Prescrição",
  exam_request: "Solicitação de exame",
  medical_certificate: "Atestado",
  attendance_declaration: "Declaração de comparecimento",
};

const documentTypes = Object.keys(documentLabels) as ClinicalDocumentType[];
const initialState: ClinicalActionState = {};

export function DocumentPanel({
  encounterId,
  templates,
  documents,
  canIssue,
  variables,
}: {
  encounterId: string;
  templates: ClinicalDocumentTemplate[];
  documents: ClinicalDocument[];
  canIssue: IssuePermissions;
  variables: DocumentVariableValues;
}) {
  const allowedTypes = useMemo(
    () =>
      documentTypes.filter((type) => {
        if (type === "prescription") return canIssue.prescription;
        if (type === "exam_request") return canIssue.examRequest;
        return canIssue.certificate;
      }),
    [canIssue.certificate, canIssue.examRequest, canIssue.prescription],
  );
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
  const [body, setBody] = useState(initialContent.body);
  const typeTemplates = templates.filter(
    (template) => template.document_type === documentType,
  );
  const unresolved = useMemo(
    () => inspectDocumentTemplateVariables(title, body),
    [body, title],
  );
  const issueAction = issueClinicalDocument.bind(null, encounterId);
  const [state, submit, issuing] = useActionState(issueAction, initialState);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state.success]);

  function applyDocumentType(nextType: ClinicalDocumentType) {
    setDocumentType(nextType);
    const nextTemplate = templates.find(
      (template) => template.document_type === nextType,
    );
    const nextContent = resolveTemplateContent(nextTemplate, variables);

    setTemplateId(nextTemplate?.id ?? "");
    setTemplateVersionId(nextTemplate?.template_version_id ?? "");
    setTitle(nextContent.title || documentLabels[nextType]);
    setBody(nextContent.body);
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
  }

  const hasUnresolvedVariables =
    unresolved.variables.length > 0 || unresolved.unknownVariables.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Documentos clínicos</h2>
            <p className="text-sm text-muted-foreground">
              Prescrições, solicitações, atestados e declarações vinculados a
              este atendimento.
            </p>
          </div>
          <FileText className="size-5 text-muted-foreground" />
        </div>
      </CardHeader>
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
                    applyDocumentType(nextValue as ClinicalDocumentType)
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
                  onValueChange={applyTemplate}
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
            <label className="grid gap-2 text-sm font-medium">
              Título
              <Input
                name="title"
                value={title}
                maxLength={300}
                required
                aria-invalid={hasUnresolvedVariables}
                onChange={(event) => setTitle(event.target.value)}
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
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            {hasUnresolvedVariables ? (
              <FormError
                message={`Substitua ou remova as variáveis sem dados antes de emitir: ${[
                  ...unresolved.variables.map((key) => `{{${key}}}`),
                  ...unresolved.unknownVariables.map((key) => `{{${key}}}`),
                ].join(", ")}.`}
              />
            ) : null}
            <FormError message={state.error} />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={issuing || hasUnresolvedVariables}
              >
                <FileText className="size-4" />
                {issuing ? "Emitindo..." : "Emitir documento"}
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
          {documents.map((document) => (
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
                  Emitido em {formatDateTime(document.issued_at)}
                </p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/documentos/${document.id}/pdf`} target="_blank">
                  <Printer className="size-4" /> Abrir PDF
                </Link>
              </Button>
            </div>
          ))}
          {!documents.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhum documento emitido para este atendimento.
            </p>
          ) : null}
        </div>
      </CardContent>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
