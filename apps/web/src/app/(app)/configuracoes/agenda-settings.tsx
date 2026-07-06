"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { Ban, CalendarClock, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createSchedule,
  createScheduleAvailability,
  createScheduleBlock,
  type AgendaActionState,
} from "../agenda/actions";
import { defaultScheduleColor } from "@/lib/colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";

type Option = { id: string; name: string };

export type AgendaSettingsData = {
  schedules: Array<{
    id: string;
    professional_id: string;
    unit_id: string;
    name: string;
    color: string;
    active: boolean;
  }>;
  professionals: Option[];
  units: Option[];
};

const initialState: AgendaActionState = {};
const weekdayOptions = [
  { id: "1", name: "Segunda-feira" },
  { id: "2", name: "Terça-feira" },
  { id: "3", name: "Quarta-feira" },
  { id: "4", name: "Quinta-feira" },
  { id: "5", name: "Sexta-feira" },
  { id: "6", name: "Sábado" },
  { id: "0", name: "Domingo" },
];
export function AgendaSettings({
  data,
  canConfigure,
  canBlock,
}: {
  data: AgendaSettingsData;
  canConfigure: boolean;
  canBlock: boolean;
}) {
  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col justify-between gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-semibold">Agenda operacional</h2>
            <p className="text-sm text-muted-foreground">
              Configure agendas, disponibilidade e bloqueios fora da tela de
              atendimento.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canConfigure ? <ScheduleForm data={data} /> : null}
            {canConfigure ? <AvailabilityForm data={data} /> : null}
            {canBlock ? <BlockForm data={data} /> : null}
          </div>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          <div className="rounded-md border border-border bg-background p-4">
            <Badge variant="neutral">{data.schedules.length}</Badge>
            <p className="mt-4 text-sm text-muted-foreground">Agendas ativas</p>
            <p className="text-lg font-semibold">Profissionais e unidades</p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <Badge variant="neutral">{data.professionals.length}</Badge>
            <p className="mt-4 text-sm text-muted-foreground">
              Profissionais ativos
            </p>
            <p className="text-lg font-semibold">Disponíveis para agenda</p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <Badge variant="neutral">{data.units.length}</Badge>
            <p className="mt-4 text-sm text-muted-foreground">
              Unidades ativas
            </p>
            <p className="text-lg font-semibold">Locais de atendimento</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function ScheduleForm({ data }: { data: AgendaSettingsData }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createSchedule, initialState);
  useToastState(state);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Settings2 className="size-4" />
        Nova agenda
      </Button>
    );
  }

  return (
    <ModalShell onClose={() => setOpen(false)}>
      <Card className="w-full max-w-lg shadow-[var(--shadow-lg)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="font-semibold">Criar agenda profissional</h2>
          <CloseButton onClose={() => setOpen(false)} />
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4">
            <OptionSelect
              name="professional_id"
              label="Profissional"
              options={data.professionals}
            />
            <OptionSelect name="unit_id" label="Unidade" options={data.units} />
            <label className="grid gap-2 text-sm font-medium">
              Nome
              <Input name="name" required placeholder="Agenda principal" />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Cor
              <input
                name="color"
                type="color"
                defaultValue={defaultScheduleColor}
                className="h-10 w-20 rounded border border-border"
              />
            </label>
            <FormError error={state.error} />
            <FormActions
              pending={pending}
              pendingLabel="Criando..."
              submitLabel="Criar agenda"
              onCancel={() => setOpen(false)}
            />
          </form>
        </CardContent>
      </Card>
    </ModalShell>
  );
}

function AvailabilityForm({ data }: { data: AgendaSettingsData }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createScheduleAvailability,
    initialState,
  );
  useToastState(state);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <CalendarClock className="size-4" />
        Disponibilidade
      </Button>
    );
  }

  return (
    <ModalShell onClose={() => setOpen(false)}>
      <Card className="w-full max-w-xl shadow-[var(--shadow-lg)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="font-semibold">Disponibilidade da agenda</h2>
            <p className="text-sm text-muted-foreground">
              Defina os períodos aceitos para agendamentos comuns.
            </p>
          </div>
          <CloseButton onClose={() => setOpen(false)} />
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <OptionSelect
                name="schedule_id"
                label="Agenda"
                options={data.schedules}
              />
            </div>
            <OptionSelect
              name="weekday"
              label="Dia da semana"
              options={weekdayOptions}
            />
            <label className="grid gap-2 text-sm font-medium">
              Duração do slot
              <Input
                name="slot_minutes"
                type="number"
                min="5"
                max="480"
                defaultValue="30"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Início
              <Input
                name="start_time"
                type="time"
                defaultValue="08:00"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Fim
              <Input
                name="end_time"
                type="time"
                defaultValue="18:00"
                required
              />
            </label>
            <FormError error={state.error} className="md:col-span-2" />
            <FormActions
              pending={pending}
              pendingLabel="Salvando..."
              submitLabel="Adicionar período"
              onCancel={() => setOpen(false)}
              disabled={!data.schedules.length}
              className="md:col-span-2"
            />
          </form>
        </CardContent>
      </Card>
    </ModalShell>
  );
}

