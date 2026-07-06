"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createStage, deleteStage, updateStage } from "../actions";
import { defaultStageColor } from "@/lib/colors";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

type StageRow = {
  id: string;
  name: string;
  color: string;
  position: number;
  stage_type: "initial" | "intermediate" | "success" | "failure";
  wip_limit: number | null;
};

const stageTypeLabel: Record<StageRow["stage_type"], string> = {
  initial: "Inicial",
  intermediate: "Intermediária",
  success: "Sucesso",
  failure: "Falha",
};

export function StageSettingsDialog({
  funnelId,
  stages,
}: {
  funnelId: string;
  stages: StageRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Settings className="size-4" aria-hidden="true" />
        Etapas
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Etapas do funil"
        description="Adicione, edite ou remova as colunas deste quadro."
        className="max-w-xl"
      >
        <div className="grid gap-3">
          {stages
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((stage) => (
              <StageRow key={stage.id} funnelId={funnelId} stage={stage} />
            ))}
          <NewStageForm funnelId={funnelId} />
        </div>
      </Modal>
    </>
  );
}

function StageRow({ funnelId, stage }: { funnelId: string; stage: StageRow }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    updateStage.bind(null, stage.id),
    {},
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    }
    if (state.error) toast.error(state.error);
  }, [router, state]);

  async function handleDelete() {
    const result = await deleteStage(funnelId, stage.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.success);
    router.refresh();
  }

  return (
    <form
      action={action}
      className="grid grid-cols-[auto_minmax(0,1fr)_9rem_6rem_auto] items-center gap-2 rounded-md border border-border p-2"
    >
      <input
        type="color"
        name="color"
        defaultValue={stage.color}
        className="size-8 shrink-0 cursor-pointer rounded border border-border"
        aria-label="Cor da etapa"
      />
      <Input name="name" defaultValue={stage.name} required />
      <Select
        name="stage_type"
        defaultValue={stage.stage_type}
        aria-label="Tipo da etapa"
      >
        {Object.entries(stageTypeLabel).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Input
        name="wip_limit"
        type="number"
        min="1"
        placeholder="Limite"
        defaultValue={stage.wip_limit ?? ""}
      />
      <div className="flex items-center gap-1 justify-self-end">
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          {pending ? "..." : "Salvar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Excluir etapa"
          onClick={handleDelete}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}

function NewStageForm({ funnelId }: { funnelId: string }) {
  const router = useRouter();
  const formId = useId();
  const [state, action, pending] = useActionState(
    createStage.bind(null, funnelId),
    {},
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
      const form = document.getElementById(formId) as HTMLFormElement | null;
      form?.reset();
    }
    if (state.error) toast.error(state.error);
  }, [formId, router, state]);

  return (
    <form
      id={formId}
      action={action}
      className="grid grid-cols-[auto_minmax(0,1fr)_9rem_6rem_auto] items-center gap-2 rounded-md border border-dashed border-border p-2"
    >
      <input
        type="color"
        name="color"
        defaultValue={defaultStageColor}
        className="size-8 shrink-0 cursor-pointer rounded border border-border"
        aria-label="Cor da nova etapa"
      />
      <Input name="name" placeholder="Nova etapa" required />
      <Select
        name="stage_type"
        defaultValue="intermediate"
        aria-label="Tipo da nova etapa"
      >
        {Object.entries(stageTypeLabel).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Input name="wip_limit" type="number" min="1" placeholder="Limite" />
      <Button
        type="submit"
        size="icon"
        disabled={pending}
        aria-label="Adicionar etapa"
      >
        <Plus className="size-4" aria-hidden="true" />
      </Button>
    </form>
  );
}
