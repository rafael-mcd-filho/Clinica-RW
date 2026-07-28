import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDots as CalendarDays,
  CheckCircle as CircleCheck,
  ChatCentered as MessageSquare,
  Clock as Clock3,
  ClockCounterClockwise as History,
  CreditCard,
  PencilSimpleLine as Edit3,
  FileText,
  Heartbeat as HeartPulse,
  EnvelopeSimple as Mail,
  MapPin,
  Phone,
  ShieldWarning as ShieldAlert,
  Stethoscope,
  Tag,
  UserCircle as UserRound,
} from "@phosphor-icons/react/dist/ssr";
import { type ClinicalSummary, type TagRow } from "./patient-detail-panels";
import { PatientPhotoForm } from "./patient-photo-form";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { getPatientCompleteness } from "@/lib/patients/completeness";
import { createPatientPhotoSignedUrl } from "@/lib/storage/patient-photos";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, initialsFromName } from "@/lib/utils";
import { formatCPF, formatPhoneBR } from "@/lib/validation/br";

type PatientRow = {
  id: string;
  full_name: string;
  social_name: string | null;
  birth_date: string | null;
  sex_at_birth: string | null;
  cpf?: string | null;
  rg?: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferred_contact: string;
  allow_whatsapp: boolean;
  allow_email: boolean;
  allow_sms: boolean;
  status: string;
  source: string | null;
  photo_path: string | null;
  deceased_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

type AddressRow = {
  postal_code: string | null;
  address_line: string | null;
  address_number: string | null;
  address_complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

type PatientTagRow = { tag_id: string };

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
  professional_id: string;
  start_at: string;
  end_at: string;
  status: string;
  procedures: { name: string } | null;
  health_insurances: { name: string } | null;
};

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

type WhatsAppContactRow = {
  id: string;
  phone: string;
  wa_name: string | null;
};

type WhatsAppConversationRow = {
  id: string;
  contact_id: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
};

type WhatsAppMessageRow = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  sent_at: string | null;
  created_at: string;
};

type PatientSection =
  | "overview"
  | "history"
  | "documents"
  | "finance"
  | "messages";

const documentTypeLabels: Record<string, string> = {
  prescription: "Prescrição",
  exam_request: "Solicitação de exame",
  medical_certificate: "Atestado",
  attendance_declaration: "Declaração de comparecimento",
};

