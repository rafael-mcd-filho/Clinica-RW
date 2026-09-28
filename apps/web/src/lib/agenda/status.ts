export const appointmentStatusLabels: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  waiting: "Aguardando",
  in_progress: "Em atendimento",
  attended: "Atendido",
  no_show: "Faltou",
  cancelled: "Cancelado",
};

export const appointmentStatusDescriptions: Record<string, string> = {
  scheduled: "O agendamento foi criado e aguarda confirmação.",
  confirmed:
    "A presença foi confirmada. Faça o check-in quando o paciente chegar.",
  waiting: "O paciente fez check-in e aguarda o início do atendimento.",
  in_progress: "O atendimento está em andamento.",
  attended: "O atendimento foi concluído.",
  no_show: "O paciente não compareceu ao atendimento.",
  cancelled: "O agendamento foi cancelado e o horário foi liberado.",
};

// Espelha o gatilho register_appointment_status_change do banco.
const transitions: Record<string, readonly string[]> = {
  scheduled: ["confirmed", "waiting", "no_show", "cancelled"],
  confirmed: ["waiting", "no_show", "cancelled"],
  waiting: ["in_progress", "no_show", "cancelled"],
  in_progress: ["attended", "cancelled"],
};

export function availableAppointmentStatuses(
  status: string,
  options: {
    startThroughEncounter?: boolean;
    finishThroughEncounter?: boolean;
  } = {},
) {
  return (transitions[status] ?? []).filter(
    (next) =>
      !(options.startThroughEncounter && next === "in_progress") &&
      !(options.finishThroughEncounter && next === "attended"),
  );
}
