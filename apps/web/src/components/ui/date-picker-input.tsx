"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { DayPicker, type DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";
import { CalendarDots as CalendarDays } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DatePickerInputProps = {
  ariaLabel?: string;
  className?: string;
  defaultValue?: string | null;
  disabled?: boolean;
  name: string;
  onValueChange?: (value: string) => void;
  panelAlign?: "start" | "end";
  placeholder?: string;
  required?: boolean;
  todayValue?: string;
  value?: string;
};

export function DatePickerInput({
  ariaLabel = "Selecionar data",
  className,
  defaultValue,
  disabled,
  name,
  onValueChange,
  panelAlign = "start",
  placeholder = "Selecione uma data",
  required,
  todayValue,
  value: controlledValue,
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const value = controlledValue ?? internalValue;
  const selected = useMemo(() => parseDateKey(value), [value]);

  useEffect(() => {
    if (!open) return;

    function closeOnPointerDown(event: PointerEvent) {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !panelRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function updateValue(nextValue: string) {
    if (controlledValue === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        name={name}
        required={required}
        type="hidden"
        value={value}
        readOnly
      />
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        disabled={disabled}
        className="h-10 w-full justify-start px-3 text-left font-normal"
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
      >
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className={value ? "text-foreground" : "text-placeholder"}>
          {selected ? formatDate(selected) : placeholder}
        </span>
      </Button>
      {open ? (
        <CalendarPopover
          id={panelId}
          ariaLabel={ariaLabel}
          anchorRef={triggerRef}
          panelRef={panelRef}
          align={panelAlign}
        >
          <DayPicker
            mode="single"
            selected={selected}
            locale={ptBR}
            onSelect={(nextDate) => {
              if (!nextDate) return;
              updateValue(dateKey(nextDate));
              setOpen(false);
              triggerRef.current?.focus();
            }}
            weekStartsOn={1}
            classNames={{
              caption_label: "text-sm font-semibold capitalize",
              chevron: "size-4 fill-current",
              day: "h-9 w-9 p-0 text-center text-sm",
              day_button: "size-9 rounded-md",
              dropdowns: "flex items-center gap-2",
              month_caption:
                "mb-2 flex min-h-9 items-center justify-center text-center",
              month_grid: "w-[252px] table-fixed border-collapse",
              months: "grid gap-3",
              nav: "absolute inset-x-3 top-3 flex justify-between",
              selected:
                "rounded-md bg-primary text-primary-foreground hover:bg-primary",
              today: "font-semibold text-primary",
              weekday:
                "h-9 w-9 p-0 text-center text-xs font-medium text-muted-foreground",
            }}
          />
          <div className="mt-2 flex justify-between border-t border-border pt-2">
            {required ? (
              <span />
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  updateValue("");
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                Limpar
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                updateValue(todayValue ?? dateKey(new Date()));
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              Hoje
            </Button>
          </div>
        </CalendarPopover>
      ) : null}
    </div>
  );
}

type DateRangePickerInputProps = {
  className?: string;
  defaultFrom?: string;
  defaultTo?: string;
  maxDate?: string;
  onApply?: (range: { from: string; to: string }) => void;
  onValueChange?: (range: { from: string; to: string }) => void;
  panelAlign?: "start" | "end";
  fromName: string;
  toName: string;
  value?: { from: string; to: string };
  weekStartsOn?: 0 | 1;
};

export function DateRangePickerInput({
  className,
  defaultFrom,
  defaultTo,
  maxDate,
  onApply,
  onValueChange,
  panelAlign = "start",
  fromName,
  toName,
  value,
  weekStartsOn = 1,
}: DateRangePickerInputProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopCalendar,
    getDesktopCalendarSnapshot,
    () => false,
  );
  const [internalRange, setInternalRange] = useState<DateRange | undefined>({
    from: parseDateKey(defaultFrom ?? ""),
    to: parseDateKey(defaultTo ?? ""),
  });
  const range = value
    ? {
        from: parseDateKey(value.from),
        to: parseDateKey(value.to),
      }
    : internalRange;
  const fromValue = range?.from ? dateKey(range.from) : "";
  const toValue = range?.to ? dateKey(range.to) : "";
  const maximumDate = useMemo(() => parseDateKey(maxDate ?? ""), [maxDate]);

  useEffect(() => {
    if (!open) return;

    function closeOnPointerDown(event: PointerEvent) {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !panelRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function updateRange(nextRange: DateRange | undefined) {
    if (!value) setInternalRange(nextRange);
    onValueChange?.({
      from: nextRange?.from ? dateKey(nextRange.from) : "",
      to: nextRange?.to ? dateKey(nextRange.to) : "",
    });
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input name={fromName} type="hidden" value={fromValue} readOnly />
      <input name={toName} type="hidden" value={toValue} readOnly />
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        className="h-10 w-full justify-start px-3 text-left font-normal"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
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
        <CalendarPopover
          id={panelId}
          ariaLabel="Selecionar intervalo de datas"
          anchorRef={triggerRef}
          panelRef={panelRef}
          align={panelAlign}
        >
          <DayPicker
            mode="range"
            selected={range}
            onSelect={updateRange}
            weekStartsOn={weekStartsOn}
            locale={ptBR}
            defaultMonth={range?.from ?? maximumDate}
            endMonth={maximumDate}
            disabled={maximumDate ? { after: maximumDate } : undefined}
            classNames={{
              caption_label: "text-sm font-semibold capitalize",
              chevron: "size-4 fill-current",
              day: "h-9 w-9 p-0 text-center text-sm",
              day_button: "size-9 rounded-md",
              month_caption:
                "mb-2 flex min-h-9 items-center justify-center text-center",
              month_grid: "w-[252px] table-fixed border-collapse",
              months: "grid gap-3 md:grid-cols-2",
              nav: "absolute inset-x-3 top-3 flex justify-between",
              range_end: "rounded-r-md bg-primary text-primary-foreground",
              range_middle: "bg-primary/10 text-primary",
              range_start: "rounded-l-md bg-primary text-primary-foreground",
              selected: "bg-primary text-primary-foreground",
              today: "font-semibold text-primary",
              weekday:
                "h-9 w-9 p-0 text-center text-xs font-medium text-muted-foreground",
            }}
            numberOfMonths={isDesktop ? 2 : 1}
          />
          <div className="mt-2 flex justify-between border-t border-border pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                updateRange(undefined);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              Limpar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!fromValue || !toValue}
              onClick={() => {
                if (!fromValue || !toValue) return;
                onApply?.({ from: fromValue, to: toValue });
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              Fechar
            </Button>
          </div>
        </CalendarPopover>
      ) : null}
    </div>
  );
}

function CalendarPopover({
  align,
  anchorRef,
  ariaLabel,
  children,
  id,
  panelRef,
}: {
  align: "start" | "end";
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  ariaLabel: string;
  children: React.ReactNode;
  id: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [position, setPosition] = useState({ left: 16, top: 16 });

  useLayoutEffect(() => {
    function placePopover() {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;

      const viewportPadding = 16;
      const gap = 8;
      const anchorRect = anchor.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const spaceBelow = window.innerHeight - anchorRect.bottom - gap;
      const spaceAbove = anchorRect.top - gap;
      const openAbove =
        spaceBelow < panelRect.height && spaceAbove > spaceBelow;
      const preferredTop = openAbove
        ? anchorRect.top - panelRect.height - gap
        : anchorRect.bottom + gap;
      const preferredLeft =
        align === "end" ? anchorRect.right - panelRect.width : anchorRect.left;

      setPosition({
        left: Math.max(
          viewportPadding,
          Math.min(
            preferredLeft,
            window.innerWidth - panelRect.width - viewportPadding,
          ),
        ),
        top: Math.max(
          viewportPadding,
          Math.min(
            preferredTop,
            window.innerHeight - panelRect.height - viewportPadding,
          ),
        ),
      });
    }

    placePopover();
    window.addEventListener("resize", placePopover);
    window.addEventListener("scroll", placePopover, true);
    return () => {
      window.removeEventListener("resize", placePopover);
      window.removeEventListener("scroll", placePopover, true);
    };
  }, [align, anchorRef, panelRef]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={ariaLabel}
      data-date-picker-popover
      style={{ left: position.left, top: position.top }}
      className="pointer-events-auto fixed z-[70] max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-auto rounded-lg border border-border bg-popover p-3 shadow-[var(--shadow-lg)]"
    >
      {children}
    </div>,
    document.body,
  );
}

function subscribeToDesktopCalendar(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia("(min-width: 1280px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getDesktopCalendarSnapshot() {
  return typeof window !== "undefined"
    ? window.matchMedia("(min-width: 1280px)").matches
    : false;
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }

  return date;
}

function dateKey(value: Date) {
  return [
    String(value.getFullYear()).padStart(4, "0"),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
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
  return "Selecione o período";
}