function BlockForm({ data }: { data: AgendaSettingsData }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createScheduleBlock,
    initialState,
  );
  useToastState(state);

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Ban className="size-4" />
        Bloquear
      </Button>
    );
  }

  return (
    <ModalShell onClose={() => setOpen(false)}>
      <Card className="w-full max-w-xl shadow-[var(--shadow-lg)]">
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="font-semibold">Bloquear horário</h2>
          <CloseButton onClose={() => setOpen(false)} />
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <OptionSelect
                name="schedule_id"
                label="Agenda"
                options={data.schedules}
              />
            </div>
            <DateTimeField name="start_at" label="Início" required />
            <DateTimeField name="end_at" label="Fim" required />
            <label className="grid gap-2 text-sm font-medium md:col-span-2">
              Motivo
              <Input
                name="reason"
                placeholder="Ex.: reunião, férias ou almoço"
              />
            </label>
            <FormError error={state.error} className="md:col-span-2" />
            <FormActions
              pending={pending}
              pendingLabel="Salvando..."
              submitLabel="Bloquear horário"
              onCancel={() => setOpen(false)}
              disabled={!data.schedules.length}
              className="md:col-span-2"
            />
          </form>
        </CardContent>
      </Card>
    </ModalShell>
  );
}

function ModalShell({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/20 p-4"
      data-select-portal-root
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClose}>
      <X className="size-4" />
    </Button>
  );
}

function FormError({
  error,
  className,
}: {
  error?: string;
  className?: string;
}) {
  if (!error) return null;
  return (
    <p className={`text-sm text-destructive ${className ?? ""}`}>{error}</p>
  );
}

function FormActions({
  pending,
  pendingLabel,
  submitLabel,
  onCancel,
  disabled,
  className,
}: {
  pending: boolean;
  pendingLabel: string;
  submitLabel: string;
  onCancel: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex justify-end gap-2 ${className ?? ""}`}>
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pending || disabled}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}

function DateTimeField({
  name,
  label,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const parsed = splitDateTimeValue(defaultValue);
  const [date, setDate] = useState(parsed.date);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const normalizedHour = normalizeTimePart(hour, 23);
  const normalizedMinute = normalizeTimePart(minute, 59);
  const value = date ? `${date}T${normalizedHour}:${normalizedMinute}` : "";

  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input type="hidden" name={name} value={value} />
      <div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_5.5rem_5.5rem]">
        <Input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          required={required}
          className="w-full"
        />
        <TimeInput
          value={hour}
          onChange={setHour}
          onBlur={() => setHour(normalizedHour)}
          max={23}
          ariaLabel={`${label}: hora`}
        />
        <TimeInput
          value={minute}
          onChange={setMinute}
          onBlur={() => setMinute(normalizedMinute)}
          max={59}
          ariaLabel={`${label}: minuto`}
        />
      </div>
    </label>
  );
}

function TimeInput({
  value,
  onChange,
  onBlur,
  max,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  max: number;
  ariaLabel: string;
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(event) =>
        onChange(event.target.value.replace(/\D/g, "").slice(0, 2))
      }
      onBlur={onBlur}
      aria-label={ariaLabel}
      maxLength={2}
      placeholder={max === 23 ? "hh" : "mm"}
      className="w-full text-center tabular-nums"
    />
  );
}

function OptionSelect({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: Option[];
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Select name={name} required defaultValue="">
        <option value="">Selecione</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

function useToastState(state: AgendaActionState) {
  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);
}

function normalizeTimePart(value: string, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "00";
  return String(Math.min(Math.max(Math.trunc(parsed), 0), max)).padStart(
    2,
    "0",
  );
}

function splitDateTimeValue(value?: string) {
  if (!value) {
    return { date: "", hour: "08", minute: "00" };
  }

  const [date = "", time = ""] = new Date(value)
    .toLocaleString("sv-SE", { timeZone: "America/Fortaleza" })
    .replace(" ", "T")
    .slice(0, 16)
    .split("T");
  const [hour = "08", minute = "00"] = time.split(":");

  return {
    date,
    hour: normalizeTimePart(hour, 23),
    minute: normalizeTimePart(minute, 59),
  };
}
