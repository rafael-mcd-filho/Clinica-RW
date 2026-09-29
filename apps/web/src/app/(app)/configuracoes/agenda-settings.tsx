"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  Prohibit as Ban,
  CalendarDots as CalendarDays,
  PlusCircle as CirclePlus,
  Clock as Clock3,
  Copy,
  Globe as Globe2,
  MapPin,
  DotsThreeVertical as MoreVertical,
  PencilSimple as Pencil,
  Plus,
  FloppyDisk as Save,
  Trash as Trash2,
  UserCircle as UserRound,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  createScheduleBlock,
  deleteScheduleBlock,
  saveScheduleConfiguration,
  updateScheduleBlock,
  type AgendaActionState,
} from "../agenda/actions";
import { categoricalColors, defaultScheduleColor } from "@/lib/colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input, Select } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string; active?: boolean };

export type AgendaSettingsData = {
  timeZone: string;
  schedules: Array<{
    id: string;
    professional_id: string;
    unit_id: string;
    name: string;
    color: string;
    active: boolean;
    online_enabled: boolean;
    min_notice_hours: number;
    max_days_ahead: number;
    cancellation_notice_hours: number;
    slot_minutes: number;
  }>;
  professionals: Option[];
  units: Option[];
  procedures: Array<Option & { duration_minutes: number }>;
  procedureAssignments: Array<{
    schedule_id: string;
    procedure_id: string;
  }>;
  availabilities: Array<{
    id: string;
    schedule_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
    slot_minutes: number;
  }>;
  blocks: Array<{
    id: string;
    schedule_id: string;
    start_at: string;
    end_at: string;
    reason: string | null;
  }>;
};

type ScheduleItem = AgendaSettingsData["schedules"][number];
type AvailabilityItem = AgendaSettingsData["availabilities"][number];
type BlockItem = AgendaSettingsData["blocks"][number];
type ScheduleEditorSection = "general" | "hours" | "online" | "blocks";
type EditablePeriod = {
  key: string;
  weekday: number;
  start_time: string;
  end_time: string;
};
type PeriodsError = { weekday: number; message: string };

const initialState: AgendaActionState = {};
const weekdays = [
  { weekday: 1, label: "Segunda-feira", shortLabel: "Seg" },
  { weekday: 2, label: "Terça-feira", shortLabel: "Ter" },
  { weekday: 3, label: "Quarta-feira", shortLabel: "Qua" },
  { weekday: 4, label: "Quinta-feira", shortLabel: "Qui" },
  { weekday: 5, label: "Sexta-feira", shortLabel: "Sex" },
  { weekday: 6, label: "Sábado", shortLabel: "Sáb" },
  { weekday: 0, label: "Domingo", shortLabel: "Dom" },
];
const editorTabs: Array<{
  id: ScheduleEditorSection;
  label: string;
  icon: typeof CalendarDays;
}> = [
  { id: "general", label: "Dados gerais", icon: CalendarDays },
  { id: "hours", label: "Horários", icon: Clock3 },
  { id: "online", label: "Agendamento online", icon: Globe2 },
  { id: "blocks", label: "Bloqueios", icon: Ban },
];
// Cores prontas da paleta do sistema; a personalizada continua possível.
const schedulePalette: string[] = [
  categoricalColors.blue,
  categoricalColors.teal,
  categoricalColors.violet,
  categoricalColors.green,
  categoricalColors.amber,
  categoricalColors.pink,
  categoricalColors.indigo,
  categoricalColors.red,
  categoricalColors.slate,
];

