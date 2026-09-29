"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Plus, Stethoscope } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  startClinicalEncounter,
  type ClinicalActionState,
} from "../../prontuario/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { Modal } from "@/components/ui/modal";

export type EncounterProfessionalOption = { id: string; name: string };
export type EncounterTemplateOption = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  versionId: string;
  versionNumber: number;
};
export type EncounterAppointmentOption = {
  id: string;
  professionalId: string;
  label: string;
};

const initialState: ClinicalActionState = {};

export function PatientStartEncounterButton({
  patientId,
  patientName,
  professionals,
  templates,
  appointments = [],
  label = "Iniciar atendimento",
  icon = "stethoscope",
  className = "w-full",
}: {
  patientId: string;
  patientName: string;
  professionals: EncounterProfessionalOption[];
  templates: EncounterTemplateOption[];
  appointments?: EncounterAppointmentOption[];
  label?: string;
  icon?: "stethoscope" | "plus";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = icon === "plus" ? Plus : Stethoscope;

  return (
    <>
      <Button type="button" className={className} onClick={() => setOpen(true)}>
        <Icon
          className="size-4"
          weight={icon === "plus" ? "bold" : undefined}
          aria-hidden="true"
        />
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Iniciar atendimento"
        description={`Abra um prontuário clínico para ${patientName}.`}
      >
        <PatientStartEncounterForm
          patientId={patientId}
          professionals={professionals}
          templates={templates}
          appointments={appointments}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

export function PatientStartEncounterForm({
  patientId,
  professionals,
  templates,
  appointments = [],
  appointmentId,
  professionalId,
  submitLabel = "Iniciar atendimento",
  onCancel,
}: {
  patientId: string;
  professionals: EncounterProfessionalOption[];
  templates: EncounterTemplateOption[];
  appointments?: EncounterAppointmentOption[];
  appointmentId?: string;
  professionalId?: string;
  submitLabel?: string;
  onCancel?: () => void;
}) {
  const defaultTemplate =
    templates.find((template) => template.isDefault) ?? templates[0];
  const defaultProfessional =
    professionals.find((professional) => professional.id === professionalId) ??
    professionals[0];
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(
    appointmentId ?? "",
  );
  const [selectedProfessionalId, setSelectedProfessionalId] = useState(
    professionalId ?? defaultProfessional?.id ?? "",
  );
  const [selectedTemplateVersionId, setSelectedTemplateVersionId] = useState(
    defaultTemplate?.versionId ?? "",
  );
  const selectedAppointment = useMemo(
    () =>
      appointments.find(
        (appointment) => appointment.id === selectedAppointmentId,
      ),
    [appointments, selectedAppointmentId],
  );
  const resolvedProfessionalId =
    professionalId ??
    selectedAppointment?.professionalId ??
    selectedProfessionalId;
  const selectedTemplate = templates.find(
    (template) => template.versionId === selectedTemplateVersionId,
  );
  const [state, action, pending] = useActionState(
    startClinicalEncounter,
    initialState,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  const ready = Boolean(resolvedProfessionalId && selectedTemplate);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="from" value="paciente" />

      {!appointmentId && appointments.length ? (
        <label className="grid gap-2 text-label font-medium">
          Agendamento relacionado
          <Select
            name="appointment_id"
            value={selectedAppointmentId}
            onValueChange={setSelectedAppointmentId}
            disabled={pending}
          >
            <option value="">Sem agendamento</option>
            {appointments.map((appointment) => (
              <option key={appointment.id} value={appointment.id}>
                {appointment.label}
              </option>
            ))}
          </Select>
          <span className="text-xs font-normal text-muted-foreground">
            Sem agendamento cria somente o registro clínico desta consulta.
          </span>
        </label>
      ) : (
        <input
          type="hidden"
          name="appointment_id"
          value={appointmentId ?? ""}
        />
      )}

      <label className="grid gap-2 text-label font-medium">
        Profissional responsável
        <Select
          name="professional_id"
          value={resolvedProfessionalId ?? ""}
          disabled={pending || Boolean(professionalId || selectedAppointment)}
          onValueChange={setSelectedProfessionalId}
          required
        >
          {!professionals.length ? (
            <option value="">Nenhum profissional disponível</option>
          ) : null}
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.name}
            </option>
          ))}
        </Select>
        {(professionalId || selectedAppointment) && resolvedProfessionalId ? (
          <input
            type="hidden"
            name="professional_id"
            value={resolvedProfessionalId}
          />
        ) : null}
        {!professionals.length ? (
          <span className="text-xs font-normal text-destructive">
            Cadastre e ative um profissional antes de iniciar.
          </span>
        ) : null}
      </label>

      <label className="grid gap-2 text-label font-medium">
        Ficha clínica
        <Select
          name="template_version_id"
          value={selectedTemplateVersionId}
          onValueChange={setSelectedTemplateVersionId}
          disabled={pending}
          required
        >
          {!templates.length ? (
            <option value="">Nenhuma ficha clínica ativa</option>
          ) : null}
          {templates.map((template) => (
            <option key={template.versionId} value={template.versionId}>
              {template.name}
            </option>
          ))}
        </Select>
        {selectedTemplate?.description ? (
          <span className="text-xs font-normal text-muted-foreground">
            {selectedTemplate.description}
          </span>
        ) : null}
        {!templates.length ? (
          <span className="text-xs font-normal text-destructive">
            Ative uma ficha clínica nas configurações para iniciar.
          </span>
        ) : null}
      </label>

      <FormError message={state.error} />

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onCancel}
          >
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={pending || !ready}>
          <Stethoscope className="size-4" aria-hidden="true" />
          {pending ? "Abrindo atendimento..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
