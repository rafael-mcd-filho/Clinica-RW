import { Stethoscope } from "@phosphor-icons/react/dist/ssr";
import {
  EncountersBrowser,
  type ProntuarioFilters,
  type ProntuarioRow,
} from "./encounters-browser";
import { PageHeader } from "@/components/ui/page-header";
import { requireCompanyPermission } from "@/lib/authz/guards";
import {
  loadReportTimeZone,
  zonedDayEndExclusive,
  zonedDayStart,
} from "@/lib/reports/time-zone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPhoneBR, onlyDigits } from "@/lib/validation/br";

type SearchParams = Record<string, string | string[] | undefined>;

type EncounterRow = {
  id: string;
  patient_id: string;
  professional_id: string;
  appointment_id: string | null;
  status: "draft" | "finalized";
  started_at: string;
};

type NamedOption = { id: string; name: string };

type PatientSummary = {
  id: string;
  full_name: string;
  social_name: string | null;
  phone: string | null;
  whatsapp: string | null;
};

const pageSize = 20;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Nenhum atendimento tem essa versão: usado quando a ficha filtrada ainda não
// foi publicada, para a lista vir vazia em vez de ignorar o filtro.
const noMatchId = "00000000-0000-0000-0000-000000000000";

/**
 * Prontuário: todos os atendimentos clínicos da clínica, com busca, filtros e
 * paginação no servidor (antes eram só os 100 mais recentes, sem filtro). Os
 * filtros moram na URL, então a lista filtrada sobrevive a recarregar a página.
 */
export default async function ProntuarioPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const [params, context] = await Promise.all([
    searchParams ?? Promise.resolve({} as SearchParams),
    requireCompanyPermission([
      "clinico.ver_prontuario",
      "clinico.ver_prontuario_proprios",
    ]),
  ]);
  // Quem só vê os próprios atendimentos recebe a lista já filtrada pelo banco:
  // filtro e coluna de profissional não teriam o que mostrar.
  const canSeeAll = context.permissionCodes.has("clinico.ver_prontuario");
  const canSearchCpf = context.permissionCodes.has(
    "paciente.ver_dados_sensiveis",
  );
  const filters = parseFilters(params, canSeeAll);
  const organizationId = context.organization.id;
  const supabase = await createSupabaseServerClient();

  const [timeZone, professionals, templates, procedures, versions] =
    await Promise.all([
      loadReportTimeZone(supabase, organizationId),
      canSeeAll
        ? supabase
            .from("professionals")
            .select("id, name")
            .eq("organization_id", organizationId)
            .order("name")
            .returns<NamedOption[]>()
        : Promise.resolve({ data: [] as NamedOption[] }),
      supabase
        .from("clinical_templates")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name")
        .returns<NamedOption[]>(),
      supabase
        .from("procedures")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("name")
        .returns<NamedOption[]>(),
      filters.templateId
        ? supabase
            .from("clinical_template_versions")
            .select("id")
            .eq("template_id", filters.templateId)
            .returns<Array<{ id: string }>>()
        : Promise.resolve({ data: [] as Array<{ id: string }> }),
    ]);

  const templateVersionIds = (versions.data ?? []).map(({ id }) => id);
  const patientSearch = buildPatientSearch(filters.query, canSearchCpf);
  // Os joins só entram quando o filtro pede: "!inner" descarta os atendimentos
  // cujo paciente/agendamento não bate com o filtro.
  const joins = [
    patientSearch ? "patients!inner(id)" : null,
    filters.procedureId ? "appointments!inner(procedure_id)" : null,
  ].filter(Boolean);
  const listColumns = [
    "id, patient_id, professional_id, appointment_id, status, started_at",
    ...joins,
  ].join(", ");
  const countColumns = ["id", ...joins].join(", ");

  // Todos os filtros menos o de status: as contagens das abas de status saem
  // da mesma base da lista.
  function filteredEncounters(
    columns: string,
    options: { count: "exact"; head?: boolean },
  ) {
    let query = supabase
      .from("encounters")
      .select(columns, options)
      .eq("organization_id", organizationId);
    if (filters.professionalId) {
      query = query.eq("professional_id", filters.professionalId);
    }
    if (filters.templateId) {
      query = query.in(
        "template_version_id",
        templateVersionIds.length ? templateVersionIds : [noMatchId],
      );
    }
    if (filters.procedureId) {
      query = query.eq("appointments.procedure_id", filters.procedureId);
    }
    if (filters.from) {
      query = query.gte(
        "started_at",
        zonedDayStart(filters.from, timeZone).toISOString(),
      );
    }
    if (filters.to) {
      query = query.lt(
        "started_at",
        zonedDayEndExclusive(filters.to, timeZone).toISOString(),
      );
    }
    if (patientSearch) {
      query = query.or(patientSearch, { referencedTable: "patients" });
    }
    return query;
  }

  let listQuery = filteredEncounters(listColumns, { count: "exact" });
  if (filters.status !== "all") {
    listQuery = listQuery.eq("status", filters.status);
  }
  const rangeStart = (filters.page - 1) * pageSize;

  const [list, allCount, draftCount] = await Promise.all([
    listQuery
      .order("started_at", { ascending: false })
      .order("id", { ascending: true })
      .range(rangeStart, rangeStart + pageSize - 1)
      .returns<EncounterRow[]>(),
    filteredEncounters(countColumns, { count: "exact", head: true }),
    filteredEncounters(countColumns, { count: "exact", head: true }).eq(
      "status",
      "draft",
    ),
  ]);

  const encounters = list.data ?? [];
  const details = await loadRowDetails(supabase, organizationId, encounters);
  const total = allCount.count ?? 0;
  const drafts = draftCount.count ?? 0;

  const rows: ProntuarioRow[] = encounters.map((encounter) => {
    const patient = details.patients.get(encounter.patient_id);
    const phone = patient?.phone || patient?.whatsapp;
    return {
      id: encounter.id,
      status: encounter.status,
      patientId: encounter.patient_id,
      patientName: patient?.social_name || patient?.full_name || "Paciente",
      patientPhone: phone ? formatPhoneBR(phone) : null,
      professionalName: details.professionals.get(encounter.professional_id),
      templateName: details.templates.get(encounter.id) ?? "Ficha clínica",
      procedureName: encounter.appointment_id
        ? details.procedures.get(encounter.appointment_id)
        : undefined,
      startedDate: formatDate(encounter.started_at, timeZone),
      startedTime: formatTime(encounter.started_at, timeZone),
    };
  });

  return (
    <div className="grid gap-4">
      <PageHeader
        icon={Stethoscope}
        title="Prontuário"
        description="Atendimentos clínicos da clínica, em andamento e finalizados."
      />
      <EncountersBrowser
        rows={rows}
        filters={filters}
        counts={{
          all: total,
          draft: drafts,
          finalized: Math.max(0, total - drafts),
        }}
        pagination={{
          page: filters.page,
          pageSize,
          total: list.count ?? rows.length,
        }}
        options={{
          professionals: professionals.data ?? [],
          templates: templates.data ?? [],
          procedures: procedures.data ?? [],
        }}
        canSeeAll={canSeeAll}
        canSearchCpf={canSearchCpf}
        error={
          list.error
            ? "Tente de novo em alguns instantes. Se continuar, avise o suporte."
            : undefined
        }
      />
    </div>
  );
}

