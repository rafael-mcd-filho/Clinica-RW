"use client";

import { useState, useTransition } from "react";
import { Broom, Image as ImageIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { clearContactPhotoCache } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

export function CacheCard() {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  async function clearCache() {
    const result = await clearContactPhotoCache();
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    if (result.success) toast.success(result.success);
    return true;
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex size-10 items-center justify-center rounded bg-primary-muted text-primary">
          <ImageIcon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">
            Fotos dos contatos
          </h2>
          <p className="text-sm text-muted-foreground">
            As fotos do WhatsApp são guardadas por uma semana para a lista de
            atendimento abrir rápido.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="max-w-prose text-sm text-muted-foreground">
          Trocou a foto no WhatsApp e ainda aparece a antiga? Limpar faz o
          sistema buscar todas de novo na próxima vez que a lista for aberta.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          <Broom className="size-4" aria-hidden="true" />
          Limpar cache de fotos
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Limpar cache de fotos?"
        description="As fotos serão buscadas de novo no WhatsApp na próxima vez que a lista de atendimento for aberta. Nenhuma conversa ou contato é afetado."
        confirmLabel="Limpar cache"
        pendingLabel="Limpando..."
        pending={pending}
        onConfirm={() =>
          new Promise<boolean>((resolve) => {
            startTransition(async () => {
              resolve(await clearCache());
            });
          })
        }
      />
    </section>
  );
}
