"use client";

import { useMemo, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DatePickerInputProps = {
  className?: string;
  defaultValue?: string | null;
  disabled?: boolean;
  name: string;
  placeholder?: string;
  required?: boolean;
};

export function DatePickerInput({
  className,
  defaultValue,
  disabled,
  name,
  placeholder = "Selecione uma data",
  required,
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const selected = useMemo(() => parseDateKey(value), [value]);

  return (
    <div className={cn("relative", className)}>
      <input name={name} required={required} type="hidden" value={value} />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        className="h-10 w-full justify-start px-3 text-left font-normal"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className={value ? "text-foreground" : "text-placeholder"}>
          {selected ? formatDate(selected) : placeholder}
        </span>
      </Button>
      {open ? (
        <div className="absolute z-40 mt-2 rounded-lg border border-border bg-popover p-3 shadow-[var(--shadow-lg)]">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(nextDate) => {
              if (!nextDate) return;
              setValue(dateKey(nextDate));
              setOpen(false);
            }}
            weekStartsOn={1}
            classNames={{
              caption_label: "text-sm font-semibold capitalize",
              chevron: "size-4 fill-current",
              day: "size-9 rounded-md text-sm hover:bg-muted",
              day_button: "size-9 rounded-md",
              dropdowns: "flex items-center gap-2",
              month_caption:
                "mb-2 flex min-h-9 items-center justify-center text-center",
              months: "grid gap-3",
              nav: "absolute inset-x-3 top-3 flex justify-between",
              selected:
                "rounded-md bg-primary text-primary-foreground hover:bg-primary",
              today: "font-semibold text-primary",
              weekdays: "grid grid-cols-7 text-xs text-muted-foreground",
              week: "grid grid-cols-7",
            }}
          />
          <div className="mt-2 flex justify-between border-t border-border pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue("");
                setOpen(false);
              }}
            >
              Limpar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue(dateKey(new Date()));
                setOpen(false);
              }}
            >
              Hoje
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type DateRangePickerInputProps = {
  className?: string;
  defaultFrom?: string;
  defaultTo?: string;
  fromName: string;
  toName: string;
};

export function DateRangePickerInput({
  className,
  defaultFrom,
  defaultTo,
  fromName,
  toName,
}: DateRangePickerInputProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({
    from: parseDateKey(defaultFrom ?? ""),
    to: parseDateKey(defaultTo ?? ""),
  });
  const fromValue = range?.from ? dateKey(range.from) : "";
  const toValue = range?.to ? dateKey(range.to) : "";

  return (
    <div className={cn("relative", className)}>
      <input name={fromName} type="hidden" value={fromValue} />
      <input name={toName} type="hidden" value={toValue} />
      <Button
        type="button"
        variant="secondary"
        className="h-10 w-full justify-start px-3 text-left font-normal"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays className="size-4 text-muted-foreground" />
        <span
          className={
            range?.from || range?.to ? "text-foreground" : "text-placeholder"
          }
        >
          {formatRange(range)}
        </span>
      </Button>
      {open ? (
        <div className="absolute z-40 mt-2 rounded-lg border border-border bg-popover p-3 shadow-[var(--shadow-lg)]">
          <DayPicker
            mode="range"
            selected={range}
            onSelect={setRange}
            weekStartsOn={1}
            classNames={{
              caption_label: "text-sm font-semibold capitalize",
              chevron: "size-4 fill-current",
              day: "size-9 rounded-md text-sm hover:bg-muted",
              day_button: "size-9 rounded-md",
              month_caption:
                "mb-2 flex min-h-9 items-center justify-center text-center",
              months: "grid gap-3 md:grid-cols-2",
              nav: "absolute inset-x-3 top-3 flex justify-between",
              range_end: "rounded-r-md bg-primary text-primary-foreground",
              range_middle: "bg-primary/10 text-primary",
              range_start: "rounded-l-md bg-primary text-primary-foreground",
              selected: "bg-primary text-primary-foreground",
              today: "font-semibold text-primary",
              weekdays: "grid grid-cols-7 text-xs text-muted-foreground",
              week: "grid grid-cols-7",
            }}
            numberOfMonths={2}
          />
          <div className="mt-2 flex justify-between border-t border-border pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setRange(undefined);
                setOpen(false);
              }}
            >
              Limpar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Aplicar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T12:00:00`);
}

function dateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA").format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatRange(range: DateRange | undefined) {
  if (range?.from && range?.to) {
    return `${formatDate(range.from)} - ${formatDate(range.to)}`;
  }
  if (range?.from) {
    return `${formatDate(range.from)} - ...`;
  }
  return "Selecione o periodo";
}