function parseFilters(
  params: SearchParams,
  canSeeAll: boolean,
): ProntuarioFilters {
  const read = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const dateKey = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  const id = (value: string) => (uuidPattern.test(value) ? value : "");
  const status = read("status");
  let from = dateKey(read("de"));
  let to = dateKey(read("ate"));
  if (from && to && from > to) [from, to] = [to, from];
  const page = Number.parseInt(read("pagina"), 10);

  return {
    query: read("q").slice(0, 80),
    status: status === "draft" || status === "finalized" ? status : "all",
    from,
    to,
    professionalId: canSeeAll ? id(read("profissional")) : "",
    templateId: id(read("ficha")),
    procedureId: id(read("tipo")),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/**
 * Filtro do PostgREST sobre o paciente: nome (civil ou social), telefone e,
 * para quem vê dados sensíveis, CPF — os dois últimos gravados só com dígitos.
 * Pontuação que quebraria a sintaxe do filtro é descartada.
 */
function buildPatientSearch(query: string, canSearchCpf: boolean) {
  if (!query) return null;
  const text = query
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const digits = onlyDigits(query);
  const clauses: string[] = [];
  if (/\p{L}/u.test(text) || (text && digits.length < 3)) {
    clauses.push(`full_name.ilike.*${text}*`, `social_name.ilike.*${text}*`);
  }
  if (digits.length >= 3) {
    clauses.push(`phone.ilike.*${digits}*`, `whatsapp.ilike.*${digits}*`);
    if (canSearchCpf) clauses.push(`cpf.ilike.*${digits}*`);
  }
  return clauses.length ? clauses.join(",") : null;
}

async function loadRowDetails(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  encounters: EncounterRow[],
) {
  const details = {
    patients: new Map<string, PatientSummary>(),
    professionals: new Map<string, string>(),
    templates: new Map<string, string>(),
    procedures: new Map<string, string>(),
  };
  if (!encounters.length) return details;

  const unique = (values: Array<string | null>) => [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
  const appointmentIds = unique(encounters.map((item) => item.appointment_id));
  const [patients, professionals, entries, appointments] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name, social_name, phone, whatsapp")
      .eq("organization_id", organizationId)
      .in("id", unique(encounters.map((item) => item.patient_id)))
      .returns<PatientSummary[]>(),
    supabase
      .from("professionals")
      .select("id, name")
      .eq("organization_id", organizationId)
      .in("id", unique(encounters.map((item) => item.professional_id)))
      .returns<NamedOption[]>(),
    supabase
      .from("encounter_entries")
      .select("encounter_id, template_snapshot")
      .eq("organization_id", organizationId)
      .in(
        "encounter_id",
        encounters.map((item) => item.id),
      )
      .returns<
        Array<{
          encounter_id: string;
          template_snapshot: { name?: string } | null;
        }>
      >(),
    appointmentIds.length
      ? supabase
          .from("appointments")
          .select("id, procedures(name)")
          .eq("organization_id", organizationId)
          .in("id", appointmentIds)
          .returns<Array<{ id: string; procedures: { name: string } | null }>>()
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            procedures: { name: string } | null;
          }>,
        }),
  ]);

  for (const patient of patients.data ?? []) {
    details.patients.set(patient.id, patient);
  }
  for (const professional of professionals.data ?? []) {
    details.professionals.set(professional.id, professional.name);
  }
  for (const entry of entries.data ?? []) {
    const name = entry.template_snapshot?.name;
    if (name) details.templates.set(entry.encounter_id, name);
  }
  for (const appointment of appointments.data ?? []) {
    if (appointment.procedures?.name) {
      details.procedures.set(appointment.id, appointment.procedures.name);
    }
  }
  return details;
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  }).format(new Date(value));
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}
