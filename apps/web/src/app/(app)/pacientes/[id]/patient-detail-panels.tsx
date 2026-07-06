"use client";

import { useActionState, useEffect } from "react";
import {
  Check,
  CheckCircle2,
  Plus,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  addPatientConsent,
  createPatientTag,
  revokePatientConsent,
  setPatientTag,
  updateClinicalSummary,
  type PatientActionState,
} from "../actions";
import { categoricalColors } from "@/lib/colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";

const initialState: PatientActionState = {};

export type ClinicalSummary = {
  allergies: string | null;
  comorbidities: string | null;
  medications: string | null;
  medical_history: string | null;
  family_history: string | null;
  habits: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
};

export type ConsentRow = {
  id: string;
  consent_type: string;
  version: string;
  accepted_at: string;
  revoked_at: string | null;
};

export type TagRow = { id: string; name: string; color: string };

export function ClinicalSummaryForm({
  patientId,
  summary,
  canEdit,
}: {
  patientId: string;
  summary: ClinicalSummary | null;
  canEdit: boolean;
}) {
  const action = updateClinicalSummary.bind(null, patientId);
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Resumo clínico permanente</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Conteúdo protegido, disponível apenas para perfis autorizados.
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ClinicalField
              label="Alergias"
              name="allergies"
              value={summary?.allergies}
            />
            <ClinicalField
              label="Comorbidades"
              name="comorbidities"
              value={summary?.comorbidities}
            />
            <ClinicalField
              label="Medicações em uso"
              name="medications"
              value={summary?.medications}
            />
            <ClinicalField
              label="Antecedentes pessoais"
              name="medical_history"
              value={summary?.medical_history}
            />
            <ClinicalField
              label="Antecedentes familiares"
              name="family_history"
              value={summary?.family_history}
            />
            <ClinicalField
              label="Hábitos"
              name="habits"
              value={summary?.habits}
            />
          </div>
          <div className="grid gap-4 rounded-md border border-border bg-background p-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-medium">
              Contato de emergência
              <Input
                name="emergency_contact_name"
                defaultValue={summary?.emergency_contact_name ?? ""}
                disabled={!canEdit}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Telefone
              <Input
                name="emergency_contact_phone"
                defaultValue={summary?.emergency_contact_phone ?? ""}
                disabled={!canEdit}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Vínculo
              <Input
                name="emergency_contact_relationship"
                defaultValue={summary?.emergency_contact_relationship ?? ""}
                disabled={!canEdit}
              />
            </label>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          {canEdit ? (
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                <Save className="size-4" />{" "}
                {pending ? "Salvando..." : "Salvar resumo clínico"}
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function ClinicalField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value?: string | null;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Textarea name={name} defaultValue={value ?? ""} />
    </label>
  );
}

export function ConsentsPanel({
  patientId,
  consents,
  canEdit,
}: {
  patientId: string;
  consents: ConsentRow[];
  canEdit: boolean;
}) {
  const action = addPatientConsent.bind(null, patientId);
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Consentimentos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Histórico de aceite e revogação por finalidade.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        {canEdit ? (
          <form
            action={formAction}
            className="grid gap-3 rounded-md border border-border bg-background p-4 md:grid-cols-[1fr_8rem_auto] md:items-end"
          >
            <label className="grid gap-2 text-sm font-medium">
              Finalidade
              <Select name="consent_type" defaultValue="privacy_notice">
                <option value="privacy_notice">Aviso de privacidade</option>
                <option value="whatsapp">Comunicação por WhatsApp</option>
                <option value="email">Comunicação por e-mail</option>
                <option value="sms">Comunicação por SMS</option>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Versão
              <Input name="version" defaultValue="1.0" required />
            </label>
            <Button type="submit" disabled={pending}>
              <ShieldCheck className="size-4" />{" "}
              {pending ? "Salvando..." : "Registrar aceite"}
            </Button>
            {state.error ? (
              <p className="text-sm text-destructive md:col-span-3">
                {state.error}
              </p>
            ) : null}
          </form>
        ) : null}

        <div className="grid gap-2">
          {consents.map((consent) => (
            <div
              key={consent.id}
              className="flex flex-col gap-3 rounded-md border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  {consent.revoked_at ? (
                    <XCircle className="size-4 text-destructive" />
                  ) : (
                    <CheckCircle2 className="size-4 text-success" />
                  )}
                  <p className="text-sm font-medium">
                    {consentLabel[consent.consent_type] ?? consent.consent_type}
                  </p>
                  <Badge variant={consent.revoked_at ? "neutral" : "success"}>
                    {consent.revoked_at ? "Revogado" : "Ativo"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Versão {consent.version} · aceite em{" "}
                  {formatDate(consent.accepted_at)}
                </p>
              </div>
              {canEdit && !consent.revoked_at ? (
                <form
                  action={revokePatientConsent.bind(
                    null,
                    patientId,
                    consent.id,
                  )}
                >
                  <Button type="submit" variant="ghost" size="sm">
                    Revogar
                  </Button>
                </form>
              ) : null}
            </div>
          ))}
          {!consents.length ? (
            <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum consentimento registrado.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function TagsPanel({
  patientId,
  tags,
  selectedTagIds,
  canEdit,
}: {
  patientId: string;
  tags: TagRow[];
  selectedTagIds: string[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createPatientTag,
    initialState,
  );

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Tags e segmentação</h2>
      </CardHeader>
      <CardContent className="grid gap-5">
        {canEdit ? (
          <form
            action={formAction}
            className="flex flex-col gap-3 rounded-md border border-border bg-background p-4 sm:flex-row sm:items-end"
          >
            <label className="grid flex-1 gap-2 text-sm font-medium">
              Nova tag
              <Input name="name" required placeholder="Ex.: acompanhamento" />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Cor
              <input
                name="color"
                type="color"
                defaultValue={categoricalColors.blue}
                className="h-10 w-20 rounded-md border border-border bg-card p-1"
              />
            </label>
            <Button type="submit" disabled={pending}>
              <Plus className="size-4" />
              {pending ? "Criando..." : "Criar tag"}
            </Button>
            {state.error ? (
              <p className="text-sm text-destructive sm:basis-full">
                {state.error}
              </p>
            ) : null}
          </form>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
            return (
              <form
                key={tag.id}
                action={setPatientTag.bind(null, patientId, tag.id, !selected)}
              >
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={!canEdit}
                  className="gap-2 shadow-none disabled:cursor-default"
                  style={{
                    borderColor: tag.color,
                    color: tag.color,
                    backgroundColor: selected ? `${tag.color}14` : undefined,
                  }}
                >
                  <span
                    className="flex size-4 items-center justify-center rounded border"
                    style={{ borderColor: tag.color }}
                  >
                    {selected ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : null}
                  </span>
                  {tag.name}
                </Button>
              </form>
            );
          })}
          {!tags.length ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma tag disponível.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function FutureModulePanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

const consentLabel: Record<string, string> = {
  privacy_notice: "Aviso de privacidade",
  whatsapp: "Comunicação por WhatsApp",
  email: "Comunicação por e-mail",
  sms: "Comunicação por SMS",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
