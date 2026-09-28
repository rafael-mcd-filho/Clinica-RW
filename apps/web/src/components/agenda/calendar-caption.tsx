"use client";

import { useDayPicker, type MonthCaptionProps } from "react-day-picker";
import { Select } from "@/components/ui/select";

const months = Array.from({ length: 12 }, (_, month) => {
  const name = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(
    new Date(2026, month, 1),
  );
  return name.charAt(0).toUpperCase() + name.slice(1);
});

export function AgendaCalendarCaption(props: MonthCaptionProps) {
  const { goToMonth } = useDayPicker();
  const month = props.calendarMonth.date.getMonth();
  const year = props.calendarMonth.date.getFullYear();
  const currentYear = new Date().getFullYear();
  // Expand around the selected year without restricting the calendar arrows.
  const firstYear = Math.min(currentYear - 10, year - 10);
  const lastYear = Math.max(currentYear + 10, year + 10);

  return (
    <div className={props.className} style={props.style}>
      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-1">
        <Select
          aria-label="Selecionar mês da agenda"
          value={String(month)}
          className="h-8 gap-1 px-1.5 font-medium shadow-none [&>svg]:size-3"
          panelMinWidth={160}
          onValueChange={(value) => goToMonth(new Date(year, Number(value), 1))}
        >
          {months.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Selecionar ano da agenda"
          value={String(year)}
          className="h-8 gap-1 px-1.5 font-medium tabular-nums shadow-none [&>svg]:size-3"
          panelMinWidth={112}
          onValueChange={(value) =>
            goToMonth(new Date(Number(value), month, 1))
          }
        >
          {Array.from(
            { length: lastYear - firstYear + 1 },
            (_, index) => firstYear + index,
          ).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {months[month]} de {year}
      </span>
    </div>
  );
}
