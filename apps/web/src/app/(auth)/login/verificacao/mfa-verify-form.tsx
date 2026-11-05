"use client";

import { useActionState } from "react";
import { ShieldCheck } from "@phosphor-icons/react";
import { signOut, verifyMfaCode } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";

export function MfaVerifyForm() {
  const [state, action, pending] = useActionState(verifyMfaCode, {});

  return (
    <div className="grid w-full max-w-sm gap-5 rounded-lg border border-border bg-card p-6 shadow-[var(--shadow-md)]">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary-muted text-primary">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-heading font-semibold">
            Verificação em duas etapas
          </h1>
          <p className="text-body-sm text-muted-foreground">
            Digite o código de 6 dígitos do seu aplicativo autenticador.
          </p>
        </div>
      </div>
      <form action={action} className="grid gap-3">
        <Input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          autoFocus
          required
          aria-label="Código do aplicativo autenticador"
          placeholder="000 000"
          className="text-center text-heading tabular-nums tracking-[0.3em]"
        />
        <FormError message={state.error} />
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Conferindo..." : "Entrar"}
        </Button>
      </form>
      <form action={signOut}>
        <Button type="submit" variant="ghost" className="w-full">
          Usar outra conta
        </Button>
      </form>
    </div>
  );
}
