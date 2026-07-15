"use client";

import { useActionState, useEffect, useState } from "react";
import {
  BadgeCheck,
  Cake,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  Plus,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  UserPlus,
} from "lucide-react";
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
import { FormDialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { categoricalColors } from "@/lib/colors";

export type PatientTagSettingsTag = {
  id: string;
  name: string;
  color: string;
};

export type PatientAutomationSchedule = {
  id: string;
  name: string;
  professional_id: string | null;
};

export type PatientAutomationProfessional = {
  id: string;
  name: string;
};

export type PatientTagTriggerType =
  | "new_patient"
  | "birthday"
  | "appointment_scheduled"
  | "appointment_before"
  | "appointment_day"
  | "appointment_completed"
  | "first_visit"
  | "revenue_threshold";

export type PatientTagActionType = "add_tag" | "remove_tag";

export type PatientTagRule = {
  id: string;
  tag_id: string;
  name: string;
  trigger_type: PatientTagTriggerType;
  /** Regras antigas não possuem a coluna e equivalem a adicionar tag. */
  action_type?: PatientTagActionType;
  active: boolean;
  /** Mantido para apresentar regras legadas que ainda tenham expiração. */
  duration_days: number | null;
  config: Record<string, unknown>;
};

export type PatientTagAutomationData = {
  tags: PatientTagSettingsTag[];
  rules: PatientTagRule[];
  schedules: PatientAutomationSchedule[];
  professionals: PatientAutomationProfessional[];
};

type OpenStateHandler = (open: boolean) => void;

const initialState: CompanyActionState = {};

const triggerLabels: Record<PatientTagTriggerType, string> = {
  new_patient: "Paciente cadastrado",
  birthday: "Aniversário do paciente",
  appointment_scheduled: "Agendamento criado",
  appointment_before: "Antes do agendamento",
  appointment_day: "Dia do agendamento",
  appointment_completed: "Agendamento concluído",
  first_visit: "Primeiro atendimento",
  revenue_threshold: "Faturamento mínimo atingido",
};

const triggerDescriptions: Record<PatientTagTriggerType, string> = {
  new_patient: "Executa quando um novo paciente é cadastrado.",
  birthday: "Executa anualmente na data de aniversário do paciente.",
  appointment_scheduled: "Executa assim que um agendamento é criado.",
  appointment_before:
    "Executa a quantidade informada de dias antes do agendamento.",
  appointment_day: "Executa no dia marcado para o agendamento.",
  appointment_completed: "Executa quando o atendimento é concluído.",
  first_visit: "Executa em relação ao primeiro atendimento do paciente.",
  revenue_threshold:
    "Executa quando o total pago pelo paciente atinge o valor informado.",
};

const triggerOrder: PatientTagTriggerType[] = [
  "birthday",
  "appointment_before",
  "appointment_day",
  "appointment_completed",
  "appointment_scheduled",
  "new_patient",
  "first_visit",
  "revenue_threshold",
];

const actionLabels: Record<PatientTagActionType, string> = {
  add_tag: "Adicionar tag",
  remove_tag: "Remover tag",
};

const appointmentScopedTriggers = new Set<PatientTagTriggerType>([
  "appointment_scheduled",
  "appointment_before",
  "appointment_day",
  "appointment_completed",
  "first_visit",
]);

export function PatientTagAutomationSettings({
  data,
}: {
  data: PatientTagAutomationData;
}) {
  const [tagEditorOpen, setTagEditorOpen] = useState(false);
  const [automationEditorOpen, setAutomationEditorOpen] = useState(false);

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Tag className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <h2 className="font-semibold">Tags de paciente</h2>
              <p className="text-sm text-muted-foreground">
                Marcadores visuais usados em pacientes, agenda e relacionamento.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            onClick={() => setTagEditorOpen(true)}
            aria-label="Criar tag"
            title="Criar tag"
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </CardHeader>
        <CardContent className="py-4">
          <TagList tags={data.tags} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <RefreshCw className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <h2 className="font-semibold">Automações</h2>
              <p className="text-sm text-muted-foreground">
                Regras que executam ações a partir de eventos da clínica.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setAutomationEditorOpen(true)}
            disabled={!data.tags.length}
            title={
              data.tags.length
                ? undefined
                : "Cadastre uma tag antes de criar uma automação."
            }
          >
            <Plus className="size-4" aria-hidden />
            Nova automação
          </Button>
        </CardHeader>
        <CardContent className="py-4">
          <RuleList
            rules={data.rules}
            tags={data.tags}
            schedules={data.schedules}
            professionals={data.professionals}
          />
        </CardContent>
      </Card>

      <CreateTagDialog open={tagEditorOpen} onOpenChange={setTagEditorOpen} />
      <CreateRuleDialog
        open={automationEditorOpen}
        onOpenChange={setAutomationEditorOpen}
        tags={data.tags}
        schedules={data.schedules}
        professionals={data.professionals}
      />
    </div>
  );
}

