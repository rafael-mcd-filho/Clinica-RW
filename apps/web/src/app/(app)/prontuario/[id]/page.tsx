import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDots as CalendarDays,
  UserCircle as UserRound,
} from "@phosphor-icons/react/dist/ssr";
import {
  DocumentPanel,
  type ClinicalDocument,
  type ClinicalDocumentTemplate,
} from "./document-panel";
import { EncounterEditor } from "./encounter-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireCompanyPermission } from "@/lib/authz/guards";
import {
  normalizeAgendaTimeZone,
  safeAgendaReturnTo,
} from "@/lib/agenda/range";
import { buildClinicalDocumentVariables } from "@/lib/clinical/document-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EncounterRow = {
  id: string;
  organization_id: string;
  patient_id: string;
  professional_id: string;
  appointment_id: string | null;
  status: string;
  started_at: string;
  finalized_at: string | null;
};

type EntryRow = {
  template_snapshot: {
    name?: string;
    version_number?: number;
    schema?: unknown;
  };
  structured_data: Record<string, unknown>;
  free_notes: string | null;
};

type PatientRow = {
  id: string;
  full_name: string;
  social_name: string | null;
  birth_date: string | null;
  cpf: string | null;
  rg: string | null;
  email: string | null;
  phone: string | null;
};

type ProfessionalRow = {
  id: string;
  name: string;
  specialty_id: string | null;
  council_type: string | null;
  council_number: string | null;
  council_state: string | null;
};

type AppointmentRow = {
  start_at: string;
  end_at: string;
  unit_id: string;
  procedure_id: string;
};

