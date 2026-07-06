"use client";

import { useActionState, useEffect, useState } from "react";
import {
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  Plus,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  UserPlus,
} from "lucide-react";
import { categoricalColors } from "@/lib/colors";
import { toast } from "sonner";
import {
  createPatientTagRule,
  createSettingsTag,
  deletePatientTagRule,
  setPatientTagRuleActive,
  type CompanyActionState,
} from "./company-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";

export type PatientTagSettingsTag = {
  id: string;
  name: string;
  color: string;
};

export type PatientTagRule = {
  id: string;
  tag_id: string;
  name: string;
  trigger_type:
    | "new_patient"
    | "appointment_scheduled"
    | "first_visit"
    | "revenue_threshold";
  active: boolean;
  duration_days: number | null;
  config: Record<string, unknown>;
};

export type PatientTagAutomationData = {
  tags: PatientTagSettingsTag[];
  rules: PatientTagRule[];
};

const initialState: CompanyActionState = {};

const triggerLabels: Record<PatientTagRule["trigger_type"], string> = {
  new_patient: "Paciente novo",
  appointment_scheduled: "Agendamento criado",
  first_visit: "Primeira vez",
  revenue_threshold: "Faturamento acima de",
};

const triggerDescriptions: Record<PatientTagRule["trigger_type"], string> = {
  new_patient: "Aplica quando um paciente é cadastrado.",
  appointment_scheduled: "Aplica quando o paciente ganha um agendamento.",
  first_visit: "Aplica até o primeiro atendimento ser finalizado.",
  revenue_threshold: "Aplica enquanto o total pago atingir o valor configurado.",
};

export function PatientTagAutomationSettings({
  data,
}: {
  data: PatientTagAutomationData;
}) {
  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Tag className="size-5 text-primary" aria-hidden />
            <div>
              <h2 className="font-semibold">Tags de paciente</h2>
              <p className="text-sm text-muted-foreground">
                Marcadores visuais usados em pacientes, agenda e relacionamento.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <TagList tags={data.tags} />
            <CreateTagForm />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <RefreshCw className="size-5 text-primary" aria-hidden />
            <div>
              <h2 className="font-semibold">Automações de tags</h2>
              <p className="text-sm text-muted-foreground">
                Regras que aplicam e removem tags por evento operacional.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <CreateRuleForm tags={data.tags} />
            <RuleList rules={data.rules} tags={data.tags} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TagList({ tags }: { tags: PatientTagSettingsTag[] }) {
  if (!tags.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        Nenhuma tag cadastrada.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm shadow-[var(--shadow-soft)]"
        >
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
          {tag.name}
        </span>
      ))}
    </div>
  );
}

function CreateTagForm() {
  const [state, action, pending] = useActionState(
    createSettingsTag,
    initialState,
  );
  useToastState(state);

  return (
    <form action={action} className="grid gap-3 rounded-lg border border-border p-4">
      <h3 className="font-semibold">Nova tag</h3>
      <label className="grid gap-1 text-sm font-medium">
        Nome
        <Input name="name" placeholder="Ex.: Cliente VIP" required />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Cor
        <Input
          name="color"
          type="color"
          defaultValue={categoricalColors.blue}
          required
        />
      </label>
      <Button type="submit" disabled={pending}>
        <Plus className="size-4" aria-hidden />
        Criar tag
      </Button>
    </form>
  );
}

