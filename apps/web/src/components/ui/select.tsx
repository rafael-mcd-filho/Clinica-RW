"use client";

import { Check, CaretUpDown as ChevronsUpDown, X } from "@phosphor-icons/react";
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type PanelLayout = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  position: "absolute" | "fixed";
  portalTarget: HTMLElement | null;
};

const panelGap = 6;

function measurePanelLayout(
  trigger: HTMLButtonElement,
  optionCount: number,
  preferredMaxHeight: number,
): PanelLayout {
  const rect = trigger.getBoundingClientRect();
  const modalRoot = trigger.closest<HTMLElement>("[data-select-portal-root]");
  const modalRect = modalRoot?.getBoundingClientRect();
  const boundaryTop = modalRect?.top ?? 0;
  const boundaryBottom = modalRect?.bottom ?? window.innerHeight;
  const availableAbove = Math.max(0, rect.top - boundaryTop - panelGap);
  const availableBelow = Math.max(0, boundaryBottom - rect.bottom - panelGap);
  const estimatedHeight = Math.min(
    preferredMaxHeight,
    Math.max(40, optionCount * 40 + 8),
  );
  const openAbove =
    availableBelow < estimatedHeight && availableAbove > availableBelow;
  const maxHeight = Math.max(
    1,
    Math.min(preferredMaxHeight, openAbove ? availableAbove : availableBelow),
  );

  if (modalRoot && modalRect) {
    return {
      top: openAbove ? undefined : rect.bottom - modalRect.top + panelGap,
      bottom: openAbove ? modalRect.bottom - rect.top + panelGap : undefined,
      left: rect.left - modalRect.left,
      width: rect.width,
      maxHeight,
      position: "absolute",
      portalTarget: modalRoot,
    };
  }

  return {
    top: openAbove ? undefined : rect.bottom + panelGap,
    bottom: openAbove ? window.innerHeight - rect.top + panelGap : undefined,
    left: rect.left,
    width: rect.width,
    maxHeight,
    position: "fixed",
    portalTarget: null,
  };
}

type SelectProps = {
  children: ReactNode;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  allowEmptyOption?: boolean;
  className?: string;
  "aria-label"?: string;
};

type MultiSelectProps = {
  options: SelectOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  allLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

function nodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(nodeToText).join("");
  }
  if (isValidElement(node)) {
    return nodeToText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function extractOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    const props = child.props as {
      value?: string | number;
      disabled?: boolean;
      children?: ReactNode;
    };
    options.push({
      value: String(props.value ?? ""),
      label: nodeToText(props.children),
      disabled: Boolean(props.disabled),
    });
  });

  return options;
}

/**
 * Custom select rendered as a popover listbox (selected item marked with a
 * check). Drop-in for native `<select>` with `<option>` children, controlled
 * (`value` + `onValueChange`) or uncontrolled (`defaultValue`). When `name` is
 * set it renders a hidden input so it works inside plain forms / server actions.
 * Empty options act as placeholders by default; set `allowEmptyOption` when an
 * empty value is a real selectable option.
 */
