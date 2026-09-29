"use client";

import { CalendarX } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

// Falha ao carregar a página pública: antes o paciente via um erro técnico em
// inglês. Aqui ele entende o que houve e pode tentar de novo.
export default function PublicBookingError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="grid max-w-sm justify-items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-muted text-primary">
          <CalendarX className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-heading font-semibold">
          Não foi possível abrir a agenda
        </h1>
        <p className="text-sm text-muted-foreground">
          Pode ser uma instabilidade passageira. Tente de novo em instantes ou
          fale com a clínica pelo telefone ou WhatsApp.
        </p>
        <Button type="button" onClick={reset}>
          Tentar novamente
        </Button>
      </div>
    </main>
  );
}