export default async function PatientDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireCompanyPermission(["paciente.ver"]);
  const { id } = await params;
  const canSeeSensitive = context.permissionCodes.has(
    "paciente.ver_dados_sensiveis",
  );
  const canSeeClinicalRecords =
    context.permissionCodes.has("clinico.ver_prontuario") ||
    context.permissionCodes.has("clinico.ver_prontuario_proprios");
  const canSeeFinance =
    context.permissionCodes.has("financeiro.ver_geral") ||
    context.permissionCodes.has("financeiro.receber_pagamento");
  const canSeeAgenda = context.permissionCodes.has("agenda.ver");
  const canSeeMessages = context.permissionCodes.has("atendimento.ver");
  const canEdit = context.permissionCodes.has("paciente.editar");
  const rawSection = (await searchParams)?.section;
  const requestedSection = normalizePatientSection(
    typeof rawSection === "string" ? rawSection : undefined,
  );
  const section = isPatientSectionAllowed(requestedSection, {
    canSeeAgenda,
    canSeeClinicalRecords,
    canSeeFinance,
    canSeeMessages,
  })
    ? requestedSection
    : "overview";
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const nowIso = new Date().toISOString();
  const patientSelect = canSeeSensitive
    ? "id, full_name, social_name, birth_date, sex_at_birth, cpf, rg, email, phone, whatsapp, preferred_contact, allow_whatsapp, allow_email, allow_sms, status, source, photo_path, deceased_at, deleted_at, created_at"
    : "id, full_name, social_name, birth_date, sex_at_birth, email, phone, whatsapp, preferred_contact, allow_whatsapp, allow_email, allow_sms, status, source, photo_path, deceased_at, deleted_at, created_at";

  const patientResult = await supabase
    .from("patients")
    .select(patientSelect as string)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle<PatientRow>();

  if (!patientResult.data) notFound();
  const patient = patientResult.data;

  let documentsQuery = supabase
    .from("clinical_documents")
    .select("id, document_type, title, issued_at", { count: "exact" })
    .eq("patient_id", id)
    .eq("organization_id", organizationId)
    .order("issued_at", { ascending: false });
  documentsQuery = documentsQuery.limit(section === "documents" ? 100 : 5);

  let receivablesQuery = supabase
    .from("accounts_receivable")
    .select("id, description, amount, paid_amount, due_date, status", {
      count: "exact",
    })
    .eq("patient_id", id)
    .eq("organization_id", organizationId)
    .order("due_date", { ascending: false });
  receivablesQuery = receivablesQuery.limit(section === "finance" ? 100 : 5);

  let encountersQuery = supabase
    .from("encounters")
    .select(
      "id, professional_id, appointment_id, status, started_at, finalized_at",
      { count: "exact" },
    )
    .eq("patient_id", id)
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false });
  encountersQuery = encountersQuery.limit(section === "history" ? 100 : 5);

  let patientAppointmentsQuery = supabase
    .from("appointments")
    .select(
      "id, professional_id, start_at, end_at, status, procedures(name), health_insurances(name)",
      { count: "exact" },
    )
    .eq("patient_id", id)
    .eq("organization_id", organizationId)
    .order("start_at", { ascending: false });
  patientAppointmentsQuery = patientAppointmentsQuery.limit(
    section === "history" ? 100 : 5,
  );

  const [
    addressResult,
    clinicalResult,
    tagsResult,
    patientTagsResult,
    documentsResult,
    receivablesResult,
    encountersResult,
    patientAppointmentsResult,
    whatsappContactsResult,
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
    canSeeClinicalRecords
      ? documentsQuery.returns<PatientDocumentRow[]>()
      : Promise.resolve({ data: [] as PatientDocumentRow[], count: 0 }),
    canSeeFinance
      ? receivablesQuery.returns<PatientReceivableRow[]>()
      : Promise.resolve({ data: [] as PatientReceivableRow[], count: 0 }),
    canSeeClinicalRecords
      ? encountersQuery.returns<EncounterRow[]>()
      : Promise.resolve({ data: [] as EncounterRow[], count: 0 }),
    canSeeAgenda
      ? patientAppointmentsQuery.returns<AppointmentRow[]>()
      : Promise.resolve({ data: [] as AppointmentRow[], count: 0 }),
    canSeeMessages
      ? supabase
          .from("whatsapp_contacts")
          .select("id, phone, wa_name")
          .eq("organization_id", organizationId)
          .eq("patient_id", id)
          .order("updated_at", { ascending: false })
          .returns<WhatsAppContactRow[]>()
      : Promise.resolve({ data: [] as WhatsAppContactRow[] }),
  ]);

  const encounters = encountersResult.data ?? [];
  const patientAppointments = patientAppointmentsResult.data ?? [];
  const encounterIds = encounters.map((encounter) => encounter.id);
  const professionalIds = [
    ...new Set(
      [
        ...encounters.map((encounter) => encounter.professional_id),
        ...patientAppointments.map(
          (appointment) => appointment.professional_id,
        ),
      ].filter(Boolean),
    ),
  ];
  const appointmentIds = [
    ...new Set(
      encounters
        .map((encounter) => encounter.appointment_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const [
    entriesResult,
    diagnosesResult,
    professionalsResult,
    encounterAppointmentsResult,
    conversationsResult,
  ] = await Promise.all([
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
    appointmentIds.length
      ? supabase
          .from("appointments")
          .select(
            "id, professional_id, start_at, end_at, status, procedures(name), health_insurances(name)",
          )
          .eq("organization_id", organizationId)
          .in("id", appointmentIds)
          .returns<AppointmentRow[]>()
      : Promise.resolve({ data: [] as AppointmentRow[] }),
    canSeeMessages && (whatsappContactsResult.data?.length ?? 0) > 0
      ? supabase
          .from("whatsapp_conversations")
          .select(
            "id, contact_id, status, last_message_at, last_message_preview",
          )
          .eq("organization_id", organizationId)
          .in(
            "contact_id",
            (whatsappContactsResult.data ?? []).map((contact) => contact.id),
          )
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .returns<WhatsAppConversationRow[]>()
      : Promise.resolve({ data: [] as WhatsAppConversationRow[] }),
  ]);

  const conversations = conversationsResult.data ?? [];
  const conversationIds = conversations.map((conversation) => conversation.id);
  const messagesResult =
    section === "messages" && conversationIds.length
      ? await supabase
          .from("whatsapp_messages")
          .select(
            "id, conversation_id, direction, message_type, body, sent_at, created_at",
          )
          .eq("organization_id", organizationId)
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
          .limit(100)
          .returns<WhatsAppMessageRow[]>()
      : { data: [] as WhatsAppMessageRow[] };

  const displayName = patient.social_name || patient.full_name;
  const photoUrl = await createPatientPhotoSignedUrl(patient.photo_path);
  const selectedTagIds = new Set(
    (patientTagsResult.data ?? []).map((item) => item.tag_id),
  );
  const selectedTags = (tagsResult.data ?? []).filter((tag) =>
    selectedTagIds.has(tag.id),
  );
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
    (encounterAppointmentsResult.data ?? []).map((item) => [item.id, item]),
  );
  const contactById = new Map(
    (whatsappContactsResult.data ?? []).map((contact) => [contact.id, contact]),
  );
  const completeness = getPatientCompleteness({
    fullName: patient.full_name,
    birthDate: patient.birth_date,
    sexAtBirth: patient.sex_at_birth,
    cpf: patient.cpf,
    rg: patient.rg,
    source: patient.source,
    email: patient.email,
    phone: patient.phone,
    whatsapp: patient.whatsapp,
    preferredContact: patient.preferred_contact,
    allowWhatsapp: patient.allow_whatsapp,
    allowEmail: patient.allow_email,
    postalCode: addressResult.data?.postal_code,
    addressLine: addressResult.data?.address_line,
    addressNumber: addressResult.data?.address_number,
    district: addressResult.data?.district,
    city: addressResult.data?.city,
    state: addressResult.data?.state,
  });
  const openBalance = (receivablesResult.data ?? [])
    .filter((item) => ["open", "partial"].includes(item.status))
    .reduce(
      (sum, item) =>
        sum + Math.max(0, Number(item.amount) - Number(item.paid_amount)),
      0,
    );

  return (
    <div className="grid gap-6">
      <section className="grid min-w-0 gap-2">
        <Breadcrumb
          items={[
            { label: "Pacientes", href: "/pacientes" },
            { label: displayName },
          ]}
        />
        <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="secondary" size="icon">
              <Link href="/pacientes" aria-label="Voltar para pacientes">
                <ArrowLeft className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-heading-lg">{displayName}</h1>
                <Badge
                  variant={
                    patient.deceased_at
                      ? "destructive"
                      : patient.deleted_at
                        ? "neutral"
                        : patient.status === "active"
                          ? "success"
                          : "neutral"
                  }
                >
                  {patient.deceased_at
                    ? "Óbito"
                    : patient.deleted_at
                      ? "Arquivado"
                      : patient.status === "active"
                        ? "Ativo"
                        : "Inativo"}
                </Badge>
              </div>
              {patient.social_name ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Nome civil: {patient.full_name}
                </p>
              ) : null}
            </div>
          </div>
          {canEdit ? (
            <Button asChild className="w-full sm:w-auto">
              <Link href={`/pacientes/${patient.id}/editar`}>
                <Edit3 className="size-4" aria-hidden="true" />
                Editar paciente
              </Link>
            </Button>
          ) : null}
        </div>
      </section>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="grid min-w-0 self-start overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)] lg:sticky lg:top-24">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 bg-gradient-to-b from-primary-muted to-transparent px-4 py-5 lg:grid-cols-1 lg:justify-items-center lg:gap-3 lg:px-5 lg:pb-5 lg:pt-6">
            <PatientPhotoForm
              patientId={patient.id}
              photoUrl={photoUrl}
              initials={initialsFromName(displayName)}
              canEdit={canEdit}
              completeness={canSeeSensitive ? completeness : null}
              deceased={Boolean(patient.deceased_at)}
            />

            <div className="min-w-0 text-left lg:text-center">
              <h2 className="truncate font-semibold">{displayName}</h2>
              {patient.social_name ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nome civil: {patient.full_name}
                </p>
              ) : null}
              {patient.deceased_at ? (
                <p className="mt-2 text-xs font-semibold text-destructive">
                  Óbito em {formatDate(patient.deceased_at)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid min-w-0 gap-4 px-4 pb-5 sm:px-5">
            <div className="h-px bg-border" />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <SidebarInfo
                icon={CalendarDays}
                label="Nascimento"
                value={
                  patient.birth_date
                    ? `${formatDate(patient.birth_date)} (${patientAge(
                        patient.birth_date,
                        patient.deceased_at,
                      )})`
                    : "Não informado"
                }
              />
              <SidebarInfo
                icon={UserRound}
                label="Sexo"
                value={sexLabel(patient.sex_at_birth)}
              />
              {canSeeSensitive ? (
                <SidebarInfo
                  icon={CreditCard}
                  label="CPF"
                  value={patient.cpf ? formatCPF(patient.cpf) : "Não informado"}
                />
              ) : null}
              <SidebarInfo
                icon={Phone}
                label="Telefone"
                value={
                  patient.phone
                    ? formatPhoneBR(patient.phone)
                    : patient.whatsapp
                      ? formatPhoneBR(patient.whatsapp)
                      : "Não informado"
                }
              />
              <SidebarInfo
                icon={Mail}
                label="E-mail"
                value={patient.email || "Não informado"}
              />
              {canSeeSensitive ? (
                <SidebarInfo
                  icon={MapPin}
                  label="Endereço"
                  value={formatAddress(addressResult.data)}
                />
              ) : null}
            </div>

            {selectedTags.length ? (
              <SidebarSection icon={Tag} title="Tags">
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none"
                      style={{
                        borderColor: `${tag.color}55`,
                        color: tag.color,
                        backgroundColor: `${tag.color}0D`,
                      }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </SidebarSection>
            ) : null}

            {canSeeSensitive ? (
              <ClinicalSidebar summary={clinicalResult.data} />
            ) : (
              <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                Dados clínicos permanentes protegidos.
              </div>
            )}
          </div>
        </aside>

        <main id="conteudo-paciente" className="grid min-w-0 gap-5">
          <PatientModuleNavigation
            patientId={patient.id}
            activeSection={section}
            canSeeHistory={canSeeAgenda || canSeeClinicalRecords}
            canSeeDocuments={canSeeClinicalRecords}
            canSeeFinance={canSeeFinance}
            canSeeMessages={canSeeMessages}
          />

          {section === "overview" ? (
            <>
              <ModuleHeading
                title="Visão geral do paciente"
                description="Agenda, registros clínicos, documentos, financeiro e comunicação reunidos em um só lugar."
              />

              {canSeeAgenda || canSeeClinicalRecords ? (
                <PatientHistoryModule
                  patientId={patient.id}
                  appointments={patientAppointments}
                  appointmentTotal={
                    patientAppointmentsResult.count ??
                    patientAppointments.length
                  }
                  encounters={encounters}
                  encounterTotal={encountersResult.count ?? encounters.length}
                  entryByEncounter={entryByEncounter}
                  diagnosisByEncounter={diagnosisByEncounter}
                  professionalName={professionalName}
                  appointmentById={appointmentById}
                  canSeeAgenda={canSeeAgenda}
                  canSeeClinicalRecords={canSeeClinicalRecords}
                  viewAll
                />
              ) : null}

              <section className="grid gap-4 xl:grid-cols-2">
                {canSeeClinicalRecords ? (
                  <DocumentsPanel
                    patientId={patient.id}
                    documents={documentsResult.data ?? []}
                    total={documentsResult.count ?? 0}
                    viewAll
                  />
                ) : null}
                {canSeeFinance ? (
                  <FinancePanel
                    patientId={patient.id}
                    receivables={receivablesResult.data ?? []}
                    total={receivablesResult.count ?? 0}
                    openBalance={openBalance}
                    partialBalance
                    viewAll
                  />
                ) : null}
              </section>

              {canSeeMessages ? (
                <MessagesPanel
                  patientId={patient.id}
                  conversations={conversations}
                  contactById={contactById}
                  messages={[]}
                  viewAll
                />
              ) : null}
            </>
          ) : null}

          {section === "history" ? (
            <PatientHistoryModule
              patientId={patient.id}
              appointments={patientAppointments}
              appointmentTotal={
                patientAppointmentsResult.count ?? patientAppointments.length
              }
              encounters={encounters}
              encounterTotal={encountersResult.count ?? encounters.length}
              entryByEncounter={entryByEncounter}
              diagnosisByEncounter={diagnosisByEncounter}
              professionalName={professionalName}
              appointmentById={appointmentById}
              canSeeAgenda={canSeeAgenda}
              canSeeClinicalRecords={canSeeClinicalRecords}
            />
          ) : null}

          {section === "documents" && canSeeClinicalRecords ? (
            <DocumentsPanel
              patientId={patient.id}
              documents={documentsResult.data ?? []}
              total={documentsResult.count ?? 0}
            />
          ) : null}

          {section === "finance" && canSeeFinance ? (
            <FinancePanel
              patientId={patient.id}
              receivables={receivablesResult.data ?? []}
              total={receivablesResult.count ?? 0}
              openBalance={openBalance}
              partialBalance={
                (receivablesResult.count ?? 0) >
                (receivablesResult.data?.length ?? 0)
              }
            />
          ) : null}

          {section === "messages" && canSeeMessages ? (
            <MessagesPanel
              patientId={patient.id}
              conversations={conversations}
              contactById={contactById}
              messages={messagesResult.data ?? []}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function PatientModuleNavigation({
  activeSection,
  canSeeDocuments,
  canSeeFinance,
  canSeeHistory,
  canSeeMessages,
  patientId,
}: {
  activeSection: PatientSection;
  canSeeDocuments: boolean;
  canSeeFinance: boolean;
  canSeeHistory: boolean;
  canSeeMessages: boolean;
  patientId: string;
}) {
  const items = [
    {
      id: "overview" as const,
      label: "Resumo",
      icon: UserRound,
      visible: true,
    },
    {
      id: "history" as const,
      label: "Histórico",
      icon: History,
      visible: canSeeHistory,
    },
    {
      id: "documents" as const,
      label: "Documentos",
      icon: FileText,
      visible: canSeeDocuments,
    },
    {
      id: "finance" as const,
      label: "Financeiro",
      icon: CreditCard,
      visible: canSeeFinance,
    },
    {
      id: "messages" as const,
      label: "Mensagens",
      icon: MessageSquare,
      visible: canSeeMessages,
    },
  ].filter((item) => item.visible);

  return (
    <nav
      aria-label="Módulos do paciente"
      className="max-w-full overflow-x-auto pb-1"
    >
      <div className="inline-flex min-w-max items-center gap-1 rounded-lg border border-border bg-muted p-1 shadow-[var(--shadow-soft)]">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeSection;
          const href =
            item.id === "overview"
              ? `/pacientes/${patientId}#conteudo-paciente`
              : `/pacientes/${patientId}?section=${item.id}#conteudo-paciente`;

          return (
            <Link
              key={item.id}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-card text-foreground shadow-[var(--shadow-soft)]"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ModuleHeading({
  action,
  description,
  title,
}: {
  action?: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </section>
  );
}

function PatientHistoryModule({
  appointmentById,
  appointmentTotal,
  appointments,
  canSeeAgenda,
  canSeeClinicalRecords,
  diagnosisByEncounter,
  encounterTotal,
  encounters,
  entryByEncounter,
  patientId,
  professionalName,
  viewAll = false,
}: {
  appointmentById: Map<string, AppointmentRow>;
  appointmentTotal: number;
  appointments: AppointmentRow[];
  canSeeAgenda: boolean;
  canSeeClinicalRecords: boolean;
  diagnosisByEncounter: Map<string, DiagnosisRow>;
  encounterTotal: number;
  encounters: EncounterRow[];
  entryByEncounter: Map<string, EncounterEntryRow>;
  patientId: string;
  professionalName: Map<string, string>;
  viewAll?: boolean;
}) {
  return (
    <section className="grid gap-4">
      <ModuleHeading
        title="Histórico de atendimentos"
        description={`${appointmentTotal} agendamento${
          appointmentTotal === 1 ? "" : "s"
        } e ${encounterTotal} registro${
          encounterTotal === 1 ? "" : "s"
        } clínico${encounterTotal === 1 ? "" : "s"}.`}
        action={
          viewAll ? (
            <Button asChild variant="secondary" size="sm">
              <Link
                href={`/pacientes/${patientId}?section=history#conteudo-paciente`}
              >
                Ver histórico
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : undefined
        }
      />

      {canSeeAgenda ? (
        <AppointmentsPanel
          appointments={appointments}
          professionalName={professionalName}
          total={appointmentTotal}
        />
      ) : null}

      {canSeeClinicalRecords ? (
        <section className="grid gap-3">
          <div>
            <h3 className="font-semibold">Registros clínicos</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Evoluções e prontuários preenchidos pelos profissionais.
            </p>
          </div>
          <EncounterTimeline
            encounters={encounters}
            entryByEncounter={entryByEncounter}
            diagnosisByEncounter={diagnosisByEncounter}
            professionalName={professionalName}
            appointmentById={appointmentById}
          />
        </section>
      ) : (
        <ProtectedPanel
          title="Histórico clínico protegido"
          description="Seu perfil não possui permissão para visualizar prontuários."
        />
      )}
    </section>
  );
}

function AppointmentsPanel({
  appointments,
  professionalName,
  total,
}: {
  appointments: AppointmentRow[];
  professionalName: Map<string, string>;
  total: number;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">Agenda</h3>
          <Badge variant="neutral">{total}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Compromissos agendados, concluídos, cancelados e faltas.
        </p>
      </CardHeader>
      <CardContent className="grid gap-2">
        {appointments.map((appointment) => (
          <div
            key={appointment.id}
            className="flex flex-col justify-between gap-3 rounded-md border border-border px-3 py-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold">
                  {appointment.procedures?.name ?? "Atendimento"}
                </p>
                <Badge variant={appointmentStatusVariant(appointment.status)}>
                  {appointmentStatusLabel(appointment.status)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTimeRange(appointment.start_at, appointment.end_at)}{" "}
                ·{" "}
                {professionalName.get(appointment.professional_id) ??
                  "Profissional"}
                {appointment.health_insurances?.name
                  ? ` · ${appointment.health_insurances.name}`
                  : ""}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/agenda?date=${appointment.start_at.slice(0, 10)}`}>
                Ver na agenda
              </Link>
            </Button>
          </div>
        ))}
        {!appointments.length ? (
          <EmptyState
            icon={CalendarDays}
            title="Nenhum agendamento registrado"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function EncounterTimeline({
  encounters,
  entryByEncounter,
  diagnosisByEncounter,
  professionalName,
  appointmentById,
}: {
  encounters: EncounterRow[];
  entryByEncounter: Map<string, EncounterEntryRow>;
  diagnosisByEncounter: Map<string, DiagnosisRow>;
  professionalName: Map<string, string>;
  appointmentById: Map<string, AppointmentRow>;
}) {
  if (!encounters.length) {
    return (
      <Card>
        <EmptyState
          icon={HeartPulse}
          title="Nenhum atendimento registrado"
          description="Quando o paciente tiver atendimentos, eles aparecerão nesta linha do tempo."
        />
      </Card>
    );
  }

  return (
    <section className="relative grid gap-4">
      <div className="absolute bottom-6 left-4 top-6 hidden w-px bg-border md:block" />
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
        const subtitle =
          diagnosis?.description ||
          diagnosis?.cid_code ||
          summarizeNotes(entry?.free_notes) ||
          "Sem resumo registrado.";

        return (
          <div
            key={encounter.id}
            className="relative grid gap-3 md:grid-cols-[2rem_minmax(0,1fr)]"
          >
            <div className="hidden justify-center pt-5 md:flex">
              <span className="z-10 flex size-8 items-center justify-center rounded-full border border-primary-muted bg-card text-primary">
                <HeartPulse className="size-4" aria-hidden="true" />
              </span>
            </div>
            <Card>
              <CardContent className="grid gap-4 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="primary">
                        {entry?.template_snapshot.name ?? "Prontuário"}
                      </Badge>
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
                    </div>
                    <h3 className="mt-3 font-semibold">{title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {subtitle}
                    </p>
                  </div>
                  <div className="shrink-0 text-sm text-muted-foreground md:text-right">
                    <p className="inline-flex items-center gap-1">
                      <Clock3 className="size-3.5" aria-hidden="true" />
                      {formatDateTime(encounter.started_at)}
                    </p>
                    {encounter.finalized_at ? (
                      <p className="mt-1 text-xs">
                        Finalizado {formatDateTime(encounter.finalized_at)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground md:flex-row md:items-center">
                  <p>
                    {professionalName.get(encounter.professional_id) ??
                      "Profissional"}{" "}
                    {diagnosis
                      ? `· ${diagnosis.cid_code}${
                          diagnosis.description
                            ? ` - ${diagnosis.description}`
                            : ""
                        }`
                      : ""}
                  </p>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/prontuario/${encounter.id}?from=paciente`}>
                      Ver detalhes
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </section>
  );
}

function ClinicalSidebar({ summary }: { summary: ClinicalSummary | null }) {
  return (
    <div className="grid gap-3">
      <SidebarSection icon={ShieldAlert} title="Alergias" tone="danger">
        <BulletList
          items={splitSummary(summary?.allergies)}
          empty="Sem alergias registradas."
        />
      </SidebarSection>
      <SidebarSection icon={HeartPulse} title="Comorbidades" tone="warning">
        <BulletList
          items={splitSummary(summary?.comorbidities)}
          empty="Nenhuma comorbidade registrada."
        />
      </SidebarSection>
      <SidebarSection
        icon={Stethoscope}
        title="Medicações contínuas"
        tone="primary"
      >
        <BulletList
          items={splitSummary(summary?.medications)}
          empty="Nenhuma medicação registrada."
        />
      </SidebarSection>
      <SidebarSection icon={FileText} title="História familiar" tone="neutral">
        <BulletList
          items={splitSummary(summary?.family_history)}
          empty="Sem história familiar registrada."
        />
      </SidebarSection>
      <SidebarSection icon={UserRound} title="Hábitos" tone="success">
        <BulletList
          items={splitSummary(summary?.habits)}
          empty="Sem hábitos registrados."
        />
      </SidebarSection>
    </div>
  );
}

function SidebarInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 break-words text-sm">{value}</p>
      </div>
    </div>
  );
}

const sectionTones = {
  danger: {
    box: "border-destructive-muted bg-destructive-muted/40",
    icon: "text-destructive",
    title: "text-destructive",
  },
  warning: {
    box: "border-warning-muted bg-warning-muted/40",
    icon: "text-warning-foreground",
    title: "text-warning-foreground",
  },
  primary: {
    box: "border-primary-muted-hover bg-primary-muted/40",
    icon: "text-primary",
    title: "text-primary",
  },
  success: {
    box: "border-success-muted bg-success-muted/40",
    icon: "text-success-foreground",
    title: "text-success-foreground",
  },
  neutral: {
    box: "border-border bg-muted/40",
    icon: "text-muted-foreground",
    title: "text-muted-foreground",
  },
} as const;

function SidebarSection({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone?: keyof typeof sectionTones;
  children: React.ReactNode;
}) {
  const style = tone ? sectionTones[tone] : null;

  return (
    <section
      className={cn(
        style ? `rounded-md border p-3 ${style.box}` : "grid gap-2",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "size-3.5",
            style ? style.icon : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
        <h3
          className={cn(
            "text-caption font-semibold uppercase tracking-wide",
            style ? style.title : "text-muted-foreground",
          )}
        >
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) {
    return <p className="text-xs text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className="grid gap-1 text-sm">
      {items.map((item) => (
        <li key={item}>• {item}</li>
      ))}
    </ul>
  );
}

function DocumentsPanel({
  documents,
  patientId,
  total,
  viewAll = false,
}: {
  documents: PatientDocumentRow[];
  patientId: string;
  total: number;
  viewAll?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {viewAll ? "Documentos recentes" : "Documentos"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} documento{total === 1 ? "" : "s"} emitido
            {total === 1 ? "" : "s"}.
          </p>
        </div>
        {viewAll ? (
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/pacientes/${patientId}?section=documents#conteudo-paciente`}
            >
              Ver todos
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {total > documents.length ? (
          <p className="text-xs text-muted-foreground">
            Exibindo os {documents.length} documentos mais recentes.
          </p>
        ) : null}
        {documents.map((document) => (
          <div
            key={document.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{document.title}</p>
              <p className="text-xs text-muted-foreground">
                {documentTypeLabels[document.document_type] ??
                  document.document_type}{" "}
                · {formatDateTime(document.issued_at)}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/documentos/${document.id}/pdf`} target="_blank">
                Abrir
              </Link>
            </Button>
          </div>
        ))}
        {!documents.length ? (
          <EmptyState icon={FileText} title="Nenhum documento emitido" />
        ) : null}
      </CardContent>
    </Card>
  );
}

function FinancePanel({
  openBalance,
  partialBalance = false,
  patientId,
  receivables,
  total,
  viewAll = false,
}: {
  openBalance: number;
  partialBalance?: boolean;
  patientId: string;
  receivables: PatientReceivableRow[];
  total: number;
  viewAll?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Financeiro</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {partialBalance ? "Saldo nos itens recentes" : "Saldo em aberto"}:{" "}
            {formatCurrency(openBalance)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {total} lançamento{total === 1 ? "" : "s"} vinculado
            {total === 1 ? "" : "s"} ao paciente.
          </p>
        </div>
        {viewAll ? (
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/pacientes/${patientId}?section=finance#conteudo-paciente`}
            >
              Ver todos
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {total > receivables.length ? (
          <p className="text-xs text-muted-foreground">
            Exibindo os {receivables.length} lançamentos mais recentes.
          </p>
        ) : null}
        {receivables.map((receivable) => (
          <div
            key={receivable.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {receivable.description}
              </p>
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
              {receivable.status === "paid" ? (
                <CircleCheck className="mr-1 size-3" aria-hidden="true" />
              ) : receivable.status === "open" ? (
                <Clock3 className="mr-1 size-3" aria-hidden="true" />
              ) : null}
              {receivable.status === "paid"
                ? "Pago"
                : receivable.status === "open"
                  ? "Aberto"
                  : receivable.status}
            </Badge>
          </div>
        ))}
        {!receivables.length ? (
          <EmptyState icon={CreditCard} title="Nenhuma pendência financeira" />
        ) : null}
      </CardContent>
    </Card>
  );
}

function MessagesPanel({
  contactById,
  conversations,
  messages,
  patientId,
  viewAll = false,
}: {
  contactById: Map<string, WhatsAppContactRow>;
  conversations: WhatsAppConversationRow[];
  messages: WhatsAppMessageRow[];
  patientId: string;
  viewAll?: boolean;
}) {
  const visibleConversations = viewAll
    ? conversations.slice(0, 3)
    : conversations;
  const conversationById = new Map(
    conversations.map((conversation) => [conversation.id, conversation]),
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Mensagens</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {conversations.length
              ? `${conversations.length} conversa${
                  conversations.length === 1 ? "" : "s"
                } vinculada${
                  conversations.length === 1 ? "" : "s"
                } ao paciente.`
              : "Nenhuma conversa vinculada a este paciente."}
          </p>
        </div>
        {viewAll && conversations.length ? (
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/pacientes/${patientId}?section=messages#conteudo-paciente`}
            >
              Ver mensagens
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {visibleConversations.map((conversation) => {
          const contact = contactById.get(conversation.contact_id);
          return (
            <div
              key={conversation.id}
              className="flex flex-col justify-between gap-3 rounded-md border border-border px-3 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold">
                    {contact?.wa_name ||
                      (contact?.phone
                        ? formatPhoneBR(contact.phone)
                        : "Contato do WhatsApp")}
                  </p>
                  <Badge
                    variant={conversationStatusVariant(conversation.status)}
                  >
                    {conversationStatusLabel(conversation.status)}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {conversation.last_message_preview || "Sem mensagens."}
                </p>
                {conversation.last_message_at ? (
                  <p className="mt-1 text-caption text-muted-foreground">
                    {formatDateTime(conversation.last_message_at)}
                  </p>
                ) : null}
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/atendimento?conversation=${conversation.id}`}>
                  Abrir conversa
                </Link>
              </Button>
            </div>
          );
        })}

        {!visibleConversations.length ? (
          <EmptyState
            icon={MessageSquare}
            title="Nenhuma conversa encontrada"
            description="Quando o contato for vinculado ao paciente, as conversas aparecerão aqui."
          />
        ) : null}

        {!viewAll && messages.length ? (
          <section className="grid gap-2 border-t border-border pt-4">
            <div>
              <h3 className="font-semibold">Mensagens recentes</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                As 100 mensagens mais recentes são exibidas aqui. Abra a
                conversa para consultar todo o conteúdo.
              </p>
            </div>
            {messages.map((message) => {
              const conversation = conversationById.get(
                message.conversation_id,
              );
              return (
                <div
                  key={message.id}
                  className="flex items-start justify-between gap-3 rounded-md bg-muted/45 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                      {message.direction === "outbound"
                        ? "Enviada pela clínica"
                        : "Recebida do paciente"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {message.body || messageTypeLabel(message.message_type)}
                    </p>
                    <p className="mt-1 text-caption text-muted-foreground">
                      {formatDateTime(message.sent_at ?? message.created_at)}
                    </p>
                  </div>
                  {conversation ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`/atendimento?conversation=${conversation.id}`}
                      >
                        Abrir
                      </Link>
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProtectedPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function normalizePatientSection(value?: string): PatientSection {
  return ["history", "documents", "finance", "messages"].includes(value ?? "")
    ? (value as PatientSection)
    : "overview";
}

function isPatientSectionAllowed(
  section: PatientSection,
  permissions: {
    canSeeAgenda: boolean;
    canSeeClinicalRecords: boolean;
    canSeeFinance: boolean;
    canSeeMessages: boolean;
  },
) {
  if (section === "history") {
    return permissions.canSeeAgenda || permissions.canSeeClinicalRecords;
  }
  if (section === "documents") return permissions.canSeeClinicalRecords;
  if (section === "finance") return permissions.canSeeFinance;
  if (section === "messages") return permissions.canSeeMessages;
  return true;
}

function appointmentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    scheduled: "Agendado",
    confirmed: "Confirmado",
    waiting: "Aguardando",
    in_progress: "Em atendimento",
    attended: "Atendido",
    no_show: "Faltou",
    cancelled: "Cancelado",
  };
  return labels[status] ?? status;
}

function appointmentStatusVariant(
  status: string,
): "neutral" | "primary" | "success" | "warning" | "destructive" {
  if (status === "attended") return "success";
  if (status === "cancelled" || status === "no_show") return "destructive";
  if (status === "in_progress" || status === "waiting") return "warning";
  if (status === "confirmed") return "primary";
  return "neutral";
}

function conversationStatusLabel(status: string) {
  if (status === "pending") return "Novo";
  if (status === "open") return "Em atendimento";
  if (status === "resolved") return "Concluído";
  return status;
}

function conversationStatusVariant(
  status: string,
): "neutral" | "primary" | "success" | "warning" | "destructive" {
  if (status === "open") return "primary";
  if (status === "pending") return "warning";
  return "neutral";
}

function messageTypeLabel(type: string) {
  const labels: Record<string, string> = {
    image: "Imagem",
    audio: "Áudio",
    video: "Vídeo",
    document: "Documento",
    sticker: "Figurinha",
    location: "Localização",
    contact: "Contato",
    system: "Mensagem do sistema",
  };
  return labels[type] ?? "Mensagem";
}

function splitSummary(value?: string | null) {
  return (value ?? "")
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function summarizeNotes(value?: string | null) {
  const clean = value?.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 140 ? `${clean.slice(0, 137)}...` : clean;
}

function formatAddress(address?: AddressRow | null) {
  if (!address) return "Não informado";
  const line = [
    address.address_line,
    address.address_number,
    address.address_complement,
  ]
    .filter(Boolean)
    .join(", ");
  const city = [address.district, address.city, address.state]
    .filter(Boolean)
    .join(", ");
  return [line, city].filter(Boolean).join(" - ") || "Não informado";
}

function patientAge(birthDate: string, deceasedAt?: string | null) {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const reference = deceasedAt
    ? new Date(`${deceasedAt}T00:00:00Z`)
    : new Date();
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = reference.getUTCMonth() - birth.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && reference.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }
  return deceasedAt ? `falecido aos ${age} anos` : `${age} anos`;
}

function sexLabel(value: string | null) {
  switch (value) {
    case "female":
      return "Feminino";
    case "male":
      return "Masculino";
    case "intersex":
      return "Intersexo";
    case "not_informed":
      return "Prefere não informar";
    default:
      return "Não informado";
  }
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

function formatDateTimeRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const date = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}, ${timeFormatter.format(start)}–${timeFormatter.format(end)}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}
