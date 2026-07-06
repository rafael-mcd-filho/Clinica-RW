"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type DropdownMenuProps = {
  trigger: React.ReactNode;
  triggerLabel: string;
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
  align = "end",
  children,
}: DropdownMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  const close = useCallback(() => setOpen(false), []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const width = 224;
    const left =
      align === "end"
        ? Math.max(8, rect.right - width)
        : Math.min(rect.left, window.innerWidth - width - 8);
    setCoords({ top: rect.bottom + 6, left });
  }, [align]);

  useLayoutEffect(() => {
    if (open) {
      updatePosition();
    }
  }, [open, updatePosition]);

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

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 aria-expanded:bg-muted aria-expanded:text-foreground"
      >
        {trigger}
      </button>

      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              style={{ top: coords.top, left: coords.left }}
              className="fixed z-[60] w-56 animate-content-enter overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-md)]"
            >
              {children(close)}
            </div>,
            document.body,
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
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm font-medium transition-colors duration-[var(--motion-fast)]",
        variant === "destructive"
          ? "text-destructive hover:bg-destructive-muted"
          : "text-foreground hover:bg-muted",
      )}
    >
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-border" role="separator" />;
}
