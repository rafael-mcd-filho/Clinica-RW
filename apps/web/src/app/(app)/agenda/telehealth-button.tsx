"use client";

import { useState, useTransition } from "react";
import { Copy, VideoCamera, WhatsappLogo } from "@phosphor-icons/react";
import { toast } from "sonner";
import { getTelehealthLink, type TelehealthLinkResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

function whatsappHref(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const international =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}

/**
 * Raio-X E14: sala de vídeo da teleconsulta, com convite pronto para o
 * paciente (link e aviso de consentimento da Resolução CFM 2.314/2022).
 */
export function TelehealthButton({
  appointmentId,
  patientPhone,
}: {
  appointmentId: string;
  patientPhone: string | null;
}) {
  const [result, setResult] = useState<TelehealthLinkResult | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      setResult(await getTelehealthLink(appointmentId));
    });
  }

  async function copyInvite() {
    if (!result?.patientMessage) return;
    try {
      await navigator.clipboard.writeText(result.patientMessage);
      toast.success("Convite copiado.");
    } catch {
      toast.error("Não foi possível copiar o convite.");
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={open}
      >
        <VideoCamera className="size-4" aria-hidden="true" />
        Teleconsulta
      </Button>
      <Modal
        open={result !== null}
        onClose={() => setResult(null)}
        title="Teleconsulta"
        description="Sala de vídeo deste agendamento. O mesmo link vale para o profissional e para o paciente."
        className="max-w-xl"
        footer={
          result?.url ? (
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:whitespace-nowrap">
              <Button type="button" variant="secondary" onClick={copyInvite}>
                <Copy className="size-4" aria-hidden="true" />
                Copiar convite
              </Button>
              {patientPhone ? (
                <Button asChild variant="secondary">
                  <a
                    href={whatsappHref(patientPhone, result.patientMessage)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <WhatsappLogo className="size-4" aria-hidden="true" />
                    Enviar ao paciente
                  </a>
                </Button>
              ) : null}
              <Button asChild>
                <a href={result.url} target="_blank" rel="noreferrer">
                  <VideoCamera className="size-4" aria-hidden="true" />
                  Entrar na sala
                </a>
              </Button>
            </div>
          ) : null
        }
      >
        {result?.error ? (
          <p role="alert" className="text-body-sm text-foreground">
            {result.error}
          </p>
        ) : result?.url ? (
          <div className="grid gap-3 text-body-sm">
            <p className="break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-caption text-foreground">
              {result.url}
            </p>
            <p className="text-muted-foreground">
              Registre no prontuário que o atendimento foi por vídeo e que o
              paciente consentiu. O convite enviado ao paciente já traz o aviso
              de consentimento.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
