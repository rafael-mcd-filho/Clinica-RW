"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDots as CalendarClock,
  FloppyDisk as Save,
  Faders as Settings2,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  saveWeeklyScheduleAvailability,
  type AgendaActionState,
} from "../agenda/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Switch } from "@/components/ui/switch";

export type WeeklyAvailabilitySettingsData = {
  schedules: Array<{
    id: string;
    name: string;
    active: boolean;
  }>;
  availabilities: Array<{
    id: string;
    schedule_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
    slot_minutes: number;
  }>;
};

type DayState = {
  weekday: number;
  label: string;
  shortLabel: string;
  active: boolean;
  startTime: string;
  endTime: string;
  lunchEnabled: boolean;
  lunchStart: string;
  lunchEnd: string;
  preserve: boolean;
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

export function WeeklyAvailabilitySettings({
  data,
  canConfigure,
}: {
  data: WeeklyAvailabilitySettingsData;
  canConfigure: boolean;
}) {
  const availableSchedules = data.schedules.filter(
    (schedule) => schedule.active,
  );
  const [requestedScheduleId, setRequestedScheduleId] = useState(
    availableSchedules[0]?.id ?? "",
  );
  const selectedScheduleId = availableSchedules.some(
    (schedule) => schedule.id === requestedScheduleId,
  )
    ? requestedScheduleId
    : (availableSchedules[0]?.id ?? "");
  const selectedRows = data.availabilities.filter(
    (availability) => availability.schedule_id === selectedScheduleId,
  );
  const formRevision = selectedRows
    .map(
      (row) =>
        `${row.id}:${row.weekday}:${row.start_time}:${row.end_time}:${row.slot_minutes}`,
    )
    .join("|");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-muted text-primary">
            <CalendarClock className="size-4" aria-hidden="true" />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold">Horários para atendimento</h2>
              <HelpTooltip label="Como os horários são usados">
                Estes períodos alimentam a agenda interna e as opções da página
                pública. Uma pausa divide o dia em manhã e tarde.
              </HelpTooltip>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Ative os dias atendidos e informe o expediente local de cada
              agenda profissional.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {availableSchedules.length ? (
          <>
            <label className="grid max-w-xl gap-2 text-sm font-medium">
              Agenda profissional
              <Select
                value={selectedScheduleId}
                onValueChange={setRequestedScheduleId}
                aria-label="Selecionar agenda para configurar horários"
              >
                {availableSchedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.name}
                  </option>
                ))}
              </Select>
            </label>
            {selectedScheduleId ? (
              <WeeklyScheduleForm
                key={`${selectedScheduleId}:${formRevision}`}
                scheduleId={selectedScheduleId}
                rows={selectedRows}
                canConfigure={canConfigure}
              />
            ) : null}
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-5 text-sm">
            <p className="font-medium">
              Cadastre uma agenda profissional primeiro.
            </p>
            <p className="mt-1 text-muted-foreground">
              Os horários precisam estar ligados a um profissional e a uma
              unidade de atendimento.
            </p>
            <Button asChild variant="secondary" size="sm" className="mt-3">
              <Link href="/configuracoes/agenda?agenda_section=agendas">
                <Settings2 className="size-4" aria-hidden="true" />
                Configurar agendas
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeeklyScheduleForm({
  scheduleId,
  rows,
  canConfigure,
}: {
  scheduleId: string;
  rows: WeeklyAvailabilitySettingsData["availabilities"];
  canConfigure: boolean;
}) {
  const [days, setDays] = useState(() => buildDayStates(rows));
  const [slotMinutes, setSlotMinutes] = useState(() => mostCommonSlot(rows));
  const [state, action, pending] = useActionState(
    saveWeeklyScheduleAvailability,
    initialState,
  );
  const advancedDays = days.filter((day) => day.preserve);

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  function updateDay(weekday: number, patch: Partial<DayState>) {
    setDays((current) =>
      current.map((day) =>
        day.weekday === weekday ? { ...day, ...patch } : day,
      ),
    );
  }

  return (
    <form action={action} className="grid gap-4" aria-busy={pending}>
      <input type="hidden" name="schedule_id" value={scheduleId} readOnly />
      <input
        type="hidden"
        name="availability_payload"
        value={JSON.stringify(days)}
        readOnly
      />

      <div className="flex flex-col justify-between gap-3 rounded-md border border-border bg-muted/20 p-3 sm:flex-row sm:items-end">
        <label className="grid gap-2 text-sm font-medium sm:max-w-56">
          <span className="inline-flex items-center gap-1">
            Intervalo entre opções
            <HelpTooltip>
              Define de quantos em quantos minutos novos horários são oferecidos
              ao paciente.
            </HelpTooltip>
          </span>
          <div className="flex items-center gap-2">
            <Input
              name="slot_minutes"
              type="number"
              min="5"
              max="480"
              step="5"
              value={slotMinutes}
              onChange={(event) => setSlotMinutes(Number(event.target.value))}
              disabled={!canConfigure || pending}
              required
              className="w-24"
            />
            <span className="text-sm font-normal text-muted-foreground">
              minutos
            </span>
          </div>
        </label>
        <p className="max-w-lg text-xs text-muted-foreground">
          A duração do procedimento continua sendo respeitada; este valor
          controla apenas o espaçamento entre os inícios oferecidos.
        </p>
      </div>

      {advancedDays.length ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
          <p className="font-medium">Alguns dias têm mais de dois períodos.</p>
          <p className="mt-1 text-muted-foreground">
            Eles foram preservados sem alteração. Use as regras avançadas da
            Agenda para editá-los individualmente.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3">
        {days.map((day) => (
          <DayAvailabilityRow
            key={day.weekday}
            day={day}
            disabled={!canConfigure || pending}
            onChange={(patch) => updateDay(day.weekday, patch)}
          />
        ))}
      </div>

      <FormError message={state.error} />
      <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/configuracoes/agenda?agenda_section=disponibilidades">
            <Settings2 className="size-4" aria-hidden="true" />
            Abrir regras avançadas
          </Link>
        </Button>
        {canConfigure ? (
          <Button type="submit" disabled={pending}>
            <Save className="size-4" aria-hidden="true" />
            {pending ? "Salvando..." : "Salvar horários"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Seu perfil pode consultar, mas não alterar estes horários.
          </p>
        )}
      </div>
    </form>
  );
}

function DayAvailabilityRow({
  day,
  disabled,
  onChange,
}: {
  day: DayState;
  disabled: boolean;
  onChange: (patch: Partial<DayState>) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-background p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-md bg-muted text-xs font-semibold text-secondary-foreground sm:hidden">
            {day.shortLabel}
          </span>
          <h3 className="hidden min-w-32 font-medium sm:block">{day.label}</h3>
          {day.preserve ? (
            <Badge variant="warning">Configuração avançada</Badge>
          ) : null}
        </div>
        <Switch
          checked={day.active}
          disabled={disabled || day.preserve}
          label={day.active ? "Atendimento ativo" : "Sem atendimento"}
          onCheckedChange={(active) => onChange({ active })}
        />
      </div>

      {day.preserve ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Este dia possui intervalos adicionais e não será alterado por este
          formulário.
        </p>
      ) : day.active ? (
        <div className="mt-4 grid gap-4 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(10rem,1fr)_minmax(10rem,1fr)_auto] lg:items-end">
            <TimeField
              label="Início do atendimento"
              value={day.startTime}
              disabled={disabled}
              onChange={(startTime) => onChange({ startTime })}
            />
            <TimeField
              label="Fim do atendimento"
              value={day.endTime}
              disabled={disabled}
              onChange={(endTime) => onChange({ endTime })}
            />
            <div className="pb-2 lg:pl-2">
              <Switch
                checked={day.lunchEnabled}
                disabled={disabled}
                label="Pausa para almoço"
                onCheckedChange={(lunchEnabled) => onChange({ lunchEnabled })}
              />
            </div>
          </div>

          {day.lunchEnabled ? (
            <div className="grid gap-3 rounded-md border border-dashed border-border bg-muted/20 p-3 sm:grid-cols-2">
              <TimeField
                label="Início da pausa"
                value={day.lunchStart}
                disabled={disabled}
                onChange={(lunchStart) => onChange({ lunchStart })}
              />
              <TimeField
                label="Fim da pausa"
                value={day.lunchEnd}
                disabled={disabled}
                onChange={(lunchEnd) => onChange({ lunchEnd })}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TimeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Input
        type="time"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  );
}

function buildDayStates(
  rows: WeeklyAvailabilitySettingsData["availabilities"],
): DayState[] {
  return weekdays.map((weekday) => {
    const dayRows = rows
      .filter((row) => row.weekday === weekday.weekday)
      .sort((left, right) => left.start_time.localeCompare(right.start_time));
    const overlapping = dayRows.some(
      (row, index) => index > 0 && row.start_time < dayRows[index - 1].end_time,
    );
    const preserve = dayRows.length > 2 || overlapping;
    const first = dayRows[0];
    const second = dayRows[1];
    const last = dayRows.at(-1);
    const lunchEnabled =
      dayRows.length === 2 && first.end_time < second.start_time;

    return {
      ...weekday,
      active: dayRows.length > 0,
      startTime: first?.start_time.slice(0, 5) ?? "08:00",
      endTime: last?.end_time.slice(0, 5) ?? "18:00",
      lunchEnabled,
      lunchStart: lunchEnabled ? first.end_time.slice(0, 5) : "12:00",
      lunchEnd: lunchEnabled ? second.start_time.slice(0, 5) : "13:00",
      preserve,
    };
  });
}

function mostCommonSlot(
  rows: WeeklyAvailabilitySettingsData["availabilities"],
) {
  if (!rows.length) return 30;
  const counts = new Map<number, number>();
  for (const row of rows) {
    counts.set(row.slot_minutes, (counts.get(row.slot_minutes) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    ([slotA, countA], [slotB, countB]) => countB - countA || slotA - slotB,
  )[0][0];
}
