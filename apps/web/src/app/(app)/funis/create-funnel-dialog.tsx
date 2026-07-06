"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createFunnel } from "./actions";
import { categoricalColors, defaultStageColor } from "@/lib/colors";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

type StageDraft = {
  key: string;
  name: string;
  color: string;
  stage_type: "initial" | "intermediate" | "success" | "failure";
  wip_limit: string;
};

type Template = {
  key: string;
  label: string;
  stages: Array<Omit<StageDraft, "key" | "wip_limit">>;
};

const templates: Template[] = [
  {
    key: "comercial",
    label: "Funil Comercial",
    stages: [
      { name: "Lead", color: categoricalColors.slate, stage_type: "initial" },
      {
        name: "Tentativa de contato",
        color: categoricalColors.amber,
        stage_type: "intermediate",
      },
      {
        name: "Contato realizado",
        color: categoricalColors.blue,
        stage_type: "intermediate",
      },
      {
        name: "Agendamento marcado",
        color: categoricalColors.indigo,
        stage_type: "intermediate",
      },
      { name: "Compareceu", color: categoricalColors.violet, stage_type: "intermediate" },
      { name: "Cliente ativo", color: categoricalColors.green, stage_type: "success" },
      { name: "Perdido", color: categoricalColors.red, stage_type: "failure" },
    ],
  },
  {
    key: "pre-consulta",
    label: "Pré-consulta",
    stages: [
      { name: "Cadastrado", color: categoricalColors.slate, stage_type: "initial" },
      {
        name: "Documentação enviada",
        color: categoricalColors.blue,
        stage_type: "intermediate",
      },
      {
        name: "Pagamento confirmado",
        color: categoricalColors.indigo,
        stage_type: "intermediate",
      },
      {
        name: "Confirmado para consulta",
        color: categoricalColors.green,
        stage_type: "success",
      },
    ],
  },
  {
    key: "pos-consulta",
    label: "Pós-consulta",
    stages: [
      { name: "Aguardando NPS", color: categoricalColors.slate, stage_type: "initial" },
      { name: "NPS respondido", color: categoricalColors.blue, stage_type: "intermediate" },
      {
        name: "Retorno agendado",
        color: categoricalColors.indigo,
        stage_type: "intermediate",
      },
      {
        name: "Tratamento em curso",
        color: categoricalColors.violet,
        stage_type: "intermediate",
      },
      { name: "Alta clínica", color: categoricalColors.green, stage_type: "success" },
    ],
  },
  {
    key: "tratamento",
    label: "Tratamento contínuo",
    stages: [
      { name: "Avaliação inicial", color: categoricalColors.slate, stage_type: "initial" },
      { name: "Plano aceito", color: categoricalColors.blue, stage_type: "intermediate" },
      { name: "Em tratamento", color: categoricalColors.violet, stage_type: "intermediate" },
      { name: "Manutenção", color: categoricalColors.indigo, stage_type: "intermediate" },
      { name: "Alta", color: categoricalColors.green, stage_type: "success" },
    ],
  },
  {
    key: "recuperacao",
    label: "Recuperação de inativos",
    stages: [
      { name: "Inativo identificado", color: categoricalColors.slate, stage_type: "initial" },
      { name: "Tentativa 1", color: categoricalColors.amber, stage_type: "intermediate" },
      { name: "Tentativa 2", color: categoricalColors.pink, stage_type: "intermediate" },
      { name: "Retornou", color: categoricalColors.green, stage_type: "success" },
      { name: "Não retornou", color: categoricalColors.red, stage_type: "failure" },
    ],
  },
];

const stageTypeLabel: Record<StageDraft["stage_type"], string> = {
  initial: "Inicial",
  intermediate: "Intermediária",
  success: "Sucesso",
  failure: "Falha",
};