type ClinicRow = {
  trade_name: string;
  legal_name: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

type UnitRow = {
  name: string;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

type DocumentTemplateRow = {
  id: string;
  document_type: ClinicalDocumentTemplate["document_type"];
  name: string;
};

type DocumentTemplateVersionRow = {
  id: string;
  template_id: string;
  version_number: number;
  title_template: string;
  body_template: string;
  layout_schema: unknown;
};

export default async function EncounterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    from?: string | string[];
    return_to?: string | string[];
  }>;
}) {
  const context = await requireCompanyPermission([
    "clinico.ver_prontuario",
    "clinico.ver_prontuario_proprios",
  ]);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();

  const { data: encounter } = await supabase
    .from("encounters")
    .select(
      "id, organization_id, patient_id, professional_id, appointment_id, status, started_at, finalized_at",
    )
    .eq("id", id)
    .maybeSingle<EncounterRow>();

  if (!encounter) notFound();

  const [
    entryResult,
    patientResult,
    professionalResult,
    diagnosesResult,
    addendaResult,
    documentTemplatesResult,
    documentTemplateVersionsResult,
    documentsResult,
    clinicResult,
    organizationSettingsResult,
    appointmentResult,
  ] = await Promise.all([
    supabase
      .from("encounter_entries")
      .select("template_snapshot, structured_data, free_notes")
      .eq("organization_id", encounter.organization_id)
      .eq("encounter_id", encounter.id)
      .single<EntryRow>(),
    supabase
      .from("patients")
      .select("id, full_name, social_name, birth_date, cpf, rg, email, phone")
      .eq("organization_id", encounter.organization_id)
      .eq("id", encounter.patient_id)
      .single<PatientRow>(),
    supabase
      .from("professionals")
      .select(
        "id, name, specialty_id, council_type, council_number, council_state",
      )
      .eq("organization_id", encounter.organization_id)
      .eq("id", encounter.professional_id)
      .single<ProfessionalRow>(),
    supabase
      .from("encounter_diagnoses")
      .select("cid_code, description, is_primary")
      .eq("organization_id", encounter.organization_id)
      .eq("encounter_id", encounter.id)
      .order("is_primary", { ascending: false })
      .returns<
        Array<{
          cid_code: string;
          description: string | null;
          is_primary: boolean;
        }>
      >(),
    supabase
      .from("encounter_addenda")
      .select("id, content, created_at, author_user_id")
      .eq("organization_id", encounter.organization_id)
      .eq("encounter_id", encounter.id)
      .order("created_at", { ascending: false })
      .returns<
        Array<{
          id: string;
          content: string;
          created_at: string;
          author_user_id: string;
        }>
      >(),
    supabase
      .from("clinical_document_templates")
      .select("id, document_type, name")
      .eq("organization_id", encounter.organization_id)
      .eq("active", true)
      .order("document_type")
      .order("name")
      .returns<DocumentTemplateRow[]>(),
    supabase
      .from("clinical_document_template_versions")
      .select(
        "id, template_id, version_number, title_template, body_template, layout_schema",
      )
      .eq("organization_id", encounter.organization_id)
      .order("version_number", { ascending: false })
      .returns<DocumentTemplateVersionRow[]>(),
    supabase
      .from("clinical_documents")
      .select("id, document_type, title, issued_at")
      .eq("organization_id", encounter.organization_id)
      .eq("encounter_id", encounter.id)
      .order("issued_at", { ascending: false })
      .returns<ClinicalDocument[]>(),
    supabase
      .from("clinics")
      .select(
        "trade_name, legal_name, document, phone, email, address_line, address_number, address_complement, district, city, state",
      )
      .eq("organization_id", encounter.organization_id)
      .maybeSingle<ClinicRow>(),
    supabase
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", encounter.organization_id)
      .maybeSingle<{ timezone: string | null }>(),
    encounter.appointment_id
      ? supabase
          .from("appointments")
          .select("start_at, end_at, unit_id, procedure_id")
          .eq("organization_id", encounter.organization_id)
          .eq("id", encounter.appointment_id)
          .maybeSingle<AppointmentRow>()
      : Promise.resolve({ data: null as AppointmentRow | null }),
  ]);

  if (!entryResult.data || !patientResult.data || !professionalResult.data) {
    notFound();
  }

  const appointment = appointmentResult.data;
  const [specialtyResult, unitResult, procedureResult] = await Promise.all([
    professionalResult.data.specialty_id
      ? supabase
          .from("specialties")
          .select("name")
          .eq("organization_id", encounter.organization_id)
          .eq("id", professionalResult.data.specialty_id)
          .maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null as { name: string } | null }),
    appointment?.unit_id
      ? supabase
          .from("units")
          .select(
            "name, phone, email, address_line, address_number, address_complement, district, city, state",
          )
          .eq("organization_id", encounter.organization_id)
          .eq("id", appointment.unit_id)
          .maybeSingle<UnitRow>()
      : Promise.resolve({ data: null as UnitRow | null }),
    appointment?.procedure_id
      ? supabase
          .from("procedures")
          .select("name")
          .eq("organization_id", encounter.organization_id)
          .eq("id", appointment.procedure_id)
          .maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null as { name: string } | null }),
  ]);

  const latestDocumentVersion = new Map<string, DocumentTemplateVersionRow>();
  for (const version of documentTemplateVersionsResult.data ?? []) {
    if (!latestDocumentVersion.has(version.template_id)) {
      latestDocumentVersion.set(version.template_id, version);
    }
  }
  const documentTemplates: ClinicalDocumentTemplate[] = (
    documentTemplatesResult.data ?? []
  ).flatMap((template) => {
    const version = latestDocumentVersion.get(template.id);
    return version
      ? [
          {
            ...template,
            template_version_id: version.id,
            version_number: version.version_number,
            title_template: version.title_template,
            body_template: version.body_template,
            layout_schema: version.layout_schema,
          },
        ]
      : [];
  });

  const timeZone = normalizeAgendaTimeZone(
    organizationSettingsResult.data?.timezone,
  );
  const documentVariables = buildClinicalDocumentVariables({
    timeZone,
    patient: {
      fullName: patientResult.data.full_name,
      socialName: patientResult.data.social_name,
      birthDate: patientResult.data.birth_date,
      cpf: patientResult.data.cpf,
      rg: patientResult.data.rg,
      email: patientResult.data.email,
      phone: patientResult.data.phone,
    },
    professional: {
      name: professionalResult.data.name,
      specialty: specialtyResult.data?.name,
      councilType: professionalResult.data.council_type,
      councilNumber: professionalResult.data.council_number,
      councilState: professionalResult.data.council_state,
    },
    clinic: clinicResult.data
      ? {
          tradeName: clinicResult.data.trade_name,
          legalName: clinicResult.data.legal_name,
          document: clinicResult.data.document,
          phone: clinicResult.data.phone,
          email: clinicResult.data.email,
          addressLine: clinicResult.data.address_line,
          addressNumber: clinicResult.data.address_number,
          addressComplement: clinicResult.data.address_complement,
          district: clinicResult.data.district,
          city: clinicResult.data.city,
          state: clinicResult.data.state,
        }
      : null,
    unit: unitResult.data
      ? {
          name: unitResult.data.name,
          phone: unitResult.data.phone,
          email: unitResult.data.email,
          addressLine: unitResult.data.address_line,
          addressNumber: unitResult.data.address_number,
          addressComplement: unitResult.data.address_complement,
          district: unitResult.data.district,
          city: unitResult.data.city,
          state: unitResult.data.state,
        }
      : null,
    appointment: appointment
      ? {
          startAt: appointment.start_at,
          endAt: appointment.end_at,
          procedure: procedureResult.data?.name,
        }
      : null,
    encounter: {
      startedAt: encounter.started_at,
      finalizedAt: encounter.finalized_at,
    },
  });

  const authorIds = [
    ...new Set((addendaResult.data ?? []).map((item) => item.author_user_id)),
  ];
  const { data: authors } = authorIds.length
    ? await supabase
        .from("app_users")
        .select("id, name")
        .in("id", authorIds)
        .returns<Array<{ id: string; name: string }>>()
    : { data: [] as Array<{ id: string; name: string }> };
  const authorName = new Map(
    (authors ?? []).map((item) => [item.id, item.name]),
  );
  const firstDiagnosis = diagnosesResult.data?.[0];
  const source = Array.isArray(query.from) ? query.from[0] : query.from;
  const returnTo = Array.isArray(query.return_to)
    ? query.return_to[0]
    : query.return_to;
  const backDestination = encounterBackDestination(
    source,
    patientResult.data.id,
    returnTo,
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <Button asChild variant="secondary" size="sm">
            <Link href={backDestination.href}>
              <ArrowLeft className="size-4" /> {backDestination.label}
            </Link>
          </Button>
          <h1 className="mt-4 text-xl font-semibold">
            {patientResult.data.social_name || patientResult.data.full_name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {entryResult.data.template_snapshot.name ?? "Template"} v
            {entryResult.data.template_snapshot.version_number ?? 1}
          </p>
        </div>
        <Badge
          variant={encounter.status === "finalized" ? "success" : "warning"}
        >
          {encounter.status === "finalized" ? "Finalizado" : "Rascunho"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          icon="patient"
          label="Paciente"
          value={patientResult.data.social_name || patientResult.data.full_name}
          detail={
            patientResult.data.birth_date
              ? formatDate(patientResult.data.birth_date)
              : "Nascimento não informado"
          }
        />
        <InfoCard
          icon="doctor"
          label="Profissional"
          value={professionalResult.data.name}
          detail={formatDateTime(encounter.started_at)}
        />
        <InfoCard
          icon="calendar"
          label="Agenda"
          value={encounter.appointment_id ? "Vinculado" : "Sem agendamento"}
          detail={
            encounter.finalized_at
              ? `Finalizado em ${formatDateTime(encounter.finalized_at)}`
              : "Em atendimento"
          }
        />
      </div>

      <EncounterEditor
        encounterId={encounter.id}
        status={encounter.status}
        canEdit={context.permissionCodes.has("clinico.preencher_prontuario")}
        canFinalize={context.permissionCodes.has(
          "clinico.finalizar_prontuario",
        )}
        schema={entryResult.data.template_snapshot.schema ?? { sections: [] }}
        structuredData={entryResult.data.structured_data ?? {}}
        freeNotes={entryResult.data.free_notes}
        cidCode={firstDiagnosis?.cid_code ?? ""}
        cidDescription={firstDiagnosis?.description ?? ""}
        addenda={(addendaResult.data ?? []).map((item) => ({
          id: item.id,
          content: item.content,
          created_at: item.created_at,
          author: authorName.get(item.author_user_id) ?? "Usuário",
        }))}
      />

      <DocumentPanel
        encounterId={encounter.id}
        templates={documentTemplates}
        documents={documentsResult.data ?? []}
        variables={documentVariables}
        canIssue={{
          prescription: context.permissionCodes.has("clinico.prescrever"),
          examRequest: context.permissionCodes.has("clinico.solicitar_exame"),
          certificate: context.permissionCodes.has("clinico.emitir_atestado"),
        }}
      />
    </div>
  );
}

function encounterBackDestination(
  source: string | undefined,
  patientId: string,
  returnTo?: string,
) {
  if (source === "agenda") {
    return {
      href: safeAgendaReturnTo(returnTo) ?? "/agenda",
      label: "Voltar para agenda",
    };
  }

  if (source === "paciente") {
    return {
      href: `/pacientes/${patientId}`,
      label: "Voltar para paciente",
    };
  }

  if (source === "pacientes") {
    return { href: "/pacientes", label: "Voltar para pacientes" };
  }

  return { href: "/prontuario", label: "Voltar para prontuários" };
}

function InfoCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: "patient" | "doctor" | "calendar";
  label: string;
  value: string;
  detail: string;
}) {
  const Icon = icon === "calendar" ? CalendarDays : UserRound;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-primary-muted p-2 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            {label}
          </p>
          <p className="truncate text-sm font-semibold">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
