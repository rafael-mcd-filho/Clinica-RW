"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { issueClinicalDocument, type ClinicalActionState } from "../actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

export type ClinicalDocumentTemplate = {
  id: string;
  document_type:
    | "prescription"
    | "exam_request"
    | "medical_certificate"
    | "attendance_declaration";
  name: string;
  title_template: string;
  body_template: string;
};

export type ClinicalDocument = {
  id: string;
  document_type: ClinicalDocumentTemplate["document_type"];
  title: string;
  issued_at: string;
};

type IssuePermissions = {
  prescription: boolean;
  examRequest: boolean;
  certificate: boolean;
};

const documentLabels: Record<
  ClinicalDocumentTemplate["document_type"],
  string
> = {
  prescription: "Prescrição",
  exam_request: "Solicitação de exame",
  medical_certificate: "Atestado",
  attendance_declaration: "Declaração de comparecimento",
};

const initialState: ClinicalActionState = {};

export function DocumentPanel({
  encounterId,
  templates,
  documents,
  canIssue,
}: {
  encounterId: string;
  templates: ClinicalDocumentTemplate[];
  documents: ClinicalDocument[];
  canIssue: IssuePermissions;
}) {
  const allowedTypes = useMemo(
    () =>
      (
        [
          "prescription",
          "exam_request",
          "medical_certificate",
          "attendance_declaration",
        ] as ClinicalDocumentTemplate["document_type"][]
      ).filter((type) => {
        if (type === "prescription") return canIssue.prescription;
        if (type === "exam_request") return canIssue.examRequest;
        return canIssue.certificate;
      }),
    [canIssue],
  );
  const initialDocumentType = allowedTypes[0] ?? "prescription";
  const initialTemplate = templates.find(
    (template) => template.document_type === initialDocumentType,
  );
  const [documentType, setDocumentType] =
    useState<ClinicalDocumentTemplate["document_type"]>(initialDocumentType);
  const typeTemplates = templates.filter(
    (template) => template.document_type === documentType,
  );
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const [title, setTitle] = useState(initialTemplate?.title_template ?? "");
  const [body, setBody] = useState(initialTemplate?.body_template ?? "");
  const issueAction = issueClinicalDocument.bind(null, encounterId);
  const [state, submit, issuing] = useActionState(issueAction, initialState);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  function applyDocumentType(
    nextType: ClinicalDocumentTemplate["document_type"],
  ) {
    setDocumentType(nextType);
    const nextTemplate = templates.find(
      (template) => template.document_type === nextType,
    );
    setTemplateId(nextTemplate?.id ?? "");
    setTitle(nextTemplate?.title_template ?? documentLabels[nextType]);
    setBody(nextTemplate?.body_template ?? "");
  }

  function applyTemplate(nextTemplateId: string) {
    setTemplateId(nextTemplateId);
    const nextTemplate = templates.find(
      (template) => template.id === nextTemplateId,
    );
    if (!nextTemplate) return;
    setTitle(nextTemplate.title_template);
    setBody(nextTemplate.body_template);
  }

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
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Tipo
                <Select
                  value={documentType}
                  onValueChange={(nextValue) =>
                    applyDocumentType(
                      nextValue as ClinicalDocumentTemplate["document_type"],
                    )
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
                  {typeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                  {!typeTemplates.length ? (
                    <option value="">Sem modelo</option>
                  ) : null}
                </Select>
              </label>
            </div>
            <label className="grid gap-2 text-sm font-medium">
              Título
              <Input
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Conteúdo
              <RichTextEditor
                key={`${documentType}-${templateId}`}
                name="body"
                defaultValue={body}
                minHeightClassName="min-h-40"
                required
              />
            </label>
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={issuing}>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