function blankStage(): StageDraft {
  return {
    key: crypto.randomUUID(),
    name: "",
    color: defaultStageColor,
    stage_type: "intermediate",
    wip_limit: "",
  };
}

export function CreateFunnelDialog() {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [stages, setStages] = useState<StageDraft[]>([
    { ...blankStage(), name: "Novo", stage_type: "initial" },
  ]);
  const [state, action, pending] = useActionState(createFunnel, {});
  const [handledState, setHandledState] = useState(state);

  if (state !== handledState) {
    setHandledState(state);
    if (state.success) {
      setOpen(false);
      setStages([{ ...blankStage(), name: "Novo", stage_type: "initial" }]);
    }
  }

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    }
  }, [router, state]);

  function applyTemplate(templateKey: string) {
    const template = templates.find((item) => item.key === templateKey);
    if (!template) return;
    setStages(
      template.stages.map((stage) => ({
        ...stage,
        key: crypto.randomUUID(),
        wip_limit: "",
      })),
    );
  }

  function updateStage(key: string, patch: Partial<StageDraft>) {
    setStages((current) =>
      current.map((stage) =>
        stage.key === key ? { ...stage, ...patch } : stage,
      ),
    );
  }

  function removeStage(key: string) {
    setStages((current) =>
      current.length > 1
        ? current.filter((stage) => stage.key !== key)
        : current,
    );
  }

  const stagesPayload = JSON.stringify(
    stages
      .filter((stage) => stage.name.trim())
      .map((stage) => ({
        name: stage.name.trim(),
        color: stage.color,
        stage_type: stage.stage_type,
        wip_limit: stage.wip_limit ? Number(stage.wip_limit) : null,
      })),
  );

  return (
    <>
      <Button
        type="button"
        className="rounded-full px-5"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden="true" />
        Novo painel
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo painel"
        description="Escolha um modelo pronto ou monte as etapas do zero."
        className="max-w-2xl"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" form={formId} disabled={pending}>
              {pending ? "Criando..." : "Criar painel"}
            </Button>
          </>
        }
      >
        <form id={formId} action={action} className="grid gap-4">
          <input type="hidden" name="stages" value={stagesPayload} />
          <label className="grid gap-2 text-sm font-medium">
            Nome do painel
            <Input name="name" required placeholder="Ex.: Consultas" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Descrição
            <Textarea
              name="description"
              placeholder="Objetivo deste funil (opcional)"
            />
          </label>

          <div className="grid gap-2">
            <span className="text-sm font-medium">Modelo</span>
            <Select
              defaultValue=""
              allowEmptyOption
              onValueChange={applyTemplate}
              aria-label="Escolher modelo de funil"
            >
              <option value="">Começar do zero</option>
              {templates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Etapas</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setStages((current) => [...current, blankStage()])
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                Adicionar etapa
              </Button>
            </div>
            <div className="grid gap-2">
              {stages.map((stage) => (
                <div
                  key={stage.key}
                  className="grid grid-cols-[auto_minmax(0,1fr)_8rem_auto] items-center gap-2 rounded-md border border-border p-2"
                >
                  <input
                    type="color"
                    value={stage.color}
                    onChange={(event) =>
                      updateStage(stage.key, { color: event.target.value })
                    }
                    className="size-8 shrink-0 cursor-pointer rounded border border-border"
                    aria-label="Cor da etapa"
                  />
                  <Input
                    value={stage.name}
                    onChange={(event) =>
                      updateStage(stage.key, { name: event.target.value })
                    }
                    placeholder="Nome da etapa"
                  />
                  <Select
                    value={stage.stage_type}
                    onValueChange={(value) =>
                      updateStage(stage.key, {
                        stage_type: value as StageDraft["stage_type"],
                      })
                    }
                    aria-label="Tipo da etapa"
                  >
                    {Object.entries(stageTypeLabel).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover etapa"
                    onClick={() => removeStage(stage.key)}
                    disabled={stages.length <= 1}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
