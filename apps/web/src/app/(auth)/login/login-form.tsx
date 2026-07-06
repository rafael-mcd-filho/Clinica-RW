"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { signInWithPassword, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(
    signInWithPassword,
    initialState,
  );

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2 text-sm font-medium">
        E-mail
        <Input required name="email" type="email" autoComplete="email" />
      </label>

      <label className="grid gap-2 text-sm font-medium">
        Senha
        <Input
          required
          name="password"
          type="password"
          autoComplete="current-password"
        />
      </label>

      {state.error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        <LogIn className="size-4" aria-hidden="true" />
        {pending ? "Entrando..." : "Entrar"}
      </Button>

      <Link
        href="/esqueci-senha"
        className="text-center text-sm font-medium text-primary transition-colors duration-[var(--motion-fast)] hover:text-primary-hover"
      >
        Esqueci minha senha
      </Link>
    </form>
  );
}
