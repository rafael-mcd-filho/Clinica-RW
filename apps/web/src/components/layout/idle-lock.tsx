"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { LockSimple } from "@phosphor-icons/react";
import { signOut } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { verifyOwnPassword } from "@/lib/auth/session-lock-actions";

const activityKey = "hi-clinic:last-activity";
const activityEvents = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "mousemove",
] as const;

function lockMinutes() {
  const configured = Number(process.env.NEXT_PUBLIC_IDLE_LOCK_MINUTES ?? "15");
  return Number.isFinite(configured) && configured >= 0 ? configured : 15;
}

function readLastActivity() {
  try {
    return Number(window.localStorage.getItem(activityKey) ?? "0") || 0;
  } catch {
    return 0;
  }
}

/**
 * Bloqueio por inatividade (Raio-X S9): recepção e consultório usam
 * computadores compartilhados. Depois de N minutos sem uso em nenhuma aba
 * (padrão 15, NEXT_PUBLIC_IDLE_LOCK_MINUTES; 0 desliga) a tela é coberta e
 * pede a senha. Parado o dobro do tempo, a sessão é encerrada.
 */
export function IdleLock({ userName }: { userName: string }) {
  const minutes = lockMinutes();
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const lastLocalWrite = useRef(0);

  useEffect(() => {
    if (!minutes) return;
    const lockAfter = minutes * 60_000;

    function markActivity() {
      if (locked) return;
      const now = Date.now();
      // Uma escrita a cada 15 s basta e não pesa no mousemove.
      if (now - lastLocalWrite.current < 15_000) return;
      lastLocalWrite.current = now;
      try {
        window.localStorage.setItem(activityKey, String(now));
      } catch {
        // Sem localStorage (modo restrito) cada aba conta sozinha.
      }
    }

    markActivity();
    for (const event of activityEvents) {
      window.addEventListener(event, markActivity, { passive: true });
    }
    const interval = window.setInterval(() => {
      const last = readLastActivity() || lastLocalWrite.current;
      const idle = Date.now() - last;
      if (idle >= lockAfter * 2) {
        void signOut();
        return;
      }
      if (idle >= lockAfter) setLocked(true);
    }, 20_000);

    return () => {
      for (const event of activityEvents) {
        window.removeEventListener(event, markActivity);
      }
      window.clearInterval(interval);
    };
  }, [locked, minutes]);

  if (!locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-lock-title"
      className="fixed inset-0 z-[100] grid place-items-center bg-background/95 p-4 backdrop-blur-xl"
    >
      <form
        className="grid w-full max-w-sm gap-4 rounded-lg border border-border bg-card p-6 shadow-[var(--shadow-lg)]"
        onSubmit={(event) => {
          event.preventDefault();
          setError(undefined);
          startTransition(async () => {
            const result = await verifyOwnPassword(password);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            try {
              window.localStorage.setItem(activityKey, String(Date.now()));
            } catch {
              // ignora
            }
            setPassword("");
            setLocked(false);
          });
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary-muted text-primary">
            <LockSimple className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="idle-lock-title" className="text-heading-sm font-semibold">
              Tela bloqueada
            </h2>
            <p className="text-body-sm text-muted-foreground">
              {minutes} minutos sem uso. Entre com a senha de {userName}.
            </p>
          </div>
        </div>
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          aria-label="Senha"
          placeholder="Senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(error)}
        />
        {error ? (
          <p role="alert" className="text-body-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => void signOut()}>
            Sair e trocar de usuário
          </Button>
          <Button type="submit" disabled={pending || !password}>
            {pending ? "Conferindo..." : "Desbloquear"}
          </Button>
        </div>
      </form>
    </div>
  );
}
