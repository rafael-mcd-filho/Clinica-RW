"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createCard, createQuickPatientFromFunil } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  PatientSearchField,
  type PatientSearchOption,
} from "@/components/patient-search-field";

type StageOption = { id: string; name: string };

export function CreateCardDialog({
  funnelId,
  stages,
  defaultStageId,
  patients,
  professionals,
  canCreatePatient,
}: {
  funnelId: string;
  stages: StageOption[];
  defaultStageId: string;
  patients: PatientSearchOption[];
  professionals: Array<{ id: string; name: string }>;
  canCreatePatient: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [stageId, setStageId] = useState(defaultStageId);
  const action = createCard.bind(null, funnelId, stageId);
  const [state, formAction, pending] = useActionState(action, {});
  const [handledState, setHandledState] = useState(state);

  if (state !== handledState) {
    setHandledState(state);
    if (state.success) setOpen(false);
  }

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      router.refresh();
    }
  }, [router, state]);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Novo card
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo card"
        description="Vincule um paciente a uma etapa deste funil."
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
              {pending ? "Criando..." : "Criar card"}
            </Button>
          </>
        }
      >
        <form id={formId} action={formAction} className="grid gap-4">
          <PatientSearchField
            patients={patients}
            canCreatePatient={canCreatePatient}
            createPatientAction={createQuickPatientFromFunil}
          />
          <label className="grid gap-2 text-sm font-medium">
            Etapa inicial
            <Select
              value={stageId}
              onValueChange={setStageId}
              aria-label="Etapa inicial"
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Profissional responsável
            <Select
              name="assigned_professional_id"
              defaultValue=""
              allowEmptyOption
              aria-label="Profissional responsável"
            >
              <option value="">Sem responsável definido</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Próxima ação
            <Input
              name="next_action"
              placeholder="Ex.: Ligar dia 22/06"
              maxLength={140}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Data da próxima ação
              <Input name="next_action_date" type="date" />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Valor (opcional)
              <Input name="value" type="number" min="0" step="0.01" />
            </label>
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
