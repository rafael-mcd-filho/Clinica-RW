import {
  clinicalDocumentTypes,
  documentTypePermissions,
} from "@/lib/clinical/document-types";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowLeft, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import {
  type ClinicalDocument,
  type ClinicalDocumentTemplate,
} from "./document-panel";
import { EncounterEditor } from "./encounter-editor";
import { EncounterWorkspace } from "./encounter-workspace";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EncounterAttachments } from "@/components/clinical/encounter-attachments";
import { requireCompanyPermission } from "@/lib/authz/guards";
import {
  normalizeAgendaTimeZone,
  safeAgendaReturnTo,
} from "@/lib/agenda/range";
import { buildClinicalDocumentVariables } from "@/lib/clinical/document-context";
import { buildRenderContext } from "@/lib/pdf/clinical-document";
import { listEncounterAttachments } from "@/lib/storage/clinical-attachments";
import { createPatientPhotoSignedUrl } from "@/lib/storage/patient-photos";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  logClinicalRecordAccess,
  requestOrigin,
} from "@/lib/audit/clinical-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { canAccessClinicalSummary } from "@/lib/authz/permissions";

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
  updated_at: string;
};

type ClinicalSummaryRow = {
  allergies: string | null;
  comorbidities: string | null;
  medications: string | null;
};

type PatientRow = {
  id: string;
  full_name: string;
  social_name: string | null;
  birth_date: string | null;
  sex_at_birth: string | null;
  cpf: string | null;
  rg: string | null;
  email: string | null;
  phone: string | null;
  photo_path: string | null;
  health_insurance_id: string | null;
};

