"use client";

import {
  ClockCounterClockwise as History,
  Info,
  ArrowRight as MoveRight,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type AuditLogItem = {
  id: string;
  organizationId: string | null;
  organizationName: string;
  actorUserId: string | null;
  actorName: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
  metadata: JsonValue;
};

const actionLabel: Record<string, string> = {
  "organization.created": "Empresa criada",
  "organization.updated": "Empresa atualizada",
  "organization.deleted": "Empresa excluida",
  "platform_settings.updated": "Plataforma atualizada",
  "super_admin.bootstrapped": "Super Admin configurado",
  "impersonation.started": "Suporte impersonado iniciado",
  "impersonation.ended": "Suporte impersonado encerrado",
  "patients.insert": "Paciente cadastrado",
  "patients.update": "Paciente atualizado",
  "patient_addresses.insert": "Endereco do paciente cadastrado",
  "patient_addresses.update": "Endereco do paciente atualizado",
  "patient_clinical_summaries.insert": "Resumo clinico cadastrado",
  "patient_clinical_summaries.update": "Resumo clinico atualizado",
  "patient_consents.insert": "Consentimento registrado",
  "patient_consents.update": "Consentimento atualizado",
  "patient_tags.insert": "Tag vinculada ao paciente",
  "patient_tags.delete": "Tag removida do paciente",
  "appointments.status_changed": "Status do agendamento alterado",
  "appointments.status_initialized": "Status inicial do agendamento",
  "clinical_documents.issue": "Documento clinico emitido",
  "clinical_documents.issued": "Documento clinico emitido",
  "payment.received": "Pagamento recebido",
  "account_payable.paid": "Conta a pagar baixada",
  "professional_payout.paid": "Repasse profissional baixado",
};

const keyLabel: Record<string, string> = {
  appointment_id: "Agendamento",
  current: "Depois",
  document: "Documento",
  email: "E-mail",
  ended_at: "Fim",
  from_status: "Status anterior",
  health_insurance_id: "Convenio",
  name: "Nome",
  organization_id: "Empresa",
  owner_email: "E-mail do responsavel",
  owner_user_id: "Responsavel",
  patient_id: "Paciente",
  patient_name: "Paciente",
  plan_key: "Plano",
  previous: "Antes",
  previous_status: "Status anterior",
  reason: "Motivo",
  resource_id: "Registro",
  status: "Status",
  target_user_id: "Usuario atendido",
  to_status: "Status novo",
  current_status: "Status novo",
  type: "Tipo",
  user_id: "Usuario",
};

const statusLabel: Record<string, string> = {
  active: "Ativo",
  archived: "Arquivado",
  attended: "Atendido",
  cancelled: "Cancelado",
  confirmed: "Confirmado",
  draft: "Rascunho",
  failed: "Falhou",
  finalized: "Finalizado",
  in_progress: "Em atendimento",
  invited: "Convidado",
  no_show: "Falta",
  open: "Aberto",
  paid: "Pago",
  partial: "Parcial",
  pending: "Pendente",
  queued: "Na fila",
  rejected: "Rejeitado",
  requested: "Solicitado",
  running: "Em execucao",
  scheduled: "Agendado",
  sent: "Enviado",
  skipped: "Ignorado",
  succeeded: "Concluido",
  suspended: "Suspenso",
  trial: "Teste",
  waiting: "Em espera",
  written_off: "Baixado",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRecord(value: JsonValue, key: string) {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function getString(value: JsonValue, key: string) {
  if (!isRecord(value)) return null;
  const raw = value[key];
  if (typeof raw === "string" || typeof raw === "number") {
    return String(raw);
  }
  return null;
}

function humanKey(key: string) {
  return (
    keyLabel[key] ??
    key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function humanValue(value: JsonValue, key?: string): string {
  if (value === null) return "Nao informado";
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (key?.includes("status")) return statusLabel[value] ?? value;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value);
    return statusLabel[value] ?? value;
  }
  return JSON.stringify(value, null, 2);
}

function statusPair(metadata: JsonValue) {
  const previous = getRecord(metadata, "previous");
  const current = getRecord(metadata, "current");
  const previousStatus =
    getString(metadata, "from_status") ??
    getString(metadata, "previous_status") ??
    (previous ? getString(previous, "status") : null);
  const currentStatus =
    getString(metadata, "to_status") ??
    getString(metadata, "current_status") ??
    (current ? getString(current, "status") : null) ??
    getString(metadata, "status");

  return {
    previousStatus,
    currentStatus,
  };
}

function changedFields(metadata: JsonValue) {
  const previous = getRecord(metadata, "previous");
  const current = getRecord(metadata, "current");
  if (!previous || !current) return [];

  return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .filter(
      (key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key]),
    )
    .map((key) => ({
      key,
      previous: previous[key] ?? null,
      current: current[key] ?? null,
    }));
}

function metadataEntries(metadata: JsonValue) {
  if (!isRecord(metadata)) return [];
  return Object.entries(metadata).filter(
    ([key]) => key !== "previous" && key !== "current",
  );
}

export function AuditLogTable({ rows }: { rows: AuditLogItem[] }) {
  const [selected, setSelected] = useState<AuditLogItem | null>(null);
  const selectedStatus = selected ? statusPair(selected.metadata) : null;
  const selectedChanges = useMemo(
    () => (selected ? changedFields(selected.metadata) : []),
    [selected],
  );
  const selectedMetadataEntries = useMemo(
    () => (selected ? metadataEntries(selected.metadata) : []),
    [selected],
  );

  if (!rows.length) {
    return (
      <div className="px-5 py-10 text-center">
        <History
          className="mx-auto size-8 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm font-medium">Nenhum evento registrado</p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-border">
        {rows.map((audit) => {
          const statuses = statusPair(audit.metadata);
          return (
            <Button
              key={audit.id}
              type="button"
              variant="ghost"
              onClick={() => setSelected(audit)}
              className="grid h-auto w-full gap-2 rounded-none px-5 py-4 text-left text-body font-normal text-foreground hover:bg-background focus-visible:bg-background focus-visible:outline-inset md:grid-cols-[1.35fr_0.95fr_0.9fr_0.65fr_2.25rem] md:items-center md:gap-4"
            >
              <div className="min-w-0 md:text-center">
                <p className="truncate text-sm font-medium">
                  {actionLabel[audit.action] ?? audit.action}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {audit.resourceType}
                </p>
              </div>
              <span className="truncate text-sm md:text-center">
                {audit.organizationName}
              </span>
              <span className="truncate text-sm md:text-center">
                {audit.actorName}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums md:text-center">
                {formatDate(audit.createdAt)}
              </span>
              <span className="flex items-center justify-between gap-2 md:justify-center">
                {statuses.currentStatus ? (
                  <Badge variant="neutral" className="md:hidden">
                    {humanValue(statuses.currentStatus, "status")}
                  </Badge>
                ) : (
                  <span />
                )}
                <Info
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
            </Button>
          );
        })}
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={
          selected
            ? (actionLabel[selected.action] ?? selected.action)
            : "Auditoria"
        }
        description="Detalhes do evento de auditoria selecionado."
        className="max-w-3xl"
        footer={
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSelected(null)}
          >
            Fechar
          </Button>
        }
      >
        {selected ? (
          <div className="grid max-h-[70vh] gap-5 overflow-y-auto pr-1">
            <section className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-2">
              <Detail label="Quem executou" value={selected.actorName} />
              <Detail label="Quando" value={formatDate(selected.createdAt)} />
              <Detail label="Empresa" value={selected.organizationName} />
              <Detail label="Recurso" value={selected.resourceType} />
              <Detail label="Acao tecnica" value={selected.action} />
              <Detail
                label="ID do registro"
                value={selected.resourceId ?? "Nao informado"}
              />
            </section>

            {selectedStatus?.previousStatus || selectedStatus?.currentStatus ? (
              <section className="rounded-md border border-border bg-muted p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Transicao de status
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">
                    {selectedStatus.previousStatus
                      ? humanValue(selectedStatus.previousStatus, "status")
                      : "Sem status anterior"}
                  </Badge>
                  <MoveRight
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Badge variant="primary">
                    {selectedStatus.currentStatus
                      ? humanValue(selectedStatus.currentStatus, "status")
                      : "Sem status novo"}
                  </Badge>
                </div>
              </section>
            ) : null}

            {selectedChanges.length ? (
              <section className="rounded-md border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Campos alterados
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {selectedChanges.map((change) => (
                    <div
                      key={change.key}
                      className="grid gap-2 px-4 py-3 md:grid-cols-[0.8fr_1fr_1fr] md:items-start"
                    >
                      <p className="text-sm font-medium">
                        {humanKey(change.key)}
                      </p>
                      <ValueBlock
                        label="Antes"
                        value={change.previous}
                        valueKey={change.key}
                      />
                      <ValueBlock
                        label="Depois"
                        value={change.current}
                        valueKey={change.key}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {selectedMetadataEntries.length ? (
              <section className="rounded-md border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Metadados
                  </p>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-2">
                  {selectedMetadataEntries.map(([key, value]) => (
                    <Detail
                      key={key}
                      label={humanKey(key)}
                      value={humanValue(value, key)}
                      multiline={typeof value === "object" && value !== null}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-md border border-border bg-muted p-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                JSON completo
              </p>
              <pre className="mt-3 max-h-56 overflow-auto rounded-md border border-border bg-card p-3 text-xs leading-relaxed text-secondary-foreground">
                {JSON.stringify(selected.metadata, null, 2)}
              </pre>
            </section>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function Detail({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-caption font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-medium text-secondary-foreground",
          multiline ? "whitespace-pre-wrap break-words" : "truncate",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ValueBlock({
  label,
  value,
  valueKey,
}: {
  label: string;
  value: JsonValue;
  valueKey: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted px-3 py-2">
      <p className="text-caption font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">
        {humanValue(value, valueKey)}
      </p>
    </div>
  );
}
