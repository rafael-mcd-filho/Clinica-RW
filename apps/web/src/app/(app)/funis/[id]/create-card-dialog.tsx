"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import { createCard, createQuickPatientFromFunil } from "../actions";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PatientSearchField } from "@/components/patient-search-field";

type StageOption = { id: string; name: string };

export function CreateCardDialog({
  funnelId,
  stages,
  defaultStageId,
  professionals,
  canCreatePatient,
}: {
  funnelId: string;
  stages: StageOption[];
  defaultStageId: string;
  professionals: Array<{ id: string; name: string }>;
  canCreatePatient: boolean;
}) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [stageId, setStageId] = useState(defaultStageId);
  const action = createCard.bind(null, funnelId, stageId);
  const [state, formAction, pending] = useActionState(action, {});

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      const timer = window.setTimeout(() => setOpen(false), 0);
      return () => window.clearTimeout(timer);
    }
  }, [state]);

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
            patients={[]}
            remoteSearch
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
              <DatePickerInput
                name="next_action_date"
                ariaLabel="Data da próxima ação"
              />
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
