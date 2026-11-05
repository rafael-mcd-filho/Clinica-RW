"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarX, Plus, Prohibit as Ban } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  closedRanges,
  dayTimelineRange,
  listFreeSlots,
  localMinuteRangeOnDate,
  minutesToTime,
  notBeforeMinuteFor,
  weekdayOfDateKey,
  windowsForSchedule,
  type DayWindow,
  type FreeSlot,
  type MinuteRange,
} from "@/lib/agenda/day-columns";
import {
  appointmentOccupiesTime,
  appointmentStatusLabels as statusLabel,
} from "@/lib/agenda/status";
import { cn } from "@/lib/utils";
import { ReminderIndicator } from "@/components/agenda/reminder-indicator";
import {
  describeReminder,
  reminderStatusLabels,
  type AppointmentReminder,
} from "@/lib/agenda/reminder-status";
import type { AgendaData } from "./agenda-board";

type Appointment = AgendaData["appointments"][number];
type Block = AgendaData["blocks"][number];

export type AgendaSlotSelection = {
  date: string;
  time: string;
  scheduleId?: string;
};

type Tone = "primary" | "success" | "warning" | "destructive" | "neutral";

/** Situações encerradas: o horário já foi resolvido. */
const finalStatuses = new Set(["attended", "no_show", "cancelled"]);

/** Cor do status na grade. O rótulo sempre aparece junto: a cor só reforça. */
export const appointmentStatusTone: Record<string, Tone> = {
  scheduled: "primary",
  confirmed: "success",
  waiting: "warning",
  in_progress: "primary",
  attended: "neutral",
  no_show: "destructive",
  cancelled: "destructive",
};

const rowAccentClass: Record<Tone, string> = {
  primary: "border-l-primary",
  success: "border-l-success",
  warning: "border-l-warning",
  destructive: "border-l-destructive",
  neutral: "border-l-border-strong",
};

export const appointmentCardToneClass: Record<Tone, string> = {
  primary: "border-primary-muted-hover border-l-primary bg-primary-muted",
  success: "border-success-muted border-l-success bg-success-muted",
  warning: "border-warning-muted border-l-warning bg-warning-muted",
  destructive:
    "border-destructive-muted border-l-destructive bg-destructive-muted",
  neutral: "border-border border-l-border-strong bg-muted",
};

// 30 minutos = 72px: um retorno de 20 minutos ainda mostra horário, status
// e nome sem cortar.
const stepMinutes = 30;
const rowHeight = 72;
const pxPerMinute = rowHeight / stepMinutes;
const gutterWidth = "4rem";
const columnMinWidth = "13rem";

type ScheduleColumn = {
  id: string;
  professionalId: string;
  professionalName: string;
  subtitle: string;
  /** Agenda sem nenhum expediente cadastrado: a grade inteira fica clicável,
      como antes, para clínicas que ainda não configuraram horários. */
  freeform: boolean;
  windows: DayWindow[];
  freeSlots: FreeSlot[];
  appointments: Appointment[];
  blocks: Array<Block & MinuteRange>;
};

type LaidOutItem =
  | ({ kind: "appointment"; appointment: Appointment } & Lane)
  | ({ kind: "block"; block: Block } & Lane)
  | ({ kind: "free"; slot: FreeSlot } & Lane);

type Lane = MinuteRange & { id: string; lane: number; laneCount: number };

function localDateKey(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(value));
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function currentMinute(timeZone: string) {
  const [, time = "00:00"] = new Date()
    .toLocaleString("sv-SE", { timeZone })
    .split(" ");
  const [hour = "0", minute = "0"] = time.split(":");
  return Number(hour) * 60 + Number(minute);
}

/** Minuto atual no fuso da clínica, atualizado a cada minuto. */
function useNowMinute(timeZone: string) {
  const [minute, setMinute] = useState(() => currentMinute(timeZone));
  useEffect(() => {
    const id = setInterval(() => setMinute(currentMinute(timeZone)), 60_000);
    return () => clearInterval(id);
  }, [timeZone]);
  return minute;
}

function assignLanes<
  T extends MinuteRange & { lane: number; laneCount: number },
>(items: T[]) {
  const sorted = [...items].sort(
    (a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute,
  );
  let group: T[] = [];
  let groupEnd = -1;
  const flush = () => {
    let active: Array<{ lane: number; end: number }> = [];
    let laneCount = 1;
    for (const item of group) {
      active = active.filter((candidate) => candidate.end > item.startMinute);
      const used = new Set(active.map((candidate) => candidate.lane));
      let lane = 0;
      while (used.has(lane)) lane += 1;
      item.lane = lane;
      laneCount = Math.max(laneCount, lane + 1);
      active.push({ lane, end: item.endMinute });
    }
    for (const item of group) item.laneCount = laneCount;
  };
  for (const item of sorted) {
    if (group.length && item.startMinute >= groupEnd) {
      flush();
      group = [];
    }
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMinute);
  }
  if (group.length) flush();
  return sorted;
}

