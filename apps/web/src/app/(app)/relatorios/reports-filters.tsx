"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FunnelSimple as Filter,
  SlidersHorizontal,
  X,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateRangePickerInput } from "@/components/ui/date-picker-input";
import { Select } from "@/components/ui/field";

type Option = { id: string; name: string };

export function ReportsFilters({
  filters,
  options,
  resetHref,
}: {
  filters: {
    from: string;
    to: string;
    professionalId: string;
    unitId: string;
    healthInsuranceId: string;
    procedureId: string;
  };
  options: {
    professionals: Option[];
    units: Option[];
    healthInsurances: Option[];
    procedures: Option[];
  };
  resetHref: string;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(filters.healthInsuranceId || filters.procedureId),
  );
  const [range, setRange] = useState({ from: filters.from, to: filters.to });
  const [preset, setPreset] = useState("custom");
  const activeLabels = useMemo(
    () =>
      [
        optionName(options.professionals, filters.professionalId),
        optionName(options.units, filters.unitId),
        optionName(options.healthInsurances, filters.healthInsuranceId),
        optionName(options.procedures, filters.procedureId),
      ].filter((label): label is string => Boolean(label)),
    [filters, options],
  );

  function applyPreset(value: string) {
    setPreset(value);
    if (value === "custom") return;

    const today = atNoon(new Date());
    let from = today;
    if (value === "7-days") from = addDays(today, -6);
    if (value === "30-days") from = addDays(today, -29);
    if (value === "current-month") {
      from = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    }
    setRange({ from: dateKey(from), to: dateKey(today) });
  }

  return (
    <form className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-[12rem_minmax(18rem,1fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)_auto]">
        <label className="grid gap-2 text-sm font-medium">
          Período
          <Select value={preset} onValueChange={applyPreset}>
            <option value="7-days">Últimos 7 dias</option>
            <option value="30-days">Últimos 30 dias</option>
            <option value="current-month">Mês atual</option>
            <option value="custom">Personalizado</option>
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Intervalo
          <DateRangePickerInput
            fromName="from"
            toName="to"
            value={range}
            onValueChange={(next) => {
              setRange(next);
              setPreset("custom");
            }}
          />
        </label>
        <FilterSelect
          label="Profissional"
          name="professional_id"
          defaultValue={filters.professionalId}
          emptyLabel="Todos"
          options={options.professionals}
        />
        <FilterSelect
          label="Unidade"
          name="unit_id"
          defaultValue={filters.unitId}
          emptyLabel="Todas"
          options={options.units}
        />
        <div className="flex items-end gap-2">
          <Button type="submit">
            <Filter className="size-4" aria-hidden="true" />
            Aplicar
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((current) => !current)}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Mais filtros
          </Button>
        </div>
      </div>

      {advancedOpen ? (
        <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
          <FilterSelect
            label="Convênio"
            name="health_insurance_id"
            defaultValue={filters.healthInsuranceId}
            emptyLabel="Todos"
            options={options.healthInsurances}
          />
          <FilterSelect
            label="Procedimento"
            name="procedure_id"
            defaultValue={filters.procedureId}
            emptyLabel="Todos"
            options={options.procedures}
          />
        </div>
      ) : null}

      {activeLabels.length ? (
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Filtros ativos"
        >
          <span className="text-xs font-medium text-muted-foreground">
            Filtros ativos:
          </span>
          {activeLabels.map((label) => (
            <Badge key={label} variant="neutral">
              {label}
            </Badge>
          ))}
          <Button asChild size="sm" variant="ghost">
            <Link href={resetHref}>
              <X className="size-3.5" aria-hidden="true" />
              Limpar tudo
            </Link>
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function FilterSelect({
  defaultValue,
  emptyLabel,
  label,
  name,
  options,
}: {
  defaultValue: string;
  emptyLabel: string;
  label: string;
  name: string;
  options: Option[];
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Select name={name} defaultValue={defaultValue}>
        <option value="">{emptyLabel}</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

function optionName(options: Option[], value: string) {
  if (!value) return null;
  return options.find((option) => option.id === value)?.name ?? null;
}

function atNoon(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
}

function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function dateKey(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}
