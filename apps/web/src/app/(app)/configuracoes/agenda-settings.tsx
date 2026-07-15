"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CalendarClock,
  CalendarDays,
  CirclePlus,
  Clock3,
  Globe2,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  createScheduleBlock,
  deleteScheduleBlock,
  saveScheduleConfiguration,
  updateScheduleBlock,
  type AgendaActionState,
} from "../agenda/actions";
import { defaultScheduleColor } from "@/lib/colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input, Select } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";

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
type EditablePeriod = {
  key: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

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
              <p className="mt-1 text-sm text-muted-foreground">
                Configure toda a operação de uma agenda em um único lugar.
              </p>
            </div>
          </div>
          {canConfigure ? (
            <Button type="button" onClick={() => setEditor("new")}>
              <CirclePlus className="size-4" aria-hidden="true" />
              Nova agenda
            </Button>
          ) : null}
        </header>

        <div className="grid gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Agendas cadastradas" value={data.schedules.length} />
            <Metric label="Ativas na operação" value={activeCount} />
            <Metric label="Disponíveis online" value={onlineCount} />
          </div>

          <div className="grid gap-3">
            {data.schedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                data={data}
                canConfigure={canConfigure}
                canBlock={canBlock}
                onEdit={() => setEditor(schedule.id)}
              />
            ))}
            {!data.schedules.length ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-5 py-10 text-center">
                <CalendarClock className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 font-medium">Nenhuma agenda cadastrada</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crie uma agenda para definir profissional, unidade e horários.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {editor ? (
        <ScheduleConfigurationEditor
          key={editor}
          data={data}
          schedule={selectedSchedule}
          canConfigure={canConfigure}
          canBlock={canBlock}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ScheduleCard({
  schedule,
  data,
  canConfigure,
  canBlock,
  onEdit,
}: {
  schedule: ScheduleItem;
  data: AgendaSettingsData;
  canConfigure: boolean;
  canBlock: boolean;
  onEdit: () => void;
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

  return (
    <article className="rounded-lg border border-border bg-background px-3 py-3 transition-colors hover:bg-muted/15">
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
                <h3 className="font-semibold">{schedule.name}</h3>
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
                    : "Fora do portal"}
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
            {canConfigure || canBlock ? (
              <DropdownMenu
                trigger={<MoreVertical className="size-4" aria-hidden="true" />}
                triggerLabel={`Ações de ${schedule.name}`}
              >
                {(close) => (
                  <>
                    {canConfigure ? (
                      <DropdownMenuItem
                        icon={Pencil}
                        onSelect={() => {
                          close();
                          onEdit();
                        }}
                      >
                        Editar agenda
                      </DropdownMenuItem>
                    ) : null}
                    {canBlock && !canConfigure ? (
                      <DropdownMenuItem
                        icon={Ban}
                        onSelect={() => {
                          close();
                          onEdit();
                        }}
                      >
                        Gerenciar bloqueios
                      </DropdownMenuItem>
                    ) : null}
                  </>
                )}
              </DropdownMenu>
            ) : null}
          </div>

          <div className="mt-3 grid gap-x-5 gap-y-2 border-t border-border/70 pt-2.5 text-sm md:grid-cols-3">
            <CardDetail
              icon={CalendarClock}
              label="Horários semanais"
              value={formatScheduleHours(rows)}
            />
            <CardDetail
              icon={Globe2}
              label="Regras online"
              value={
                schedule.online_enabled
                  ? `${schedule.min_notice_hours}h de antecedência · ${procedureCount} procedimento${procedureCount === 1 ? "" : "s"}`
                  : "Agendamento online desativado"
              }
            />
            <CardDetail
              icon={Ban}
              label="Próximo bloqueio"
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
  icon: typeof CalendarClock;
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
  onClose,
}: {
  data: AgendaSettingsData;
  schedule?: ScheduleItem;
  canConfigure: boolean;
  canBlock: boolean;
  onClose: () => void;
}) {
  const scheduleRows = schedule
    ? data.availabilities.filter((row) => row.schedule_id === schedule.id)
    : [];
  const [active, setActive] = useState(schedule?.active ?? true);
  const [onlineEnabled, setOnlineEnabled] = useState(
    schedule?.online_enabled ?? false,
  );
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
  const availabilityError = useMemo(() => validatePeriods(periods), [periods]);
  const scheduleBlocks = schedule
    ? data.blocks.filter((block) => block.schedule_id === schedule.id)
    : [];
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

  return (
    <Modal
      open
      onClose={onClose}
      title={schedule ? schedule.name : "Nova agenda profissional"}
      description="Dados, expediente, publicação online e exceções da agenda."
      className="max-w-6xl"
    >
      <form action={action} className="grid gap-5" aria-busy={pending}>
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

        <EditorSection
          title="Dados gerais"
          description="Identificação, profissional responsável e unidade de atendimento."
          icon={CalendarDays}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <OptionSelect
              name="professional_id"
              label="Profissional"
              options={data.professionals}
              defaultValue={schedule?.professional_id}
              disabled={!canConfigure || pending}
            />
            <OptionSelect
              name="unit_id"
              label="Unidade"
              options={data.units}
              defaultValue={schedule?.unit_id}
              disabled={!canConfigure || pending}
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
            <label className="grid gap-2 text-sm font-medium">
              Cor na agenda
              <input
                name="color"
                type="color"
                defaultValue={schedule?.color ?? defaultScheduleColor}
                disabled={!canConfigure || pending}
                className="h-10 w-24 rounded-md border border-border bg-card p-1"
              />
            </label>
          </div>
          <div className="mt-4 rounded-md border border-border bg-muted/25 p-3">
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
        </EditorSection>

        <EditorSection
          title="Horários de atendimento"
          description="Cadastre um ou mais períodos por dia. O espaço entre eles será a pausa de almoço ou outro intervalo."
          icon={Clock3}
        >
          <label className="mb-4 grid max-w-xs gap-2 text-sm font-medium">
            <span className="inline-flex items-center gap-1">
              Intervalo entre opções
              <HelpTooltip>
                Espaçamento entre os horários de início oferecidos. A duração do
                procedimento continua sendo respeitada.
              </HelpTooltip>
            </span>
            <div className="flex items-center gap-2">
              <Input
                name="slot_minutes"
                type="number"
                min="5"
                max="480"
                step="5"
                defaultValue={schedule?.slot_minutes ?? 30}
                disabled={!canConfigure || pending}
                className="w-28"
                required
              />
              <span className="text-sm font-normal text-muted-foreground">
                minutos
              </span>
            </div>
          </label>
          <div className="grid gap-3">
            {weekdays.map((day) => (
              <DayPeriodsEditor
                key={day.weekday}
                day={day}
                periods={periods.filter(
                  (period) => period.weekday === day.weekday,
                )}
                disabled={!canConfigure || pending}
                onAdd={() => addPeriod(day.weekday)}
                onChange={updatePeriod}
                onRemove={(key) =>
                  setPeriods((current) =>
                    current.filter((period) => period.key !== key),
                  )
                }
              />
            ))}
          </div>
          {availabilityError ? (
            <p className="mt-3 text-sm text-destructive">{availabilityError}</p>
          ) : null}
        </EditorSection>

        <EditorSection
          title="Agendamento online"
          description="Defina se esta agenda aparece no portal e quais regras ela segue."
          icon={Globe2}
        >
          <div className="rounded-md border border-border bg-muted/25 p-3">
            <Switch
              checked={onlineEnabled}
              disabled={!canConfigure || pending || !active}
              label="Permitir agendamento online nesta agenda"
              onCheckedChange={setOnlineEnabled}
            />
            <p className="mt-1 pl-11 text-xs text-muted-foreground">
              A publicação geral do portal continua sendo controlada na tela de
              Agendamento online.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <NumberField
              name="min_notice_hours"
              label="Antecedência mínima"
              suffix="horas"
              min={0}
              max={720}
              defaultValue={schedule?.min_notice_hours ?? 24}
              disabled={!canConfigure || pending}
            />
            <NumberField
              name="max_days_ahead"
              label="Janela máxima"
              suffix="dias"
              min={1}
              max={365}
              defaultValue={schedule?.max_days_ahead ?? 30}
              disabled={!canConfigure || pending}
            />
            <NumberField
              name="cancellation_notice_hours"
              label="Prazo para cancelar"
              suffix="horas"
              min={0}
              max={720}
              defaultValue={schedule?.cancellation_notice_hours ?? 24}
              disabled={!canConfigure || pending}
            />
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div>
              <h4 className="text-sm font-semibold">
                Procedimentos oferecidos
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                O paciente verá somente os procedimentos marcados nesta agenda.
              </p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.procedures.map((procedure) => (
                <div
                  key={procedure.id}
                  className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-background p-3"
                >
                  <Checkbox
                    checked={selectedProcedures.has(procedure.id)}
                    disabled={!canConfigure || pending}
                    aria-label={`Oferecer ${procedure.name}`}
                    onChange={(event) => {
                      setSelectedProcedures((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(procedure.id);
                        else next.delete(procedure.id);
                        return next;
                      });
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {procedure.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {procedure.duration_minutes} min
                    </span>
                  </span>
                </div>
              ))}
              {!data.procedures.length ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum procedimento ativo cadastrado.
                </p>
              ) : null}
            </div>
          </div>
        </EditorSection>

        <EditorSection
          title="Bloqueios e exceções"
          description="Bloqueios sempre prevalecem sobre os horários recorrentes e também removem o período do portal online."
          icon={Ban}
          action={
            schedule && canBlock ? (
              <BlockForm scheduleId={schedule.id} timeZone={data.timeZone} />
            ) : null
          }
        >
          {schedule ? (
            <BlocksList
              blocks={scheduleBlocks}
              scheduleId={schedule.id}
              timeZone={data.timeZone}
              canBlock={canBlock}
            />
          ) : (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Salve a agenda antes de cadastrar bloqueios.
            </p>
          )}
        </EditorSection>

        {state.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {state.error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {canConfigure ? (
            <Button
              type="submit"
              disabled={pending || Boolean(availabilityError)}
            >
              <Save className="size-4" aria-hidden="true" />
              {pending
                ? "Salvando..."
                : schedule
                  ? "Salvar configuração"
                  : "Criar agenda"}
            </Button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

function EditorSection({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description: string;
  icon: typeof CalendarDays;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-background">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-muted text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function DayPeriodsEditor({
  day,
  periods,
  disabled,
  onAdd,
  onChange,
  onRemove,
}: {
  day: (typeof weekdays)[number];
  periods: EditablePeriod[];
  disabled: boolean;
  onAdd: () => void;
  onChange: (key: string, patch: Partial<EditablePeriod>) => void;
  onRemove: (key: string) => void;
}) {
  const orderedPeriods = [...periods].sort((left, right) =>
    left.start_time.localeCompare(right.start_time),
  );
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-muted text-xs font-semibold sm:hidden">
            {day.shortLabel}
          </span>
          <p className="hidden min-w-32 text-sm font-medium sm:block">
            {day.label}
          </p>
          <Badge variant={orderedPeriods.length ? "success" : "neutral"}>
            {orderedPeriods.length
              ? `${orderedPeriods.length} período${orderedPeriods.length === 1 ? "" : "s"}`
              : "Sem atendimento"}
          </Badge>
        </div>
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
      {orderedPeriods.length ? (
        <div className="mt-3 grid gap-2 border-t border-border pt-3">
          {orderedPeriods.map((period, index) => (
            <div
              key={period.key}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(8rem,1fr)_auto_minmax(8rem,1fr)_auto] sm:items-end"
            >
              <label className="grid min-w-0 gap-1 text-xs font-medium">
                Início {index + 1}
                <Input
                  type="time"
                  value={period.start_time}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(period.key, { start_time: event.target.value })
                  }
                  required
                  className="min-w-0 w-full"
                />
              </label>
              <span className="hidden pb-2 text-sm text-muted-foreground sm:block">
                até
              </span>
              <label className="col-start-1 grid min-w-0 gap-1 text-xs font-medium sm:col-start-auto">
                Fim {index + 1}
                <Input
                  type="time"
                  value={period.end_time}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(period.key, { end_time: event.target.value })
                  }
                  required
                  className="min-w-0 w-full"
                />
              </label>
              <Button
                type="button"
                variant="destructive-ghost"
                size="icon-sm"
                disabled={disabled}
                onClick={() => onRemove(period.key)}
                aria-label={`Remover período ${index + 1} de ${day.label}`}
                className="self-end"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
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
}: {
  name: string;
  label: string;
  suffix: string;
  min: number;
  max: number;
  defaultValue: number;
  disabled: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <div className="flex items-center gap-2">
        <Input
          name={name}
          type="number"
          min={min}
          max={max}
          defaultValue={defaultValue}
          disabled={disabled}
          required
          className="min-w-0 flex-1"
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
  if (!blocks.length) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Nenhum bloqueio atual ou futuro nesta agenda.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      {blocks.map((block) => (
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
              <BlockForm
                block={block}
                scheduleId={scheduleId}
                timeZone={timeZone}
              />
              <DeleteBlockButton block={block} timeZone={timeZone} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function BlockForm({
  scheduleId,
  timeZone,
  block,
}: {
  scheduleId: string;
  timeZone: string;
  block?: BlockItem;
}) {
  const initialStart = block
    ? toLocalDateTime(block.start_at, timeZone)
    : defaultLocalDateTime(1, timeZone);
  const initialEnd = block
    ? toLocalDateTime(block.end_at, timeZone)
    : defaultLocalDateTime(2, timeZone);
  const [open, setOpen] = useState(false);
  const [startAt, setStartAt] = useState(initialStart);
  const [endAt, setEndAt] = useState(initialEnd);
  const [allDay, setAllDay] = useState(false);
  const [clientError, setClientError] = useState<string>();
  const serverAction = block
    ? updateScheduleBlock.bind(null, block.id)
    : createScheduleBlock;
  const [state, action, pending] = useActionState(
    async (previousState: AgendaActionState, formData: FormData) => {
      const result = await serverAction(previousState, formData);
      if (result.success) setOpen(false);
      return result;
    },
    initialState,
  );
  useToastState(state);

  function setDayMode(checked: boolean) {
    setAllDay(checked);
    if (!checked) return;
    const date =
      startAt.slice(0, 10) || defaultLocalDateTime(0, timeZone).slice(0, 10);
    setStartAt(`${date}T00:00`);
    setEndAt(`${nextDate(date)}T00:00`);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size={block ? "icon-sm" : "sm"}
        onClick={() => setOpen(true)}
        aria-label={block ? "Editar bloqueio" : undefined}
      >
        {block ? <Pencil className="size-4" /> : <Ban className="size-4" />}
        {block ? null : "Novo bloqueio"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={block ? "Editar bloqueio" : "Bloquear horário"}
        description="O período ficará indisponível na agenda interna e no agendamento online."
        className="max-w-2xl"
      >
        <form
          action={action}
          className="grid min-w-0 gap-4"
          onSubmit={(event) => {
            if (startAt && endAt && endAt <= startAt) {
              event.preventDefault();
              setClientError("O fim do bloqueio deve ser posterior ao início.");
            } else {
              setClientError(undefined);
            }
          }}
        >
          <input type="hidden" name="schedule_id" value={scheduleId} />
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <Checkbox
              checked={allDay}
              label="Bloquear o dia inteiro"
              onChange={(event) => setDayMode(event.target.checked)}
            />
          </div>
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Início do bloqueio
            <Input
              name="start_at"
              type="datetime-local"
              value={startAt}
              onChange={(event) => {
                setStartAt(event.target.value);
                if (allDay && event.target.value) {
                  setEndAt(
                    `${nextDate(event.target.value.slice(0, 10))}T00:00`,
                  );
                }
              }}
              disabled={pending}
              required
              className="min-w-0 w-full"
            />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Fim do bloqueio
            <Input
              name="end_at"
              type="datetime-local"
              value={endAt}
              min={startAt}
              onChange={(event) => setEndAt(event.target.value)}
              disabled={pending}
              required
              className="min-w-0 w-full"
            />
          </label>
          <label className="grid min-w-0 gap-2 text-sm font-medium">
            Motivo
            <Input
              name="reason"
              defaultValue={block?.reason ?? ""}
              placeholder="Ex.: reunião, férias ou almoço"
              disabled={pending}
              className="min-w-0 w-full"
            />
          </label>
          {clientError || state.error ? (
            <p className="text-sm text-destructive">
              {clientError || state.error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Salvando..."
                : block
                  ? "Salvar bloqueio"
                  : "Bloquear horário"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
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
}: {
  name: string;
  label: string;
  options: Option[];
  defaultValue?: string;
  disabled: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-medium">
      {label}
      <Select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
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
    </label>
  );
}

function useToastState(state: AgendaActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state.success]);
}

function validatePeriods(periods: EditablePeriod[]) {
  for (const day of weekdays) {
    const dayPeriods = periods
      .filter((period) => period.weekday === day.weekday)
      .sort((left, right) => left.start_time.localeCompare(right.start_time));
    for (const [index, period] of dayPeriods.entries()) {
      if (!period.start_time || !period.end_time) {
        return `Preencha todos os horários de ${day.label.toLowerCase()}.`;
      }
      if (period.start_time >= period.end_time) {
        return `Em ${day.label.toLowerCase()}, o fim deve ser posterior ao início.`;
      }
      if (index > 0 && period.start_time < dayPeriods[index - 1].end_time) {
        return `Há períodos sobrepostos em ${day.label.toLowerCase()}.`;
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