export function AgendaSettings({
  data,
  canConfigure,
  canBlock,
  initialScheduleId,
}: {
  data: AgendaSettingsData;
  canConfigure: boolean;
  canBlock: boolean;
  initialScheduleId?: string;
}) {
  const [editor, setEditor] = useState<string | "new" | null>(() =>
    initialScheduleId &&
    data.schedules.some((schedule) => schedule.id === initialScheduleId)
      ? initialScheduleId
      : null,
  );
  const [editorSection, setEditorSection] =
    useState<ScheduleEditorSection>("general");
  // Momento da abertura da tela, para saber se um bloqueio já começou.
  const [nowMs] = useState(() => Date.now());
  const selectedSchedule =
    editor && editor !== "new"
      ? data.schedules.find((schedule) => schedule.id === editor)
      : undefined;
  const activeCount = data.schedules.filter(
    (schedule) => schedule.active,
  ).length;
  const onlineCount = data.schedules.filter(
    (schedule) => schedule.active && schedule.online_enabled,
  ).length;

  function openNew() {
    setEditorSection("general");
    setEditor("new");
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-border bg-card">
        <header className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-muted text-primary">
              <CalendarDays className="size-5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-semibold">Agendas profissionais</h2>
                <HelpTooltip label="Como as agendas funcionam">
                  Cada agenda reúne profissional, unidade, horários, bloqueios e
                  regras próprias para o agendamento online.
                </HelpTooltip>
              </div>
              {/* Resumo em uma linha: três cartões de número grande diziam
                  pouco e ocupavam a tela. */}
              <p className="mt-1 text-sm text-muted-foreground">
                {data.schedules.length
                  ? `${data.schedules.length} ${data.schedules.length === 1 ? "agenda" : "agendas"} · ${activeCount} ${activeCount === 1 ? "ativa" : "ativas"} · ${onlineCount} no agendamento online`
                  : "Configure toda a operação de uma agenda em um único lugar."}
              </p>
            </div>
          </div>
          {canConfigure ? (
            <Button type="button" onClick={openNew}>
              <CirclePlus className="size-4" aria-hidden="true" />
              Nova agenda
            </Button>
          ) : null}
        </header>

        <div className="grid gap-3 p-5">
          {data.schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              data={data}
              nowMs={nowMs}
              canConfigure={canConfigure}
              canBlock={canBlock}
              onEdit={(section) => {
                setEditorSection(section);
                setEditor(schedule.id);
              }}
            />
          ))}
          {!data.schedules.length ? (
            <div className="grid justify-items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-5 py-10 text-center">
              <CalendarDays
                className="size-6 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">Nenhuma agenda cadastrada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Uma agenda junta profissional, unidade e horários de
                  atendimento. Crie a primeira para começar a marcar consultas.
                </p>
              </div>
              {canConfigure ? (
                <Button type="button" variant="secondary" onClick={openNew}>
                  <CirclePlus className="size-4" aria-hidden="true" />
                  Nova agenda
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {editor ? (
        <ScheduleConfigurationEditor
          key={editor}
          data={data}
          schedule={selectedSchedule}
          canConfigure={canConfigure}
          canBlock={canBlock}
          initialSection={editor === "new" ? "general" : editorSection}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}

function ScheduleCard({
  schedule,
  data,
  nowMs,
  canConfigure,
  canBlock,
  onEdit,
}: {
  schedule: ScheduleItem;
  data: AgendaSettingsData;
  nowMs: number;
  canConfigure: boolean;
  canBlock: boolean;
  onEdit: (section: ScheduleEditorSection) => void;
}) {
  const professional = data.professionals.find(
    (item) => item.id === schedule.professional_id,
  );
  const unit = data.units.find((item) => item.id === schedule.unit_id);
  const rows = data.availabilities.filter(
    (item) => item.schedule_id === schedule.id,
  );
  const blocks = data.blocks.filter((item) => item.schedule_id === schedule.id);
  const activeProcedureIds = new Set(
    data.procedures.map((procedure) => procedure.id),
  );
  const procedureCount = data.procedureAssignments.filter(
    (item) =>
      item.schedule_id === schedule.id &&
      activeProcedureIds.has(item.procedure_id),
  ).length;
  const nextBlock = blocks[0];
  const nextBlockOngoing = nextBlock
    ? new Date(nextBlock.start_at).getTime() <= nowMs
    : false;
  const canOpen = canConfigure || canBlock;

  return (
    <article className="rounded-lg border border-border bg-background px-3 py-3">
      <div className="flex items-start gap-3">
        <span
          className="mt-1.5 size-2.5 shrink-0 rounded-full ring-2 ring-border"
          style={{ backgroundColor: schedule.color }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* O nome abre a agenda: é onde o olho já está. */}
                {canOpen ? (
                  <button
                    type="button"
                    onClick={() => onEdit(canConfigure ? "general" : "blocks")}
                    className="text-left font-semibold underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {schedule.name}
                  </button>
                ) : (
                  <h3 className="font-semibold">{schedule.name}</h3>
                )}
                <Badge variant={schedule.active ? "success" : "neutral"}>
                  {schedule.active ? "Ativa" : "Inativa"}
                </Badge>
                <Badge
                  variant={
                    schedule.active && schedule.online_enabled
                      ? "primary"
                      : "neutral"
                  }
                >
                  {schedule.active && schedule.online_enabled
                    ? "Online"
                    : "Online desligado"}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                  {professional?.name ?? "Profissional indisponível"}
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {unit?.name ?? "Unidade indisponível"}
                </span>
              </div>
            </div>
            {canOpen ? (
              <DropdownMenu
                trigger={<MoreVertical className="size-4" aria-hidden="true" />}
                triggerLabel={`Ações de ${schedule.name}`}
              >
                {(close) => (
                  <>
                    {editorTabs
                      .filter((tab) =>
                        tab.id === "blocks" ? canBlock : canConfigure,
                      )
                      .map((tab) => (
                        <DropdownMenuItem
                          key={tab.id}
                          icon={tab.id === "general" ? Pencil : tab.icon}
                          onSelect={() => {
                            close();
                            onEdit(tab.id);
                          }}
                        >
                          {tab.label}
                        </DropdownMenuItem>
                      ))}
                  </>
                )}
              </DropdownMenu>
            ) : null}
          </div>

          <div className="mt-3 grid gap-x-5 gap-y-2 border-t border-border/70 pt-2.5 text-sm md:grid-cols-3">
            <CardDetail
              icon={Clock3}
              label="Horários semanais"
              value={formatScheduleHours(rows)}
            />
            <CardDetail
              icon={Globe2}
              label="Regras online"
              value={
                schedule.online_enabled
                  ? `${schedule.min_notice_hours}h de antecedência · ${procedureCount} procedimento${procedureCount === 1 ? "" : "s"}`
                  : "Agendamento online desligado"
              }
            />
            <CardDetail
              icon={Ban}
              label={
                nextBlockOngoing ? "Bloqueio em andamento" : "Próximo bloqueio"
              }
              value={
                nextBlock
                  ? formatBlockInterval(
                      nextBlock.start_at,
                      nextBlock.end_at,
                      data.timeZone,
                    )
                  : "Nenhum bloqueio futuro"
              }
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function CardDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 line-clamp-2 text-sm">{value}</p>
    </div>
  );
}

function ScheduleConfigurationEditor({
  data,
  schedule,
  canConfigure,
  canBlock,
  initialSection,
  onClose,
}: {
  data: AgendaSettingsData;
  schedule?: ScheduleItem;
  canConfigure: boolean;
  canBlock: boolean;
  initialSection: ScheduleEditorSection;
  onClose: () => void;
}) {
  const scheduleRows = schedule
    ? data.availabilities.filter((row) => row.schedule_id === schedule.id)
    : [];
  // Abas dentro da janela: antes cada item do menu abria só uma seção, e
  // passar de Horários para Online exigia fechar e reabrir.
  const [section, setSection] = useState<ScheduleEditorSection>(initialSection);
  const [active, setActive] = useState(schedule?.active ?? true);
  const [onlineEnabled, setOnlineEnabled] = useState(
    schedule?.online_enabled ?? false,
  );
  const [color, setColor] = useState(schedule?.color ?? defaultScheduleColor);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedDeactivationRef = useRef(false);
  const [confirmingDeactivation, setConfirmingDeactivation] = useState(false);
  const [periods, setPeriods] = useState<EditablePeriod[]>(() =>
    scheduleRows.map((row) => ({
      key: row.id,
      weekday: row.weekday,
      start_time: row.start_time.slice(0, 5),
      end_time: row.end_time.slice(0, 5),
    })),
  );
  const [selectedProcedures, setSelectedProcedures] = useState<Set<string>>(
    () => {
      const availableProcedureIds = new Set(
        data.procedures.map((procedure) => procedure.id),
      );
      return new Set(
        data.procedureAssignments
          .filter(
            (item) =>
              item.schedule_id === schedule?.id &&
              availableProcedureIds.has(item.procedure_id),
          )
          .map((item) => item.procedure_id),
      );
    },
  );
  const [state, action, pending] = useActionState(
    async (previousState: AgendaActionState, formData: FormData) => {
      const result = await saveScheduleConfiguration(previousState, formData);
      if (result.success) onClose();
      return result;
    },
    initialState,
  );
  const periodsError = useMemo(() => validatePeriods(periods), [periods]);
  const scheduleBlocks = schedule
    ? data.blocks.filter((block) => block.schedule_id === schedule.id)
    : [];
  const visibleTabs = editorTabs.filter((tab) =>
    tab.id === "blocks" ? canBlock : canConfigure,
  );
  useToastState(state);

  function addPeriod(weekday: number) {
    const dayPeriods = periods
      .filter((period) => period.weekday === weekday)
      .sort((left, right) => left.start_time.localeCompare(right.start_time));
    const previous = dayPeriods.at(-1);
    const start = previous ? laterTime(previous.end_time, 60) : "08:00";
    const end = previous ? laterTime(start, 240) : "12:00";
    setPeriods((current) => [
      ...current,
      {
        key: `${weekday}-${Date.now()}-${Math.random()}`,
        weekday,
        start_time: start,
        end_time: end,
      },
    ]);
  }

  function updatePeriod(key: string, patch: Partial<EditablePeriod>) {
    setPeriods((current) =>
      current.map((period) =>
        period.key === key ? { ...period, ...patch } : period,
      ),
    );
  }

  // Segunda a sexta costumam ser iguais: copiar um dia evita refazer tudo.
  function copyDay(sourceWeekday: number, targets: number[]) {
    setPeriods((current) => {
      const source = current.filter(
        (period) => period.weekday === sourceWeekday,
      );
      const kept = current.filter(
        (period) =>
          period.weekday === sourceWeekday || !targets.includes(period.weekday),
      );
      const copies = targets
        .filter((weekday) => weekday !== sourceWeekday)
        .flatMap((weekday) =>
          source.map((period) => ({
            ...period,
            key: `${weekday}-${Date.now()}-${Math.random()}`,
            weekday,
          })),
        );
      return [...kept, ...copies];
    });
    toast.success(
      targets.length >= 6
        ? "Horários copiados para todos os dias."
        : "Horários copiados para os dias úteis.",
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={schedule ? schedule.name : "Nova agenda profissional"}
      description={
        schedule
          ? "Dados, horários, publicação online e bloqueios desta agenda."
          : "Comece pelos dados gerais; horários e online podem ser ajustados depois."
      }
      className="max-w-4xl"
    >
      <div
        role="tablist"
        aria-label="Seções da agenda"
        className="mb-4 flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted p-1"
      >
        {visibleTabs.map((tab) => {
          const disabled = tab.id === "blocks" && !schedule;
          const selected = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={disabled}
              title={
                disabled
                  ? "Salve a agenda para cadastrar bloqueios."
                  : undefined
              }
              onClick={() => setSection(tab.id)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-body-sm font-medium transition-[background-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "bg-card text-foreground shadow-[var(--shadow-soft)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon className="size-4" aria-hidden="true" />
              {tab.label}
              {tab.id === "hours" && periodsError ? (
                <span
                  className="size-1.5 rounded-full bg-destructive"
                  aria-label="(com erro)"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <form
        ref={formRef}
        action={action}
        className="grid gap-5"
        aria-busy={pending}
        onSubmit={(event) => {
          const deactivatingSchedule = Boolean(schedule?.active && !active);
          const unpublishingSchedule = Boolean(
            schedule?.online_enabled && !onlineEnabled,
          );
          if (
            (deactivatingSchedule || unpublishingSchedule) &&
            !confirmedDeactivationRef.current
          ) {
            event.preventDefault();
            setConfirmingDeactivation(true);
          }
        }}
      >
        <input type="hidden" name="schedule_id" value={schedule?.id ?? ""} />
        <input type="hidden" name="active" value={String(active)} />
        <input
          type="hidden"
          name="online_enabled"
          value={String(onlineEnabled)}
        />
        <input
          type="hidden"
          name="availability_payload"
          value={JSON.stringify(
            periods.map(({ weekday, start_time, end_time }) => ({
              weekday,
              start_time,
              end_time,
            })),
          )}
        />
        <input
          type="hidden"
          name="procedure_ids_payload"
          value={JSON.stringify([...selectedProcedures])}
        />
        <input type="hidden" name="color" value={color} />

        {/* As seções continuam montadas (só escondidas): o formulário é um
            só e salva tudo junto. */}
        <section hidden={section !== "general"} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <OptionSelect
              name="professional_id"
              label="Profissional"
              options={data.professionals}
              defaultValue={schedule?.professional_id}
              disabled={!canConfigure || pending}
              emptyHint="Cadastre um profissional em Configurações › Cadastros e operação › Equipe."
              emptyHref="/configuracoes/cadastros?section=equipe"
            />
            <OptionSelect
              name="unit_id"
              label="Unidade"
              options={data.units}
              defaultValue={schedule?.unit_id}
              disabled={!canConfigure || pending}
              emptyHint="Cadastre uma unidade em Configurações › Cadastros e operação › Estrutura."
              emptyHref="/configuracoes/cadastros?section=estrutura"
            />
            <label className="grid gap-2 text-sm font-medium">
              Nome da agenda
              <Input
                name="name"
                defaultValue={schedule?.name}
                placeholder="Ex.: Agenda Dra. Camila"
                disabled={!canConfigure || pending}
                required
              />
            </label>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">
                Cor na agenda
              </legend>
              <div className="flex flex-wrap items-center gap-1.5">
                {schedulePalette.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    disabled={!canConfigure || pending}
                    onClick={() => setColor(swatch)}
                    aria-label={`Usar a cor ${swatch}`}
                    aria-pressed={color === swatch}
                    className={cn(
                      "size-7 rounded-full ring-offset-2 ring-offset-card transition-[box-shadow,scale] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95",
                      color === swatch ? "ring-2 ring-foreground" : "",
                    )}
                    style={{ backgroundColor: swatch }}
                  />
                ))}
                {/* Cor fora da paleta aparece aqui, marcada. */}
                <label
                  className={cn(
                    "relative size-7 cursor-pointer overflow-hidden rounded-full ring-offset-2 ring-offset-card",
                    schedulePalette.includes(color)
                      ? "border border-dashed border-border-strong"
                      : "ring-2 ring-foreground",
                  )}
                  style={
                    schedulePalette.includes(color)
                      ? undefined
                      : { backgroundColor: color }
                  }
                  title="Outra cor"
                >
                  <span className="sr-only">Escolher outra cor</span>
                  <input
                    type="color"
                    value={color}
                    disabled={!canConfigure || pending}
                    onChange={(event) => setColor(event.target.value)}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                  {schedulePalette.includes(color) ? (
                    <Plus
                      className="absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : null}
                </label>
              </div>
            </fieldset>
          </div>
          <div className="rounded-md border border-border bg-muted/25 p-3">
            <Switch
              checked={active}
              disabled={!canConfigure || pending}
              label="Agenda ativa na operação"
              onCheckedChange={(checked) => {
                setActive(checked);
                if (!checked) setOnlineEnabled(false);
              }}
            />
            <p className="mt-1 pl-11 text-xs text-muted-foreground">
              Ao desativar, o histórico é preservado, mas novos agendamentos não
              são aceitos.
            </p>
          </div>
        </section>

        <section hidden={section !== "hours"} className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Cadastre um ou mais períodos por dia. O espaço entre eles vira a
            pausa de almoço ou outro intervalo.
          </p>
          <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="inline-flex items-center gap-1.5">
              Intervalo entre horários
              <HelpTooltip>
                De quanto em quanto tempo os horários de início são oferecidos
                (ex.: 30 min → 08:00, 08:30…). A duração do procedimento
                continua sendo respeitada.
              </HelpTooltip>
            </span>
            <Input
              name="slot_minutes"
              type="number"
              min="5"
              max="480"
              step="5"
              defaultValue={schedule?.slot_minutes ?? 30}
              disabled={!canConfigure || pending}
              className="w-24"
              required
            />
            <span className="text-xs font-normal text-muted-foreground">
              minutos
            </span>
          </label>
          <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {weekdays.map((day) => (
              <DayPeriodsEditor
                key={day.weekday}
                day={day}
                periods={periods.filter(
                  (period) => period.weekday === day.weekday,
                )}
                error={
                  periodsError?.weekday === day.weekday
                    ? periodsError.message
                    : undefined
                }
                disabled={!canConfigure || pending}
                onAdd={() => addPeriod(day.weekday)}
                onChange={updatePeriod}
                onCopy={(targets) => copyDay(day.weekday, targets)}
                onRemove={(key) =>
                  setPeriods((current) =>
                    current.filter((period) => period.key !== key),
                  )
                }
              />
            ))}
          </div>
        </section>

        <section hidden={section !== "online"} className="grid gap-4">
          <div className="grid gap-3 rounded-md border border-border bg-muted/25 p-3">
            <div>
              <Switch
                checked={onlineEnabled}
                disabled={!canConfigure || pending || !active}
                label="Permitir agendamento online nesta agenda"
                onCheckedChange={setOnlineEnabled}
              />
              <p className="mt-1 pl-11 text-xs text-muted-foreground">
                {active
                  ? "A publicação geral continua sendo controlada na tela de Agendamento online."
                  : "Ative a agenda em Dados gerais para publicá-la online."}
              </p>
            </div>
            {/* As regras só valem com o online ligado: desligado, ficam
                esmaecidas em vez de parecer editáveis à toa. */}
            <div
              className={cn(
                "grid gap-3 transition-opacity duration-[var(--motion-fast)] sm:grid-cols-3",
                !onlineEnabled && "opacity-60",
              )}
            >
              <NumberField
                name="min_notice_hours"
                label="Antecedência mínima"
                suffix="horas"
                min={0}
                max={720}
                defaultValue={schedule?.min_notice_hours ?? 24}
                disabled={!canConfigure || pending}
                readOnly={!onlineEnabled}
              />
              <NumberField
                name="max_days_ahead"
                label="Janela máxima"
                suffix="dias"
                min={1}
                max={365}
                defaultValue={schedule?.max_days_ahead ?? 30}
                disabled={!canConfigure || pending}
                readOnly={!onlineEnabled}
              />
              <NumberField
                name="cancellation_notice_hours"
                label="Prazo para cancelar"
                suffix="horas"
                min={0}
                max={720}
                defaultValue={schedule?.cancellation_notice_hours ?? 24}
                disabled={!canConfigure || pending}
                readOnly={!onlineEnabled}
              />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">
                Procedimentos oferecidos
              </h4>
              <p className="text-xs text-muted-foreground">
                O paciente verá somente os procedimentos marcados nesta agenda.
              </p>
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {data.procedures.map((procedure) => {
                const checked = selectedProcedures.has(procedure.id);
                return (
                  // A linha inteira marca: antes só a caixinha de 16 px.
                  <label
                    key={procedure.id}
                    className={cn(
                      "flex min-w-0 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors duration-[var(--motion-fast)]",
                      checked
                        ? "border-primary/40 bg-primary-muted/30"
                        : "border-border bg-background hover:border-primary/30",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!canConfigure || pending}
                      onChange={(event) => {
                        setSelectedProcedures((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(procedure.id);
                          else next.delete(procedure.id);
                          return next;
                        });
                      }}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {procedure.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {procedure.duration_minutes} min
                      </span>
                    </span>
                  </label>
                );
              })}
              {!data.procedures.length ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum procedimento ativo.{" "}
                  <Link
                    href="/configuracoes/cadastros?section=servicos"
                    className="font-medium text-primary hover:underline"
                  >
                    Cadastrar procedimentos
                  </Link>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {state.error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}
        {periodsError && section !== "hours" ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            {periodsError.message}
            <button
              type="button"
              onClick={() => setSection("hours")}
              className="font-medium underline underline-offset-4"
            >
              Ver horários
            </button>
          </p>
        ) : null}

        {section !== "blocks" ? (
          <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            {canConfigure ? (
              <Button type="submit" disabled={pending || Boolean(periodsError)}>
                <Save className="size-4" aria-hidden="true" />
                {pending
                  ? "Salvando..."
                  : schedule
                    ? "Salvar configuração"
                    : "Criar agenda"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </form>

      {/* Bloqueios salvam na hora, fora do formulário da agenda. */}
      {section === "blocks" && schedule ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Bloqueios sempre prevalecem sobre os horários da semana e também
            tiram o período do agendamento online. Eles são salvos na hora.
          </p>
          {canBlock ? (
            <BlockEditor scheduleId={schedule.id} timeZone={data.timeZone} />
          ) : null}
          <BlocksList
            blocks={scheduleBlocks}
            scheduleId={schedule.id}
            timeZone={data.timeZone}
            canBlock={canBlock}
          />
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmingDeactivation}
        onClose={() => setConfirmingDeactivation(false)}
        title={active ? "Despublicar agenda?" : "Desativar agenda?"}
        description={
          active
            ? "Esta agenda deixará de aparecer no portal público. Agendamentos existentes serão preservados."
            : "A agenda deixará de aceitar novos agendamentos internos e online. Todo o histórico será preservado."
        }
        confirmLabel={active ? "Despublicar agenda" : "Desativar agenda"}
        destructive
        onConfirm={() => {
          confirmedDeactivationRef.current = true;
          formRef.current?.requestSubmit();
          confirmedDeactivationRef.current = false;
        }}
      />
    </Modal>
  );
}

function DayPeriodsEditor({
  day,
  periods,
  error,
  disabled,
  onAdd,
  onChange,
  onCopy,
  onRemove,
}: {
  day: (typeof weekdays)[number];
  periods: EditablePeriod[];
  error?: string;
  disabled: boolean;
  onAdd: () => void;
  onChange: (key: string, patch: Partial<EditablePeriod>) => void;
  onCopy: (targets: number[]) => void;
  onRemove: (key: string) => void;
}) {
  const orderedPeriods = [...periods].sort((left, right) =>
    left.start_time.localeCompare(right.start_time),
  );
  return (
    <div
      className={cn(
        "grid min-h-14 gap-2 px-3 py-2 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:items-center",
        error ? "bg-destructive/5" : "bg-background",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded bg-muted text-caption font-semibold sm:hidden">
          {day.shortLabel}
        </span>
        <p className="hidden text-sm font-medium sm:block">{day.label}</p>
      </div>

      <div className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {orderedPeriods.length ? (
            orderedPeriods.map((period, index) => (
              <div
                key={period.key}
                className={cn(
                  "flex min-w-0 animate-content-enter items-center gap-1 rounded-md border bg-card p-1 shadow-[var(--shadow-soft)]",
                  error ? "border-destructive/60" : "border-border",
                )}
              >
                <label className="sr-only" htmlFor={`${period.key}-start`}>
                  Início do período {index + 1} de {day.label}
                </label>
                <Input
                  id={`${period.key}-start`}
                  type="time"
                  value={period.start_time}
                  disabled={disabled}
                  aria-invalid={Boolean(error)}
                  onChange={(event) =>
                    onChange(period.key, { start_time: event.target.value })
                  }
                  required
                  className="h-8 w-[7.25rem] min-w-0 border-0 px-2 text-control shadow-none"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <label className="sr-only" htmlFor={`${period.key}-end`}>
                  Fim do período {index + 1} de {day.label}
                </label>
                <Input
                  id={`${period.key}-end`}
                  type="time"
                  value={period.end_time}
                  disabled={disabled}
                  aria-invalid={Boolean(error)}
                  onChange={(event) =>
                    onChange(period.key, { end_time: event.target.value })
                  }
                  required
                  className="h-8 w-[7.25rem] min-w-0 border-0 px-2 text-control shadow-none"
                />
                <Button
                  type="button"
                  variant="destructive-ghost"
                  size="icon-sm"
                  disabled={disabled}
                  onClick={() => onRemove(period.key)}
                  aria-label={`Remover período ${index + 1} de ${day.label}`}
                  className="size-8 shrink-0"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            ))
          ) : (
            <span className="self-center text-xs text-muted-foreground">
              Sem atendimento
            </span>
          )}
        </div>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-1">
        {orderedPeriods.length ? (
          <DropdownMenu
            trigger={<Copy className="size-4" aria-hidden="true" />}
            triggerLabel={`Copiar horários de ${day.label}`}
          >
            {(close) => (
              <>
                <DropdownMenuItem
                  icon={Copy}
                  onSelect={() => {
                    close();
                    onCopy([1, 2, 3, 4, 5]);
                  }}
                >
                  Copiar para os dias úteis
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={Copy}
                  onSelect={() => {
                    close();
                    onCopy([0, 1, 2, 3, 4, 5, 6]);
                  }}
                >
                  Copiar para todos os dias
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenu>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onAdd}
        >
          <Plus className="size-4" aria-hidden="true" />
          Período
        </Button>
      </div>
    </div>
  );
}

function NumberField({
  name,
  label,
  suffix,
  min,
  max,
  defaultValue,
  disabled,
  readOnly,
}: {
  name: string;
  label: string;
  suffix: string;
  min: number;
  max: number;
  defaultValue: number;
  disabled: boolean;
  /** Somente leitura (e não desativado): o valor continua indo no envio. */
  readOnly?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <div className="flex items-center gap-1.5">
        <Input
          name={name}
          type="number"
          min={min}
          max={max}
          defaultValue={defaultValue}
          disabled={disabled}
          readOnly={readOnly}
          aria-readonly={readOnly || undefined}
          required
          className="w-24 min-w-0 read-only:bg-muted/40"
        />
        <span className="text-xs font-normal text-muted-foreground">
          {suffix}
        </span>
      </div>
    </label>
  );
}

function BlocksList({
  blocks,
  scheduleId,
  timeZone,
  canBlock,
}: {
  blocks: BlockItem[];
  scheduleId: string;
  timeZone: string;
  canBlock: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!blocks.length) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Nenhum bloqueio atual ou futuro nesta agenda.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      {blocks.map((block) =>
        editingId === block.id ? (
          <BlockEditor
            key={block.id}
            block={block}
            scheduleId={scheduleId}
            timeZone={timeZone}
            initiallyOpen
            onDone={() => setEditingId(null)}
          />
        ) : (
          <div
            key={block.id}
            className="flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {formatBlockInterval(block.start_at, block.end_at, timeZone)}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {block.reason || "Sem motivo informado"}
              </p>
            </div>
            {canBlock ? (
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Editar bloqueio"
                  title="Editar"
                  onClick={() => setEditingId(block.id)}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
                <DeleteBlockButton block={block} timeZone={timeZone} />
              </div>
            ) : null}
          </div>
        ),
      )}
    </div>
  );
}

/**
 * Criar ou editar bloqueio no próprio lugar (antes era uma janela dentro da
 * janela). Com "dia inteiro" só as datas aparecem; o fim vira o início do
 * dia seguinte por baixo.
 */
function BlockEditor({
  scheduleId,
  timeZone,
  block,
  initiallyOpen = false,
  onDone,
}: {
  scheduleId: string;
  timeZone: string;
  block?: BlockItem;
  initiallyOpen?: boolean;
  onDone?: () => void;
}) {
  const initialStart = block
    ? toLocalDateTime(block.start_at, timeZone)
    : defaultLocalDateTime(1, timeZone);
  const initialEnd = block
    ? toLocalDateTime(block.end_at, timeZone)
    : defaultLocalDateTime(2, timeZone);
  const initialAllDay = Boolean(
    block &&
    initialStart.slice(11) === "00:00" &&
    initialEnd.slice(11) === "00:00",
  );
  const [open, setOpen] = useState(initiallyOpen);
  const [formKey, setFormKey] = useState(0);
  const [startDate, setStartDate] = useState(initialStart.slice(0, 10));
  const [startTime, setStartTime] = useState(initialStart.slice(11, 16));
  // Em dia inteiro, o fim guardado é 00:00 do dia seguinte; na tela, o último
  // dia bloqueado.
  const [endDate, setEndDate] = useState(
    initialAllDay
      ? previousDate(initialEnd.slice(0, 10))
      : initialEnd.slice(0, 10),
  );
  const [endTime, setEndTime] = useState(initialEnd.slice(11, 16));
  const [allDay, setAllDay] = useState(initialAllDay);
  const [clientError, setClientError] = useState<string>();
  const serverAction = block
    ? updateScheduleBlock.bind(null, block.id)
    : createScheduleBlock;
  const [state, action, pending] = useActionState(
    async (previousState: AgendaActionState, formData: FormData) => {
      const result = await serverAction(previousState, formData);
      if (result.success) {
        close();
      }
      return result;
    },
    initialState,
  );
  useToastState(state);

  const startAt = allDay ? `${startDate}T00:00` : `${startDate}T${startTime}`;
  const endAt = allDay ? `${nextDate(endDate)}T00:00` : `${endDate}T${endTime}`;

  function close() {
    if (onDone) {
      onDone();
      return;
    }
    setOpen(false);
    // Próximo "Novo bloqueio" começa limpo.
    const nextStart = defaultLocalDateTime(1, timeZone);
    const nextEnd = defaultLocalDateTime(2, timeZone);
    setStartDate(nextStart.slice(0, 10));
    setStartTime(nextStart.slice(11, 16));
    setEndDate(nextEnd.slice(0, 10));
    setEndTime(nextEnd.slice(11, 16));
    setAllDay(false);
    setClientError(undefined);
    setFormKey((value) => value + 1);
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="w-fit"
        onClick={() => setOpen(true)}
      >
        <Ban className="size-4" aria-hidden="true" />
        Novo bloqueio
      </Button>
    );
  }

  return (
    <form
      key={formKey}
      action={action}
      className="grid min-w-0 animate-content-enter gap-4 rounded-md border border-border bg-muted/20 p-4"
      onSubmit={(event) => {
        if (!startDate || !endDate || endAt <= startAt) {
          event.preventDefault();
          setClientError(
            allDay
              ? "O último dia do bloqueio não pode ser antes do primeiro."
              : "O fim do bloqueio deve ser depois do início.",
          );
        } else {
          setClientError(undefined);
        }
      }}
    >
      <input type="hidden" name="schedule_id" value={scheduleId} />
      <input type="hidden" name="start_at" value={startAt} />
      <input type="hidden" name="end_at" value={endAt} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {block ? "Editar bloqueio" : "Novo bloqueio"}
        </p>
        <Checkbox
          checked={allDay}
          label="Dia inteiro"
          onChange={(event) => setAllDay(event.target.checked)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 text-sm font-medium">
          {allDay ? "Primeiro dia" : "Início"}
          <div className="flex min-w-0 gap-2">
            <DatePickerInput
              name="block_start_date"
              ariaLabel={allDay ? "Primeiro dia" : "Data de início"}
              value={startDate}
              onValueChange={(value) => {
                setStartDate(value);
                if (value && endDate < value) setEndDate(value);
              }}
              className="min-w-0 flex-1"
            />
            {!allDay ? (
              <Input
                type="time"
                aria-label="Hora de início"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="w-28 shrink-0"
                required
              />
            ) : null}
          </div>
        </div>
        <div className="grid gap-2 text-sm font-medium">
          {allDay ? "Último dia" : "Fim"}
          <div className="flex min-w-0 gap-2">
            <DatePickerInput
              name="block_end_date"
              ariaLabel={allDay ? "Último dia" : "Data de fim"}
              value={endDate}
              onValueChange={setEndDate}
              className="min-w-0 flex-1"
            />
            {!allDay ? (
              <Input
                type="time"
                aria-label="Hora de fim"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                className="w-28 shrink-0"
                required
              />
            ) : null}
          </div>
        </div>
      </div>
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Motivo
        <Input
          name="reason"
          defaultValue={block?.reason ?? ""}
          placeholder="Ex.: reunião, férias ou congresso"
          disabled={pending}
          className="min-w-0 w-full"
        />
      </label>
      {clientError || state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {clientError || state.error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
        <Button type="button" variant="ghost" onClick={close}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Salvando..."
            : block
              ? "Salvar bloqueio"
              : "Bloquear período"}
        </Button>
      </div>
    </form>
  );
}

function DeleteBlockButton({
  block,
  timeZone,
}: {
  block: BlockItem;
  timeZone: string;
}) {
  const [open, setOpen] = useState(false);
  const serverAction = deleteScheduleBlock.bind(null, block.id);
  const [state, action, pending] = useActionState(
    async (previousState: AgendaActionState, formData: FormData) => {
      const result = await serverAction(previousState, formData);
      if (result.success) setOpen(false);
      return result;
    },
    initialState,
  );
  useToastState(state);
  return (
    <>
      <Button
        type="button"
        variant="destructive-ghost"
        size="icon-sm"
        aria-label="Excluir bloqueio"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Excluir bloqueio?"
        description={`${formatBlockInterval(block.start_at, block.end_at, timeZone)}. O período voltará a seguir os horários semanais da agenda.`}
        formAction={action}
        error={state.error}
        pending={pending}
        confirmLabel="Excluir bloqueio"
        pendingLabel="Excluindo..."
        destructive
        icon={Trash2}
      />
    </>
  );
}

function OptionSelect({
  name,
  label,
  options,
  defaultValue = "",
  disabled,
  emptyHint,
  emptyHref,
}: {
  name: string;
  label: string;
  options: Option[];
  defaultValue?: string;
  disabled: boolean;
  /** Sem opções, diz onde cadastrar em vez de mostrar uma lista vazia. */
  emptyHint?: string;
  emptyHref?: string;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-medium">
      {label}
      <Select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled || !options.length}
        required
        className="min-w-0 w-full"
      >
        <option value="">Selecione</option>
        {options.map((item) => (
          <option
            key={item.id}
            value={item.id}
            disabled={item.active === false && item.id !== defaultValue}
          >
            {item.name}
            {item.active === false ? " (inativo)" : ""}
          </option>
        ))}
      </Select>
      {!options.length && emptyHint ? (
        <span className="text-xs font-normal text-muted-foreground">
          {emptyHref ? (
            <Link href={emptyHref} className="text-primary hover:underline">
              {emptyHint}
            </Link>
          ) : (
            emptyHint
          )}
        </span>
      ) : null}
    </label>
  );
}

function useToastState(state: AgendaActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state.success]);
}

/** Primeiro problema encontrado, com o dia, para marcar a linha certa. */
function validatePeriods(periods: EditablePeriod[]): PeriodsError | undefined {
  for (const day of weekdays) {
    const dayPeriods = periods
      .filter((period) => period.weekday === day.weekday)
      .sort((left, right) => left.start_time.localeCompare(right.start_time));
    for (const [index, period] of dayPeriods.entries()) {
      if (!period.start_time || !period.end_time) {
        return {
          weekday: day.weekday,
          message: `Preencha todos os horários de ${day.label.toLowerCase()}.`,
        };
      }
      if (period.start_time >= period.end_time) {
        return {
          weekday: day.weekday,
          message: `Em ${day.label.toLowerCase()}, o fim deve ser depois do início.`,
        };
      }
      if (index > 0 && period.start_time < dayPeriods[index - 1].end_time) {
        return {
          weekday: day.weekday,
          message: `Há períodos sobrepostos em ${day.label.toLowerCase()}.`,
        };
      }
    }
  }
  return undefined;
}

function laterTime(value: string, addedMinutes: number) {
  const [hours, minutes] = value.split(":").map(Number);
  const total = Math.min(hours * 60 + minutes + addedMinutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatScheduleHours(rows: AvailabilityItem[]) {
  if (!rows.length) return "Nenhum horário configurado";
  const summaries = weekdays
    .map((day) => {
      const periods = rows
        .filter((row) => row.weekday === day.weekday)
        .sort((left, right) => left.start_time.localeCompare(right.start_time));
      if (!periods.length) return null;
      return `${day.shortLabel} ${periods
        .map(
          (period) =>
            `${period.start_time.slice(0, 5)}–${period.end_time.slice(0, 5)}`,
        )
        .join(", ")}`;
    })
    .filter(Boolean);
  const visible = summaries.slice(0, 3);
  return `${visible.join(" · ")}${summaries.length > visible.length ? ` · +${summaries.length - visible.length} dias` : ""}`;
}

function formatBlockInterval(startAt: string, endAt: string, timeZone: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const startDate = dateFormatter.format(start);
  const endDate = dateFormatter.format(end);
  return startDate === endDate
    ? `${startDate}, ${timeFormatter.format(start)}–${timeFormatter.format(end)}`
    : `${startDate}, ${timeFormatter.format(start)} até ${endDate}, ${timeFormatter.format(end)}`;
}

function toLocalDateTime(value: string, timeZone: string) {
  return new Date(value)
    .toLocaleString("sv-SE", { timeZone })
    .replace(" ", "T")
    .slice(0, 16);
}

function defaultLocalDateTime(addedHours: number, timeZone: string) {
  const date = new Date(Date.now() + addedHours * 60 * 60 * 1000);
  date.setUTCMinutes(0, 0, 0);
  return date
    .toLocaleString("sv-SE", { timeZone })
    .replace(" ", "T")
    .slice(0, 16);
}

function nextDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return value;
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
}

function previousDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return value;
  return new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString()
    .slice(0, 10);
}