function CreateRuleForm({ tags }: { tags: PatientTagSettingsTag[] }) {
  const [state, action, pending] = useActionState(
    createPatientTagRule,
    initialState,
  );
  const [triggerType, setTriggerType] =
    useState<PatientTagRule["trigger_type"]>("first_visit");
  useToastState(state);

  return (
    <form action={action} className="grid gap-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="font-semibold">Nova automação</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A regra é aplicada também aos registros existentes ao salvar.
        </p>
      </div>

      <label className="grid gap-1 text-sm font-medium">
        Nome da regra
        <Input
          name="name"
          placeholder="Ex.: Primeira vez até finalizar"
          required
        />
      </label>

      <label className="grid gap-1 text-sm font-medium">
        Tag
        <Select name="tag_id" required disabled={!tags.length}>
          <option value="">Selecione</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </Select>
      </label>

      <label className="grid gap-1 text-sm font-medium">
        Gatilho
        <Select
          name="trigger_type"
          value={triggerType}
          onValueChange={(value) =>
            setTriggerType(value as PatientTagRule["trigger_type"])
          }
          required
        >
          {Object.entries(triggerLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </label>

      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        {triggerDescriptions[triggerType]}
      </p>

      {triggerType === "revenue_threshold" ? (
        <label className="grid gap-1 text-sm font-medium">
          Faturamento pago mínimo
          <Input
            name="minimum_paid_amount"
            inputMode="decimal"
            placeholder="Ex.: 2000,00"
            required
          />
        </label>
      ) : null}

      <label className="grid gap-1 text-sm font-medium">
        Duração em dias
        <Input
          name="duration_days"
          type="number"
          min={1}
          max={3650}
          placeholder="Sem expiração"
        />
      </label>

      <Button type="submit" disabled={pending || !tags.length}>
        <Save className="size-4" aria-hidden />
        Salvar automação
      </Button>
    </form>
  );
}

function RuleList({
  rules,
  tags,
}: {
  rules: PatientTagRule[];
  tags: PatientTagSettingsTag[];
}) {
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));

  if (!rules.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        Nenhuma automação configurada.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {rules.map((rule) => (
        <RuleRow key={rule.id} rule={rule} tag={tagsById.get(rule.tag_id)} />
      ))}
    </div>
  );
}

function RuleRow({
  rule,
  tag,
}: {
  rule: PatientTagRule;
  tag?: PatientTagSettingsTag;
}) {
  const minimumPaid =
    typeof rule.config.minimum_paid_amount === "number"
      ? rule.config.minimum_paid_amount
      : Number(rule.config.minimum_paid_amount ?? 0);

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <RuleIcon triggerType={rule.trigger_type} />
            <h3 className="font-semibold">{rule.name}</h3>
            <Badge variant={rule.active ? "success" : "neutral"}>
              {rule.active ? "Ativa" : "Inativa"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {triggerLabels[rule.trigger_type]}
            {rule.trigger_type === "revenue_threshold" && minimumPaid > 0
              ? ` · acima de ${formatCurrency(minimumPaid)}`
              : ""}
            {rule.duration_days
              ? ` · expira em ${rule.duration_days} dias`
              : " · sem expiração por prazo"}
          </p>
          {tag ? (
            <div className="mt-3">
              <span
                className="inline-flex h-6 items-center rounded px-2 text-xs font-bold uppercase text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.name}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <form
            action={setPatientTagRuleActive.bind(null, rule.id, !rule.active)}
          >
            <Button type="submit" variant="secondary" size="sm">
              {rule.active ? "Desativar" : "Ativar"}
            </Button>
          </form>
          <form action={deletePatientTagRule.bind(null, rule.id)}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Remover automação"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </form>
        </div>
      </div>
    </article>
  );
}

function RuleIcon({
  triggerType,
}: {
  triggerType: PatientTagRule["trigger_type"];
}) {
  const className = "size-4 text-primary";

  if (triggerType === "new_patient") {
    return <UserPlus className={className} aria-hidden />;
  }
  if (triggerType === "appointment_scheduled") {
    return <Clock3 className={className} aria-hidden />;
  }
  if (triggerType === "revenue_threshold") {
    return <CircleDollarSign className={className} aria-hidden />;
  }
  return <BadgeCheck className={className} aria-hidden />;
}

function useToastState(state: CompanyActionState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(state.success);
  }, [state.error, state.success]);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
