"use client";

import { ArrowRight } from "@phosphor-icons/react";

/**
 * "Agendar" na lista de serviços: leva ao formulário já com o serviço
 * escolhido (antes só rolava a página e o paciente escolhia tudo de novo).
 */
export function BookServiceButton({ procedureId }: { procedureId: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("booking:choose-service", { detail: procedureId }),
        );
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        document.getElementById("agendamento")?.scrollIntoView({
          behavior: reduceMotion ? "auto" : "smooth",
          block: "start",
        });
      }}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs transition-[background-color,scale] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97] motion-reduce:active:scale-100"
    >
      Agendar
      <ArrowRight className="size-4" aria-hidden="true" />
    </button>
  );
}
