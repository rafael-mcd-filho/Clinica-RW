"use client";

import {
  ArrowsLeftRight as ArrowLeftRight,
  CalendarDots as CalendarRange,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DateRangePickerInput } from "@/components/ui/date-picker-input";
import { Select } from "@/components/ui/select";
import {
  maxCustomPeriodDays,
  type DashboardFilterSelection,
  type DashboardPeriodPreset,
} from "@/lib/dashboard/periods";
import { cn } from "@/lib/utils";

const periodOptions: Array<{
  value: DashboardPeriodPreset;
  label: string;
}> = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "current_week", label: "Esta semana" },
  { value: "previous_week", label: "Semana anterior" },
  { value: "current_month", label: "Mês atual" },
  { value: "previous_month", label: "Mês anterior" },
  { value: "custom", label: "Período personalizado" },
];

export function DashboardFilters({
  selection,
  currentRangeLabel,
  comparisonRangeLabel,
  today,
}: {
  selection: DashboardFilterSelection;
  currentRangeLabel: string;
  comparisonRangeLabel: string;
  today: string;
}) {
  const [view, setView] = useState(selection.view);
  const [period, setPeriod] = useState(selection.period);
  const [customRange, setCustomRange] = useState({
    from: selection.from ?? "",
    to: selection.to ?? "",
  });
  const customDays = countCalendarDays(customRange.from, customRange.to);
  const customIncomplete =
    period === "custom" && (!customRange.from || !customRange.to);
  const customTooLong =
    period === "custom" &&
    customDays != null &&
    customDays > maxCustomPeriodDays;
  const customInvalid =
    period === "custom" &&
    Boolean(customRange.from && customRange.to) &&
    customDays == null;

  return (
    <section className="overflow-visible rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
      <form
        action="/dashboard"
        className="grid items-end gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(9rem,11rem)_minmax(10rem,13rem)_minmax(14rem,1fr)_auto]"
      >
        <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
          Visão
          <Select
            name="view"
            value={view}
            className="h-9 bg-background shadow-none"
            onValueChange={(value) =>
              setView(value as DashboardFilterSelection["view"])
            }
          >
            <option value="operational">Operacional</option>
            <option value="commercial">Comercial</option>
          </Select>
        </label>

        <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
          Período
          <Select
            name="period"
            value={period}
            className="h-9 bg-background shadow-none"
            onValueChange={(value) => setPeriod(value as DashboardPeriodPreset)}
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        {period === "custom" ? (
          <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">
            Selecionar período
            <DateRangePickerInput
              fromName="from"
              toName="to"
              value={customRange}
              maxDate={today}
              weekStartsOn={0}
              panelAlign="end"
              className="[&>button]:h-9 [&>button]:bg-background [&>button]:shadow-none"
              onValueChange={setCustomRange}
            />
          </label>
        ) : null}

        <Button
          type="submit"
          className={cn(
            "w-full sm:w-auto sm:justify-self-end lg:col-span-1 lg:col-start-4",
            period !== "custom" && "sm:col-span-2",
          )}
          disabled={customIncomplete || customInvalid || customTooLong}
        >
          Aplicar
        </Button>

        {customTooLong ? (
          <p
            className="text-xs text-destructive sm:col-span-2 lg:col-span-2 lg:col-start-3"
            role="alert"
          >
            Selecione no máximo {maxCustomPeriodDays} dias.
          </p>
        ) : customInvalid ? (
          <p
            className="text-xs text-destructive sm:col-span-2 lg:col-span-2 lg:col-start-3"
            role="alert"
          >
            Selecione um intervalo de datas válido.
          </p>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <CalendarRange className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="inline-flex flex-wrap gap-x-1">
            <span>Período analisado:</span>
            <strong className="font-medium text-foreground">
              {currentRangeLabel}
            </strong>
          </span>
        </span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="inline-flex flex-wrap gap-x-1">
            <span>Comparado com</span>
            <strong className="font-medium text-foreground">
              {comparisonRangeLabel}
            </strong>
          </span>
        </span>
      </div>
    </section>
  );
}

function countCalendarDays(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return Math.floor((end - start) / 86_400_000) + 1;
}
