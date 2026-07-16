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
        className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-[minmax(10rem,12rem)_minmax(11rem,14rem)_minmax(15rem,1fr)_auto] xl:items-end"
      >
        <label className="grid gap-2 text-body-sm font-medium">
          Visão
          <Select
            name="view"
            value={view}
            onValueChange={(value) =>
              setView(value as DashboardFilterSelection["view"])
            }
          >
            <option value="operational">Operacional</option>
            <option value="commercial">Comercial</option>
          </Select>
        </label>

        <label className="grid gap-2 text-body-sm font-medium">
          Período
          <Select
            name="period"
            value={period}
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
          <label className="grid gap-2 text-body-sm font-medium">
            Selecionar período
            <DateRangePickerInput
              fromName="from"
              toName="to"
              value={customRange}
              maxDate={today}
              weekStartsOn={0}
              panelAlign="end"
              onValueChange={setCustomRange}
            />
          </label>
        ) : (
          <div className="hidden md:block" />
        )}

        <Button
          type="submit"
          className="md:justify-self-end"
          disabled={customIncomplete || customInvalid || customTooLong}
        >
          Aplicar
        </Button>

        {customTooLong ? (
          <p
            className="text-body-sm text-destructive xl:col-start-3"
            role="alert"
          >
            Selecione no máximo {maxCustomPeriodDays} dias.
          </p>
        ) : customInvalid ? (
          <p
            className="text-body-sm text-destructive xl:col-start-3"
            role="alert"
          >
            Selecione um intervalo de datas válido.
          </p>
        ) : null}
      </form>

      <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-body-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <span className="inline-flex items-center gap-2">
          <CalendarRange className="size-4 shrink-0" aria-hidden="true" />
          <span className="inline-flex flex-wrap gap-x-1">
            <span>Período analisado:</span>
            <strong className="font-medium text-foreground">
              {currentRangeLabel}
            </strong>
          </span>
        </span>
        <span className="inline-flex items-center gap-2">
          <ArrowLeftRight className="size-4 shrink-0" aria-hidden="true" />
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
