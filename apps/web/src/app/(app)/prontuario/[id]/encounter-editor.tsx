"use client";

import { useActionState, useEffect } from "react";
import { FileCheck, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import {
  addEncounterAddendum,
  finalizeEncounter,
  saveEncounterDraft,
  type ClinicalActionState,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

type TemplateField = {
  id: string;
  label: string;
  type?: "text" | "textarea";
  required?: boolean;
};

type TemplateSection = {
  id: string;
  title: string;
  fields: TemplateField[];
};

type TemplateSchema = {
  sections: TemplateSection[];
};

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
  schema,
  structuredData,
  freeNotes,
  cidCode,
  cidDescription,
  addenda,
}: {
  encounterId: string;
  status: string;
  schema: TemplateSchema;
  structuredData: Record<string, string>;
  freeNotes: string | null;
  cidCode: string;
  cidDescription: string;
  addenda: Addendum[];
}) {
  const draftAction = saveEncounterDraft.bind(null, encounterId);
  const finalizeAction = finalizeEncounter.bind(null, encounterId);
  const addendumAction = addEncounterAddendum.bind(null, encounterId);
  const [draftState, saveDraft, saving] = useActionState(
    draftAction,
    initialState,
  );
  const [finalizeState, submitFinalize, finalizing] = useActionState(
    finalizeAction,
    initialState,
  );
  const [addendumState, submitAddendum, adding] = useActionState(
    addendumAction,
    initialState,
  );
  const finalized = status === "finalized";

  useEffect(() => {
    for (const state of [draftState, finalizeState, addendumState]) {
      if (state.success) toast.success(state.success);
    }
  }, [draftState, finalizeState, addendumState]);

  return (
    <div className="grid gap-5">
      <form action={saveDraft} className="grid gap-5">
        {schema.sections.map((section) => (
          <Card key={section.id}>
            <CardHeader>
              <h2 className="font-semibold">{section.title}</h2>
            </CardHeader>
            <CardContent className="grid gap-4">
              {section.fields.map((field) => (
                <label
                  key={field.id}
                  className="grid gap-2 text-sm font-medium"
                >
                  {field.label}
                  {finalized ? (
                    <div className="min-h-20 rounded-md border border-border bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
                      {structuredData[field.id] || "—"}
                    </div>
                  ) : field.type === "text" ? (
                    <Input
                      name={`field:${field.id}`}
                      defaultValue={structuredData[field.id] ?? ""}
                      required={field.required}
                    />
                  ) : (
                    <RichTextEditor
                      name={`field:${field.id}`}
                      defaultValue={structuredData[field.id] ?? ""}
                      required={field.required}
                      placeholder={field.label}
                    />
                  )}
                </label>
              ))}
            </CardContent>
          </Card>
        ))}

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
                disabled={finalized}
                placeholder="J00"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Descrição
              <Input
                name="cid_description"
                defaultValue={cidDescription}
                disabled={finalized}
                placeholder="Descrição inicial"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium md:col-span-2">
              Notas livres
              {finalized ? (
                <div className="min-h-24 rounded-md border border-border bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
                  {freeNotes || "—"}
                </div>
              ) : (
                <RichTextEditor
                  name="free_notes"
                  defaultValue={freeNotes ?? ""}
                  minHeightClassName="min-h-40"
                  placeholder="Notas livres do atendimento"
                />
              )}
            </label>
            {draftState.error ? (
              <p className="text-sm text-destructive md:col-span-2">
                {draftState.error}
              </p>
            ) : null}
            {!finalized ? (
              <div className="flex justify-end md:col-span-2">
                <Button type="submit" disabled={saving}>
                  <Save className="size-4" />
                  {saving ? "Salvando..." : "Salvar rascunho"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </form>

      {!finalized ? (
        <Card>
          <CardContent className="flex flex-col justify-between gap-3 p-4 md:flex-row md:items-center">
            <div>
              <p className="font-semibold">Finalizar prontuário</p>
              <p className="text-sm text-muted-foreground">
                Depois de finalizado, o atendimento não poderá ser editado.
              </p>
            </div>
            <form action={submitFinalize}>
              <Button type="submit" disabled={finalizing}>
                <FileCheck className="size-4" />
                {finalizing ? "Finalizando..." : "Finalizar"}
              </Button>
            </form>
            {finalizeState.error ? (
              <p className="text-sm text-destructive">{finalizeState.error}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
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
      )}
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
