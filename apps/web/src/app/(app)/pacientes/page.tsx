import {
  PatientsTable,
  type PatientListRow,
  type PatientTagOption,
} from "./patients-table";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PatientTagRow = { patient_id: string; tag_id: string };
type EncounterRow = {
  id: string;
  patient_id: string;
  professional_id: string;
  appointment_id: string | null;
  status: string;
  started_at: string;
};
type ProfessionalRow = { id: string; name: string };
type AppointmentInsuranceRow = {
  id: string;
  health_insurances: { name: string } | null;
};

export default async function PacientesPage() {
  const context = await requireCompanyPermission([
    "paciente.ver",
    "clinico.ver_prontuario",
    "clinico.ver_prontuario_proprios",
  ]);
  const canSeeSensitive = context.permissionCodes.has(
    "paciente.ver_dados_sensiveis",
  );
  const canViewClinicalRecords =
    context.permissionCodes.has("clinico.ver_prontuario") ||
    context.permissionCodes.has("clinico.ver_prontuario_proprios");
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const nowIso = new Date().toISOString();

  const [
    { data: patients, error },
    { data: tags },
    { data: patientTags },
    encountersResult,
    professionalsResult,
  ] = await Promise.all([
      supabase
        .from("patients")
        .select(
          "id, full_name, social_name, birth_date, cpf, email, phone, whatsapp, status, source, deleted_at, created_at",
        )
        .eq("organization_id", organizationId)
        .order("full_name")
        .returns<PatientListRow[]>(),
      supabase
        .from("tags")
        .select("id, name, color")
        .eq("organization_id", organizationId)
        .order("name")
        .returns<PatientTagOption[]>(),
      supabase
        .from("patient_tags")
        .select("patient_id, tag_id")
        .eq("organization_id", organizationId)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .returns<PatientTagRow[]>(),
      canViewClinicalRecords
        ? supabase
            .from("encounters")
            .select(
              "id, patient_id, professional_id, appointment_id, status, started_at",
            )
            .eq("organization_id", organizationId)
            .order("started_at", { ascending: false })
            .limit(1000)
            .returns<EncounterRow[]>()
        : Promise.resolve({ data: [] as EncounterRow[] }),
      canViewClinicalRecords
        ? supabase
            .from("professionals")
            .select("id, name")
            .eq("organization_id", organizationId)
            .eq("active", true)
            .order("name")
            .returns<ProfessionalRow[]>()
        : Promise.resolve({ data: [] as ProfessionalRow[] }),
    ]);

  const tagIdsByPatient = new Map<string, string[]>();
  (patientTags ?? []).forEach((item) => {
    const list = tagIdsByPatient.get(item.patient_id) ?? [];
    list.push(item.tag_id);
    tagIdsByPatient.set(item.patient_id, list);
  });
  const professionalName = new Map(
    (professionalsResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const latestEncounterByPatient = new Map<string, EncounterRow>();
  const appointmentIds = new Set<string>();

  for (const encounter of encountersResult.data ?? []) {
    if (!latestEncounterByPatient.has(encounter.patient_id)) {
      latestEncounterByPatient.set(encounter.patient_id, encounter);
      if (encounter.appointment_id) {
        appointmentIds.add(encounter.appointment_id);
      }
    }
  }

  const appointmentInsurances =
    appointmentIds.size && canViewClinicalRecords
      ? await supabase
          .from("appointments")
          .select("id, health_insurances(name)")
          .eq("organization_id", organizationId)
          .in("id", Array.from(appointmentIds))
          .returns<AppointmentInsuranceRow[]>()
      : { data: [] as AppointmentInsuranceRow[] };
  const insuranceByAppointment = new Map(
    (appointmentInsurances.data ?? []).map((item) => [
      item.id,
      item.health_insurances?.name ?? null,
    ]),
  );

  const rows = (patients ?? []).map((patient) => {
    const encounter = latestEncounterByPatient.get(patient.id);

    return {
      ...patient,
      tagIds: tagIdsByPatient.get(patient.id) ?? [],
      lastEncounterId: encounter?.id ?? null,
      lastEncounterAt: encounter?.started_at ?? null,
      lastEncounterStatus: encounter?.status ?? null,
      lastProfessionalName: encounter
        ? (professionalName.get(encounter.professional_id) ?? null)
        : null,
      lastInsuranceName: encounter?.appointment_id
        ? (insuranceByAppointment.get(encounter.appointment_id) ?? null)
        : null,
    };
  });

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-xl font-semibold">Pacientes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cadastro central para agenda, atendimento e relacionamento.
        </p>
      </section>

      <PatientsTable
        patients={rows}
        tags={tags ?? []}
        error={error?.message}
        canCreate={context.permissionCodes.has("paciente.criar")}
        canArchive={context.permissionCodes.has("paciente.excluir")}
        canSeeSensitive={canSeeSensitive}
        canViewClinicalRecords={canViewClinicalRecords}
      />
    </div>
  );
}
