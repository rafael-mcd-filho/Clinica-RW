"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import {
  requestPasswordReset,
  type PasswordResetRequestState,
} from "../login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

const initialState: PasswordResetRequestState = {};

export function PasswordResetRequestForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2 text-sm font-medium">
        E-mail
        <Input required name="email" type="email" autoComplete="email" />
      </label>

      {state.error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        <Mail className="size-4" aria-hidden="true" />
        {pending ? "Enviando..." : "Enviar instruções"}
      </Button>

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary transition-colors duration-[var(--motion-fast)] hover:text-primary-hover"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Voltar ao login
      </Link>
    </form>
  );
}
