import { AgendaBoard, type AgendaData } from "./agenda-board";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AgendaPage() {
  const context = await requireCompanyPermission(["agenda.ver"]);
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const canSeeClinicalRecords =
    context.permissionCodes.has("clinico.ver_prontuario") ||
    context.permissionCodes.has("clinico.ver_prontuario_proprios");
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const until = new Date();
  until.setDate(until.getDate() + 90);

  const [
    schedules,
    professionals,
    specialties,
    units,
    rooms,
    patients,
    procedures,
    insurances,
    paymentMethods,
    appointments,
    availability,
    blocks,
  ] = await Promise.all([
    supabase
      .from("schedules")
      .select("id, professional_id, unit_id, name, color, active")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("professionals")
      .select("id, name, specialty_id")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("specialties")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("units")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("rooms")
      .select("id, unit_id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("patients")
      .select("id, full_name, social_name, cpf, email, phone, whatsapp")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("full_name"),
    supabase
      .from("procedures")
      .select("id, name, duration_minutes")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("health_insurances")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("payment_methods")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("appointments")
      .select(
        "id, patient_id, professional_id, procedure_id, schedule_id, unit_id, room_id, health_insurance_id, payment_method_id, status, start_at, end_at, notes, is_extra",
      )
      .eq("organization_id", organizationId)
      .gte("start_at", from.toISOString())
      .lte("start_at", until.toISOString())
      .order("start_at"),
    supabase
      .from("schedule_availability")
      .select("id, schedule_id, weekday, start_time, end_time, slot_minutes")
      .eq("organization_id", organizationId)
      .order("weekday")
      .order("start_time"),
    supabase
      .from("schedule_blocks")
      .select("id, schedule_id, start_at, end_at, reason")
      .eq("organization_id", organizationId)
      .lte("start_at", until.toISOString())
      .gte("end_at", from.toISOString())
      .order("start_at"),
  ]);

  const appointmentRows = appointments.data ?? [];
  const appointmentIds = appointmentRows.map((appointment) => appointment.id);
  const encounters =
    canSeeClinicalRecords && appointmentIds.length
      ? await supabase
          .from("encounters")
          .select("id, appointment_id, status, started_at")
          .eq("organization_id", organizationId)
          .in("appointment_id", appointmentIds)
          .returns<
            Array<{
              id: string;
              appointment_id: string | null;
              status: string;
              started_at: string;
            }>
          >()
      : { data: [] };

  const data: AgendaData = {
    organizationId,
    schedules: schedules.data ?? [],
    professionals: professionals.data ?? [],
    specialties: specialties.data ?? [],
    units: units.data ?? [],
    rooms: rooms.data ?? [],
    patients: patients.data ?? [],
    procedures: procedures.data ?? [],
    insurances: insurances.data ?? [],
    paymentMethods: paymentMethods.data ?? [],
    appointments: appointmentRows,
    encounters: encounters.data ?? [],
    availability: availability.data ?? [],
    blocks: blocks.data ?? [],
    waitlist: [],
    onlineSettings: null,
    onlineRequests: [],
  };

  return (
    <AgendaBoard
      data={data}
      canCreate={context.permissionCodes.has("agenda.criar_agendamento")}
      canCreatePatient={context.permissionCodes.has("paciente.criar")}
      canEdit={context.permissionCodes.has("agenda.editar_agendamento")}
      canExtra={context.permissionCodes.has("agenda.encaixar")}
      canViewPatient={context.permissionCodes.has("paciente.ver")}
      canViewClinical={canSeeClinicalRecords}
      canStartEncounter={
        canSeeClinicalRecords &&
        context.permissionCodes.has("clinico.preencher_prontuario")
      }
    />
  );
}
