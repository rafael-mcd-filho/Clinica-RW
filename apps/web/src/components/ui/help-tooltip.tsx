"use client";

import { Question as CircleHelp } from "@phosphor-icons/react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export function HelpTooltip({
  children,
  className,
  label = "Mais informações",
  align = "start",
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
  align?: "start" | "end";
}) {
  const tooltipId = useId();

  return (
    <span
      className={cn(
        "group/help relative inline-flex shrink-0 align-middle",
        className,
      )}
    >
      <button
        type="button"
        className="-my-1 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label={label}
        aria-describedby={tooltipId}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          "pointer-events-none invisible absolute bottom-full z-50 mb-2 w-max max-w-[min(16rem,calc(100vw-2rem))] translate-y-1 rounded-md border border-border bg-popover px-3 py-2 text-left text-body-sm font-normal leading-5 text-popover-foreground opacity-0 shadow-[var(--shadow-lg)] transition-[opacity,transform,visibility] duration-[var(--motion-fast)] group-hover/help:visible group-hover/help:translate-y-0 group-hover/help:opacity-100 group-focus-within/help:visible group-focus-within/help:translate-y-0 group-focus-within/help:opacity-100",
          align === "end" ? "right-0" : "left-0",
        )}
      >
        {children}
      </span>
    </span>
  );
}
