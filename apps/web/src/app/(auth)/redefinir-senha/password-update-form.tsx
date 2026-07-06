"use client";

import Link from "next/link";
import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { updatePassword, type PasswordUpdateState } from "../login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

const initialState: PasswordUpdateState = {};

export function PasswordUpdateForm() {
  const [state, action, pending] = useActionState(updatePassword, initialState);

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2 text-sm font-medium">
        Nova senha
        <Input
          required
          minLength={8}
          name="password"
          type="password"
          autoComplete="new-password"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Confirmar nova senha
        <Input
          required
          minLength={8}
          name="password_confirmation"
          type="password"
          autoComplete="new-password"
        />
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

      <Button type="submit" disabled={pending || Boolean(state.success)}>
        <KeyRound className="size-4" aria-hidden="true" />
        {pending ? "Atualizando..." : "Atualizar senha"}
      </Button>

      {state.success ? (
        <Button asChild variant="secondary">
          <Link href="/login">Ir para o login</Link>
        </Button>
      ) : null}
    </form>
  );
}