type PreviousEncounterRow = {
  id: string;
  started_at: string;
  status: string;
  professional_id: string;
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
    documentsResult,
    clinicResult,
    organizationSettingsResult,
    appointmentResult,
    clinicalSummaryResult,
    attachmentsResult,
    previousEncountersResult,
  ] = await Promise.all([
    supabase
      .from("encounter_entries")
      .select("template_snapshot, structured_data, free_notes, updated_at")
      .eq("organization_id", encounter.organization_id)
      .eq("encounter_id", encounter.id)
      .single<EntryRow>(),
    supabase
      .from("patients")
      .select(
        "id, full_name, social_name, birth_date, sex_at_birth, cpf, rg, email, phone, photo_path, health_insurance_id",
      )
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
    // Só a última versão de cada modelo (Raio-X E12): antes vinham todas as
    // versões de todos os modelos, com o texto inteiro, a cada abertura.
    supabase
      .from("clinical_document_templates")
      .select(
        "id, document_type, name, versions:clinical_document_template_versions(id, template_id, version_number, title_template, body_template, layout_schema)",
      )
      .eq("organization_id", encounter.organization_id)
      .eq("active", true)
      .order("document_type")
      .order("name")
      .order("version_number", {
        referencedTable: "versions",
        ascending: false,
      })
      .limit(1, { referencedTable: "versions" })
      .returns<
        Array<
          DocumentTemplateRow & {
            versions: DocumentTemplateVersionRow[] | null;
          }
        >
      >(),
    supabase
      .from("clinical_documents")
      .select(
        "id, document_type, title, issued_at, consent_events:clinical_document_consent_events(event_type, created_at)",
      )
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
    // Alergias, medicações e comorbidades são a segurança do atendimento:
    // quem abriu este atendimento (a RLS acima já conferiu) precisa vê-las,
    // mesmo sem a permissão de dados cadastrais sensíveis (CPF e endereço)
    // que hoje protege a tabela. Leitura só do resumo deste paciente.
    createSupabaseAdminClient()
      .from("patient_clinical_summaries")
      .select("allergies, comorbidities, medications")
      .eq("organization_id", encounter.organization_id)
      .eq("patient_id", encounter.patient_id)
      .maybeSingle<ClinicalSummaryRow>(),
    // O atendimento acima já passou pelas regras de acesso da pessoa.
    listEncounterAttachments(encounter.organization_id, encounter.id),
    // Histórico para o painel lateral; a RLS já limita ao que a pessoa vê.
    supabase
      .from("encounters")
      .select("id, started_at, status, professional_id")
      .eq("organization_id", encounter.organization_id)
      .eq("patient_id", encounter.patient_id)
      .neq("id", encounter.id)
      .order("started_at", { ascending: false })
      .limit(4)
      .returns<PreviousEncounterRow[]>(),
  ]);

  if (!entryResult.data || !patientResult.data || !professionalResult.data) {
    notFound();
  }

  const appointment = appointmentResult.data;
  const previousEncounters = previousEncountersResult.data ?? [];
  const previousProfessionalIds = [
    ...new Set(previousEncounters.map((item) => item.professional_id)),
  ];
  const [
    specialtyResult,
    unitResult,
    procedureResult,
    insuranceResult,
    photoUrl,
    previousProfessionalsResult,
    previousDiagnosesResult,
  ] = await Promise.all([
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
    patientResult.data.health_insurance_id
      ? supabase
          .from("health_insurances")
          .select("name")
          .eq("organization_id", encounter.organization_id)
          .eq("id", patientResult.data.health_insurance_id)
          .maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null as { name: string } | null }),
    createPatientPhotoSignedUrl(patientResult.data.photo_path),
    previousProfessionalIds.length
      ? supabase
          .from("professionals")
          .select("id, name")
          .eq("organization_id", encounter.organization_id)
          .in("id", previousProfessionalIds)
          .returns<Array<{ id: string; name: string }>>()
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    previousEncounters.length
      ? supabase
          .from("encounter_diagnoses")
          .select("encounter_id, cid_code, description, is_primary")
          .eq("organization_id", encounter.organization_id)
          .in(
            "encounter_id",
            previousEncounters.map((item) => item.id),
          )
          .returns<
            Array<{
              encounter_id: string;
              cid_code: string;
              description: string | null;
              is_primary: boolean;
            }>
          >()
      : Promise.resolve({
          data: [] as Array<{
            encounter_id: string;
            cid_code: string;
            description: string | null;
            is_primary: boolean;
          }>,
        }),
  ]);

  const documentTemplates: ClinicalDocumentTemplate[] = (
    documentTemplatesResult.data ?? []
  ).flatMap(({ versions, ...template }) => {
    // O banco já devolve a mais recente primeiro; o reduce garante a ordem
    // mesmo se a ordenação aninhada não vier.
    const version = (versions ?? []).reduce<DocumentTemplateVersionRow | null>(
      (latest, item) =>
        !latest || item.version_number > latest.version_number ? item : latest,
      null,
    );
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
  const documentRenderContext = buildRenderContext({
    renderSnapshot: { timezone: timeZone, unit: unitResult.data },
    patient: patientResult.data,
    professional: professionalResult.data,
    clinic: clinicResult.data,
    organization: context.organization,
  });
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
  const source = Array.isArray(query.from) ? query.from[0] : query.from;
  const returnTo = Array.isArray(query.return_to)
    ? query.return_to[0]
    : query.return_to;
  const backDestination = encounterBackDestination(
    source,
    patientResult.data.id,
    returnTo,
  );

  // Quem abriu o atendimento fica registrado (Raio-X S6), depois da resposta.
  const origin = await requestOrigin();
  after(() =>
    logClinicalRecordAccess({
      organizationId: encounter.organization_id,
      actorUserId: context.actor?.id ?? null,
      effectiveUserId: context.effectiveUser?.id ?? null,
      impersonationSessionId: context.impersonation?.id ?? null,
      patientId: encounter.patient_id,
      encounterId: encounter.id,
      view: "encounter",
      origin,
    }),
  );

  const patientName =
    patientResult.data.social_name || patientResult.data.full_name;
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone }).format(
    new Date(),
  );
  const age = patientResult.data.birth_date
    ? ageInYears(patientResult.data.birth_date, todayKey)
    : null;
  const canEditSummary = canAccessClinicalSummary(context.permissionCodes);
  const clinicalSummary = clinicalSummaryResult.data;
  const allergies = clinicalSummary?.allergies?.trim() || null;
  const previousProfessionalName = new Map(
    (previousProfessionalsResult.data ?? []).map((item) => [
      item.id,
      item.name,
    ]),
  );
  const previousDiagnosis = new Map<
    string,
    { cid_code: string; description: string | null }
  >();
  for (const diagnosis of previousDiagnosesResult.data ?? []) {
    const current = previousDiagnosis.get(diagnosis.encounter_id);
    if (!current || diagnosis.is_primary) {
      previousDiagnosis.set(diagnosis.encounter_id, diagnosis);
    }
  }
  const patientFacts = [
    age !== null ? `${age} ${age === 1 ? "ano" : "anos"}` : null,
    sexLabel(patientResult.data.sex_at_birth),
    insuranceResult.data?.name ?? "Particular",
  ].filter(Boolean);
  const encounterFacts = [
    professionalResult.data.name,
    procedureResult.data?.name,
    `Início ${formatDateTime(encounter.started_at, timeZone)}`,
    encounter.finalized_at
      ? `Finalizado ${formatDateTime(encounter.finalized_at, timeZone)}`
      : encounter.appointment_id
        ? null
        : "Atendimento avulso",
  ].filter(Boolean);

  return (
    <div className="grid gap-5">
      <div className="grid min-w-0 gap-2">
        <h1 className="sr-only">Prontuário de {patientName}</h1>
        <Breadcrumb
          items={[
            { label: "Pacientes", href: "/pacientes" },
            {
              label: patientName,
              href: `/pacientes/${patientResult.data.id}`,
            },
            { label: "Prontuário" },
          ]}
        />
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={backDestination.href}>
              <ArrowLeft className="size-4" aria-hidden="true" />{" "}
              {backDestination.label}
            </Link>
          </Button>
        </div>
      </div>

      {/* Quem está sendo atendido, com o alerta de alergia sempre à vista. */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={patientName} photoUrl={photoUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-heading font-semibold">
                {patientName}
              </p>
              <p className="truncate text-body-sm text-muted-foreground">
                {patientFacts.join(" · ")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:ml-auto md:justify-end">
            {allergies ? (
              <Badge
                variant="destructive"
                className="h-auto min-h-6 max-w-[22rem] gap-1.5 py-0.5"
                title={`Alergias: ${allergies}`}
              >
                <WarningCircle
                  className="size-3.5 shrink-0"
                  weight="fill"
                  aria-hidden="true"
                />
                <span className="truncate">Alergia: {allergies}</span>
              </Badge>
            ) : (
              <Badge variant="neutral">Sem alergias registradas</Badge>
            )}
            <Badge
              variant={encounter.status === "finalized" ? "success" : "warning"}
            >
              {encounter.status === "finalized" ? "Finalizado" : "Rascunho"}
            </Badge>
            <Badge variant="neutral">
              {entryResult.data.template_snapshot.name ?? "Modelo"} v
              {entryResult.data.template_snapshot.version_number ?? 1}
            </Badge>
          </div>
        </CardContent>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border bg-surface-sunken/60 px-4 py-2 text-caption text-muted-foreground">
          {encounterFacts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </div>
      </Card>

      <EncounterWorkspace
        encounterId={encounter.id}
        templates={documentTemplates}
        documents={documentsResult.data ?? []}
        variables={documentVariables}
        renderContext={documentRenderContext}
        timeZone={timeZone}
        allowedTypes={clinicalDocumentTypes.filter((type) =>
          context.permissionCodes.has(documentTypePermissions[type]),
        )}
        allergies={allergies}
        ficha={
          <div className="grid gap-5">
            <EncounterEditor
              encounterId={encounter.id}
              status={encounter.status}
              canEdit={context.permissionCodes.has(
                "clinico.preencher_prontuario",
              )}
              canFinalize={context.permissionCodes.has(
                "clinico.finalizar_prontuario",
              )}
              canAddAddendum={context.permissionCodes.has(
                "clinico.adicionar_adendo",
              )}
              entryUpdatedAt={entryResult.data.updated_at}
              timeZone={timeZone}
              schema={
                entryResult.data.template_snapshot.schema ?? {
                  sections: [],
                }
              }
              structuredData={entryResult.data.structured_data ?? {}}
              freeNotes={entryResult.data.free_notes}
              diagnoses={diagnosesResult.data ?? []}
              addenda={(addendaResult.data ?? []).map((item) => ({
                id: item.id,
                content: item.content,
                created_at: item.created_at,
                author: authorName.get(item.author_user_id) ?? "Usuário",
              }))}
            />
            <EncounterAttachments
              encounterId={encounter.id}
              attachments={attachmentsResult.attachments}
              available={attachmentsResult.available}
              canUpload={
                attachmentsResult.available &&
                context.permissionCodes.has("clinico.preencher_prontuario")
              }
              timeZone={timeZone}
            />
          </div>
        }
        aside={
          <>
            <Card>
              <CardHeader className="flex items-center justify-between gap-2 px-4 py-3">
                <h2 className="text-label font-semibold">Contexto clínico</h2>
                {canEditSummary ? (
                  <Link
                    href={`/pacientes/${patientResult.data.id}`}
                    className="text-caption font-medium text-primary hover:underline"
                  >
                    Editar
                  </Link>
                ) : null}
              </CardHeader>
              <CardContent className="grid gap-3 p-4">
                <ClinicalContextItem label="Alergias" value={allergies} alert />
                <ClinicalContextItem
                  label="Medicamentos em uso"
                  value={clinicalSummary?.medications ?? null}
                />
                <ClinicalContextItem
                  label="Comorbidades"
                  value={clinicalSummary?.comorbidities ?? null}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex items-center justify-between gap-2 px-4 py-3">
                <h2 className="text-label font-semibold">
                  Atendimentos anteriores
                </h2>
                <Link
                  href={`/pacientes/${patientResult.data.id}`}
                  className="text-caption font-medium text-primary hover:underline"
                >
                  Ver histórico
                </Link>
              </CardHeader>
              {previousEncounters.length ? (
                <ul className="divide-y divide-border">
                  {previousEncounters.map((item) => {
                    const diagnosis = previousDiagnosis.get(item.id);
                    return (
                      <li key={item.id}>
                        <Link
                          href={`/prontuario/${item.id}`}
                          className="grid gap-0.5 px-4 py-2.5 transition-colors duration-[var(--motion-fast)] hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                        >
                          <span className="flex items-center justify-between gap-2 text-body-sm font-medium text-foreground">
                            {formatDate(
                              localDateKey(item.started_at, timeZone),
                            )}
                            {item.status !== "finalized" ? (
                              <Badge variant="warning" className="h-5 px-1.5">
                                Rascunho
                              </Badge>
                            ) : null}
                          </span>
                          <span className="truncate text-caption text-muted-foreground">
                            {previousProfessionalName.get(
                              item.professional_id,
                            ) ?? "Profissional"}
                          </span>
                          {diagnosis ? (
                            <span className="truncate text-caption text-secondary-foreground">
                              {diagnosis.cid_code}
                              {diagnosis.description
                                ? ` · ${diagnosis.description}`
                                : ""}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <CardContent className="p-4 text-body-sm text-muted-foreground">
                  Primeiro atendimento registrado deste paciente.
                </CardContent>
              )}
            </Card>
          </>
        }
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

  // Vindo da lista filtrada, volta para a mesma busca/página. Só aceita a
  // própria lista como destino, para o parâmetro não virar um redirecionamento.
  const listHref =
    source === "prontuario" &&
    returnTo &&
    /^\/prontuario(\?[^#]*)?$/.test(returnTo)
      ? returnTo
      : "/prontuario";
  return { href: listHref, label: "Voltar para o prontuário" };
}

function ClinicalContextItem({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string | null;
  alert?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-caption font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 whitespace-pre-line break-words text-body-sm",
          value
            ? alert
              ? "font-semibold text-destructive-foreground"
              : "text-foreground"
            : "text-muted-foreground",
        )}
      >
        {value || "Não informado"}
      </p>
    </div>
  );
}

function ageInYears(birthDate: string, todayKey: string) {
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [year, month, day] = todayKey.split("-").map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  return age >= 0 ? age : null;
}

function sexLabel(value: string | null) {
  if (value === "female") return "Feminino";
  if (value === "male") return "Masculino";
  if (value === "intersex") return "Intersexo";
  return null;
}

function localDateKey(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}
