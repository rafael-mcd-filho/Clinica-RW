import {
  PatientsTable,
  type PatientListRow,
  type PatientTagOption,
} from "./patients-table";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { PageHeader } from "@/components/ui/page-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UsersRound } from "lucide-react";

type PatientTagRow = { patient_id: string; tag_id: string };
type LatestEncounterRow = {
  id: string;
  patient_id: string;
  status: string;
  started_at: string;
  professional_name: string | null;
  insurance_name: string | null;
};

const PAGE_SIZE = 25;
const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    sort?: string;
    status?: string;
    tag?: string;
  }>;
}) {
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
  const params = await searchParams;
  const page = positiveInteger(params.page, 1);
  const queryText = (params.q ?? "").trim().slice(0, 100);
  const status = ["active", "archived", "all"].includes(params.status ?? "")
    ? (params.status as "active" | "archived" | "all")
    : "active";
  const sort = ["name", "newest", "oldest"].includes(params.sort ?? "")
    ? (params.sort as "name" | "newest" | "oldest")
    : "name";
  const tagId = params.tag?.trim() || "all";
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const nowIso = new Date().toISOString();

  const [tagsResult, selectedTagPatients] = await Promise.all([
    supabase
      .from("tags")
      .select("id, name, color")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<PatientTagOption[]>(),
    tagId !== "all"
      ? supabase
          .from("patient_tags")
          .select("patient_id")
          .eq("organization_id", organizationId)
          .eq("tag_id", tagId)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .returns<Array<{ patient_id: string }>>()
      : Promise.resolve({ data: null }),
  ]);

  const patientIdsForTag = selectedTagPatients.data?.map(
    (item) => item.patient_id,
  );
  const patientSelect = canSeeSensitive
    ? "id, full_name, social_name, birth_date, cpf, email, phone, whatsapp, status, source, deleted_at, created_at"
    : "id, full_name, social_name, birth_date, email, phone, whatsapp, status, source, deleted_at, created_at";
  let patientsQuery = supabase
    .from("patients")
    .select(patientSelect, { count: "exact" })
    .eq("organization_id", organizationId);

  if (status === "active") {
    patientsQuery = patientsQuery.is("deleted_at", null);
  } else if (status === "archived") {
    patientsQuery = patientsQuery.not("deleted_at", "is", null);
  }

  if (tagId !== "all") {
    patientsQuery = patientsQuery.in(
      "id",
      patientIdsForTag?.length ? patientIdsForTag : [EMPTY_UUID],
    );
  }

  const safeQuery = queryText.replace(/[,()%*]/g, " ").replace(/\s+/g, " ");
  if (safeQuery.length >= 2) {
    const filters = [
      `full_name.ilike.%${safeQuery}%`,
      `social_name.ilike.%${safeQuery}%`,
      `email.ilike.%${safeQuery}%`,
      `phone.ilike.%${safeQuery}%`,
      `whatsapp.ilike.%${safeQuery}%`,
    ];
    const digits = safeQuery.replace(/\D/g, "");
    if (canSeeSensitive && digits.length >= 3) {
      filters.push(`cpf.ilike.%${digits}%`);
    }
    patientsQuery = patientsQuery.or(filters.join(","));
  }

  if (sort === "newest") {
    patientsQuery = patientsQuery.order("created_at", { ascending: false });
  } else if (sort === "oldest") {
    patientsQuery = patientsQuery.order("created_at", { ascending: true });
  } else {
    patientsQuery = patientsQuery.order("full_name", { ascending: true });
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const patientsResult = await patientsQuery
    .range(from, to)
    .returns<PatientListRow[]>();
  const patients = patientsResult.data ?? [];
  const pagePatientIds = patients.map((patient) => patient.id);

  const [patientTagsResult, latestEncountersResult] = await Promise.all([
    pagePatientIds.length
      ? supabase
          .from("patient_tags")
          .select("patient_id, tag_id")
          .eq("organization_id", organizationId)
          .in("patient_id", pagePatientIds)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .returns<PatientTagRow[]>()
      : Promise.resolve({ data: [] as PatientTagRow[] }),
    canViewClinicalRecords && pagePatientIds.length
      ? fetchLatestPatientEncounters(supabase, organizationId, pagePatientIds)
      : Promise.resolve({ data: [] as LatestEncounterRow[] }),
  ]);

  const tagIdsByPatient = new Map<string, string[]>();
  (patientTagsResult.data ?? []).forEach((item) => {
    const list = tagIdsByPatient.get(item.patient_id) ?? [];
    list.push(item.tag_id);
    tagIdsByPatient.set(item.patient_id, list);
  });
  const latestEncounterByPatient = new Map(
    (latestEncountersResult.data ?? []).map((encounter) => [
      encounter.patient_id,
      encounter,
    ]),
  );
  const rows = patients.map((patient) => {
    const encounter = latestEncounterByPatient.get(patient.id);

    return {
      ...patient,
      tagIds: tagIdsByPatient.get(patient.id) ?? [],
      lastEncounterId: encounter?.id ?? null,
      lastEncounterAt: encounter?.started_at ?? null,
      lastEncounterStatus: encounter?.status ?? null,
      lastProfessionalName: encounter?.professional_name ?? null,
      lastInsuranceName: encounter?.insurance_name ?? null,
    };
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={UsersRound}
        title="Pacientes"
        description="Cadastro central para agenda, atendimento e relacionamento."
      />

      <PatientsTable
        key={`${queryText}:${status}:${tagId}:${sort}:${page}`}
        patients={rows}
        tags={tagsResult.data ?? []}
        error={
          patientsResult.error
            ? "Não foi possível carregar os pacientes. Tente novamente."
            : undefined
        }
        filters={{ query: queryText, sort, status, tagId }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: patientsResult.count ?? 0,
        }}
        canCreate={context.permissionCodes.has("paciente.criar")}
        canArchive={context.permissionCodes.has("paciente.excluir")}
        canSeeSensitive={canSeeSensitive}
        canViewClinicalRecords={canViewClinicalRecords}
      />
    </div>
  );
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchLatestPatientEncounters(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  patientIds: string[],
) {
  const result = await supabase.rpc("latest_patient_encounters", {
    p_organization_id: organizationId,
    p_patient_ids: patientIds,
  });

  return {
    data: Array.isArray(result.data)
      ? (result.data as unknown as LatestEncounterRow[])
      : [],
  };
}
