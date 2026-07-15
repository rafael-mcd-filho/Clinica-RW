import { createSupabaseServerClient } from "@/lib/supabase/server";

const clinicTimeZone = "America/Fortaleza";

export type TodayAppointmentTag = {
  id: string;
  name: string;
  color: string;
};

export type TodayAppointmentItem = {
  id: string;
  patientId: string;
  patientName: string;
  startAt: string;
  endAt: string;
  status: string;
  professionalName: string | null;
  procedureName: string | null;
  tags: TodayAppointmentTag[];
  firstVisit: boolean;
};

type AppointmentRow = {
  id: string;
  patient_id: string;
  professional_id: string;
  procedure_id: string;
  status: string;
  start_at: string;
  end_at: string;
};

type PatientRow = {
  id: string;
  full_name: string;
  social_name: string | null;
};

type NamedRow = {
  id: string;
  name: string;
};

type PatientTagRow = {
  patient_id: string;
  tag_id: string;
};

type TagRow = {
  id: string;
  name: string;
  color: string;
};

type EncounterPatientRow = {
  patient_id: string;
};

export async function getTodayAppointmentsForRail(
  organizationId: string,
): Promise<TodayAppointmentItem[]> {
  const supabase = await createSupabaseServerClient();
  const today = getLocalDateKey(new Date());
  const start = new Date(`${today}T00:00:00-03:00`);
  const end = new Date(`${today}T23:59:59.999-03:00`);
  const nowIso = new Date().toISOString();

  const appointmentsResult = await supabase
    .from("appointments")
    .select(
      "id, patient_id, professional_id, procedure_id, status, start_at, end_at",
    )
    .eq("organization_id", organizationId)
    .gte("start_at", start.toISOString())
    .lte("start_at", end.toISOString())
    .not("status", "in", "(cancelled,no_show)")
    .order("start_at")
    .returns<AppointmentRow[]>();

  if (appointmentsResult.error) {
    throw new Error(appointmentsResult.error.message);
  }

  const appointments = appointmentsResult.data ?? [];
  if (!appointments.length) {
    return [];
  }

  const patientIds = unique(appointments.map((item) => item.patient_id));
  const professionalIds = unique(
    appointments.map((item) => item.professional_id),
  );
  const procedureIds = unique(appointments.map((item) => item.procedure_id));

  const [
    patientsResult,
    professionalsResult,
    proceduresResult,
    patientTagsResult,
    tagsResult,
    encountersResult,
  ] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name, social_name")
      .eq("organization_id", organizationId)
      .in("id", patientIds)
      .returns<PatientRow[]>(),
    supabase
      .from("professionals")
      .select("id, name")
      .eq("organization_id", organizationId)
      .in("id", professionalIds)
      .returns<NamedRow[]>(),
    supabase
      .from("procedures")
      .select("id, name")
      .eq("organization_id", organizationId)
      .in("id", procedureIds)
      .returns<NamedRow[]>(),
    supabase
      .from("patient_tags")
      .select("patient_id, tag_id")
      .eq("organization_id", organizationId)
      .in("patient_id", patientIds)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .returns<PatientTagRow[]>(),
    supabase
      .from("tags")
      .select("id, name, color")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<TagRow[]>(),
    supabase
      .from("encounters")
      .select("patient_id")
      .eq("organization_id", organizationId)
      .eq("status", "finalized")
      .in("patient_id", patientIds)
      .returns<EncounterPatientRow[]>(),
  ]);

  const relatedError = [
    patientsResult.error,
    professionalsResult.error,
    proceduresResult.error,
    patientTagsResult.error,
    tagsResult.error,
    encountersResult.error,
  ].find(Boolean);

  if (relatedError) {
    throw new Error(relatedError.message);
  }

  const patients = new Map(
    (patientsResult.data ?? []).map((item) => [item.id, item]),
  );
  const professionals = new Map(
    (professionalsResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const procedures = new Map(
    (proceduresResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const tags = new Map((tagsResult.data ?? []).map((item) => [item.id, item]));
  const finalizedPatients = new Set(
    (encountersResult.data ?? []).map((item) => item.patient_id),
  );
  const tagsByPatient = new Map<string, TodayAppointmentTag[]>();

  for (const patientTag of patientTagsResult.data ?? []) {
    const tag = tags.get(patientTag.tag_id);
    if (!tag) continue;

    const list = tagsByPatient.get(patientTag.patient_id) ?? [];
    list.push(tag);
    tagsByPatient.set(patientTag.patient_id, list);
  }

  return appointments.map((appointment) => {
    const patient = patients.get(appointment.patient_id);
    const itemTags = [...(tagsByPatient.get(appointment.patient_id) ?? [])];
    const firstVisit = !finalizedPatients.has(appointment.patient_id);

    if (
      firstVisit &&
      !itemTags.some((tag) => normalizeText(tag.name).includes("primeira"))
    ) {
      itemTags.unshift({
        id: "virtual-first-visit",
        name: "Primeira vez",
        color: "#22c55e",
      });
    }

    return {
      id: appointment.id,
      patientId: appointment.patient_id,
      patientName:
        patient?.social_name || patient?.full_name || "Paciente sem nome",
      startAt: appointment.start_at,
      endAt: appointment.end_at,
      status: appointment.status,
      professionalName: professionals.get(appointment.professional_id) ?? null,
      procedureName: procedures.get(appointment.procedure_id) ?? null,
      tags: itemTags,
      firstVisit,
    };
  });
}

function getLocalDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: clinicTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