function patientDisplayName(patient?: AgendaData["patients"][number]) {
  return patient?.social_name || patient?.full_name || "Paciente";
}

/**
 * Visão do dia por profissional: uma coluna por agenda, com o expediente
 * de cada um, o almoço e os bloqueios em cinza e os horários livres à vista
 * para agendar com um clique. No celular vira uma lista do dia.
 */
export function DayByProfessional({
  data,
  date,
  today,
  timeZone,
  schedules,
  appointments,
  showCancelled,
  patient,
  procedure,
  insurance,
  hasFilters,
  onSelectSlot,
  onSelectAppointment,
  groupBy = "professional",
}: {
  /** Colunas por profissional (padrão) ou por sala (Raio-X A2). */
  groupBy?: "professional" | "room";
  data: AgendaData;
  date: string;
  today: string;
  timeZone: string;
  /** Agendas que passam pelos filtros de profissional, unidade e
      especialidade. */
  schedules: AgendaData["schedules"];
  /** Agendamentos do dia já filtrados (status, procedimento, busca...). */
  appointments: Appointment[];
  showCancelled: boolean;
  patient: Map<string, AgendaData["patients"][number]>;
  procedure: Map<string, AgendaData["procedures"][number]>;
  insurance: Map<string, { id: string; name: string }>;
  hasFilters: boolean;
  onSelectSlot?: (slot: AgendaSlotSelection) => void;
  onSelectAppointment: (appointmentId: string) => void;
}) {
  const nowMinute = useNowMinute(timeZone);
  const isToday = date === today;
  const notBefore = notBeforeMinuteFor(date, today, nowMinute);

  const { columns, range } = useMemo(() => {
    const weekday = weekdayOfDateKey(date);
    const professionalById = new Map(
      data.professionals.map((item) => [item.id, item]),
    );
    const specialtyById = new Map(
      data.specialties.map((item) => [item.id, item.name]),
    );
    const unitById = new Map(data.units.map((item) => [item.id, item.name]));
    const showUnit = data.units.length > 1;

    const visibleAppointments = appointments.filter(
      (item) =>
        localDateKey(item.start_at, timeZone) === date &&
        (showCancelled || item.status !== "cancelled"),
    );
    // O que ocupa horário vem de todos os agendamentos do dia, não só dos
    // filtrados: filtrar por "Confirmado" não pode fazer um horário com
    // paciente "Agendado" parecer livre.
    const occupying = data.appointments.filter(
      (item) =>
        appointmentOccupiesTime(item.status) &&
        localDateKey(item.start_at, timeZone) === date,
    );
    // Bloqueio é fato da agenda, não um item filtrável: aparece sempre nas
    // colunas visíveis, inclusive o de vários dias que começou antes.
    const dayBlocks = data.blocks.flatMap((item) => {
      const minutes = localMinuteRangeOnDate(
        item.start_at,
        item.end_at,
        date,
        timeZone,
      );
      return minutes ? [{ ...item, ...minutes }] : [];
    });
    const schedulesWithAvailability = new Set(
      data.availability.map((item) => item.schedule_id),
    );

    const byId = new Map<string, ScheduleColumn>();
    function columnFor(
      scheduleId: string,
      professionalId: string,
      unitId: string | null,
    ) {
      const existing = byId.get(scheduleId);
      if (existing) return existing;
      const professional = professionalById.get(professionalId);
      const specialty = professional?.specialty_id
        ? specialtyById.get(professional.specialty_id)
        : undefined;
      const unit = unitId && showUnit ? unitById.get(unitId) : undefined;
      const column: ScheduleColumn = {
        id: scheduleId,
        professionalId,
        professionalName: professional?.name ?? "Profissional",
        subtitle: [specialty, unit].filter(Boolean).join(" · "),
        freeform: !schedulesWithAvailability.has(scheduleId),
        windows: windowsForSchedule(data.availability, scheduleId, weekday),
        freeSlots: [],
        appointments: [],
        blocks: [],
      };
      byId.set(scheduleId, column);
      return column;
    }

    for (const schedule of schedules) {
      const windows = windowsForSchedule(
        data.availability,
        schedule.id,
        weekday,
      );
      const freeform = !schedulesWithAvailability.has(schedule.id);
      if (windows.length || freeform) {
        columnFor(schedule.id, schedule.professional_id, schedule.unit_id);
      }
    }
    for (const item of visibleAppointments) {
      const schedule = data.schedules.find(
        (candidate) => candidate.id === item.schedule_id,
      );
      columnFor(
        item.schedule_id,
        item.professional_id,
        schedule?.unit_id ?? item.unit_id,
      ).appointments.push(item);
    }
    for (const item of dayBlocks) {
      const column = byId.get(item.schedule_id);
      if (column) column.blocks.push(item);
    }

    const columns = [...byId.values()].sort(
      (a, b) =>
        a.professionalName.localeCompare(b.professionalName, "pt-BR") ||
        a.subtitle.localeCompare(b.subtitle, "pt-BR"),
    );

    for (const column of columns) {
      const busy: MinuteRange[] = [
        ...occupying
          .filter((item) => item.professional_id === column.professionalId)
          .flatMap((item) => {
            const minutes = localMinuteRangeOnDate(
              item.start_at,
              item.end_at,
              date,
              timeZone,
            );
            return minutes ? [minutes] : [];
          }),
        ...dayBlocks.filter((item) => item.schedule_id === column.id),
      ];
      column.freeSlots = listFreeSlots({
        windows: column.windows,
        busy,
        notBeforeMinute: notBefore,
      });
    }

    const range = dayTimelineRange({
      windows: columns.flatMap((column) => column.windows),
      items: visibleAppointments.flatMap((item) => {
        const minutes = localMinuteRangeOnDate(
          item.start_at,
          item.end_at,
          date,
          timeZone,
        );
        return minutes ? [minutes] : [];
      }),
      step: stepMinutes,
    });

    if (groupBy === "room") {
      // Por sala: quem ocupa cada consultório no dia. Sala não tem expediente
      // próprio, então não há horário livre aqui — a marcação continua na
      // visão por profissional.
      const unitIds = new Set(schedules.map((item) => item.unit_id));
      const rooms = data.rooms
        .filter((room) => !unitIds.size || unitIds.has(room.unit_id))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      const roomColumns: ScheduleColumn[] = rooms.map((room) => ({
        id: room.id,
        professionalId: "",
        professionalName: room.name,
        subtitle: showUnit ? (unitById.get(room.unit_id) ?? "") : "",
        freeform: true,
        windows: [],
        freeSlots: [],
        appointments: visibleAppointments.filter(
          (item) => item.room_id === room.id,
        ),
        blocks: [],
      }));
      const withoutRoom = visibleAppointments.filter(
        (item) =>
          !item.room_id || !rooms.some((room) => room.id === item.room_id),
      );
      if (withoutRoom.length) {
        roomColumns.push({
          id: "sem-sala",
          professionalId: "",
          professionalName: "Sem sala definida",
          subtitle: "",
          freeform: true,
          windows: [],
          freeSlots: [],
          appointments: withoutRoom,
          blocks: [],
        });
      }
      return { columns: roomColumns, range };
    }

    return { columns, range };
  }, [
    groupBy,
    data.rooms,
    appointments,
    data.appointments,
    data.availability,
    data.blocks,
    data.professionals,
    data.schedules,
    data.specialties,
    data.units,
    date,
    notBefore,
    schedules,
    showCancelled,
    timeZone,
  ]);

  if (!columns.length) {
    return (
      <EmptyState
        icon={CalendarX}
        title={
          hasFilters
            ? "Nenhuma agenda com estes filtros neste dia"
            : "Nenhum profissional atende neste dia"
        }
        description={
          hasFilters
            ? "Ajuste ou limpe os filtros para ver as demais agendas."
            : "O expediente de cada profissional é configurado em Configurações › Agendas."
        }
        className="py-16"
      />
    );
  }

  const sharedProps = {
    columns,
    range,
    date,
    today,
    timeZone,
    isToday,
    nowMinute,
    patient,
    procedure,
    insurance,
    reminders: data.reminders ?? {},
    onSelectSlot: groupBy === "room" ? undefined : onSelectSlot,
    onSelectAppointment,
  };

  return (
    <>
      <div className="hidden md:block">
        <DayColumnsGrid {...sharedProps} />
      </div>
      <div className="md:hidden">
        <DayAgendaList {...sharedProps} />
      </div>
    </>
  );
}

