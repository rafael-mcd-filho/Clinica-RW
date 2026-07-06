"use client";

import type * as React from "react";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import { ClipboardList, Save } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClinicalTemplate, type ClinicalActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import {
  SortableFieldList,
  type SortableField,
} from "@/components/ui/sortable-field-list";

const initialState: ClinicalActionState = {};
const JsonSchemaForm = Form as unknown as React.ComponentType<{
  children?: React.ReactNode;
  disabled?: boolean;
  noHtml5Validate?: boolean;
  schema: object;
  showErrorList?: boolean;
  validator: typeof validator;
}>;

export function TemplateBuilderForm() {
  const [state, action, pending] = useActionState(
    createClinicalTemplate,
    initialState,
  );
  const [fields, setFields] = useState<SortableField[]>([]);
  const previewSchema = useMemo(
    () => ({
      type: "object" as const,
      properties: Object.fromEntries(
        fields
          .filter((field) => field.label.trim())
          .map((field) => [
            field.id,
            { type: "string", title: field.label.trim() },
          ]),
      ),
    }),
    [fields],
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" />
            <h2 className="text-heading-sm font-semibold">
              Construtor de template
            </h2>
          </div>
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              Nome
              <Input
                name="name"
                placeholder="Consulta dermatológica"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Seção
              <Input name="section_title" placeholder="Evolução" required />
            </label>
            <div className="grid gap-2 text-sm font-medium">
              <span>Campos</span>
              <SortableFieldList name="fields" onFieldsChange={setFields} />
            </div>
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                <Save className="size-4" />
                {pending ? "Salvando..." : "Criar template"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-heading-sm font-semibold">Prévia</h2>
          <p className="text-sm text-muted-foreground">
            Como a ficha aparece para o profissional durante o atendimento.
          </p>
        </CardHeader>
        <CardContent className="rjsf-preview">
          <JsonSchemaForm
            schema={previewSchema}
            validator={validator}
            disabled
            noHtml5Validate
            showErrorList={false}
          >
            <span />
          </JsonSchemaForm>
        </CardContent>
      </Card>
    </div>
  );
}
