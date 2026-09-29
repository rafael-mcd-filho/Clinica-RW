"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type DropdownMenuProps = {
  trigger: React.ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  align?: "start" | "end";
  children: (close: () => void) => React.ReactNode;
};

/**
 * Lightweight menu rendered in a portal so it is never clipped by ancestors
 * with `overflow: hidden`. Positions itself against the trigger via
 * getBoundingClientRect and closes on outside click, Escape, scroll or resize.
 */
export function DropdownMenu({
  trigger,
  triggerLabel,
  triggerClassName,
  align = "end",
  children,
}: DropdownMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<"first" | "last">("first");
  const [open, setOpen] = useState(false);
  const [restoreFocus, setRestoreFocus] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    maxHeight: number;
    above: boolean;
    width: number;
    portalTarget: HTMLElement | null;
    position: "fixed" | "absolute";
  } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setRestoreFocus(true);
  }, []);

  useEffect(() => {
    if (!open && restoreFocus) triggerRef.current?.focus();
  }, [open, restoreFocus]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const modalRoot = trigger.closest<HTMLElement>("[data-select-portal-root]");
    const modalRect = modalRoot?.getBoundingClientRect();
    const boundaryTop = modalRect?.top ?? 0;
    const boundaryBottom = modalRect?.bottom ?? window.innerHeight;
    const boundaryLeft = modalRect?.left ?? 0;
    const boundaryRight = modalRect?.right ?? window.innerWidth;
    const width = Math.min(224, boundaryRight - boundaryLeft - 16);
    const gap = 6;
    const viewportPadding = 8;
    const availableAbove = Math.max(
      0,
      rect.top - boundaryTop - viewportPadding - gap,
    );
    const availableBelow = Math.max(
      0,
      boundaryBottom - rect.bottom - viewportPadding - gap,
    );
    const panelHeight = panelRef.current?.scrollHeight ?? 240;
    const openAbove =
      availableBelow < Math.min(panelHeight, 240) &&
      availableAbove > availableBelow;
    const maxHeight = Math.max(
      40,
      Math.min(320, openAbove ? availableAbove : availableBelow),
    );
    const visibleHeight = Math.min(panelHeight, maxHeight);
    const desiredLeft = align === "end" ? rect.right - width : rect.left;
    const left = Math.min(
      Math.max(boundaryLeft + viewportPadding, desiredLeft),
      Math.max(
        boundaryLeft + viewportPadding,
        boundaryRight - width - viewportPadding,
      ),
    );
    const top = openAbove
      ? Math.max(boundaryTop + viewportPadding, rect.top - gap - visibleHeight)
      : Math.min(
          rect.bottom + gap,
          Math.max(
            boundaryTop + viewportPadding,
            boundaryBottom - visibleHeight - gap,
          ),
        );

    setCoords({
      top: modalRoot ? top - boundaryTop : top,
      left: modalRoot ? left - boundaryLeft : left,
      maxHeight,
      above: openAbove,
      width,
      portalTarget: modalRoot,
      position: modalRoot ? "absolute" : "fixed",
    });
  }, [align]);

  const openMenu = useCallback(
    (initialFocus: "first" | "last" = "first") => {
      initialFocusRef.current = initialFocus;
      setRestoreFocus(false);
      updatePosition();
      setOpen(true);
    },
    [updatePosition],
  );

  const focusMenuItem = useCallback((target: "first" | "last" | number) => {
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    if (!items.length) return;

    const index =
      target === "first"
        ? 0
        : target === "last"
          ? items.length - 1
          : (target + items.length) % items.length;
    items[index]?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    let positionFrame: number | null = null;

    function schedulePositionUpdate() {
      if (positionFrame !== null) {
        return;
      }
      positionFrame = window.requestAnimationFrame(() => {
        positionFrame = null;
        updatePosition();
      });
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

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    schedulePositionUpdate();
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", schedulePositionUpdate, true);
    window.addEventListener("resize", schedulePositionUpdate);

    return () => {
      if (positionFrame !== null) {
        window.cancelAnimationFrame(positionFrame);
      }
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", schedulePositionUpdate, true);
      window.removeEventListener("resize", schedulePositionUpdate);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      focusMenuItem(initialFocusRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusMenuItem, open]);

  function handleTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? "last" : "first");
    }
  }

  function handlePanelKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    const currentIndex = items.findIndex(
      (item) => item === document.activeElement,
    );

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusMenuItem(currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItem(currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusMenuItem("first");
    } else if (event.key === "End") {
      event.preventDefault();
      focusMenuItem("last");
    } else if (event.key === "Tab") {
      close();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => (open ? close() : openMenu("first"))}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          "inline-flex size-8 touch-manipulation items-center justify-center rounded-md border border-border bg-card text-secondary-foreground shadow-[var(--shadow-soft)] transition-[background-color,border-color,color] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:border-primary hover:bg-primary-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 aria-expanded:border-primary aria-expanded:bg-primary-muted aria-expanded:text-primary",
          triggerClassName,
        )}
      >
        {trigger}
      </button>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              id={menuId}
              ref={panelRef}
              role="menu"
              aria-label={triggerLabel}
              onKeyDown={handlePanelKeyDown}
              style={{
                top: coords.top,
                left: coords.left,
                maxHeight: coords.maxHeight,
                width: coords.width,
                position: coords.position,
              }}
              className="pointer-events-auto z-[60] animate-content-enter overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-[var(--shadow-md)]"
            >
              {children(close)}
            </div>,
            coords.portalTarget ?? document.body,
          )
        : null}
    </>
  );
}

export function DropdownMenuItem({
  children,
  icon: Icon,
  onSelect,
  variant = "default",
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onSelect}
      className={menuItemClassName(variant)}
    >
      <MenuItemContent icon={Icon} variant={variant}>
        {children}
      </MenuItemContent>
    </button>
  );
}

/**
 * Item de menu que envia o <form> em volta (ações de servidor como "Definir
 * como padrão"). Mesmo visual do DropdownMenuItem: antes cada tela fazia o
 * seu, sem o ícone em destaque e com outro tamanho de texto.
 */
export function DropdownMenuSubmitItem({
  children,
  disabled,
  icon: Icon,
  variant = "default",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      type="submit"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      className={cn(menuItemClassName(variant), "disabled:opacity-50")}
    >
      <MenuItemContent icon={Icon} variant={variant}>
        {children}
      </MenuItemContent>
    </button>
  );
}

function menuItemClassName(variant: "default" | "destructive") {
  return cn(
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-control font-medium transition-colors duration-[var(--motion-fast)]",
    variant === "destructive"
      ? "text-destructive hover:bg-destructive-muted"
      : "text-foreground hover:bg-muted",
  );
}

function MenuItemContent({
  children,
  icon: Icon,
  variant,
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  variant: "default" | "destructive";
}) {
  return (
    <>
      {Icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            variant === "destructive"
              ? "bg-destructive-muted text-destructive"
              : "bg-primary-muted text-primary",
          )}
        >
          <Icon className="size-4" />
        </span>
      ) : null}
      {children}
    </>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-border" role="separator" />;
}
