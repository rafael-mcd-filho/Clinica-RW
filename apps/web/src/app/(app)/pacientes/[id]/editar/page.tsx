import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDots as CalendarDays,
  Clock as Clock3,
  FileText,
  ClockCounterClockwise as History,
  EnvelopeSimple as Mail,
  ChatCentered as MessageSquare,
  Phone,
  Faders as Settings2,
  Stethoscope,
  UserCircle as UserRound,
  Wallet as WalletCards,
} from "@phosphor-icons/react/dist/ssr";
import {
  ClinicalSummaryForm,
  ConsentsPanel,
  FutureModulePanel,
  TagsPanel,
  type ClinicalSummary,
  type ConsentRow,
  type TagRow,
} from "../patient-detail-panels";
import { PatientForm, type PatientFormValues } from "../../patient-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCPF, formatPhoneBR } from "@/lib/validation/br";

type AddressRow = NonNullable<PatientFormValues["address"]>;
type PatientTagRow = { tag_id: string };
type PatientDocumentRow = {
  id: string;
  document_type: string;
  title: string;
  issued_at: string;
};
type PatientReceivableRow = {
  id: string;
  description: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  status: string;
};
type EncounterRow = {
  id: string;
  professional_id: string;
  appointment_id: string | null;
  status: string;
  started_at: string;
  finalized_at: string | null;
};
type EncounterEntryRow = {
  encounter_id: string;
  template_snapshot: { name?: string };
  free_notes: string | null;
};
type DiagnosisRow = {
  encounter_id: string;
  cid_code: string;
  description: string | null;
  is_primary: boolean;
};
type ProfessionalRow = { id: string; name: string };
type AppointmentRow = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  professional_id: string;
  procedures: { name: string } | null;
  health_insurances: { name: string } | null;
};

const documentTypeLabels: Record<string, string> = {
  prescription: "Prescrição",
  exam_request: "Solicitação de exame",
  medical_certificate: "Atestado",
  attendance_declaration: "Declaração de comparecimento",
};

const appointmentStatusLabel: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  waiting: "Aguardando",
  in_progress: "Em atendimento",
  attended: "Atendido",
  no_show: "Faltou",
  cancelled: "Cancelado",
};

