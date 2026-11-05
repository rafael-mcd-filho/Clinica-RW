"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { ConfirmDialog } from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Enrollment = { factorId: string; qrCode: string; secret: string };

/**
 * Verificação em duas etapas por aplicativo autenticador (Raio-X S9).
 * Ativada, o login pede o código do aplicativo depois da senha.
 */
export function MfaSection({ readOnly }: { readOnly: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [activeFactorId, setActiveFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp.find((factor) => factor.status === "verified");
    setActiveFactorId(verified?.id ?? null);
    setLoaded(true);
  }

  useEffect(() => {
    let cancelled = false;
    createSupabaseBrowserClient()
      .auth.mfa.listFactors()
      .then(({ data }) => {
        if (cancelled) return;
        const verified = data?.totp.find(
          (factor) => factor.status === "verified",
        );
        setActiveFactorId(verified?.id ?? null);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function startEnrollment() {
    setError(undefined);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      // Fatores não confirmados de tentativas anteriores impedem um novo.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const factor of existing?.all ?? []) {
        if (factor.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Aplicativo autenticador",
      });
      if (enrollError || !data) {
        setError("Não foi possível iniciar agora. Tente de novo em instantes.");
        return;
      }
      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    });
  }

  function confirmEnrollment() {
    if (!enrollment) return;
    setError(undefined);
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify(
        { factorId: enrollment.factorId, code: code.replace(/\D/g, "") },
      );
      if (verifyError) {
        setError("Código inválido. Use o código que aparece agora no app.");
        return;
      }
      setEnrollment(null);
      setCode("");
      toast.success("Verificação em duas etapas ativada.");
      await refresh();
    });
  }

  function disable() {
    if (!activeFactorId) return false;
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const supabase = createSupabaseBrowserClient();
        const { error: removeError } = await supabase.auth.mfa.unenroll({
          factorId: activeFactorId,
        });
        if (removeError) {
          setError(
            "Para desativar, entre de novo confirmando o código do aplicativo.",
          );
          resolve(false);
          return;
        }
        toast.success("Verificação em duas etapas desativada.");
        await refresh();
        resolve(true);
      });
    });
  }

  if (!loaded) {
    return <p className="text-body-sm text-muted-foreground">Carregando…</p>;
  }

  if (activeFactorId) {
    return (
      <div className="grid gap-3">
        <p className="text-body-sm text-foreground">
          Ativada. Ao entrar, o sistema pede o código do aplicativo depois da
          senha.
        </p>
        <FormError message={error} />
        {!readOnly ? (
          <div>
            <Button
              type="button"
              variant="destructive-ghost"
              onClick={() => setConfirmingDisable(true)}
            >
              Desativar
            </Button>
          </div>
        ) : null}
        <ConfirmDialog
          open={confirmingDisable}
          onClose={() => setConfirmingDisable(false)}
          title="Desativar a verificação em duas etapas?"
          description="A conta volta a depender só da senha."
          confirmLabel="Desativar"
          destructive
          onConfirm={disable}
        />
      </div>
    );
  }

  if (enrollment) {
    return (
      <div className="grid gap-4">
        <ol className="grid list-decimal gap-1 pl-5 text-body-sm text-secondary-foreground">
          <li>
            Abra um aplicativo autenticador (Google Authenticator, Microsoft
            Authenticator, 1Password…).
          </li>
          <li>Leia o QR code abaixo ou digite a chave.</li>
          <li>Informe o código de 6 dígitos que aparecer.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-4">
          <Image
            unoptimized
            src={enrollment.qrCode}
            alt="QR code para o aplicativo autenticador"
            width={168}
            height={168}
            className="rounded-md border border-border bg-card p-2"
          />
          <p className="min-w-0 break-all text-caption text-muted-foreground">
            Chave:{" "}
            <span className="font-mono text-foreground">
              {enrollment.secret}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            aria-label="Código do aplicativo"
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="w-36 tabular-nums"
          />
          <Button
            type="button"
            disabled={pending || code.replace(/\D/g, "").length !== 6}
            onClick={confirmEnrollment}
          >
            {pending ? "Conferindo..." : "Confirmar e ativar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setEnrollment(null);
              setCode("");
            }}
          >
            Cancelar
          </Button>
        </div>
        <FormError message={error} />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-body-sm text-secondary-foreground">
        Além da senha, o login pede um código do seu celular. Recomendado para
        quem administra a clínica ou acessa prontuários.
      </p>
      <FormError message={error} />
      {!readOnly ? (
        <div>
          <Button type="button" disabled={pending} onClick={startEnrollment}>
            {pending ? "Preparando..." : "Ativar verificação em duas etapas"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