type ViewProps = {
  columns: ScheduleColumn[];
  range: MinuteRange;
  date: string;
  today: string;
  timeZone: string;
  isToday: boolean;
  nowMinute: number;
  patient: Map<string, AgendaData["patients"][number]>;
  procedure: Map<string, AgendaData["procedures"][number]>;
  insurance: Map<string, { id: string; name: string }>;
  reminders: Record<string, AppointmentReminder>;
  onSelectSlot?: (slot: AgendaSlotSelection) => void;
  onSelectAppointment: (appointmentId: string) => void;
};

function DayColumnsGrid({
  columns,
  range,
  date,
  today,
  timeZone,
  isToday,
  nowMinute,
  patient,
  procedure,
  insurance,
  reminders,
  onSelectSlot,
  onSelectAppointment,
}: ViewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const totalHeight = (range.endMinute - range.startMinute) * pxPerMinute;
  const gridTemplateColumns = `${gutterWidth} repeat(${columns.length}, minmax(${columnMinWidth}, 1fr))`;
  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (
      let minute = range.startMinute;
      minute < range.endMinute;
      minute += stepMinutes
    ) {
      marks.push(minute);
    }
    return marks;
  }, [range.endMinute, range.startMinute]);
  const showNow =
    isToday && nowMinute >= range.startMinute && nowMinute <= range.endMinute;

  // Abre já na hora que interessa: "agora" em hoje, senão o primeiro
  // atendimento do dia. Só ao trocar de dia, para não pular durante o uso.
  const firstAppointmentMinute = useMemo(() => {
    const starts = columns.flatMap((column) =>
      column.appointments.map(
        (item) =>
          localMinuteRangeOnDate(item.start_at, item.end_at, date, timeZone)
            ?.startMinute ?? range.endMinute,
      ),
    );
    return starts.length ? Math.min(...starts) : range.startMinute;
  }, [columns, date, range.endMinute, range.startMinute, timeZone]);
  const scrollTarget = showNow ? nowMinute : firstAppointmentMinute;
  const scrollTargetRef = useRef(scrollTarget);
  useEffect(() => {
    scrollTargetRef.current = scrollTarget;
  });
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const top =
      (scrollTargetRef.current - range.startMinute) * pxPerMinute - rowHeight;
    scroller.scrollTop = Math.max(0, top);
  }, [date, range.startMinute]);

  return (
    <div
      ref={scrollerRef}
      role="region"
      aria-label="Agenda do dia por profissional"
      tabIndex={0}
      className="relative max-h-[max(32rem,calc(100svh-var(--app-sticky-offset,0rem)-12rem))] overflow-auto overscroll-contain rounded-b-lg focus-visible:outline-2 focus-visible:-outline-offset-2"
    >
      <div
        style={{
          minWidth: `calc(${gutterWidth} + ${columns.length} * ${columnMinWidth})`,
        }}
      >
        <div
          className="sticky top-0 z-30 grid border-b border-border bg-card"
          style={{ gridTemplateColumns }}
        >
          <div className="sticky left-0 z-10 border-r border-border bg-card" />
          {columns.map((column) => (
            <ColumnHeader key={column.id} column={column} past={date < today} />
          ))}
        </div>

        <div
          className="relative grid"
          style={{ gridTemplateColumns, height: totalHeight }}
        >
          <div className="sticky left-0 z-20 border-r border-border bg-card">
            {hourMarks.map((minute) => (
              <span
                key={minute}
                className={cn(
                  "absolute right-2 -translate-y-1/2 bg-card px-0.5 text-caption tabular-nums",
                  minute % 60 === 0
                    ? "font-medium text-secondary-foreground"
                    : "text-muted-foreground",
                  minute === range.startMinute && "translate-y-0.5",
                )}
                style={{ top: (minute - range.startMinute) * pxPerMinute }}
              >
                {minutesToTime(minute)}
              </span>
            ))}
            {showNow ? (
              <span
                aria-hidden="true"
                className="absolute right-1 z-10 -translate-y-1/2 rounded-md bg-destructive px-1.5 py-0.5 text-caption font-semibold tabular-nums text-primary-foreground"
                style={{ top: (nowMinute - range.startMinute) * pxPerMinute }}
              >
                {minutesToTime(nowMinute)}
              </span>
            ) : null}
          </div>

          {columns.map((column) => (
            <ColumnBody
              key={column.id}
              column={column}
              range={range}
              hourMarks={hourMarks}
              date={date}
              timeZone={timeZone}
              patient={patient}
              procedure={procedure}
              insurance={insurance}
              reminders={reminders}
              onSelectSlot={onSelectSlot}
              onSelectAppointment={onSelectAppointment}
            />
          ))}

          {showNow ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 z-[5]"
              style={{ top: (nowMinute - range.startMinute) * pxPerMinute }}
            >
              <div
                className="relative border-t-2 border-destructive"
                style={{ marginLeft: gutterWidth }}
              >
                <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-destructive" />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ColumnHeader({
  column,
  past,
}: {
  column: ScheduleColumn;
  past: boolean;
}) {
  const count = column.appointments.filter(
    (item) => item.status !== "cancelled",
  ).length;
  const free = column.freeSlots.length;

  return (
    <div className="@container flex min-w-0 items-center gap-2.5 border-r border-border px-3 py-2.5 last:border-r-0">
      {/* Em coluna estreita o nome completo vale mais que o avatar. */}
      <Avatar
        name={column.professionalName.replace(/^dr(a)?\.?\s+/i, "")}
        size="sm"
        className="hidden @[15rem]:flex"
      />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-label font-semibold text-foreground"
          title={column.professionalName}
        >
          {column.professionalName}
        </p>
        <div className="flex min-w-0 items-center gap-1.5">
          <p
            className="min-w-0 flex-1 truncate text-caption text-muted-foreground"
            title={column.subtitle}
          >
            {column.subtitle ||
              `${count} ${count === 1 ? "paciente" : "pacientes"}`}
          </p>
          {!column.freeform && !past ? (
            <Badge
              variant={free > 0 ? "success" : "neutral"}
              className="h-5 shrink-0 px-1.5"
              title={
                free > 0
                  ? `${free} ${free === 1 ? "horário livre" : "horários livres"}`
                  : "Sem horário livre"
              }
            >
              {free > 0
                ? `${free} ${free === 1 ? "livre" : "livres"}`
                : "Lotado"}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const hatchStyle = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 8px)",
};

function ColumnBody({
  column,
  range,
  hourMarks,
  date,
  timeZone,
  patient,
  procedure,
  insurance,
  reminders,
  onSelectSlot,
  onSelectAppointment,
}: {
  column: ScheduleColumn;
  range: MinuteRange;
  hourMarks: number[];
  date: string;
  timeZone: string;
  patient: ViewProps["patient"];
  procedure: ViewProps["procedure"];
  insurance: ViewProps["insurance"];
  reminders: ViewProps["reminders"];
  onSelectSlot?: ViewProps["onSelectSlot"];
  onSelectAppointment: ViewProps["onSelectAppointment"];
}) {
  const closed = column.freeform ? [] : closedRanges(column.windows, range);
  const items = useMemo(() => {
    const raw: LaidOutItem[] = [
      ...column.appointments.flatMap((appointment) => {
        const minutes = localMinuteRangeOnDate(
          appointment.start_at,
          appointment.end_at,
          date,
          timeZone,
        );
        if (!minutes) return [];
        return [
          {
            kind: "appointment" as const,
            appointment,
            id: appointment.id,
            // Encaixe muito curto ainda precisa caber nome e horário.
            startMinute: minutes.startMinute,
            endMinute: Math.max(minutes.endMinute, minutes.startMinute + 15),
            lane: 0,
            laneCount: 1,
          },
        ];
      }),
      ...column.blocks.map((block) => ({
        kind: "block" as const,
        block,
        id: block.id,
        startMinute: Math.max(block.startMinute, range.startMinute),
        endMinute: Math.min(block.endMinute, range.endMinute),
        lane: 0,
        laneCount: 1,
      })),
      ...(onSelectSlot
        ? column.freeSlots.map((slot) => ({
            kind: "free" as const,
            slot,
            id: `free-${slot.startMinute}`,
            startMinute: slot.startMinute,
            endMinute: slot.endMinute,
            lane: 0,
            laneCount: 1,
          }))
        : []),
    ].filter((item) => item.endMinute > item.startMinute);
    return assignLanes(raw);
  }, [
    column.appointments,
    column.blocks,
    column.freeSlots,
    date,
    onSelectSlot,
    range.endMinute,
    range.startMinute,
    timeZone,
  ]);

  return (
    <div className="relative border-r border-border bg-card last:border-r-0">
      {closed.map((item) => (
        <div
          key={`closed-${item.startMinute}`}
          aria-hidden="true"
          className="absolute inset-x-0 bg-surface-sunken"
          style={{
            ...hatchStyle,
            top: (item.startMinute - range.startMinute) * pxPerMinute,
            height: (item.endMinute - item.startMinute) * pxPerMinute,
          }}
        />
      ))}
      {hourMarks.map((minute) => (
        <div
          key={minute}
          aria-hidden="true"
          className={cn(
            "absolute inset-x-0 border-t",
            minute % 60 === 0
              ? "border-border"
              : "border-dashed border-border/70",
          )}
          style={{ top: (minute - range.startMinute) * pxPerMinute }}
        />
      ))}

      {column.freeform && onSelectSlot
        ? hourMarks.map((minute) => (
            <Button
              key={`any-${minute}`}
              type="button"
              variant="ghost"
              aria-label={`Agendar com ${column.professionalName} às ${minutesToTime(minute)}`}
              onClick={() =>
                onSelectSlot({
                  date,
                  time: minutesToTime(minute),
                  scheduleId: column.id,
                })
              }
              className="group absolute inset-x-1 h-auto rounded-md border border-dashed border-transparent px-2 py-0 text-caption font-normal text-primary hover:border-primary/60 hover:bg-primary-muted/70 focus-visible:border-primary focus-visible:bg-primary-muted active:translate-y-0"
              style={{
                top: (minute - range.startMinute) * pxPerMinute + 2,
                height: rowHeight - 4,
              }}
            >
              <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
                <Plus className="size-3.5" aria-hidden="true" />
                Agendar
              </span>
            </Button>
          ))
        : null}

      {items.map((item) => {
        const top = (item.startMinute - range.startMinute) * pxPerMinute;
        const height = Math.max(
          22,
          (item.endMinute - item.startMinute) * pxPerMinute - 2,
        );
        const width = `calc(${100 / item.laneCount}% - 6px)`;
        const left = `calc(${(100 / item.laneCount) * item.lane}% + 3px)`;
        const style = { top: top + 1, height, width, left };

        if (item.kind === "free") {
          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              aria-label={`Agendar com ${column.professionalName} às ${item.slot.time}`}
              onClick={() =>
                onSelectSlot?.({
                  date,
                  time: item.slot.time,
                  scheduleId: column.id,
                })
              }
              className="group absolute h-auto items-start justify-start gap-1.5 rounded-md border border-dashed border-border-strong/70 bg-card/70 px-2 py-1 text-caption font-normal text-muted-foreground hover:border-primary hover:bg-primary-muted hover:text-primary focus-visible:border-primary focus-visible:bg-primary-muted active:translate-y-0"
              style={style}
            >
              <span className="tabular-nums">{item.slot.time}</span>
              <span className="group-hover:hidden group-focus-visible:hidden">
                Livre
              </span>
              <span className="hidden items-center gap-1 font-medium group-hover:flex group-focus-visible:flex">
                <Plus className="size-3.5" aria-hidden="true" />
                Agendar
              </span>
            </Button>
          );
        }

        if (item.kind === "block") {
          return (
            <div
              key={item.id}
              className="absolute z-10 overflow-hidden rounded-md border border-dashed border-border-strong bg-muted px-2 py-1 text-caption text-secondary-foreground"
              style={{ ...style, ...hatchStyle }}
              title={`Bloqueado ${formatTime(item.block.start_at, timeZone)}–${formatTime(item.block.end_at, timeZone)}`}
            >
              <p className="flex min-w-0 items-center gap-1 font-semibold">
                <Ban className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {item.block.reason || "Horário bloqueado"}
                </span>
              </p>
              {height >= 40 ? (
                <p className="truncate tabular-nums">
                  {formatTime(item.block.start_at, timeZone)}–
                  {formatTime(item.block.end_at, timeZone)}
                </p>
              ) : null}
            </div>
          );
        }

        return (
          <AppointmentBlock
            key={item.id}
            appointment={item.appointment}
            style={style}
            height={height}
            timeZone={timeZone}
            patientName={patientDisplayName(
              patient.get(item.appointment.patient_id),
            )}
            procedureName={procedure.get(item.appointment.procedure_id)?.name}
            insuranceName={
              item.appointment.health_insurance_id
                ? insurance.get(item.appointment.health_insurance_id)?.name
                : undefined
            }
            professionalName={column.professionalName}
            reminder={reminders[item.appointment.id]}
            onSelect={() => onSelectAppointment(item.appointment.id)}
          />
        );
      })}
    </div>
  );
}

function AppointmentBlock({
  appointment,
  style,
  height,
  timeZone,
  patientName,
  procedureName,
  insuranceName,
  professionalName,
  reminder,
  onSelect,
}: {
  appointment: Appointment;
  style: React.CSSProperties;
  height: number;
  timeZone: string;
  patientName: string;
  procedureName?: string;
  insuranceName?: string;
  professionalName: string;
  reminder?: AppointmentReminder;
  onSelect: () => void;
}) {
  const tone = appointmentStatusTone[appointment.status] ?? "primary";
  const label = statusLabel[appointment.status] ?? appointment.status;
  const start = formatTime(appointment.start_at, timeZone);
  const end = formatTime(appointment.end_at, timeZone);
  const finished =
    appointment.status === "attended" ||
    appointment.status === "cancelled" ||
    appointment.status === "no_show";
  const detail = [
    procedureName ?? "Procedimento",
    insuranceName ?? "Particular",
  ]
    .filter(Boolean)
    .join(" · ");
  // Lembrete só interessa enquanto o paciente não confirmou.
  const visibleReminder =
    reminder && appointment.status === "scheduled" ? reminder : undefined;
  const summary = [
    `${start}–${end}`,
    patientName,
    label,
    detail,
    professionalName,
    visibleReminder ? describeReminder(visibleReminder, timeZone) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={summary}
      title={summary}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "@container absolute z-10 cursor-pointer overflow-hidden rounded-md border border-l-[3px] px-2 py-1 text-left transition-shadow duration-[var(--motion-fast)] hover:z-20 hover:shadow-[var(--shadow-hover)] focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        appointmentCardToneClass[tone],
        finished && "opacity-70 hover:opacity-100",
      )}
      style={style}
    >
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="truncate text-caption tabular-nums text-secondary-foreground">
          {start}
          <span className="hidden @[14rem]:inline">–{end}</span>
          {appointment.is_extra ? " · encaixe" : ""}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {visibleReminder ? (
            <ReminderIndicator reminder={visibleReminder} timeZone={timeZone} />
          ) : null}
          {height >= 40 ? (
            <Badge variant={tone} className="h-5 shrink-0 px-1.5">
              {label}
            </Badge>
          ) : null}
        </span>
      </div>
      <p
        className={cn(
          "truncate text-label font-semibold leading-tight text-foreground",
          appointment.status === "cancelled" && "line-through",
        )}
      >
        {patientName}
      </p>
      {height >= 62 ? (
        <p className="mt-0.5 truncate text-caption text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

/** Lista do dia para o celular: um profissional por vez (ou todos), em
    ordem de horário, com os horários livres no meio para agendar. */
function DayAgendaList({
  columns,
  date,
  timeZone,
  isToday,
  nowMinute,
  patient,
  procedure,
  insurance,
  reminders,
  onSelectSlot,
  onSelectAppointment,
}: ViewProps) {
  const [selected, setSelected] = useState<string>("all");
  const visibleColumns =
    selected === "all"
      ? columns
      : columns.filter((column) => column.id === selected);
  const showFree = selected !== "all" && Boolean(onSelectSlot);

  type Row =
    | {
        kind: "appointment";
        minute: number;
        appointment: Appointment;
        column: ScheduleColumn;
      }
    | {
        kind: "block";
        minute: number;
        block: ScheduleColumn["blocks"][number];
        column: ScheduleColumn;
      }
    | { kind: "free"; minute: number; slot: FreeSlot; column: ScheduleColumn };

  const rows: Row[] = visibleColumns
    .flatMap((column): Row[] => [
      ...column.appointments.map((appointment) => ({
        kind: "appointment" as const,
        minute:
          localMinuteRangeOnDate(
            appointment.start_at,
            appointment.end_at,
            date,
            timeZone,
          )?.startMinute ?? 0,
        appointment,
        column,
      })),
      ...column.blocks.map((block) => ({
        kind: "block" as const,
        minute: block.startMinute,
        block,
        column,
      })),
      ...(showFree
        ? column.freeSlots.map((slot) => ({
            kind: "free" as const,
            minute: slot.startMinute,
            slot,
            column,
          }))
        : []),
    ])
    .sort((a, b) => a.minute - b.minute);
  // Hoje a lista começa no que importa agora: atendidos, faltas e
  // bloqueios que já passaram ficam recolhidos num clique. Quem está
  // aguardando ou em atendimento continua à vista, mesmo tendo começado antes.
  const [showEarlier, setShowEarlier] = useState(false);
  const isDoneBeforeNow = (row: Row) =>
    isToday &&
    row.minute < nowMinute &&
    (row.kind === "block"
      ? row.block.endMinute <= nowMinute
      : row.kind === "appointment"
        ? finalStatuses.has(row.appointment.status)
        : false);
  const doneCount = rows.filter(isDoneBeforeNow).length;
  const hiddenEarlier = !showEarlier && doneCount > 2 ? doneCount : 0;
  const visibleRows = hiddenEarlier
    ? rows.filter((row) => !isDoneBeforeNow(row))
    : rows;
  const nowIndex = isToday
    ? (() => {
        const index = visibleRows.findIndex((row) => row.minute >= nowMinute);
        return index === -1 ? visibleRows.length : index;
      })()
    : -1;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-3">
      <div
        role="radiogroup"
        aria-label="Profissional"
        className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1"
      >
        {[
          { id: "all", label: "Todos" },
          ...columns.map((column) => ({
            id: column.id,
            label: column.professionalName,
          })),
        ].map((option) => (
          <Button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected === option.id}
            variant={selected === option.id ? "primary" : "secondary"}
            onClick={() => setSelected(option.id)}
            className="max-w-[14rem] shrink-0 rounded-full"
          >
            <span className="truncate">{option.label}</span>
          </Button>
        ))}
      </div>

      {selected === "all" && onSelectSlot ? (
        <p className="text-caption text-muted-foreground">
          Escolha um profissional para ver os horários livres.
        </p>
      ) : null}

      {hiddenEarlier ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowEarlier(true)}
          className="justify-self-start"
        >
          Mostrar {hiddenEarlier}{" "}
          {hiddenEarlier === 1 ? "horário encerrado" : "horários encerrados"}
        </Button>
      ) : null}

      {visibleRows.length ? (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {visibleRows.map((row, offset) => (
            <li
              key={`${row.kind}-${row.column.id}-${row.kind === "appointment" ? row.appointment.id : row.kind === "block" ? row.block.id : row.slot.time}`}
            >
              {offset === nowIndex ? (
                <div
                  aria-hidden="true"
                  className="mb-2 flex items-center gap-2 text-caption font-semibold text-destructive"
                >
                  <span className="tabular-nums">
                    Agora · {minutesToTime(nowMinute)}
                  </span>
                  <span className="h-0.5 flex-1 rounded-full bg-destructive" />
                </div>
              ) : null}
              {row.kind === "appointment" ? (
                <ListAppointmentRow
                  appointment={row.appointment}
                  timeZone={timeZone}
                  patientName={patientDisplayName(
                    patient.get(row.appointment.patient_id),
                  )}
                  detail={[
                    procedure.get(row.appointment.procedure_id)?.name ??
                      "Procedimento",
                    row.appointment.health_insurance_id
                      ? insurance.get(row.appointment.health_insurance_id)?.name
                      : "Particular",
                    selected === "all" ? row.column.professionalName : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  reminder={reminders[row.appointment.id]}
                  onSelect={() => onSelectAppointment(row.appointment.id)}
                />
              ) : row.kind === "block" ? (
                <div
                  className="flex items-center gap-3 rounded-lg border border-dashed border-border-strong bg-muted px-3 py-2.5 text-body-sm text-secondary-foreground"
                  style={hatchStyle}
                >
                  <span className="w-12 shrink-0 tabular-nums font-medium">
                    {minutesToTime(row.block.startMinute)}
                  </span>
                  <Ban className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">
                    {row.block.reason || "Horário bloqueado"}
                    {selected === "all"
                      ? ` · ${row.column.professionalName}`
                      : ""}
                  </span>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    onSelectSlot?.({
                      date,
                      time: row.slot.time,
                      scheduleId: row.column.id,
                    })
                  }
                  className="h-auto w-full justify-start gap-3 rounded-lg border border-dashed border-border-strong px-3 py-2.5 text-body-sm font-normal text-muted-foreground hover:border-primary hover:bg-primary-muted hover:text-primary"
                >
                  <span className="w-12 shrink-0 text-left tabular-nums font-medium text-secondary-foreground">
                    {row.slot.time}
                  </span>
                  <span className="flex-1 text-left">Horário livre</span>
                  <span className="flex items-center gap-1 font-medium text-primary">
                    <Plus className="size-4" aria-hidden="true" />
                    Agendar
                  </span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-body-sm text-muted-foreground">
          {showFree
            ? "Sem agendamentos nem horários livres neste dia."
            : "Nenhum agendamento neste dia."}
        </p>
      )}
    </div>
  );
}

function ListAppointmentRow({
  appointment,
  timeZone,
  patientName,
  detail,
  reminder,
  onSelect,
}: {
  appointment: Appointment;
  timeZone: string;
  patientName: string;
  detail: string;
  reminder?: AppointmentReminder;
  onSelect: () => void;
}) {
  const visibleReminder =
    reminder && appointment.status === "scheduled" ? reminder : undefined;
  const tone = appointmentStatusTone[appointment.status] ?? "primary";
  const label = statusLabel[appointment.status] ?? appointment.status;
  const finished =
    appointment.status === "attended" ||
    appointment.status === "cancelled" ||
    appointment.status === "no_show";

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={onSelect}
      className={cn(
        "h-auto w-full items-start justify-start gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-left font-normal",
        rowAccentClass[tone],
        finished && "opacity-70",
      )}
    >
      <span className="w-12 shrink-0 pt-0.5 text-body-sm font-medium tabular-nums text-secondary-foreground">
        {formatTime(appointment.start_at, timeZone)}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span
          className={cn(
            "truncate text-body-sm font-semibold text-foreground",
            appointment.status === "cancelled" && "line-through",
          )}
        >
          {patientName}
        </span>
        <span className="truncate text-caption text-muted-foreground">
          {detail}
        </span>
        {visibleReminder ? (
          <span className="flex items-center gap-1 text-caption text-muted-foreground">
            <ReminderIndicator reminder={visibleReminder} timeZone={timeZone} />
            {reminderStatusLabels[visibleReminder.status]}
          </span>
        ) : null}
      </span>
      <Badge variant={tone} className="shrink-0">
        {label}
      </Badge>
    </Button>
  );
}