export function Select({
  children,
  name,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  required,
  disabled,
  allowEmptyOption = false,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const allOptions = useMemo(() => extractOptions(children), [children]);
  const placeholderOption = allOptions.find(
    (option) => option.value === "" && !allowEmptyOption,
  );
  const options = useMemo(
    () =>
      allowEmptyOption
        ? allOptions
        : allOptions.filter((option) => option.value !== ""),
    [allowEmptyOption, allOptions],
  );
  const placeholderText =
    placeholder ?? placeholderOption?.label ?? "Selecione";

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = isControlled ? value : internalValue;
  const selected = options.find((option) => option.value === currentValue);

  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelLayout, setPanelLayout] = useState<PanelLayout | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Measure and pick the active row up front so opening needs no layout effect.
  const openMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger) {
      setPanelLayout(measurePanelLayout(trigger, options.length, 256));
    }
    const selectedIndex = options.findIndex(
      (option) => option.value === currentValue,
    );
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [options, currentValue]);

  const commit = useCallback(
    (next: string) => {
      if (!isControlled) {
        setInternalValue(next);
      }
      onValueChange?.(next);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [isControlled, onValueChange],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function onScroll(event: Event) {
      const target = event.target as Node | null;
      if (
        target &&
        (panelRef.current?.contains(target) ||
          triggerRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  function moveActive(direction: 1 | -1) {
    setActiveIndex((index) => {
      let next = index;
      for (let step = 0; step < options.length; step += 1) {
        next = (next + direction + options.length) % options.length;
        if (!options[next]?.disabled) {
          return next;
        }
      }
      return index;
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (
      !open &&
      (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      openMenu();
      return;
    }
    if (!open) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option && !option.disabled) {
        commit(option.value);
      }
    }
  }

  return (
    <>
      {name ? <input type="hidden" name={name} value={currentValue} /> : null}

      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-required={required}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-10 w-full min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden rounded-md border border-border bg-card px-3 text-left text-sm shadow-[var(--shadow-soft)] outline-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.1)] disabled:cursor-not-allowed disabled:opacity-60 aria-expanded:border-primary aria-expanded:shadow-[0_0_0_3px_rgba(37,99,235,0.1)] aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/15",
          className,
        )}
      >
        <span
          title={selected?.label ?? placeholderText}
          className={cn(
            "w-0 min-w-0 flex-1 truncate",
            selected ? "text-foreground" : "text-placeholder",
          )}
        >
          {selected ? selected.label : placeholderText}
        </span>
        <ChevronsUpDown
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </button>

      {open && panelLayout && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              id={listboxId}
              role="listbox"
              style={{
                top: panelLayout.top,
                bottom: panelLayout.bottom,
                left: panelLayout.left,
                width: panelLayout.width,
                maxHeight: panelLayout.maxHeight,
                position: panelLayout.position,
              }}
              className="pointer-events-auto z-[60] animate-content-enter overflow-auto rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-md)]"
            >
              {options.length ? (
                options.map((option, index) => {
                  const isSelected = option.value === currentValue;
                  const isActive = index === activeIndex;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onClick={() => commit(option.value)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        "flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded px-2.5 py-2 text-left text-sm transition-colors duration-[var(--motion-fast)] disabled:pointer-events-none disabled:opacity-50",
                        isActive ? "bg-muted" : "",
                        isSelected
                          ? "font-medium text-foreground"
                          : "text-secondary-foreground",
                      )}
                    >
                      <Check
                        className={cn(
                          "size-4 shrink-0 text-primary",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden="true"
                      />
                      <span className="w-0 min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="px-2.5 py-2 text-sm text-muted-foreground">
                  Nenhuma opção disponível
                </p>
              )}
            </div>,
            panelLayout.portalTarget ?? document.body,
          )
        : null}
    </>
  );
}

export function MultiSelect({
  options,
  value,
  onValueChange,
  allLabel,
  placeholder,
  disabled,
  className,
  "aria-label": ariaLabel,
}: MultiSelectProps) {
  const selectedValues = useMemo(() => new Set(value), [value]);
  const selectedOptions = options.filter((option) =>
    selectedValues.has(option.value),
  );
  const label =
    selectedOptions.length === 0
      ? allLabel
      : selectedOptions.length === 1
        ? selectedOptions[0]?.label
        : `${selectedOptions.length} selecionados`;

  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelLayout, setPanelLayout] = useState<PanelLayout | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger) {
      setPanelLayout(measurePanelLayout(trigger, options.length + 1, 288));
    }
    setOpen(true);
  }, [options.length]);

  function toggle(nextValue: string) {
    if (selectedValues.has(nextValue)) {
      onValueChange(value.filter((item) => item !== nextValue));
      return;
    }
    onValueChange([...value, nextValue]);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function onScroll(event: Event) {
      const target = event.target as Node | null;
      if (
        target &&
        (panelRef.current?.contains(target) ||
          triggerRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (
      !open &&
      (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      openMenu();
    }
  }

  const hasSelection = selectedOptions.length > 0;

  return (
    <div className={cn("relative min-w-0 max-w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className="peer flex h-10 w-full min-w-0 max-w-full items-center overflow-hidden rounded-md border border-border bg-card py-2 pl-3 pr-9 text-left text-sm shadow-[var(--shadow-soft)] outline-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.1)] disabled:cursor-not-allowed disabled:opacity-60 aria-expanded:border-primary aria-expanded:shadow-[0_0_0_3px_rgba(37,99,235,0.1)] aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/15"
      >
        <span
          className={cn(
            "w-0 min-w-0 flex-1 truncate",
            selectedOptions.length ? "text-foreground" : "text-placeholder",
          )}
        >
          {label ?? placeholder ?? allLabel}
        </span>
      </button>
      <ChevronsUpDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 shrink-0 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-60"
        aria-hidden="true"
      />
      {hasSelection && !disabled ? (
        <button
          type="button"
          aria-label={`Limpar ${ariaLabel ?? "seleção"}`}
          onClick={(event) => {
            event.stopPropagation();
            onValueChange([]);
          }}
          className="absolute right-8 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}

      {open && panelLayout && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              id={listboxId}
              role="listbox"
              aria-multiselectable="true"
              style={{
                top: panelLayout.top,
                bottom: panelLayout.bottom,
                left: panelLayout.left,
                width: panelLayout.width,
                maxHeight: panelLayout.maxHeight,
                position: panelLayout.position,
              }}
              className="pointer-events-auto z-[60] animate-content-enter overflow-auto rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-md)]"
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm font-medium text-secondary-foreground transition-colors hover:bg-muted"
                onClick={() => onValueChange([])}
              >
                <Check
                  className={cn(
                    "size-4 shrink-0 text-primary",
                    value.length === 0 ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{allLabel}</span>
              </button>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onClick={() => toggle(option.value)}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-secondary-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        isSelected
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-card",
                      )}
                    >
                      {isSelected ? (
                        <Check className="size-3" aria-hidden="true" />
                      ) : null}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>,
            panelLayout.portalTarget ?? document.body,
          )
        : null}
    </div>
  );
}
