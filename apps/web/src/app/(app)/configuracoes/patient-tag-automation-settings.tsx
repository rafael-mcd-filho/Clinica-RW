"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import {
  SealCheck as BadgeCheck,
  Cake,
  CalendarCheck as CalendarCheck2,
  CalendarDots as CalendarClock,
  CalendarDots as CalendarDays,
  CurrencyCircleDollar as CircleDollarSign,
  PencilSimple as Pencil,
  Plus,
  ArrowsClockwise as RefreshCw,
  FloppyDisk as Save,
  Trash as Trash2,
  UserPlus,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  createPatientTagRule,
  deletePatientAutomationRule,
  setPatientTagRuleActive,
  updatePatientAutomationRule,
  type CompanyActionState,
} from "./company-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  CurrencyInput,
  formatCurrencyInput,
} from "@/components/ui/currency-input";
import { ConfirmDialog, FormDialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

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
  // null: fechado; "new": criando; regra: editando.
  const [editor, setEditor] = useState<PatientTagRule | "new" | null>(null);

  return (
    <div className="grid gap-5">
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
            onClick={() => setEditor("new")}
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
        <CardContent className="grid gap-3 py-4">
          {!data.tags.length ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              As automações põem e tiram tags. Cadastre as tags em{" "}
              <Link
                href="/configuracoes/cadastros?section=tags"
                className="font-medium text-primary hover:underline"
              >
                Cadastros e operação › Tags
              </Link>{" "}
              para criar a primeira automação.
            </p>
          ) : null}
          <RuleList
            rules={data.rules}
            tags={data.tags}
            schedules={data.schedules}
            professionals={data.professionals}
            onEdit={(rule) => setEditor(rule)}
          />
        </CardContent>
      </Card>

      {editor ? (
        <RuleEditorDialog
          key={editor === "new" ? "new" : editor.id}
          rule={editor === "new" ? undefined : editor}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          tags={data.tags}
          schedules={data.schedules}
          professionals={data.professionals}
        />
      ) : null}
    </div>
  );
}

const triggerGroups: Array<{
  label: string;
  triggers: PatientTagTriggerType[];
}> = [
  {
    label: "Agendamento",
    triggers: [
      "appointment_scheduled",
      "appointment_before",
      "appointment_day",
      "appointment_completed",
    ],
  },
  {
    label: "Paciente",
    triggers: ["new_patient", "first_visit", "birthday", "revenue_threshold"],
  },
];

/** Como o gatilho entra na frase "Quando ..., adicionar a tag ...". */
function triggerPhrase(
  triggerType: PatientTagTriggerType,
  daysBefore: number,
  minimumPaid: string,
) {
  switch (triggerType) {
    case "new_patient":
      return "um paciente for cadastrado";
    case "birthday":
      return "for o aniversário do paciente";
    case "appointment_scheduled":
      return "um agendamento for criado";
    case "appointment_before":
      return `faltarem ${daysBefore || "N"} ${daysBefore === 1 ? "dia" : "dias"} para o agendamento`;
    case "appointment_day":
      return "chegar o dia do agendamento";
    case "appointment_completed":
      return "um atendimento for concluído";
    case "first_visit":
      return "o paciente tiver o primeiro atendimento";
    case "revenue_threshold":
      return `o total pago pelo paciente chegar a R$ ${minimumPaid || "…"}`;
  }
}

