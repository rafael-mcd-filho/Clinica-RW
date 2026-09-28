"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { loadAppointmentFormData } from "../../agenda/actions";
import { AppointmentFormModal } from "@/components/agenda/appointment-form-modal";
import { Button } from "@/components/ui/button";
import type { AppointmentFormData } from "@/lib/agenda/slots";

/**
 * Abre o mesmo formulário de agendamento da agenda, com o paciente já
 * amarrado. Os catálogos e a grade só são carregados quando ele abre.
 */
export function usePatientScheduler({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<AppointmentFormData | null>(null);
  const [loading, setLoading] = useState(false);

  const openScheduler = useCallback(async () => {
    setOpen(true);
    if (formData || loading) return;
    setLoading(true);
    const result = await loadAppointmentFormData();
    setLoading(false);
    if (!result.ok || !result.data) {
      setOpen(false);
      toast.error(result.error ?? "Não foi possível abrir o agendamento.");
      return;
    }
    setFormData(result.data);
  }, [formData, loading]);

  const modal = formData ? (
    <AppointmentFormModal
      open={open}
      onClose={() => setOpen(false)}
      data={formData}
      patient={{ id: patientId, name: patientName }}
      onCreated={() => {
        // A grade muda depois de marcar: a próxima abertura busca de novo.
        setFormData(null);
        router.refresh();
      }}
    />
  ) : null;

  return { openScheduler, loading, modal };
}

export function PatientScheduleButton({
  label = "Agendar retorno",
  patientId,
  patientName,
}: {
  label?: string;
  patientId: string;
  patientName: string;
}) {
  const { openScheduler, loading, modal } = usePatientScheduler({
    patientId,
    patientName,
  });

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={loading}
        onClick={() => void openScheduler()}
        className="shrink-0"
      >
        {loading ? "Abrindo..." : label}
      </Button>
      {modal}
    </>
  );
}
