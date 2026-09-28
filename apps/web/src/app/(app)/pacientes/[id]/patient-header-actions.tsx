"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowCounterClockwise,
  CalendarPlus,
  CaretDown,
  ChatCircleText,
  HeartBreak,
  PencilSimpleLine,
  Tag,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { setPatientArchived } from "../actions";
import { usePatientScheduler } from "./patient-schedule-button";
import {
  PatientStartEncounterButton,
  type EncounterAppointmentOption,
  type EncounterProfessionalOption,
  type EncounterTemplateOption,
} from "./patient-start-encounter";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * Canto direito do cabeçalho da ficha: "Ações" reúne o que se faz com o
 * paciente (editar, agendar, conversar, arquivar) e "Novo atendimento" abre
 * o prontuário. Cada item só aparece para quem tem a permissão.
 */
export function PatientHeaderActions({
  archived,
  canArchive,
  canEdit,
  canEditLifeStatus,
  canSchedule,
  canStartEncounter,
  conversationHref,
  deceased,
  encounterAppointments,
  encounterProfessionals,
  encounterTemplates,
  patientId,
  patientName,
}: {
  archived: boolean;
  canArchive: boolean;
  canEdit: boolean;
  canEditLifeStatus: boolean;
  canSchedule: boolean;
  canStartEncounter: boolean;
  conversationHref: string | null;
  deceased: boolean;
  encounterAppointments: EncounterAppointmentOption[];
  encounterProfessionals: EncounterProfessionalOption[];
  encounterTemplates: EncounterTemplateOption[];
  patientId: string;
  patientName: string;
}) {
  const router = useRouter();
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const scheduler = usePatientScheduler({ patientId, patientName });
  const hasMenu =
    canEdit || canSchedule || Boolean(conversationHref) || canArchive;

  async function toggleArchived(next: boolean) {
    await setPatientArchived(patientId, next);
    toast.success(next ? "Paciente arquivado." : "Paciente reativado.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasMenu ? (
        <DropdownMenu
          trigger={
            <>
              Ações
              <CaretDown
                className="size-3.5"
                weight="bold"
                aria-hidden="true"
              />
            </>
          }
          triggerLabel="Ações do paciente"
          triggerClassName="h-10 w-auto gap-2 px-4 text-body-sm font-medium text-foreground"
        >
          {(close) => (
            <>
              {canEdit ? (
                <DropdownMenuItem
                  icon={PencilSimpleLine}
                  onSelect={() => {
                    close();
                    router.push(`/pacientes/${patientId}/editar`);
                  }}
                >
                  Editar paciente
                </DropdownMenuItem>
              ) : null}
              {canSchedule ? (
                <DropdownMenuItem
                  icon={CalendarPlus}
                  onSelect={() => {
                    close();
                    void scheduler.openScheduler();
                  }}
                >
                  Agendar consulta
                </DropdownMenuItem>
              ) : null}
              {conversationHref ? (
                <DropdownMenuItem
                  icon={ChatCircleText}
                  onSelect={() => {
                    close();
                    router.push(conversationHref);
                  }}
                >
                  Abrir conversa
                </DropdownMenuItem>
              ) : null}
              {canEdit ? (
                <DropdownMenuItem
                  icon={Tag}
                  onSelect={() => {
                    close();
                    router.push(
                      `/pacientes/${patientId}/editar?section=configuracoes`,
                    );
                  }}
                >
                  Tags e consentimentos
                </DropdownMenuItem>
              ) : null}
              {canEditLifeStatus || canArchive ? (
                <DropdownMenuSeparator />
              ) : null}
              {canEditLifeStatus ? (
                <DropdownMenuItem
                  icon={HeartBreak}
                  onSelect={() => {
                    close();
                    router.push(
                      `/pacientes/${patientId}/editar?section=configuracoes`,
                    );
                  }}
                >
                  {deceased ? "Revisar registro de óbito" : "Registrar óbito"}
                </DropdownMenuItem>
              ) : null}
              {canArchive ? (
                archived ? (
                  <DropdownMenuItem
                    icon={ArrowCounterClockwise}
                    onSelect={() => {
                      close();
                      void toggleArchived(false);
                    }}
                  >
                    Reativar paciente
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    icon={Archive}
                    variant="destructive"
                    onSelect={() => {
                      close();
                      setConfirmingArchive(true);
                    }}
                  >
                    Arquivar paciente
                  </DropdownMenuItem>
                )
              ) : null}
            </>
          )}
        </DropdownMenu>
      ) : null}

      {canStartEncounter ? (
        <PatientStartEncounterButton
          patientId={patientId}
          patientName={patientName}
          professionals={encounterProfessionals}
          templates={encounterTemplates}
          appointments={encounterAppointments}
          label="Novo atendimento"
          icon="plus"
          className="h-10 px-4"
        />
      ) : null}

      {scheduler.modal}

      <ConfirmDialog
        open={confirmingArchive}
        onClose={() => setConfirmingArchive(false)}
        title="Arquivar paciente?"
        description={`${patientName} sai da lista de pacientes ativos. O histórico é mantido e você pode reativar quando quiser.`}
        confirmLabel="Arquivar paciente"
        destructive
        onConfirm={() => toggleArchived(true)}
      />
    </div>
  );
}
