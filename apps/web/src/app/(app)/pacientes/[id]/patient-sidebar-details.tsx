"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Dados pessoais e clínicos da coluna do paciente.
 *
 * No desktop ficam sempre abertos, ao lado das abas. Abaixo de lg a coluna
 * vem antes das abas, e aberta ocupava mais de uma tela: histórico,
 * documentos e financeiro só apareciam depois de rolar a ficha inteira. Ali
 * ela começa recolhida, e `alert` (as alergias) continua à vista, porque é o
 * que não pode passar despercebido antes de atender.
 */
export function PatientSidebarDetails({
  alert,
  children,
}: {
  alert?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div className="grid min-w-0 gap-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-left text-sm font-medium transition-colors duration-[var(--motion-fast)] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
      >
        {open ? "Ocultar dados do paciente" : "Ver dados do paciente"}
        <CaretDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)]",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {alert && !open ? <div className="lg:hidden">{alert}</div> : null}

      <div
        id={contentId}
        className={cn("min-w-0 gap-4 lg:grid", open ? "grid" : "hidden")}
      >
        {children}
      </div>
    </div>
  );
}