function RuleEditorDialog({
  onOpenChange,
  tags,
  schedules,
  professionals,
  rule,
}: {
  onOpenChange: OpenStateHandler;
  tags: PatientTagSettingsTag[];
  schedules: PatientAutomationSchedule[];
  professionals: PatientAutomationProfessional[];
  /** Presente ao editar; ausente ao criar. */
  rule?: PatientTagRule;
}) {
  const serverAction = rule
    ? updatePatientAutomationRule.bind(null, rule.id)
    : createPatientTagRule;
  const [state, action, pending] = useActionState(serverAction, initialState);
  const [triggerType, setTriggerType] = useState<PatientTagTriggerType>(
    rule?.trigger_type ?? "appointment_completed",
  );
  const [actionType, setActionType] = useState<PatientTagActionType>(
    rule?.action_type ?? "add_tag",
  );
  const [scheduleId, setScheduleId] = useState(
    stringValue(rule?.config.schedule_id),
  );
  const [professionalId, setProfessionalId] = useState(
    stringValue(rule?.config.professional_id),
  );
  const [tagId, setTagId] = useState(rule?.tag_id ?? "");
  const [daysBefore, setDaysBefore] = useState(
    String(
      positiveNumber(
        rule?.config.days_before ??
          rule?.config.days_offset ??
          rule?.config.offset_days,
      ) || 1,
    ),
  );
  const [minimumPaid, setMinimumPaid] = useState(() => {
    const value = positiveNumber(rule?.config.minimum_paid_amount);
    return value ? formatCurrencyInput(value) : "";
  });
  const [name, setName] = useState(rule?.name ?? "");
  const [nameTouched, setNameTouched] = useState(Boolean(rule));
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

  const tag = tags.find((item) => item.id === tagId);
  const schedule = schedules.find((item) => item.id === scheduleId);
  const professional = professionals.find((item) => item.id === professionalId);
  const scopePhrase = supportsAppointmentScope
    ? [
        professional ? ` com ${professional.name}` : "",
        schedule ? ` na agenda ${schedule.name}` : "",
      ].join("")
    : "";
  const sentence = `Quando ${triggerPhrase(triggerType, Number(daysBefore), minimumPaid)}${scopePhrase}, ${actionType === "add_tag" ? "adicionar" : "remover"} a tag ${tag ? `“${tag.name}”` : "…"}.`;
  // Nome sugerido a partir da regra, até a pessoa escrever o próprio.
  const suggestedName = tag
    ? `${actionType === "add_tag" ? "Adicionar" : "Remover"} “${tag.name}” · ${triggerLabels[triggerType]}`.slice(
        0,
        120,
      )
    : "";
  const effectiveName = nameTouched ? name : suggestedName;

  function changeProfessional(nextProfessionalId: string) {
    setProfessionalId(nextProfessionalId);
    if (
      scheduleId &&
      nextProfessionalId &&
      schedules.find((item) => item.id === scheduleId)?.professional_id !==
        nextProfessionalId
    ) {
      setScheduleId("");
    }
  }

  function changeTrigger(nextTrigger: PatientTagTriggerType) {
    setTriggerType(nextTrigger);
    if (!appointmentScopedTriggers.has(nextTrigger)) {
      setProfessionalId("");
      setScheduleId("");
    }
  }

  return (
    <FormDialog
      open
      onClose={() => onOpenChange(false)}
      title={rule ? "Editar automação" : "Nova automação"}
      description="Escolha quando a regra age, para quem e o que ela faz."
      formAction={action}
      error={state.error}
      pending={pending}
      confirmLabel={rule ? "Salvar alterações" : "Criar automação"}
      pendingLabel="Salvando..."
      confirmDisabled={!tags.length || !tagId || !effectiveName.trim()}
      icon={Save}
    >
      <input type="hidden" name="trigger_type" value={triggerType} />
      <input type="hidden" name="action_type" value={actionType} />

      <fieldset className="grid min-w-0 gap-3">
        <legend className="text-sm font-semibold">1. Quando acontecer</legend>
        {triggerGroups.map((group) => (
          <div key={group.label} className="grid gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {group.label}
            </p>
            <div
              role="radiogroup"
              aria-label={`Gatilhos de ${group.label.toLowerCase()}`}
              className="grid gap-2 sm:grid-cols-2"
            >
              {group.triggers.map((value) => {
                const selected = triggerType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => changeTrigger(value)}
                    className={cn(
                      "flex min-w-0 items-start gap-2.5 rounded-lg border p-3 text-left transition-[border-color,background-color] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                      selected
                        ? "border-primary bg-primary-muted/50"
                        : "border-border bg-card hover:border-primary/50",
                    )}
                  >
                    <RuleIcon triggerType={value} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {triggerLabels[value]}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {triggerDescriptions[value]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {triggerType === "appointment_before" ? (
          <label className="grid max-w-48 gap-1.5 text-sm font-medium">
            Quantos dias antes
            <Input
              name="days_offset"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={daysBefore}
              onChange={(event) => setDaysBefore(event.target.value)}
              required
            />
          </label>
        ) : null}

        {triggerType === "revenue_threshold" ? (
          <label className="grid max-w-56 gap-1.5 text-sm font-medium">
            Total pago mínimo
            <CurrencyInput
              name="minimum_paid_amount"
              required
              defaultValue={
                minimumPaid
                  ? Number(minimumPaid.replace(/\./g, "").replace(",", "."))
                  : 0
              }
              onValueChange={setMinimumPaid}
            />
          </label>
        ) : null}
      </fieldset>

      {supportsAppointmentScope ? (
        <fieldset className="grid min-w-0 gap-3 border-t border-border pt-4">
          <legend className="text-sm font-semibold">
            2. Para quais agendamentos
          </legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              Profissional
              <Select
                name="professional_id"
                value={professionalId}
                onValueChange={changeProfessional}
                allowEmptyOption
              >
                <option value="">Todos os profissionais</option>
                {professionals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
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
              >
                <option value="">Todas as agendas</option>
                {availableSchedules.map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatScheduleName(item, professionalNamesById)}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </fieldset>
      ) : null}

      <fieldset className="grid min-w-0 gap-3 border-t border-border pt-4">
        <legend className="text-sm font-semibold">
          {supportsAppointmentScope ? "3" : "2"}. Fazer isto
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div
            role="radiogroup"
            aria-label="Ação"
            className="inline-flex h-10 items-center gap-1 self-end rounded-lg border border-border bg-muted p-1"
          >
            {(Object.keys(actionLabels) as PatientTagActionType[]).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={actionType === value}
                  onClick={() => setActionType(value)}
                  className={cn(
                    "h-8 flex-1 rounded-md px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-[var(--motion-fast)]",
                    actionType === value
                      ? "bg-card text-foreground shadow-[var(--shadow-soft)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {actionLabels[value]}
                </button>
              ),
            )}
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            {actionType === "add_tag" ? "Tag a adicionar" : "Tag a remover"}
            <Select
              name="tag_id"
              required
              value={tagId}
              onValueChange={setTagId}
              disabled={!tags.length}
            >
              <option value="">Selecione</option>
              {tags.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </fieldset>

      {/* A regra em uma frase: dá para conferir antes de salvar. */}
      <p
        aria-live="polite"
        className="rounded-md border border-primary/20 bg-primary-muted/40 px-3 py-2.5 text-sm text-foreground"
      >
        {sentence}
      </p>

      <label className="grid gap-1.5 text-sm font-medium">
        Nome da automação
        <Input
          name="name"
          value={effectiveName}
          onChange={(event) => {
            setNameTouched(true);
            setName(event.target.value);
          }}
          maxLength={120}
          placeholder="Escolha a tag para sugerirmos um nome"
          required
        />
      </label>
    </FormDialog>
  );
}

function RuleList({
  rules,
  tags,
  schedules,
  professionals,
  onEdit,
}: {
  rules: PatientTagRule[];
  tags: PatientTagSettingsTag[];
  schedules: PatientAutomationSchedule[];
  professionals: PatientAutomationProfessional[];
  onEdit: (rule: PatientTagRule) => void;
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
        Nenhuma automação ainda. Exemplo: marcar com a tag “Retorno” quem
        concluiu um atendimento, ou “Aniversariante” no dia do aniversário.
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
            onEdit={() => onEdit(rule)}
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
  onEdit,
}: {
  rule: PatientTagRule;
  tag?: PatientTagSettingsTag;
  schedule?: PatientAutomationSchedule;
  scheduleProfessional?: PatientAutomationProfessional;
  professional?: PatientAutomationProfessional;
  onEdit: () => void;
}) {
  const actionType = rule.action_type ?? "add_tag";
  const hasScheduleScope = Boolean(rule.config.schedule_id);
  const hasProfessionalScope = Boolean(rule.config.professional_id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [toggling, startToggle] = useTransition();

  // Desativar é reversível: vai direto, com aviso, sem pedir confirmação.
  function toggleActive() {
    startToggle(async () => {
      const result = await setPatientTagRuleActive(rule.id, !rule.active);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }

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
        <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={toggling}
          onClick={toggleActive}
        >
          {toggling
            ? rule.active
              ? "Desativando..."
              : "Ativando..."
            : rule.active
              ? "Desativar"
              : "Ativar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remover automação ${rule.name}`}
          title="Remover"
          onClick={() => setConfirmingDelete(true)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Remover automação?"
        description={`A automação "${rule.name}" deixará de ser aplicada aos pacientes e será removida permanentemente. Para só pausar, use Desativar.`}
        destructive
        confirmLabel="Remover automação"
        pendingLabel="Removendo..."
        onConfirm={async () => {
          await deletePatientAutomationRule(rule.id);
          toast.success("Automação removida.");
        }}
      />
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
