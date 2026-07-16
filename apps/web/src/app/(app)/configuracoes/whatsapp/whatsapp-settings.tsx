"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import {
  CircleNotch as Loader2,
  SignOut as LogOut,
  ChatCircle as MessageCircle,
  Broadcast as Radio,
  ArrowsClockwise as RefreshCw,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  testWhatsAppConnection,
  type WhatsAppActionState,
} from "./actions";

type Props = {
  initial: {
    status: string;
    phoneNumber: string | null;
    displayName: string | null;
    profilePictureUrl: string | null;
    platformConfigured: boolean;
  };
};

const statusLabels: Record<string, string> = {
  connected: "Conectado",
  open: "Conectado",
  connecting: "Conectando",
  disconnected: "Desconectado",
  close: "Desconectado",
  error: "Erro na conexão",
  refused: "Conexão recusada",
  unknown: "Estado desconhecido",
};

export function WhatsAppSettings({ initial }: Props) {
  const [connection, setConnection] = useState<WhatsAppActionState>({
    state: initial.status,
    phoneNumber: initial.phoneNumber,
    displayName: initial.displayName,
    profilePictureUrl: initial.profilePictureUrl,
  });
  const [pending, startTransition] = useTransition();
  const state = connection.state ?? initial.status;
  const connected = state === "connected" || state === "open";
  const connecting = state === "connecting";

  function run(action: () => Promise<WhatsAppActionState>) {
    startTransition(async () => {
      const result = await action();
      setConnection((current) => ({ ...current, ...result }));
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }

  useEffect(() => {
    if (!connecting) return;
    const timer = window.setInterval(async () => {
      const result = await testWhatsAppConnection();
      if (!result.error)
        setConnection((current) => ({ ...current, ...result }));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [connecting]);

  const qrSource = connection.qrBase64
    ? connection.qrBase64.startsWith("data:")
      ? connection.qrBase64
      : `data:image/png;base64,${connection.qrBase64}`
    : null;
  const profilePicture =
    connection.profilePictureUrl ?? initial.profilePictureUrl;
  const displayName = connection.displayName ?? initial.displayName;
  const phoneNumber = connection.phoneNumber ?? initial.phoneNumber;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-50 text-emerald-700">
            {profilePicture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profilePicture}
                alt="Foto do perfil do WhatsApp"
                className="size-full object-cover"
              />
            ) : (
              <MessageCircle className="size-7" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Conexão do WhatsApp</h2>
              <span
                className={`size-2.5 rounded-full ${
                  connected
                    ? "bg-emerald-500"
                    : connecting
                      ? "animate-pulse bg-amber-500"
                      : "bg-slate-400"
                }`}
                aria-hidden="true"
              />
              <span className="text-sm font-medium">
                {statusLabels[state] ?? state}
              </span>
            </div>
            {connected ? (
              <div className="mt-2 grid gap-0.5 text-sm">
                <span className="font-medium">
                  {displayName ?? "Conta do WhatsApp"}
                </span>
                <span className="text-muted-foreground">
                  {formatPhone(phoneNumber)}
                </span>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {connecting
                  ? "Leia o QR Code abaixo. O status será atualizado automaticamente."
                  : "Conecte um número para habilitar o canal de atendimento."}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(connected || connecting) && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => run(testWhatsAppConnection)}
            >
              <RefreshCw
                className={pending ? "size-4 animate-spin" : "size-4"}
                aria-hidden="true"
              />
              Testar conexão
            </Button>
          )}
          {connected ? (
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run(disconnectWhatsApp)}
            >
              <LogOut className="size-4" aria-hidden="true" />
              Desconectar
            </Button>
          ) : !connecting ? (
            <Button
              disabled={!initial.platformConfigured || pending}
              onClick={() => run(connectWhatsApp)}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Radio className="size-4" aria-hidden="true" />
              )}
              Conectar WhatsApp
            </Button>
          ) : null}
        </div>
      </div>

      {!initial.platformConfigured ? (
        <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          A integração ainda precisa ser configurada pelo Super Admin.
        </p>
      ) : null}

      {qrSource && connecting ? (
        <div className="mt-6 grid justify-items-center gap-3 rounded-lg border border-border bg-white p-5 text-slate-900">
          <Image
            unoptimized
            width={256}
            height={256}
            src={qrSource}
            alt="QR Code para conectar o WhatsApp"
            className="size-64"
          />
          <span className="text-center text-sm">
            WhatsApp → Aparelhos conectados → Conectar aparelho
          </span>
        </div>
      ) : null}

      {connection.pairingCode && connecting ? (
        <div className="mt-4 rounded-lg border border-border p-4 text-center">
          <span className="text-sm text-muted-foreground">
            Código de pareamento
          </span>
          <div className="mt-1 text-2xl font-semibold tracking-widest">
            {connection.pairingCode}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatPhone(phone: string | null) {
  if (!phone) return "Número não informado pela Evolution";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone;
}
