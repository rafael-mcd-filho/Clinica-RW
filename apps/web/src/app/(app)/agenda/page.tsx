import { redirect } from "next/navigation";
import { AgendaBoard, type AgendaData } from "./agenda-board";
import { requireCompanyPermission } from "@/lib/authz/guards";
import {
  normalizeAgendaTimeZone,
  resolveAgendaMonthGridRange,
  resolveAgendaSelection,
  resolveAgendaVisibleRange,
} from "@/lib/agenda/range";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireCompanyPermission(["agenda.ver"]);
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const canSeeClinicalRecords =
    context.permissionCodes.has("clinico.ver_prontuario") ||
    context.permissionCodes.has("clinico.ver_prontuario_proprios");
  // Onda única para settings + catálogos: nada aqui depende do período
  // visível, então tudo compartilha o mesmo round-trip ao Supabase.
  const [
    { data: organizationSettings },
    requestedParams,
    schedules,
    professionals,
    specialties,
    units,
    rooms,
    procedures,
    insurances,
    paymentMethods,
    availability,
    insurancePrices,
  ] = await Promise.all([
    supabase
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle<{ timezone: string | null }>(),
    searchParams,
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
      .from("procedures")
      .select("id, name, duration_minutes, base_price")
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
      .from("schedule_availability")
      .select("id, schedule_id, weekday, start_time, end_time, slot_minutes")
      .eq("organization_id", organizationId)
      .order("weekday")
      .order("start_time"),
    supabase
      .from("price_table_items")
      .select(
        "procedure_id, price, price_tables!inner(health_insurance_id, active)",
      )
      .eq("organization_id", organizationId),
  ]);

  const timeZone = normalizeAgendaTimeZone(organizationSettings?.timezone);
  const selection = resolveAgendaSelection(requestedParams, { timeZone });
  const requestedDate = firstParam(requestedParams.date);
  const requestedView = firstParam(requestedParams.view);
  // Redireciona apenas para normalizar params explícitos inválidos. A
  // entrada sem params (clique no menu) renderiza direto com o padrão —
  // o board grava date/view na URL na primeira interação, e evitar o
  // redirect poupa uma execução completa da página.
  if (
    (requestedDate !== undefined && requestedDate !== selection.date) ||
    (requestedView !== undefined && requestedView !== selection.view)
  ) {
    redirect(`/agenda?date=${selection.date}&view=${selection.view}`);
  }
  const visibleRange = resolveAgendaVisibleRange(selection, timeZone);
  const rangeStart = visibleRange.startInclusive.toISOString();
  const rangeEnd = visibleRange.endExclusive.toISOString();
  const monthGrid = resolveAgendaMonthGridRange(selection.date, timeZone);

  const [appointments, blocks, dayCounts] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, patient_id, professional_id, procedure_id, schedule_id, unit_id, room_id, health_insurance_id, payment_method_id, status, start_at, end_at, notes, is_extra, price, list_price, price_note",
      )
      .eq("organization_id", organizationId)
      .gte("start_at", rangeStart)
      .lt("start_at", rangeEnd)
      .order("start_at"),
    supabase
      .from("schedule_blocks")
      .select("id, schedule_id, start_at, end_at, reason")
      .eq("organization_id", organizationId)
      .lt("start_at", rangeEnd)
      .gt("end_at", rangeStart)
      .order("start_at"),
    supabase.rpc("agenda_day_counts", {
      p_organization_id: organizationId,
      p_start: monthGrid.startInclusive.toISOString(),
      p_end: monthGrid.endExclusive.toISOString(),
      p_timezone: timeZone,
    }),
  ]);

  const appointmentRows = appointments.data ?? [];
  const appointmentIds = appointmentRows.map((appointment) => appointment.id);
  const patientIds = [
    ...new Set(appointmentRows.map((appointment) => appointment.patient_id)),
  ];
  const [patients, encounters] = await Promise.all([
    patientIds.length
      ? supabase
          .from("patients")
          .select("id, full_name, social_name, cpf, email, phone, whatsapp")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .in("id", patientIds)
          .order("full_name")
      : Promise.resolve({ data: [] }),
    canSeeClinicalRecords && appointmentIds.length
      ? supabase
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
      : Promise.resolve({ data: [] }),
  ]);

  const data: AgendaData = {
    organizationId,
    timeZone,
    selectedDate: selection.date,
    visibleFrom: visibleRange.localFrom,
    visibleTo: visibleRange.localTo,
    schedules: schedules.data ?? [],
    professionals: professionals.data ?? [],
    specialties: specialties.data ?? [],
    units: units.data ?? [],
    rooms: rooms.data ?? [],
    patients: patients.data ?? [],
    procedures: procedures.data ?? [],
    insurances: insurances.data ?? [],
    insurancePrices: buildInsurancePriceMap(insurancePrices.data),
    paymentMethods: paymentMethods.data ?? [],
    appointments: appointmentRows,
    // Ocupação do mini calendário. Enquanto a migration do RPC não estiver
    // aplicada o mapa de calor apenas não aparece — o resto da agenda segue.
    dayCounts: isDayCountMap(dayCounts.data) ? dayCounts.data : {},
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
      initialDate={selection.date}
      initialView={selection.view}
      canCreate={context.permissionCodes.has("agenda.criar_agendamento")}
      canBlock={context.permissionCodes.has("agenda.bloquear_horario")}
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

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Indexa o preço de convênio por `${convênio}:${procedimento}`, que é como o
    formulário de agendamento procura. Tabela inativa não entra. */
function buildInsurancePriceMap(
  rows:
    | Array<{
        procedure_id: string;
        price: number | string;
        price_tables:
          | { health_insurance_id: string | null; active: boolean }
          | Array<{ health_insurance_id: string | null; active: boolean }>
          | null;
      }>
    | null,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows ?? []) {
    const table = Array.isArray(row.price_tables)
      ? row.price_tables[0]
      : row.price_tables;
    if (!table?.active || !table.health_insurance_id) continue;
    map[`${table.health_insurance_id}:${row.procedure_id}`] = Number(row.price);
  }
  return map;
}

function isDayCountMap(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "number")
  );
}