export default async function PatientDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireCompanyPermission(["paciente.ver"]);
  const { id } = await params;
  const canSeeSensitive = context.permissionCodes.has(
    "paciente.ver_dados_sensiveis",
  );
  const canSeeClinicalDocuments =
    context.permissionCodes.has("clinico.ver_prontuario") ||
    context.permissionCodes.has("clinico.ver_prontuario_proprios");
  const canSeeFinance =
    context.permissionCodes.has("financeiro.ver_geral") ||
    context.permissionCodes.has("financeiro.receber_pagamento");
  const canSeeAgenda = context.permissionCodes.has("agenda.ver");
  const canEdit = context.permissionCodes.has("paciente.editar");
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const nowIso = new Date().toISOString();

  const patientResult = await supabase
    .from("patients")
    .select(
      "id, full_name, social_name, birth_date, sex_at_birth, cpf, rg, email, phone, whatsapp, preferred_contact, allow_whatsapp, allow_email, allow_sms, status, source, deleted_at, created_at",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle<
      PatientFormValues & { deleted_at: string | null; created_at: string }
    >();

  if (!patientResult.data) notFound();
  const patient = patientResult.data;

  const [
    addressResult,
    clinicalResult,
    consentsResult,
    tagsResult,
    patientTagsResult,
    documentsResult,
    receivablesResult,
    encountersResult,
    appointmentsResult,
  ] = await Promise.all([
    canSeeSensitive
      ? supabase
          .from("patient_addresses")
          .select(
            "postal_code, address_line, address_number, address_complement, district, city, state",
          )
          .eq("patient_id", id)
          .eq("organization_id", organizationId)
          .maybeSingle<AddressRow>()
      : Promise.resolve({ data: null }),
    canSeeSensitive
      ? supabase
          .from("patient_clinical_summaries")
          .select(
            "allergies, comorbidities, medications, medical_history, family_history, habits, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship",
          )
          .eq("patient_id", id)
          .eq("organization_id", organizationId)
          .maybeSingle<ClinicalSummary>()
      : Promise.resolve({ data: null }),
    supabase
      .from("patient_consents")
      .select("id, consent_type, version, accepted_at, revoked_at")
      .eq("patient_id", id)
      .eq("organization_id", organizationId)
      .order("accepted_at", { ascending: false })
      .returns<ConsentRow[]>(),
    supabase
      .from("tags")
      .select("id, name, color")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<TagRow[]>(),
    supabase
      .from("patient_tags")
      .select("tag_id")
      .eq("patient_id", id)
      .eq("organization_id", organizationId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .returns<PatientTagRow[]>(),
    canSeeClinicalDocuments
      ? supabase
          .from("clinical_documents")
          .select("id, document_type, title, issued_at")
          .eq("patient_id", id)
          .eq("organization_id", organizationId)
          .order("issued_at", { ascending: false })
          .returns<PatientDocumentRow[]>()
      : Promise.resolve({ data: [] as PatientDocumentRow[] }),
    canSeeFinance
      ? supabase
          .from("accounts_receivable")
          .select("id, description, amount, paid_amount, due_date, status")
          .eq("patient_id", id)
          .eq("organization_id", organizationId)
          .order("due_date", { ascending: false })
          .returns<PatientReceivableRow[]>()
      : Promise.resolve({ data: [] as PatientReceivableRow[] }),
    canSeeClinicalDocuments
      ? supabase
          .from("encounters")
          .select(
            "id, professional_id, appointment_id, status, started_at, finalized_at",
          )
          .eq("patient_id", id)
          .eq("organization_id", organizationId)
          .order("started_at", { ascending: false })
          .limit(30)
          .returns<EncounterRow[]>()
      : Promise.resolve({ data: [] as EncounterRow[] }),
    canSeeAgenda || canSeeClinicalDocuments
      ? supabase
          .from("appointments")
          .select(
            "id, start_at, end_at, status, professional_id, procedures(name), health_insurances(name)",
          )
          .eq("patient_id", id)
          .eq("organization_id", organizationId)
          .order("start_at", { ascending: false })
          .limit(30)
          .returns<AppointmentRow[]>()
      : Promise.resolve({ data: [] as AppointmentRow[] }),
  ]);

  const encounters = encountersResult.data ?? [];
  const encounterIds = encounters.map((encounter) => encounter.id);
  const professionalIds = [
    ...new Set(
      [
        ...encounters.map((encounter) => encounter.professional_id),
        ...(appointmentsResult.data ?? []).map(
          (appointment) => appointment.professional_id,
        ),
      ].filter(Boolean),
    ),
  ];

  const [entriesResult, diagnosesResult, professionalsResult] =
    await Promise.all([
      encounterIds.length
        ? supabase
            .from("encounter_entries")
            .select("encounter_id, template_snapshot, free_notes")
            .eq("organization_id", organizationId)
            .in("encounter_id", encounterIds)
            .returns<EncounterEntryRow[]>()
        : Promise.resolve({ data: [] as EncounterEntryRow[] }),
      encounterIds.length
        ? supabase
            .from("encounter_diagnoses")
            .select("encounter_id, cid_code, description, is_primary")
            .eq("organization_id", organizationId)
            .in("encounter_id", encounterIds)
            .order("is_primary", { ascending: false })
            .returns<DiagnosisRow[]>()
        : Promise.resolve({ data: [] as DiagnosisRow[] }),
      professionalIds.length
        ? supabase
            .from("professionals")
            .select("id, name")
            .eq("organization_id", organizationId)
            .in("id", professionalIds)
            .returns<ProfessionalRow[]>()
        : Promise.resolve({ data: [] as ProfessionalRow[] }),
    ]);

  const entryByEncounter = new Map(
    (entriesResult.data ?? []).map((entry) => [entry.encounter_id, entry]),
  );
  const diagnosisByEncounter = new Map<string, DiagnosisRow>();
  for (const diagnosis of diagnosesResult.data ?? []) {
    if (!diagnosisByEncounter.has(diagnosis.encounter_id)) {
      diagnosisByEncounter.set(diagnosis.encounter_id, diagnosis);
    }
  }
  const professionalName = new Map(
    (professionalsResult.data ?? []).map((item) => [item.id, item.name]),
  );
  const appointmentById = new Map(
    (appointmentsResult.data ?? []).map((item) => [item.id, item]),
  );

  const formPatient: PatientFormValues = {
    ...patient,
    address: addressResult.data,
  };
  const displayName = patient.social_name || patient.full_name;

  return (
    <div className="grid gap-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="secondary" size="icon">
            <Link href={`/pacientes/${id}`} aria-label="Voltar para o resumo">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{displayName}</h1>
              <Badge variant={patient.deleted_at ? "neutral" : "success"}>
                {patient.deleted_at ? "Arquivado" : "Ativo"}
              </Badge>
            </div>
            {patient.social_name ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Nome civil: {patient.full_name}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          icon={UserRound}
          label="CPF"
          value={patient.cpf ? formatCPF(patient.cpf) : "Não informado"}
        />
        <InfoCard
          icon={CalendarDays}
          label="Nascimento"
          value={
            patient.birth_date
              ? formatDate(patient.birth_date)
              : "Não informado"
          }
        />
        <InfoCard
          icon={Phone}
          label="Telefone"
          value={patient.phone ? formatPhoneBR(patient.phone) : "Não informado"}
        />
        <InfoCard
          icon={Mail}
          label="E-mail"
          value={patient.email || "Não informado"}
        />
      </section>

      <Tabs
        ariaLabel="Seções do paciente"
        urlParam="section"
        items={[
          {
            id: "pessoais",
            label: "Dados pessoais",
            icon: <UserRound />,
            content: canEdit ? (
              <PatientForm
                patient={formPatient}
                canSeeSensitive={canSeeSensitive}
              />
            ) : (
              <FutureModulePanel
                title="Dados pessoais em modo leitura"
                description="Seu perfil não possui permissão para editar este paciente."
              />
            ),
          },
          {
            id: "clinicos",
            label: "Dados clínicos",
            icon: <Stethoscope />,
            content: canSeeSensitive ? (
              <ClinicalSummaryForm
                patientId={id}
                summary={clinicalResult.data}
                canEdit
              />
            ) : (
              <FutureModulePanel
                title="Conteúdo clínico protegido"
                description="Seu perfil não possui acesso aos dados clínicos permanentes."
              />
            ),
          },
          {
            id: "historico",
            label: "Histórico",
            icon: <History />,
            content:
              canSeeAgenda || canSeeClinicalDocuments ? (
                <PatientHistoryPanel
                  appointments={appointmentsResult.data ?? []}
                  encounters={encounters}
                  entryByEncounter={entryByEncounter}
                  diagnosisByEncounter={diagnosisByEncounter}
                  professionalName={professionalName}
                  appointmentById={appointmentById}
                  canSeeAgenda={canSeeAgenda}
                  canSeeEncounters={canSeeClinicalDocuments}
                />
              ) : (
                <FutureModulePanel
                  title="Histórico protegido"
                  description="Seu perfil não possui permissão para visualizar agenda ou prontuário."
                />
              ),
          },
          {
            id: "documentos",
            label: "Documentos",
            icon: <FileText />,
            content: canSeeClinicalDocuments ? (
              <DocumentsHistoryPanel documents={documentsResult.data ?? []} />
            ) : (
              <FutureModulePanel
                title="Documentos clínicos"
                description="Prescrições, atestados e solicitações entrarão na Fase 8."
              />
            ),
          },
          {
            id: "financeiro",
            label: "Financeiro",
            icon: <WalletCards />,
            content: canSeeFinance ? (
              <PatientFinancePanel receivables={receivablesResult.data ?? []} />
            ) : (
              <FutureModulePanel
                title="Financeiro do paciente"
                description="Cobranças e pagamentos entrarão na Fase 9."
              />
            ),
          },
          {
            id: "mensagens",
            label: "Mensagens",
            icon: <MessageSquare />,
            content: (
              <FutureModulePanel
                title="Mensagens"
                description="O histórico de comunicação será conectado nas fases de automação."
              />
            ),
          },
          {
            id: "configuracoes",
            label: "Configurações",
            icon: <Settings2 />,
            content: (
              <div className="grid gap-5">
                <ConsentsPanel
                  patientId={id}
                  consents={consentsResult.data ?? []}
                  canEdit={canEdit}
                />
                <TagsPanel
                  patientId={id}
                  tags={tagsResult.data ?? []}
                  selectedTagIds={(patientTagsResult.data ?? []).map(
                    (item) => item.tag_id,
                  )}
                  canEdit={canEdit}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function PatientHistoryPanel({
  appointments,
  encounters,
  entryByEncounter,
  diagnosisByEncounter,
  professionalName,
  appointmentById,
  canSeeAgenda,
  canSeeEncounters,
}: {
  appointments: AppointmentRow[];
  encounters: EncounterRow[];
  entryByEncounter: Map<string, EncounterEntryRow>;
  diagnosisByEncounter: Map<string, DiagnosisRow>;
  professionalName: Map<string, string>;
  appointmentById: Map<string, AppointmentRow>;
  canSeeAgenda: boolean;
  canSeeEncounters: boolean;
}) {
  return (
    <div className="grid gap-6">
      {canSeeAgenda ? (
        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">Agendamentos</h3>
          {appointments.length ? (
            <div className="grid gap-2">
              {appointments.map((appointment) => (
                <Card key={appointment.id}>
                  <CardContent className="flex flex-col justify-between gap-2 p-4 md:flex-row md:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {appointment.procedures?.name ?? "Consulta"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {professionalName.get(appointment.professional_id) ??
                          "Profissional"}{" "}
                        · {formatDateTime(appointment.start_at)}
                      </p>
                    </div>
                    <Badge
                      variant={
                        appointment.status === "cancelled"
                          ? "neutral"
                          : appointment.status === "attended"
                            ? "success"
                            : appointment.status === "no_show"
                              ? "warning"
                              : "primary"
                      }
                    >
                      {appointmentStatusLabel[appointment.status] ??
                        appointment.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <FutureModulePanel
              title="Nenhum agendamento"
              description="Agendamentos deste paciente aparecerão aqui."
            />
          )}
        </section>
      ) : null}

      {canSeeEncounters ? (
        <section className="grid gap-3">
          <h3 className="text-sm font-semibold">Atendimentos</h3>
          {encounters.length ? (
            <div className="grid gap-2">
              {encounters.map((encounter) => {
                const entry = entryByEncounter.get(encounter.id);
                const diagnosis = diagnosisByEncounter.get(encounter.id);
                const appointment = encounter.appointment_id
                  ? appointmentById.get(encounter.appointment_id)
                  : null;
                const title =
                  appointment?.procedures?.name ??
                  entry?.template_snapshot.name ??
                  "Atendimento clínico";

                return (
                  <Card key={encounter.id}>
                    <CardContent className="grid gap-2 p-4">
                      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {title}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {professionalName.get(encounter.professional_id) ??
                              "Profissional"}
                            {diagnosis
                              ? ` · ${diagnosis.cid_code}${
                                  diagnosis.description
                                    ? ` - ${diagnosis.description}`
                                    : ""
                                }`
                              : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            variant={
                              encounter.status === "finalized"
                                ? "success"
                                : "warning"
                            }
                          >
                            {encounter.status === "finalized"
                              ? "Finalizado"
                              : "Rascunho"}
                          </Badge>
                          <Button asChild variant="ghost" size="sm">
                            <Link
                              href={`/prontuario/${encounter.id}?from=paciente`}
                            >
                              Ver detalhes
                            </Link>
                          </Button>
                        </div>
                      </div>
                      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock3 className="size-3.5" aria-hidden="true" />
                        {formatDateTime(encounter.started_at)}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <FutureModulePanel
              title="Nenhum atendimento registrado"
              description="Atendimentos clínicos finalizados aparecerão aqui."
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

function DocumentsHistoryPanel({
  documents,
}: {
  documents: PatientDocumentRow[];
}) {
  return (
    <div className="grid gap-3">
      {documents.map((document) => (
        <Card key={document.id}>
          <CardContent className="flex flex-col justify-between gap-3 p-4 md:flex-row md:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded bg-primary-muted text-primary">
                <FileText className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {document.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {documentTypeLabels[document.document_type] ??
                    document.document_type}{" "}
                  · {formatDateTime(document.issued_at)}
                </p>
              </div>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/documentos/${document.id}/pdf`} target="_blank">
                Abrir PDF
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
      {!documents.length ? (
        <FutureModulePanel
          title="Nenhum documento emitido"
          description="Documentos emitidos durante os atendimentos aparecerão aqui."
        />
      ) : null}
    </div>
  );
}

function PatientFinancePanel({
  receivables,
}: {
  receivables: PatientReceivableRow[];
}) {
  const openBalance = receivables
    .filter((item) => ["open", "partial"].includes(item.status))
    .reduce(
      (sum, item) =>
        sum + Math.max(0, Number(item.amount) - Number(item.paid_amount)),
      0,
    );

  return (
    <div className="grid gap-3">
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Saldo em aberto</p>
          <p className="mt-1 text-xl font-semibold">
            {formatCurrency(openBalance)}
          </p>
        </CardContent>
      </Card>
      {receivables.map((receivable) => (
        <Card key={receivable.id}>
          <CardContent className="flex flex-col justify-between gap-3 p-4 md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold">{receivable.description}</p>
              <p className="text-xs text-muted-foreground">
                Venc. {formatDate(receivable.due_date)} ·{" "}
                {formatCurrency(receivable.paid_amount)} recebido de{" "}
                {formatCurrency(receivable.amount)}
              </p>
            </div>
            <Badge
              variant={
                receivable.status === "paid"
                  ? "success"
                  : receivable.status === "open"
                    ? "warning"
                    : "neutral"
              }
            >
              {receivable.status === "paid"
                ? "Pago"
                : receivable.status === "open"
                  ? "Aberto"
                  : receivable.status}
            </Badge>
          </CardContent>
        </Card>
      ))}
      {!receivables.length ? (
        <FutureModulePanel
          title="Nenhuma pendência financeira"
          description="Cobranças geradas por consultas aparecerão aqui."
        />
      ) : null}
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded bg-primary-muted text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-medium">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}