function TagList({ tags }: { tags: PatientTagSettingsTag[] }) {
  if (!tags.length) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Nenhuma tag cadastrada. Use o botão + para criar a primeira.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-medium"
        >
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: tag.color }}
            aria-hidden
          />
          {tag.name}
        </span>
      ))}
    </div>
  );
}

function CreateTagDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: OpenStateHandler;
}) {
  const [state, action, pending] = useActionState(
    createSettingsTag,
    initialState,
  );
  useActionFeedback(state, onOpenChange);

  return (
    <FormDialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Nova tag"
      description="Informe um nome curto e escolha a cor do marcador."
      formAction={action}
      error={state.error}
      pending={pending}
      confirmLabel="Criar tag"
      pendingLabel="Criando..."
      icon={Plus}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <label className="grid gap-1.5 text-sm font-medium">
          Nome
          <Input name="name" placeholder="Ex.: Cliente VIP" required />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Cor
          <Input
            name="color"
            type="color"
            className="w-full p-1"
            defaultValue={categoricalColors.blue}
            required
          />
        </label>
      </div>
    </FormDialog>
  );
}

function CreateRuleDialog({
  open,
  onOpenChange,
  tags,
  schedules,
  professionals,
}: {
  open: boolean;
  onOpenChange: OpenStateHandler;
  tags: PatientTagSettingsTag[];
  schedules: PatientAutomationSchedule[];
  professionals: PatientAutomationProfessional[];
}) {
  const [state, action, pending] = useActionState(
    createPatientTagRule,
    initialState,
  );
  const [triggerType, setTriggerType] = useState<PatientTagTriggerType>(
    "appointment_completed",
  );
  const [actionType, setActionType] = useState<PatientTagActionType>("add_tag");
  const [scheduleId, setScheduleId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const supportsAppointmentScope = appointmentScopedTriggers.has(triggerType);
  const availableSchedules = professionalId
    ? schedules.filter(
        (schedule) => schedule.professional_id === professionalId,
      )
    : schedules;
  const professionalNamesById = new Map(
    professionals.map((professional) => [professional.id, professional.name]),
  );
  useActionFeedback(state, onOpenChange);

  function changeProfessional(nextProfessionalId: string) {
    setProfessionalId(nextProfessionalId);
    if (
      scheduleId &&
      nextProfessionalId &&
      schedules.find((schedule) => schedule.id === scheduleId)
        ?.professional_id !== nextProfessionalId
    ) {
      setScheduleId("");
    }
  }

  function changeTrigger(nextTriggerType: string) {
    const nextTrigger = nextTriggerType as PatientTagTriggerType;
    setTriggerType(nextTrigger);

    if (!appointmentScopedTriggers.has(nextTrigger)) {
      setProfessionalId("");
      setScheduleId("");
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Nova automação"
      description="Defina quando a regra deve executar e o que ela fará."
      formAction={action}
      error={state.error}
      pending={pending}
      confirmLabel="Salvar automação"
      pendingLabel="Salvando..."
      confirmDisabled={!tags.length}
      icon={Save}
    >
      <label className="grid gap-1.5 text-sm font-medium">
        Nome da regra
        <Input
          name="name"
          placeholder="Ex.: Marcar pacientes após atendimento"
          required
        />
      </label>

      <fieldset className="grid min-w-0 gap-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Filtro</legend>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Profissional
            <Select
              name="professional_id"
              value={professionalId}
              onValueChange={changeProfessional}
              allowEmptyOption
              disabled={!supportsAppointmentScope}
            >
              <option value="">Todos os profissionais</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Agenda
            <Select
              name="schedule_id"
              value={scheduleId}
              onValueChange={setScheduleId}
              allowEmptyOption
              disabled={!supportsAppointmentScope}
            >
              <option value="">Todas as agendas</option>
              {availableSchedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {formatScheduleName(schedule, professionalNamesById)}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          {supportsAppointmentScope
            ? "Filtros opcionais. Ao selecionar um profissional, a lista de agendas mostra apenas as agendas dele."
            : "Este gatilho não usa agenda ou profissional. A regra será aplicada globalmente."}
        </p>
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Quando acontecer</legend>
        <label className="grid gap-1.5 text-sm font-medium">
          Gatilho
          <Select
            name="trigger_type"
            value={triggerType}
            onValueChange={changeTrigger}
            required
          >
            {triggerOrder.map((value) => (
              <option key={value} value={value}>
                {triggerLabels[value]}
              </option>
            ))}
          </Select>
        </label>

        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {triggerDescriptions[triggerType]}
        </p>

        {triggerType === "appointment_before" ? (
          <label className="grid gap-1.5 text-sm font-medium">
            Quantos dias antes
            <Input
              name="days_offset"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              defaultValue={1}
              required
            />
          </label>
        ) : null}

        {triggerType === "revenue_threshold" ? (
          <label className="grid gap-1.5 text-sm font-medium">
            Total pago mínimo
            <Input
              name="minimum_paid_amount"
              inputMode="decimal"
              placeholder="Ex.: 2.000,00"
              required
            />
          </label>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Fazer isto</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Ação
            <Select
              name="action_type"
              value={actionType}
              onValueChange={(value) =>
                setActionType(value as PatientTagActionType)
              }
              required
            >
              {Object.entries(actionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm font-medium">
            {actionType === "add_tag" ? "Tag a adicionar" : "Tag a remover"}
            <Select name="tag_id" required disabled={!tags.length}>
              <option value="">Selecione</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          As primeiras ações disponíveis trabalham com tags. Outras ações
          poderão ser acrescentadas sem alterar a estrutura da regra.
        </p>
      </fieldset>
    </FormDialog>
  );
}

function RuleList({
  rules,
  tags,
  schedules,
  professionals,
}: {
  rules: PatientTagRule[];
  tags: PatientTagSettingsTag[];
  schedules: PatientAutomationSchedule[];
  professionals: PatientAutomationProfessional[];
}) {
  const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
  const schedulesById = new Map(
    schedules.map((schedule) => [schedule.id, schedule]),
  );
  const professionalsById = new Map(
    professionals.map((professional) => [professional.id, professional]),
  );

  if (!rules.length) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-5 text-center text-sm text-muted-foreground">
        Nenhuma automação configurada.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {rules.map((rule) => {
        const schedule = schedulesById.get(
          stringValue(rule.config.schedule_id),
        );
        const scheduleProfessional = schedule?.professional_id
          ? professionalsById.get(schedule.professional_id)
          : undefined;

        return (
          <RuleRow
            key={rule.id}
            rule={rule}
            tag={tagsById.get(rule.tag_id)}
            schedule={schedule}
            scheduleProfessional={scheduleProfessional}
            professional={professionalsById.get(
              stringValue(rule.config.professional_id),
            )}
          />
        );
      })}
    </div>
  );
}

function RuleRow({
  rule,
  tag,
  schedule,
  scheduleProfessional,
  professional,
}: {
  rule: PatientTagRule;
  tag?: PatientTagSettingsTag;
  schedule?: PatientAutomationSchedule;
  scheduleProfessional?: PatientAutomationProfessional;
  professional?: PatientAutomationProfessional;
}) {
  const actionType = rule.action_type ?? "add_tag";
  const hasScheduleScope = Boolean(rule.config.schedule_id);
  const hasProfessionalScope = Boolean(rule.config.professional_id);

  return (
    <article className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <RuleIcon triggerType={rule.trigger_type} />
          <h3 className="truncate text-sm font-semibold">{rule.name}</h3>
          <Badge variant={rule.active ? "success" : "neutral"}>
            {rule.active ? "Ativa" : "Inativa"}
          </Badge>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{formatRuleTrigger(rule)}</span>
          <span aria-hidden>•</span>
          <span>{actionLabels[actionType]}</span>
          {tag ? <CompactTag tag={tag} /> : <span>Tag indisponível</span>}
          {rule.duration_days ? (
            <>
              <span aria-hidden>•</span>
              <span>expira em {rule.duration_days} dias</span>
            </>
          ) : null}
          {appointmentScopedTriggers.has(rule.trigger_type) ? (
            <>
              <span aria-hidden>•</span>
              <span>
                {formatRuleScope({
                  hasScheduleScope,
                  hasProfessionalScope,
                  schedule,
                  scheduleProfessional,
                  professional,
                })}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
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
            size="icon-sm"
            aria-label={`Remover automação ${rule.name}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </form>
      </div>
    </article>
  );
}

function CompactTag({ tag }: { tag: PatientTagSettingsTag }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium text-foreground">
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: tag.color }}
        aria-hidden
      />
      {tag.name}
    </span>
  );
}

function formatRuleTrigger(rule: PatientTagRule) {
  if (rule.trigger_type === "appointment_before") {
    const days = positiveNumber(
      rule.config.days_before ??
        rule.config.days_offset ??
        rule.config.offset_days,
    );
    if (days) {
      return `${days} ${days === 1 ? "dia" : "dias"} antes do agendamento`;
    }
  }

  if (rule.trigger_type === "revenue_threshold") {
    const minimumPaid = positiveNumber(rule.config.minimum_paid_amount);
    if (minimumPaid) {
      return `${triggerLabels[rule.trigger_type]}: ${formatCurrency(minimumPaid)}`;
    }
  }

  return triggerLabels[rule.trigger_type];
}

function formatRuleScope({
  hasScheduleScope,
  hasProfessionalScope,
  schedule,
  scheduleProfessional,
  professional,
}: {
  hasScheduleScope: boolean;
  hasProfessionalScope: boolean;
  schedule?: PatientAutomationSchedule;
  scheduleProfessional?: PatientAutomationProfessional;
  professional?: PatientAutomationProfessional;
}) {
  if (!hasScheduleScope && !hasProfessionalScope) {
    return "Todas as agendas e profissionais";
  }

  return [
    hasScheduleScope
      ? `Agenda: ${
          schedule
            ? `${schedule.name}${scheduleProfessional ? ` — ${scheduleProfessional.name}` : ""}`
            : "indisponível"
        }`
      : null,
    hasProfessionalScope
      ? `Profissional: ${professional?.name ?? "indisponível"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatScheduleName(
  schedule: PatientAutomationSchedule,
  professionalNamesById: Map<string, string>,
) {
  const professionalName = schedule.professional_id
    ? professionalNamesById.get(schedule.professional_id)
    : undefined;
  return `${schedule.name}${professionalName ? ` — ${professionalName}` : ""}`;
}

function RuleIcon({ triggerType }: { triggerType: PatientTagTriggerType }) {
  const className = "size-4 shrink-0 text-primary";

  if (triggerType === "birthday") {
    return <Cake className={className} aria-hidden />;
  }
  if (triggerType === "appointment_before") {
    return <CalendarClock className={className} aria-hidden />;
  }
  if (triggerType === "appointment_day") {
    return <CalendarDays className={className} aria-hidden />;
  }
  if (triggerType === "appointment_completed") {
    return <CalendarCheck2 className={className} aria-hidden />;
  }
  if (triggerType === "new_patient") {
    return <UserPlus className={className} aria-hidden />;
  }
  if (triggerType === "appointment_scheduled") {
    return <CalendarDays className={className} aria-hidden />;
  }
  if (triggerType === "revenue_threshold") {
    return <CircleDollarSign className={className} aria-hidden />;
  }
  return <BadgeCheck className={className} aria-hidden />;
}

function useActionFeedback(
  state: CompanyActionState,
  onOpenChange: OpenStateHandler,
) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      onOpenChange(false);
    }
  }, [state, onOpenChange]);
}

function positiveNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
