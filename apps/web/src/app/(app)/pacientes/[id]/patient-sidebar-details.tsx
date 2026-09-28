"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Parte de baixo do cartão do paciente: resumo clínico e dados cadastrais.
 *
 * No desktop fica sempre aberta, ao lado das abas. Abaixo de lg o cartão vem
 * antes das abas, e aberto ocupava mais de uma tela: o Resumo só aparecia
 * depois de rolar a ficha inteira. Ali começa recolhida, e `alert` (as
 * alergias) continua à vista, porque é o que não pode passar despercebido.
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
    <div className="min-w-0">
      <div className="grid gap-3 px-4 pb-4 lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-left text-sm font-medium transition-colors duration-[var(--motion-fast)] hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {open ? "Ocultar dados do paciente" : "Ver dados do paciente"}
          <CaretDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
        {alert && !open ? alert : null}
      </div>

      {/* Abaixo de lg o conteúdo entra subindo 6px com fade ao abrir. No
          desktop já está sempre à vista e não anima a cada visita. */}
      <div
        id={contentId}
        className={cn(
          "min-w-0 max-lg:animate-content-enter lg:block",
          open ? "block" : "hidden",
        )}
      >
        {children}
      </div>
    </div>
  );
}
