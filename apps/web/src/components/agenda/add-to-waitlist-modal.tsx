"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  createQuickPatientFromAgenda,
  createWaitlistEntry,
  loadWaitlistFormData,
  type AgendaActionState,
} from "@/app/(app)/agenda/actions";
import { PatientSearchField } from "@/components/patient-search-field";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

const initialState: AgendaActionState = {};

/**
 * Entrada na fila de espera, um só formulário para o sistema inteiro.
 *
 * Mora aqui — e não dentro do painel do dashboard — porque o gesto acontece
 * nos dois lugares: no painel, quando alguém liga pedindo vaga; e na agenda,
 * quando a recepção procura horário, não acha e precisa anotar o paciente sem
 * sair da tela. Os catálogos chegam sob demanda, quando o modal abre.
 */
export function AddToWaitlistModal({
  canCreatePatient,
  onClose,
  onCreated,
}: {
  canCreatePatient: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [catalogs, setCatalogs] = useState<{
    procedures: Array<{ id: string; name: string }>;
    professionals: Array<{ id: string; name: string }>;
  } | null>(null);
  const [state, action, pending] = useActionState(
    createWaitlistEntry,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      onCreated?.();
      onClose();
    }
    if (state.error) toast.error(state.error);
  }, [state, onClose, onCreated]);

  useEffect(() => {
    let active = true;
    void loadWaitlistFormData().then((result) => {
      if (!active) return;
      if (!result.ok || !result.data) {
        toast.error(result.error ?? "Não foi possível carregar os catálogos.");
        onClose();
        return;
      }
      setCatalogs(result.data);
    });
    return () => {
      active = false;
    };
  }, [onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar à fila de espera"
      description="O paciente entra no fim da fila; a prioridade é a ordem de chegada."
    >
      {catalogs ? (
        <form action={action} aria-busy={pending} className="grid gap-4">
          {/* Quem liga pedindo para entrar na fila muitas vezes ainda não é
              paciente: a busca sem resultado oferece o cadastro rápido (nome +
              contato) e já devolve o paciente selecionado aqui. */}
          <PatientSearchField
            patients={[]}
            remoteSearch
            canCreatePatient={canCreatePatient}
            createPatientAction={createQuickPatientFromAgenda}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid content-start gap-2 text-body-sm font-medium">
              Procedimento (opcional)
              <Select name="procedure_id" defaultValue="" allowEmptyOption>
                <option value="">Qualquer procedimento</option>
                {catalogs.procedures.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid content-start gap-2 text-body-sm font-medium">
              Profissional (opcional)
              <Select name="professional_id" defaultValue="" allowEmptyOption>
                <option value="">Qualquer profissional</option>
                {catalogs.professionals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <label className="grid content-start gap-2 text-body-sm font-medium">
            Turno preferido
            <Select name="preferred_period" required defaultValue="any">
              <option value="any">Qualquer período</option>
              <option value="morning">Manhã</option>
              <option value="afternoon">Tarde</option>
              <option value="evening">Noite</option>
            </Select>
          </label>
          <label className="grid gap-2 text-body-sm font-medium">
            Observações
            <Textarea
              name="notes"
              maxLength={500}
              placeholder="Ex.: avisar se surgir desistência."
            />
          </label>
          {state.error ? (
            <p className="text-body-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Adicionando..." : "Adicionar à fila"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="py-6 text-center text-body-sm text-muted-foreground">
          Carregando...
        </p>
      )}
    </Modal>
  );
}
