"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, WhatsappLogo } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  getReceivablePixCharge,
  type PixChargeResult,
} from "@/app/(app)/financeiro/pix-actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { onlyDigits } from "@/lib/validation/br";

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value,
  );

function whatsappHref(phone: string, text: string) {
  const digits = onlyDigits(phone);
  const international =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}

/**
 * Raio-X FI4: QR Code e Pix copia e cola com o valor em aberto da conta. O
 * pagamento cai na conta da chave Pix; a baixa é registrada como sempre.
 */
export function PixChargeDialog({
  receivableId,
  onClose,
}: {
  receivableId: string;
  onClose: () => void;
}) {
  const [result, setResult] = useState<PixChargeResult | null>(null);

  useEffect(() => {
    let current = true;
    getReceivablePixCharge(receivableId)
      .then((loaded) => {
        if (current) setResult(loaded);
      })
      .catch(() => {
        if (current)
          setResult({
            error: "Não foi possível gerar o Pix. Tente novamente.",
          });
      });
    return () => {
      current = false;
    };
  }, [receivableId]);

  const charge = result?.data;
  const message = charge
    ? `Olá${charge.patientFirstName ? `, ${charge.patientFirstName}` : ""}! Segue o Pix de ${money(charge.amount)} para ${charge.receiver}. Copie o código abaixo e cole na opção "Pix copia e cola" do app do seu banco:\n\n${charge.payload}`
    : "";

  async function copyPayload() {
    if (!charge) return;
    try {
      await navigator.clipboard.writeText(charge.payload);
      toast.success("Código Pix copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o código e copie.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Cobrar por Pix"
      description={
        charge
          ? `${money(charge.amount)} · ${charge.description}`
          : "QR Code e Pix copia e cola com o valor em aberto."
      }
      className="max-w-lg"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          {charge?.patientWhatsapp ? (
            <Button asChild variant="secondary">
              <a
                href={whatsappHref(charge.patientWhatsapp, message)}
                target="_blank"
                rel="noreferrer"
              >
                <WhatsappLogo className="size-4" aria-hidden="true" />
                Enviar pelo WhatsApp
              </a>
            </Button>
          ) : null}
          {charge ? (
            <Button onClick={copyPayload}>
              <Copy className="size-4" aria-hidden="true" />
              Copiar código
            </Button>
          ) : null}
        </div>
      }
    >
      {!result ? (
        <p role="status" className="py-6 text-body-sm text-muted-foreground">
          Gerando o Pix...
        </p>
      ) : result.error ? (
        <div className="grid gap-3 py-2">
          <p role="alert" className="text-body-sm text-foreground">
            {result.error}
          </p>
          {result.reason === "no_key" ? (
            <Button asChild variant="secondary" className="justify-self-start">
              <Link href="/configuracoes/cadastros?section=convenios">
                Cadastrar chave Pix
              </Link>
            </Button>
          ) : null}
        </div>
      ) : charge ? (
        <div className="grid justify-items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado no servidor como data URL */}
          <img
            src={charge.qrDataUrl}
            alt={`QR Code Pix de ${money(charge.amount)}`}
            width={240}
            height={240}
            className="rounded-md border border-border bg-white p-2"
          />
          <dl className="grid w-full gap-1 text-body-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Recebedor</dt>
              <dd className="text-right font-medium">{charge.receiver}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Chave</dt>
              <dd className="text-right">{charge.keyLabel}</dd>
            </div>
          </dl>
          <label className="grid w-full gap-1.5 text-label font-medium">
            Pix copia e cola
            <textarea
              readOnly
              value={charge.payload}
              rows={4}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full resize-none rounded-md border border-border bg-muted px-3 py-2 font-mono text-caption break-all text-foreground"
            />
          </label>
          <p className="text-caption text-muted-foreground">
            Quando o pagamento cair na conta, registre o recebimento nesta conta
            para dar a baixa.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
