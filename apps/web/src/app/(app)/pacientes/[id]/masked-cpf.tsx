"use client";

import { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { formatCPF, maskCPF } from "@/lib/validation/br";

/** CPF mascarado na tela, com um clique para conferir o número inteiro. */
export function MaskedCpf({ cpf }: { cpf: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <p className="flex items-center justify-center gap-1 text-body-sm tabular-nums text-secondary-foreground">
      <span>CPF {visible ? formatCPF(cpf) : maskCPF(cpf)}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-pressed={visible}
        aria-label={visible ? "Ocultar CPF" : "Mostrar CPF"}
        title={visible ? "Ocultar CPF" : "Mostrar CPF"}
        onClick={() => setVisible((value) => !value)}
        className="size-7"
      >
        {visible ? (
          <EyeSlash className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </Button>
    </p>
  );
}
