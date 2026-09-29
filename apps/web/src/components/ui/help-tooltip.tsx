"use client";

import { Question as CircleHelp } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

// Largura máxima do balão (16rem) mais a margem de respiro da tela.
const tooltipMaxWidth = 256;
const viewportGutter = 16;

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
  const [side, setSide] = useState(align);

  // `align` é a preferência; se o balão não couber daquele lado, abre para o
  // outro. Num "?" da última coluna ele saía da tela com o texto cortado.
  function place(trigger: HTMLElement) {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(
      tooltipMaxWidth,
      window.innerWidth - viewportGutter * 2,
    );
    const fitsStart = rect.left + width <= window.innerWidth - viewportGutter;
    const fitsEnd = rect.right - width >= viewportGutter;
    setSide(
      align === "start"
        ? fitsStart || !fitsEnd
          ? "start"
          : "end"
        : fitsEnd || !fitsStart
          ? "end"
          : "start",
    );
  }

  return (
    <span
      className={cn(
        "group/help relative inline-flex shrink-0 align-middle",
        className,
      )}
      onMouseEnter={(event) => place(event.currentTarget)}
      onFocus={(event) => place(event.currentTarget)}
    >
      <button
        type="button"
        className="-my-1 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label={label}
        aria-describedby={tooltipId}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </button>
      {/* Escondido é display:none, não só invisível: invisível ele seguia
          no layout e, perto da borda direita, criava rolagem lateral na
          página inteira. O fade de entrada vem do @starting-style. */}
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full z-50 mb-2 hidden w-max max-w-[min(16rem,calc(100vw-2rem))] rounded-md border border-border bg-popover px-3 py-2 text-left text-body-sm font-normal leading-5 text-popover-foreground shadow-[var(--shadow-lg)] transition-[opacity,translate,display] transition-discrete duration-[var(--motion-fast)] ease-[var(--ease-out)] starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0 group-hover/help:block group-focus-within/help:block",
          side === "end" ? "right-0" : "left-0",
        )}
      >
        {children}
      </span>
    </span>
  );
}
