"use client";

import { useState, useTransition } from "react";
import { Broom } from "@phosphor-icons/react";
import { toast } from "sonner";
import { clearContactPhotoCache } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

// Ficava em "Meu perfil", mas é uma ferramenta da clínica (vale para toda a
// lista de atendimento), não da conta de quem está logado.
export function ContactPhotoCacheCard() {
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
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
      <div className="min-w-0 max-w-prose">
        <h2 className="font-semibold">Fotos dos contatos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          As fotos do WhatsApp ficam guardadas por uma semana para a lista de
          atendimento abrir rápido. Trocou a foto no WhatsApp e ainda aparece a
          antiga? Limpe para o sistema buscar todas de novo.
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        <Broom className="size-4" aria-hidden="true" />
        Limpar cache de fotos
      </Button>

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
