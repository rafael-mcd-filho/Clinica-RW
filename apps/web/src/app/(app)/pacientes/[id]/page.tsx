import type { ConsentEventSummary } from "@/lib/clinical/consent";
import { consentStatus } from "@/lib/clinical/consent";
import { documentTypeLabels } from "@/lib/clinical/document-types";
import {
  describePrescriptionItem,
  parsePrescriptionItems,
} from "@/lib/clinical/prescription-items";
import { FinancialRecordTrigger } from "@/components/finance/financial-record-details";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CalendarBlank,
  CalendarCheck,
  CalendarDots as CalendarDays,
  CaretRight,
  ChatCenteredText,
  CheckCircle as CircleCheck,
  ChatCentered as MessageSquare,
  ClipboardText,
  Clock as Clock3,
  CreditCard,
  EnvelopeSimple as Mail,
  FileText,
  GenderIntersex,
  Heartbeat as HeartPulse,
  IdentificationCard,
  Lifebuoy,
  MapPin,
  PencilSimpleLine,
  Phone,
  Pill,
  Prescription,
  ShieldWarning as ShieldAlert,
  Target,
  UserFocus,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { ClinicalSummary, TagRow } from "./patient-detail-panels";
import { PatientAppointmentActions } from "./patient-appointment-actions";
import { PatientClinicalList } from "./patient-clinical-list";
import { PatientContactActions } from "./patient-contact-actions";
import { PatientConversationPreview } from "./patient-conversation-preview";
import {
  PatientDiagnosesCard,
  type DiagnosisSuggestion,
  type PatientDiagnosisView,
} from "./patient-diagnoses-card";
import {
  PatientDocumentsCard,
  type PatientDocumentItem,
} from "./patient-documents-card";
import { PatientHeaderActions } from "./patient-header-actions";
import { PatientNotesCard } from "./patient-notes-card";
import { OverviewCard, ViewAllTab } from "./patient-overview-card";
import { PatientPhotoForm } from "./patient-photo-form";
import { PatientScheduleButton } from "./patient-schedule-button";
import { PatientSidebarDetails } from "./patient-sidebar-details";
import type {
  EncounterAppointmentOption,
  EncounterProfessionalOption,
  EncounterTemplateOption,
} from "./patient-start-encounter";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabSelectionButton } from "@/components/ui/tabs";
import { normalizeAgendaTimeZone } from "@/lib/agenda/range";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { stripRichTextMarkers } from "@/lib/clinical/rich-text-format";
import {
  attachmentCategoryLabels,
  listPatientAttachments,
} from "@/lib/storage/clinical-attachments";
import { createPatientPhotoSignedUrl } from "@/lib/storage/patient-photos";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

type ProfessionalRow = { id: string; name: string; user_id?: string | null };

type ClinicalTemplateRow = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  clinical_template_versions: Array<{
    id: string;
    version_number: number;
  }>;
};

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
  consent_events: ConsentEventSummary[];
  id: string;
  document_type: keyof typeof documentTypeLabels;
  title: string;
  issued_at: string;
  encounter_id: string | null;
};

type PrescriptionRow = {
  id: string;
  title: string;
  body: string;
  issued_at: string;
  professional_id: string;
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

/** Um disparo de comunicação (lembrete, confirmação, automação) ao paciente. */
type PatientCommunicationRow = {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  error_message: string | null;
  template_name: string | null;
  automation_name: string | null;
};

type PatientSection =
  | "overview"
  | "prontuario"
  | "agenda"
  | "documents"
  | "finance"
  | "messages"
  | "prescriptions";

/** Linha de prescrição do Resumo: um medicamento de um documento emitido. */
type PrescriptionLine = {
  key: string;
  documentId: string;
  name: string;
  detail: string;
  continuous: boolean;
  dateLabel: string;
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
  const codes = context.permissionCodes;
  const canSeeSensitive = codes.has("paciente.ver_dados_sensiveis");
  const canSeeClinicalRecords =
    codes.has("clinico.ver_prontuario") ||
    codes.has("clinico.ver_prontuario_proprios");
  const canWriteClinical =
    canSeeClinicalRecords && codes.has("clinico.preencher_prontuario");
  const canSeeAllClinicalRecords = codes.has("clinico.ver_prontuario");
  const canSeeFinance =
    codes.has("financeiro.ver_geral") ||
    codes.has("financeiro.receber_pagamento");
  const canSeeAgenda = codes.has("agenda.ver");
  const canEditAgenda = codes.has("agenda.editar_agendamento");
  const canSchedule = codes.has("agenda.criar_agendamento");
  const canSeeMessages = codes.has("atendimento.ver");
  const canEdit = codes.has("paciente.editar");
  const canArchive = codes.has("paciente.excluir");
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

  // Todas as consultas da ficha filtram pelo paciente e pela empresa.
  type Filterable = { eq(column: string, value: string): Filterable };
  const byPatient = <T,>(query: T): T =>
    (query as unknown as Filterable)
      .eq("patient_id", id)
      .eq("organization_id", organizationId) as unknown as T;

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
    settingsResult,
    insuranceResult,
    notesResult,
    attendedCountResult,
    upcomingResult,
    openReceivablesResult,
    prescriptionsResult,
    patientDiagnosesResult,
  ] = await Promise.all([
    canSeeSensitive
      ? byPatient(
          supabase
            .from("patient_addresses")
            .select(
              "postal_code, address_line, address_number, address_complement, district, city, state",
            ),
        ).maybeSingle<AddressRow>()
      : Promise.resolve({ data: null }),
    canSeeSensitive
      ? byPatient(
          supabase
            .from("patient_clinical_summaries")
            .select(
              "allergies, comorbidities, medications, medical_history, family_history, habits, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship",
            ),
        ).maybeSingle<ClinicalSummary>()
      : Promise.resolve({ data: null }),
    supabase
      .from("tags")
      .select("id, name, color")
      .eq("organization_id", organizationId)
      .order("name")
      .returns<TagRow[]>(),
    byPatient(supabase.from("patient_tags").select("tag_id"))
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .returns<PatientTagRow[]>(),
    canSeeClinicalRecords
      ? byPatient(
          supabase
            .from("clinical_documents")
            .select(
              "id, document_type, title, issued_at, encounter_id, consent_events:clinical_document_consent_events(event_type, created_at)",
              { count: "exact" },
            ),
        )
          .order("issued_at", { ascending: false })
          .limit(100)
          .returns<PatientDocumentRow[]>()
      : Promise.resolve({ data: [] as PatientDocumentRow[], count: 0 }),
    canSeeFinance
      ? byPatient(
          supabase
            .from("accounts_receivable")
            .select("id, description, amount, paid_amount, due_date, status", {
              count: "exact",
            }),
        )
          .order("due_date", { ascending: false })
          .limit(100)
          .returns<PatientReceivableRow[]>()
      : Promise.resolve({ data: [] as PatientReceivableRow[], count: 0 }),
    canSeeClinicalRecords
      ? byPatient(
          supabase
            .from("encounters")
            .select(
              "id, professional_id, appointment_id, status, started_at, finalized_at",
              { count: "exact" },
            ),
        )
          .order("started_at", { ascending: false })
          .limit(100)
          .returns<EncounterRow[]>()
      : Promise.resolve({ data: [] as EncounterRow[], count: 0 }),
    canSeeAgenda
      ? byPatient(
          supabase
            .from("appointments")
            .select(
              "id, professional_id, start_at, end_at, status, procedures(name), health_insurances(name)",
              { count: "exact" },
            ),
        )
          .order("start_at", { ascending: false })
          .limit(100)
          .returns<AppointmentRow[]>()
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
    supabase
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle<{ timezone: string | null }>(),
    // Colunas novas (migração da ficha): consultas à parte, para a ficha
    // continuar abrindo num banco que ainda não as tem.
    supabase
      .from("patients")
      .select("health_insurance_id, health_insurance_card")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle<{
        health_insurance_id: string | null;
        health_insurance_card: string | null;
      }>(),
    canSeeSensitive
      ? byPatient(
          supabase.from("patient_clinical_summaries").select("general_notes"),
        ).maybeSingle<{ general_notes: string | null }>()
      : Promise.resolve({ data: null, error: null }),
    canSeeAgenda
      ? byPatient(
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true }),
        ).eq("status", "attended")
      : Promise.resolve({ count: 0 }),
    canSeeAgenda
      ? byPatient(
          supabase
            .from("appointments")
            .select(
              "id, professional_id, start_at, end_at, status, procedures(name), health_insurances(name)",
              { count: "exact" },
            ),
        )
          .in("status", ["scheduled", "confirmed"])
          .gte("start_at", nowIso)
          .order("start_at", { ascending: true })
          .limit(1)
          .returns<AppointmentRow[]>()
      : Promise.resolve({ data: [] as AppointmentRow[], count: 0 }),
    canSeeFinance
      ? byPatient(
          supabase
            .from("accounts_receivable")
            .select("id", { count: "exact", head: true }),
        ).in("status", ["open", "partial"])
      : Promise.resolve({ count: 0 }),
    canSeeClinicalRecords
      ? byPatient(
          supabase
            .from("clinical_documents")
            .select("id, title, body, issued_at, professional_id"),
        )
          .eq("document_type", "prescription")
          .order("issued_at", { ascending: false })
          .limit(30)
          .returns<PrescriptionRow[]>()
      : Promise.resolve({ data: [] as PrescriptionRow[] }),
    // Diagnósticos da ficha: tabela só do servidor (a permissão de
    // prontuário foi conferida acima).
    canSeeClinicalRecords
      ? createSupabaseAdminClient()
          .from("patient_diagnoses")
          .select("id, cid_code, description, is_primary")
          .eq("organization_id", organizationId)
          .eq("patient_id", id)
          .is("removed_at", null)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true })
          .returns<
            Array<{
              id: string;
              cid_code: string;
              description: string | null;
              is_primary: boolean;
            }>
          >()
      : Promise.resolve({ data: [], error: null }),
  ]);
  // Horários da ficha saem no fuso da clínica, como na agenda. Sem isso o
  // servidor formatava no fuso dele (em produção costuma ser UTC, e "14:00"
  // viraria "17:00"), e o link "Ver na agenda" de um horário noturno caía no
  // dia seguinte, porque a data saía do ISO em UTC.
  const timeZone = normalizeAgendaTimeZone(settingsResult.data?.timezone);

  const encounters = encountersResult.data ?? [];
  const patientAppointments = patientAppointmentsResult.data ?? [];
  const prescriptions = prescriptionsResult.data ?? [];
  const encounterIds = encounters.map((encounter) => encounter.id);
  // Exames anexados nos atendimentos que a pessoa enxerga (a lista acima já
  // passou pelas regras de acesso do prontuário) e os enviados na ficha.
  const patientAttachments = canSeeClinicalRecords
    ? await listPatientAttachments(organizationId, id, encounterIds)
    : [];
  const professionalIds = [
    ...new Set(
      [
        ...encounters.map((encounter) => encounter.professional_id),
        ...patientAppointments.map(
          (appointment) => appointment.professional_id,
        ),
        ...(upcomingResult.data ?? []).map(
          (appointment) => appointment.professional_id,
        ),
        ...prescriptions.map((prescription) => prescription.professional_id),
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
  const insuranceId = insuranceResult.data?.health_insurance_id ?? null;

  const [
    entriesResult,
    diagnosesResult,
    professionalsResult,
    encounterAppointmentsResult,
    conversationsResult,
    encounterProfessionalsResult,
    clinicalTemplatesResult,
    insuranceNameResult,
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
    canWriteClinical
      ? supabase
          .from("professionals")
          .select("id, name, user_id")
          .eq("organization_id", organizationId)
          .eq("active", true)
          .order("name")
          .returns<ProfessionalRow[]>()
      : Promise.resolve({ data: [] as ProfessionalRow[] }),
    canWriteClinical
      ? supabase
          .from("clinical_templates")
          .select(
            "id, name, description, is_default, clinical_template_versions(id, version_number)",
          )
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .order("is_default", { ascending: false })
          .order("name")
          .order("version_number", {
            referencedTable: "clinical_template_versions",
            ascending: false,
          })
          .returns<ClinicalTemplateRow[]>()
      : Promise.resolve({ data: [] as ClinicalTemplateRow[] }),
    insuranceId
      ? supabase
          .from("health_insurances")
          .select("name")
          .eq("organization_id", organizationId)
          .eq("id", insuranceId)
          .maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null }),
  ]);

  const conversations = conversationsResult.data ?? [];
  // Comunicações disparadas para o paciente (lembretes e automações). O
  // conteúdo da conversa em si fica no atendimento — aqui interessa o que a
  // clínica mandou por conta própria.
  const communicationsResult = canSeeMessages
    ? await supabase.rpc("get_patient_communications", {
        p_patient_id: patient.id,
        p_limit: 20,
      })
    : { data: null };
  const communications = Array.isArray(communicationsResult.data)
    ? (communicationsResult.data as unknown as PatientCommunicationRow[])
    : [];

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
  const encounterByAppointmentId = new Map(
    encounters.flatMap((encounter) =>
      encounter.appointment_id
        ? ([[encounter.appointment_id, encounter]] as const)
        : [],
    ),
  );
  const encounterProfessionals: EncounterProfessionalOption[] = (
    encounterProfessionalsResult.data ?? []
  )
    .filter(
      (professional) =>
        canSeeAllClinicalRecords ||
        professional.user_id === context.effectiveUser?.id,
    )
    .map((professional) => ({
      id: professional.id,
      name: professional.name,
    }));
  const encounterTemplates: EncounterTemplateOption[] = (
    clinicalTemplatesResult.data ?? []
  ).flatMap((template) => {
    const latestVersion = template.clinical_template_versions[0];
    return latestVersion
      ? [
          {
            id: template.id,
            name: template.name,
            description: template.description,
            isDefault: template.is_default,
            versionId: latestVersion.id,
            versionNumber: latestVersion.version_number,
          },
        ]
      : [];
  });
  const encounterAppointments: EncounterAppointmentOption[] =
    patientAppointments
      .filter(
        (appointment) =>
          ["confirmed", "waiting", "in_progress"].includes(
            appointment.status,
          ) && !encounterByAppointmentId.has(appointment.id),
      )
      .map((appointment) => ({
        id: appointment.id,
        professionalId: appointment.professional_id,
        label: `${formatDateTimeRange(
          appointment.start_at,
          appointment.end_at,
          timeZone,
        )} · ${appointment.procedures?.name ?? "Atendimento"}`,
      }));
  const contactById = new Map(
    (whatsappContactsResult.data ?? []).map((contact) => [contact.id, contact]),
  );
  const openBalance = (receivablesResult.data ?? [])
    .filter((item) => ["open", "partial"].includes(item.status))
    .reduce(
      (sum, item) =>
        sum + Math.max(0, Number(item.amount) - Number(item.paid_amount)),
      0,
    );
  // "Hoje" no fuso da clínica: é o que separa um lançamento em aberto de um
  // vencido, que antes apareciam iguais ("Aberto").
  const today = localDateKey(nowIso, timeZone);
  const overdueBalance = (receivablesResult.data ?? [])
    .filter((item) => isReceivableOverdue(item, today))
    .reduce(
      (sum, item) =>
        sum + Math.max(0, Number(item.amount) - Number(item.paid_amount)),
      0,
    );
  const allergyItems = canSeeSensitive
    ? splitSummary(clinicalResult.data?.allergies)
    : [];

  // Números da faixa "Visão geral".
  const attendedTotal = canSeeAgenda
    ? (attendedCountResult.count ?? 0)
    : encounters.filter((encounter) => encounter.status === "finalized").length;
  const draftEncounters = encounters.filter(
    (encounter) => encounter.status === "draft",
  ).length;
  const openReceivables = openReceivablesResult.count ?? 0;
  const pendingTotal = openReceivables + draftEncounters;
  const upcomingTotal = upcomingResult.count ?? 0;
  const nextAppointment = upcomingResult.data?.[0] ?? null;

  // Último atendimento: o último agendamento atendido; sem agenda, o último
  // registro clínico finalizado.
  const lastAttended = patientAppointments.find(
    (appointment) => appointment.status === "attended",
  );
  const lastFinalizedEncounter = encounters.find(
    (encounter) => encounter.status === "finalized",
  );
  const lastVisit = lastAttended
    ? {
        date: lastAttended.start_at,
        title: lastAttended.procedures?.name ?? "Atendimento",
        professional: professionalName.get(lastAttended.professional_id),
        href: encounterByAppointmentId.get(lastAttended.id)
          ? `/prontuario/${encounterByAppointmentId.get(lastAttended.id)!.id}?from=paciente`
          : null,
      }
    : lastFinalizedEncounter
      ? {
          date: lastFinalizedEncounter.started_at,
          title:
            entryByEncounter.get(lastFinalizedEncounter.id)?.template_snapshot
              .name ?? "Atendimento clínico",
          professional: professionalName.get(
            lastFinalizedEncounter.professional_id,
          ),
          href: `/prontuario/${lastFinalizedEncounter.id}?from=paciente`,
        }
      : null;

  // Histórico: o que já aconteceu (o próximo fica no cartão ao lado).
  const pastAppointments = patientAppointments.filter(
    (appointment) => appointment.start_at <= nowIso,
  );

  // Convênio: o do cadastro; sem ele, o do último agendamento com convênio.
  const insuranceName =
    insuranceNameResult.data?.name ??
    patientAppointments.find((appointment) => appointment.health_insurances)
      ?.health_insurances?.name ??
    null;

  const diagnosesAvailable = !patientDiagnosesResult.error;
  const patientDiagnoses: PatientDiagnosisView[] = (
    patientDiagnosesResult.data ?? []
  ).map((row) => ({
    id: row.id,
    cidCode: row.cid_code,
    description: row.description,
    isPrimary: row.is_primary,
  }));
  // CIDs lançados nos atendimentos, do mais recente, sem repetir.
  const diagnosisSuggestions: DiagnosisSuggestion[] = [];
  for (const encounter of encounters) {
    for (const diagnosis of diagnosesResult.data ?? []) {
      if (
        diagnosis.encounter_id === encounter.id &&
        !diagnosisSuggestions.some(
          (item) => item.cidCode === diagnosis.cid_code,
        )
      ) {
        diagnosisSuggestions.push({
          cidCode: diagnosis.cid_code,
          description: diagnosis.description,
        });
      }
    }
  }

  const prescriptionLines: PrescriptionLine[] = prescriptions.flatMap(
    (prescription) => {
      const dateLabel = formatNumericDate(prescription.issued_at, timeZone);
      const items = parsePrescriptionItems(prescription.body);
      if (!items.length) {
        return [
          {
            key: prescription.id,
            documentId: prescription.id,
            name: prescription.title,
            detail: summarizeNotes(prescription.body) ?? "",
            continuous: false,
            dateLabel,
          },
        ];
      }
      return items.map((item, index) => ({
        key: `${prescription.id}-${index}`,
        documentId: prescription.id,
        name: item.name,
        detail: describePrescriptionItem(item),
        continuous: item.continuous,
        dateLabel,
      }));
    },
  );

  const documentItems: PatientDocumentItem[] = [
    ...(documentsResult.data ?? []).map<PatientDocumentItem>((document) => {
      const consent =
        document.document_type === "informed_consent"
          ? consentStatus(document.consent_events ?? [])
          : null;
      return {
        id: document.id,
        kind: "document",
        name: document.title,
        typeLabel: consent
          ? (consentShortLabel[consent] ?? "Termo")
          : (documentShortLabel[document.document_type] ??
            documentTypeLabels[document.document_type] ??
            "Documento"),
        typeTone:
          document.document_type === "clinical_report"
            ? "success"
            : document.document_type === "informed_consent"
              ? consent === "signed"
                ? "success"
                : "warning"
              : document.document_type === "prescription" ||
                  document.document_type === "exam_request"
                ? "primary"
                : "neutral",
        category:
          document.document_type === "exam_request"
            ? "exam"
            : document.document_type === "clinical_report"
              ? "report"
              : "other",
        dateLabel: formatNumericDate(document.issued_at, timeZone),
        sortKey: document.issued_at,
        openHref: `/documentos/${document.id}/pdf`,
        downloadHref: `/documentos/${document.id}/pdf?download=1`,
        fileKind: "pdf",
        removable: false,
        consentDocumentId:
          document.document_type === "informed_consent"
            ? document.id
            : undefined,
        encounterHref: document.encounter_id
          ? `/prontuario/${document.encounter_id}?from=paciente`
          : null,
      };
    }),
    ...patientAttachments.map<PatientDocumentItem>((attachment) => ({
      id: attachment.id,
      kind: "attachment",
      name: attachment.fileName,
      typeLabel: attachmentCategoryLabels[attachment.category],
      typeTone:
        attachment.category === "exam"
          ? "primary"
          : attachment.category === "report"
            ? "success"
            : "neutral",
      category: attachment.category,
      dateLabel: formatNumericDate(attachment.createdAt, timeZone),
      sortKey: attachment.createdAt,
      openHref: attachment.url,
      downloadHref: attachment.url
        ? `${attachment.url}&download=${encodeURIComponent(attachment.fileName)}`
        : null,
      fileKind:
        attachment.contentType === "application/pdf"
          ? "pdf"
          : attachment.contentType.startsWith("image/")
            ? "image"
            : "other",
      removable: canWriteClinical,
      encounterHref: attachment.encounterId
        ? `/prontuario/${attachment.encounterId}?from=paciente`
        : null,
    })),
  ].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  // Anexo na ficha e categorias só existem depois da migração da ficha.
  const attachmentsUpgraded = !insuranceResult.error;

  const latestConversation = conversations[0] ?? null;
  const conversationHref =
    canSeeMessages && latestConversation
      ? `/atendimento?conversation=${latestConversation.id}`
      : null;
  const phoneDigits = patient.phone || patient.whatsapp || null;
  const active =
    patient.status === "active" && !patient.deleted_at && !patient.deceased_at;
  const statusBadge = patient.deceased_at
    ? { label: "Óbito", variant: "destructive" as const }
    : patient.deleted_at
      ? { label: "Arquivado", variant: "neutral" as const }
      : patient.status === "active"
        ? { label: "Ativo", variant: "success" as const }
        : { label: "Inativo", variant: "neutral" as const };

  const infoRows: Array<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    title?: string;
  }> = [
    {
      icon: CalendarBlank,
      label: "Nascimento",
      value: patient.birth_date
        ? `${formatDate(patient.birth_date)} (${patientAge(
            patient.birth_date,
            patient.deceased_at,
          )})`
        : "Não informado",
    },
    {
      icon: GenderIntersex,
      label: "Sexo",
      value: sexLabel(patient.sex_at_birth),
    },
    {
      icon: Phone,
      label: "Telefone",
      value: phoneDigits ? formatPhoneBR(phoneDigits) : "Não informado",
    },
    { icon: Mail, label: "E-mail", value: patient.email || "Não informado" },
    ...(canSeeSensitive
      ? [
          {
            icon: MapPin,
            label: "Endereço",
            value: formatCityState(addressResult.data),
            title: formatAddress(addressResult.data),
          },
        ]
      : []),
    {
      icon: IdentificationCard,
      label: "Convênio",
      value: insuranceName ?? "Não informado",
      title: insuranceResult.data?.health_insurance_card
        ? `Carteirinha ${insuranceResult.data.health_insurance_card}`
        : undefined,
    },
    ...(canSeeSensitive
      ? [
          {
            icon: Lifebuoy,
            label: "Contato de emergência",
            value: formatEmergencyContact(clinicalResult.data),
          },
        ]
      : []),
  ];

  const overviewContent = (
    <div className="grid gap-4">
      <section className="rounded-lg border border-border bg-card p-2.5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-4 rounded-md bg-primary-muted/70 px-4 py-3.5 @3xl:flex-row @3xl:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-card/80 text-primary"
              aria-hidden="true"
            >
              <UserFocus className="size-6" weight="duotone" />
            </span>
            <div className="min-w-0">
              <h2 className="text-heading-sm font-semibold text-primary-hover">
                Visão geral do paciente
              </h2>
              <p className="mt-0.5 text-body-sm text-secondary-foreground">
                Informações principais, últimos atendimentos e pendências em um
                só lugar.
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 @3xl:w-[22rem] @3xl:shrink-0">
            <OverviewStat
              value={attendedTotal}
              label={attendedTotal === 1 ? "Atendimento" : "Atendimentos"}
              tone="neutral"
            />
            <OverviewStat
              value={pendingTotal}
              label={pendingTotal === 1 ? "Pendência" : "Pendências"}
              tone={pendingTotal ? "danger" : "neutral"}
              title={[
                canSeeFinance
                  ? `${openReceivables} lançamento${openReceivables === 1 ? "" : "s"} em aberto`
                  : null,
                canSeeClinicalRecords
                  ? `${draftEncounters} prontuário${draftEncounters === 1 ? "" : "s"} em rascunho`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <OverviewStat
              value={upcomingTotal}
              label={upcomingTotal === 1 ? "Retorno" : "Retornos"}
              tone="success"
              title="Agendamentos futuros"
            />
          </dl>
        </div>
      </section>

      <div
        className={cn(
          "grid gap-4 @xl:grid-cols-2",
          canSeeFinance && "@4xl:grid-cols-3",
        )}
      >
        <SummaryTile
          icon={CalendarCheck}
          label="Último atendimento"
          tone="primary"
        >
          {lastVisit ? (
            <>
              <p className="font-semibold text-foreground">
                {formatLongDate(lastVisit.date, timeZone)}
              </p>
              <p className="mt-1.5 text-body-sm text-muted-foreground">
                {lastVisit.title}
                {lastVisit.professional ? (
                  <>
                    <br />
                    com {lastVisit.professional}
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <p className="font-semibold text-foreground">Nenhum ainda</p>
          )}
          {lastVisit?.href ? (
            <Link
              href={lastVisit.href}
              aria-label="Abrir o prontuário do último atendimento"
              className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          ) : null}
          {lastVisit?.href ? (
            <CaretRight
              className="absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          ) : null}
        </SummaryTile>

        <SummaryTile
          icon={CalendarDays}
          label="Próximo atendimento"
          tone="primary"
          action={
            canSchedule && active ? (
              <PatientScheduleButton
                patientId={patient.id}
                patientName={displayName}
                label={nextAppointment ? "Agendar outro" : "Agendar retorno"}
              />
            ) : null
          }
        >
          {nextAppointment ? (
            <>
              <p className="font-semibold text-foreground">
                {formatLongDate(nextAppointment.start_at, timeZone)},{" "}
                {formatTime(nextAppointment.start_at, timeZone)}
              </p>
              <p className="mt-1.5 text-body-sm text-muted-foreground">
                {nextAppointment.procedures?.name ?? "Atendimento"}
                {professionalName.get(nextAppointment.professional_id)
                  ? ` com ${professionalName.get(nextAppointment.professional_id)}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="font-semibold text-foreground">
              {canSeeAgenda ? "Não agendado" : "Sem acesso à agenda"}
            </p>
          )}
        </SummaryTile>

        {canSeeFinance ? (
          <SummaryTile
            className="@xl:col-span-2 @4xl:col-span-1"
            icon={Wallet}
            label="Status financeiro"
            tone="warning"
            action={
              <Button asChild variant="secondary" size="sm">
                <TabSelectionButton value="finance" scrollToTop>
                  Ver lançamentos
                </TabSelectionButton>
              </Button>
            }
          >
            <p className="font-semibold text-foreground">
              {openBalance > 0 ? "Saldo em aberto" : "Sem saldo em aberto"}
            </p>
            <p
              className={cn(
                "mt-1 text-heading font-bold tabular-nums",
                openBalance > 0
                  ? "text-destructive-foreground"
                  : "text-success-foreground",
              )}
            >
              {formatCurrency(openBalance)}
            </p>
            {overdueBalance > 0 ? (
              <p className="text-caption text-destructive-foreground">
                {formatCurrency(overdueBalance)} vencido
              </p>
            ) : null}
          </SummaryTile>
        ) : null}
      </div>

      <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1.38fr)_minmax(0,1fr)] @4xl:items-start">
        <div className="grid min-w-0 gap-4">
          {canSeeAgenda || canSeeClinicalRecords ? (
            <OverviewCard
              icon={ClipboardText}
              title="Histórico de atendimentos"
              action={
                <ViewAllTab tab={canSeeAgenda ? "agenda" : "prontuario"} />
              }
              bodyClassName="pt-0"
            >
              {canSeeAgenda ? (
                pastAppointments.length ? (
                  <ol className="grid">
                    {pastAppointments
                      .slice(0, 4)
                      .map((appointment, index, list) => {
                        const encounter = encounterByAppointmentId.get(
                          appointment.id,
                        );
                        return (
                          <TimelineItem
                            key={appointment.id}
                            first={index === 0}
                            last={index === list.length - 1}
                          >
                            <PatientAppointmentActions
                              variant="timeline"
                              highlight={index === 0}
                              dateLabel={formatShortDate(
                                appointment.start_at,
                                timeZone,
                              )}
                              timeLabel={formatTime(
                                appointment.start_at,
                                timeZone,
                              )}
                              id={appointment.id}
                              procedureName={
                                appointment.procedures?.name ?? "Atendimento"
                              }
                              status={appointment.status}
                              statusLabel={timelineStatusLabel(
                                appointment.status,
                              )}
                              statusVariant={appointmentStatusVariant(
                                appointment.status,
                              )}
                              dateTimeLabel={formatDateTimeRange(
                                appointment.start_at,
                                appointment.end_at,
                                timeZone,
                              )}
                              professionalName={
                                professionalName.get(
                                  appointment.professional_id,
                                ) ?? "Profissional"
                              }
                              insuranceName={
                                appointment.health_insurances?.name ?? null
                              }
                              agendaHref={`/agenda?date=${localDateKey(
                                appointment.start_at,
                                timeZone,
                              )}`}
                              canEditAgenda={canEditAgenda}
                              canStartEncounter={canWriteClinical}
                              patientId={patient.id}
                              professionalId={appointment.professional_id}
                              professionals={encounterProfessionals}
                              templates={encounterTemplates}
                              encounterStatus={encounter?.status}
                              encounterHref={
                                encounter
                                  ? `/prontuario/${encounter.id}?from=paciente`
                                  : undefined
                              }
                            />
                          </TimelineItem>
                        );
                      })}
                  </ol>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum atendimento registrado.
                  </p>
                )
              ) : encounters.length ? (
                <ol className="grid">
                  {encounters.slice(0, 4).map((encounter, index, list) => (
                    <TimelineItem
                      key={encounter.id}
                      first={index === 0}
                      last={index === list.length - 1}
                    >
                      <Link
                        href={`/prontuario/${encounter.id}?from=paciente`}
                        className="group grid w-full grid-cols-[5.25rem_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-2 py-2.5 transition-colors duration-[var(--motion-fast)] hover:bg-muted/60"
                      >
                        <span className="grid">
                          <span
                            className={cn(
                              "text-sm font-medium tabular-nums",
                              index === 0 ? "text-primary" : "text-foreground",
                            )}
                          >
                            {formatShortDate(encounter.started_at, timeZone)}
                          </span>
                          <span className="text-caption tabular-nums text-muted-foreground">
                            {formatTime(encounter.started_at, timeZone)}
                          </span>
                        </span>
                        <span className="grid min-w-0">
                          <span className="truncate text-sm font-semibold">
                            {entryByEncounter.get(encounter.id)
                              ?.template_snapshot.name ?? "Atendimento clínico"}
                          </span>
                          <span className="truncate text-caption text-muted-foreground">
                            {professionalName.get(encounter.professional_id) ??
                              "Profissional"}
                          </span>
                        </span>
                        <Badge
                          variant={
                            encounter.status === "finalized"
                              ? "success"
                              : "warning"
                          }
                          className="rounded-full"
                        >
                          {encounter.status === "finalized"
                            ? "Finalizado"
                            : "Rascunho"}
                        </Badge>
                        <CaretRight
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </Link>
                    </TimelineItem>
                  ))}
                </ol>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum atendimento registrado.
                </p>
              )}
            </OverviewCard>
          ) : null}

          {canSeeClinicalRecords ? (
            <PatientDocumentsCard
              patientId={patient.id}
              items={documentItems}
              limit={5}
              canUpload={canWriteClinical}
              uploadAvailable={attachmentsUpgraded}
            />
          ) : null}
        </div>

        <div className="grid min-w-0 gap-4">
          {canSeeClinicalRecords ? (
            <PatientDiagnosesCard
              patientId={patient.id}
              available={diagnosesAvailable}
              canEdit={canWriteClinical}
              diagnoses={patientDiagnoses}
              suggestions={diagnosisSuggestions}
            />
          ) : null}

          {canSeeClinicalRecords ? (
            <OverviewCard
              icon={Prescription}
              title="Últimas prescrições"
              action={
                prescriptionLines.length ? (
                  <ViewAllTab tab="prescriptions" label="Ver todas" />
                ) : null
              }
            >
              {prescriptionLines.length ? (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {prescriptionLines.slice(0, 3).map((line) => (
                    <li key={line.key}>
                      <a
                        href={`/documentos/${line.documentId}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-3 px-3 py-2.5 transition-colors duration-[var(--motion-fast)] hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                      >
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-full",
                            line.continuous
                              ? "bg-success-muted text-success-foreground"
                              : "bg-primary-muted text-primary",
                          )}
                          aria-hidden="true"
                        >
                          <Pill className="size-[18px]" weight="fill" />
                        </span>
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {line.name}
                          </span>
                          {line.detail ? (
                            <span className="truncate text-caption text-muted-foreground">
                              {line.detail}
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                          {line.dateLabel}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                  Nenhuma prescrição emitida.
                </p>
              )}
            </OverviewCard>
          ) : null}

          {canSeeMessages ? (
            <OverviewCard
              icon={ChatCenteredText}
              title="Mensagens"
              action={
                conversations.length ? (
                  <ViewAllTab tab="messages" label="Ver todas" />
                ) : null
              }
            >
              {conversations.length ? (
                <ul className="divide-y divide-border">
                  {conversations.slice(0, 2).map((conversation) => {
                    const contact = contactById.get(conversation.contact_id);
                    const name =
                      contact?.wa_name ||
                      (contact?.phone
                        ? formatPhoneBR(contact.phone)
                        : "Contato do WhatsApp");
                    return (
                      <li key={conversation.id}>
                        <PatientConversationPreview
                          conversationId={conversation.id}
                          organizationId={organizationId}
                          contactName={name}
                          row={{
                            initials: contact?.wa_name
                              ? initialsFromName(contact.wa_name)
                              : null,
                            statusLabel: conversationStatusLabel(
                              conversation.status,
                            ),
                            statusVariant: conversationStatusVariant(
                              conversation.status,
                            ),
                            preview:
                              conversation.last_message_preview ||
                              "Sem mensagens.",
                            dateLabel: conversation.last_message_at
                              ? formatNumericDate(
                                  conversation.last_message_at,
                                  timeZone,
                                )
                              : null,
                            timeLabel: conversation.last_message_at
                              ? formatTime(
                                  conversation.last_message_at,
                                  timeZone,
                                )
                              : null,
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-md border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
                  Nenhuma conversa vinculada ao paciente.
                </p>
              )}
            </OverviewCard>
          ) : null}
        </div>
      </div>

      {canSeeSensitive ? (
        <PatientNotesCard
          patientId={patient.id}
          notes={notesResult.data?.general_notes ?? null}
          available={!notesResult.error}
          canEdit={canEdit}
        />
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <Breadcrumb
            items={[
              { label: "Pacientes", href: "/pacientes" },
              { label: displayName },
            ]}
          />
          <Badge variant={statusBadge.variant} className="rounded-full px-2.5">
            {statusBadge.label}
          </Badge>
        </div>
        <PatientHeaderActions
          patientId={patient.id}
          patientName={displayName}
          archived={Boolean(patient.deleted_at)}
          deceased={Boolean(patient.deceased_at)}
          canArchive={canArchive}
          canEdit={canEdit}
          canEditLifeStatus={canEdit && canSeeSensitive}
          canSchedule={canSchedule && active}
          canStartEncounter={canWriteClinical && active}
          conversationHref={conversationHref}
          encounterAppointments={encounterAppointments}
          encounterProfessionals={encounterProfessionals}
          encounterTemplates={encounterTemplates}
        />
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <aside className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)] lg:sticky lg:top-20">
          <div className="grid justify-items-center gap-3 px-4 pb-4 pt-5 text-center">
            <PatientPhotoForm
              patientId={patient.id}
              photoUrl={photoUrl}
              initials={initialsFromName(displayName)}
              canEdit={canEdit}
            />
            <div className="grid min-w-0 max-w-full gap-1">
              {/* Quebra em vez de cortar: é o nome que confirma que a ficha
                  é a certa. */}
              <h1 className="text-balance break-words text-heading font-semibold text-foreground">
                {displayName}
              </h1>
              {patient.social_name ? (
                <p className="text-caption text-muted-foreground">
                  Nome civil: {patient.full_name}
                </p>
              ) : null}
              <p className="text-body-sm text-secondary-foreground">
                {[
                  patient.birth_date
                    ? `${patientAge(patient.birth_date, patient.deceased_at)} (${formatDate(patient.birth_date)})`
                    : null,
                  patient.sex_at_birth &&
                  patient.sex_at_birth !== "not_informed"
                    ? sexLabel(patient.sex_at_birth)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Idade e sexo não informados"}
              </p>
              {canSeeSensitive && patient.cpf ? (
                <p className="text-body-sm tabular-nums text-secondary-foreground">
                  CPF {formatCPF(patient.cpf)}
                </p>
              ) : null}
              {patient.deceased_at ? (
                <p className="text-caption font-semibold text-destructive-foreground">
                  Óbito em {formatDate(patient.deceased_at)}
                </p>
              ) : null}
              {selectedTags.length ? (
                <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                  {selectedTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="rounded-full border px-1.5 py-0.5 text-caption font-medium leading-none"
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
              ) : null}
            </div>

            <PatientContactActions
              phone={phoneDigits}
              phoneLabel={phoneDigits ? formatPhoneBR(phoneDigits) : null}
              whatsapp={patient.whatsapp}
              email={patient.email}
              cpf={
                canSeeSensitive && patient.cpf ? formatCPF(patient.cpf) : null
              }
              conversationHref={conversationHref}
            />

            {canEdit ? (
              <Button asChild className="mt-1 w-full">
                <Link href={`/pacientes/${patient.id}/editar`}>
                  <PencilSimpleLine className="size-4" aria-hidden="true" />
                  Editar paciente
                </Link>
              </Button>
            ) : null}
          </div>

          <PatientSidebarDetails
            alert={
              allergyItems.length ? <AllergyAlert items={allergyItems} /> : null
            }
          >
            <div className="border-t border-border">
              {canSeeSensitive ? (
                <PatientClinicalList
                  patientId={patient.id}
                  summary={clinicalResult.data}
                  canEdit={canEdit}
                />
              ) : (
                <p className="m-4 rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  Dados clínicos permanentes protegidos.
                </p>
              )}
            </div>
            <dl className="grid gap-2.5 border-t border-border px-4 py-4">
              {infoRows.map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.label}
                    className="grid grid-cols-[1rem_5.25rem_minmax(0,1fr)] items-start gap-x-2.5 text-body-sm"
                  >
                    <Icon
                      className="mt-0.5 size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <dt className="text-secondary-foreground">{row.label}</dt>
                    <dd
                      className="break-words text-foreground"
                      title={row.title}
                    >
                      {row.value}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </PatientSidebarDetails>
        </aside>

        <main id="conteudo-paciente" className="min-w-0">
          <Tabs
            ariaLabel="Módulos do paciente"
            variant="card"
            defaultTab={section}
            urlParam="section"
            contentClassName="grid gap-4 pt-4"
            items={[
              {
                id: "overview",
                label: "Resumo",
                icon: <Target />,
                urlValue: null,
                content: overviewContent,
              },
              ...(canSeeClinicalRecords
                ? [
                    {
                      id: "prontuario",
                      label: "Prontuário",
                      icon: <PencilSimpleLine />,
                      content: (
                        <section className="grid gap-4">
                          <ModuleHeading
                            title="Prontuário"
                            description={`${encountersResult.count ?? encounters.length} registro${
                              (encountersResult.count ?? encounters.length) ===
                              1
                                ? ""
                                : "s"
                            } clínico${
                              (encountersResult.count ?? encounters.length) ===
                              1
                                ? ""
                                : "s"
                            } preenchido${
                              (encountersResult.count ?? encounters.length) ===
                              1
                                ? ""
                                : "s"
                            } pelos profissionais.`}
                          />
                          <EncounterTimeline
                            encounters={encounters}
                            entryByEncounter={entryByEncounter}
                            diagnosisByEncounter={diagnosisByEncounter}
                            professionalName={professionalName}
                            appointmentById={appointmentById}
                            timeZone={timeZone}
                          />
                        </section>
                      ),
                    },
                  ]
                : []),
              ...(canSeeAgenda
                ? [
                    {
                      id: "agenda",
                      label: "Agenda",
                      icon: <CalendarBlank />,
                      content: (
                        <AppointmentsPanel
                          appointments={patientAppointments}
                          canEditAgenda={canEditAgenda}
                          canStartClinicalEncounter={canWriteClinical}
                          encounters={encounters}
                          encounterProfessionals={encounterProfessionals}
                          encounterTemplates={encounterTemplates}
                          patientId={patient.id}
                          professionalName={professionalName}
                          total={
                            patientAppointmentsResult.count ??
                            patientAppointments.length
                          }
                          timeZone={timeZone}
                          action={
                            canSchedule && active ? (
                              <PatientScheduleButton
                                patientId={patient.id}
                                patientName={displayName}
                                label="Agendar consulta"
                              />
                            ) : null
                          }
                        />
                      ),
                    },
                  ]
                : []),
              ...(canSeeClinicalRecords
                ? [
                    {
                      id: "documents",
                      label: "Documentos",
                      icon: <FileText />,
                      content: (
                        <PatientDocumentsCard
                          patientId={patient.id}
                          items={documentItems}
                          canUpload={canWriteClinical}
                          uploadAvailable={attachmentsUpgraded}
                        />
                      ),
                    },
                  ]
                : []),
              ...(canSeeFinance
                ? [
                    {
                      id: "finance",
                      label: "Financeiro",
                      icon: <CreditCard />,
                      content: (
                        <FinancePanel
                          receivables={receivablesResult.data ?? []}
                          total={receivablesResult.count ?? 0}
                          openBalance={openBalance}
                          overdueBalance={overdueBalance}
                          partialBalance={
                            (receivablesResult.count ?? 0) >
                            (receivablesResult.data?.length ?? 0)
                          }
                          today={today}
                        />
                      ),
                    },
                  ]
                : []),
              ...(canSeeMessages
                ? [
                    {
                      id: "messages",
                      label: "Mensagens",
                      icon: <ChatCenteredText />,
                      content: (
                        <MessagesPanel
                          conversations={conversations}
                          contactById={contactById}
                          communications={communications}
                          organizationId={organizationId}
                          timeZone={timeZone}
                        />
                      ),
                    },
                  ]
                : []),
              ...(canSeeClinicalRecords
                ? [
                    {
                      id: "prescriptions",
                      label: "Prescrições",
                      icon: <Prescription />,
                      content: (
                        <PrescriptionsPanel
                          prescriptions={prescriptions}
                          professionalName={professionalName}
                          timeZone={timeZone}
                        />
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </main>
      </div>
    </div>
  );
}

const documentShortLabel: Partial<
  Record<keyof typeof documentTypeLabels, string>
> = {
  exam_request: "Pedido de exame",
  attendance_declaration: "Declaração",
  patient_instructions: "Orientações",
  clinical_report: "Laudo",
};

const consentShortLabel: Record<string, string> = {
  pending: "Termo pendente",
  signed: "Termo assinado",
  cancelled: "Termo cancelado",
  revoked: "Termo revogado",
};

function OverviewStat({
  label,
  title,
  tone,
  value,
}: {
  label: string;
  title?: string;
  tone: "neutral" | "danger" | "success";
  value: number;
}) {
  return (
    <div
      title={title || undefined}
      className={cn(
        "grid min-w-0 content-center rounded-md px-3.5 py-2",
        tone === "danger"
          ? "bg-destructive-muted text-destructive-foreground"
          : tone === "success"
            ? "bg-success-muted text-success-foreground"
            : "bg-card text-foreground",
      )}
    >
      <dd className="order-1 text-heading font-bold leading-tight tabular-nums">
        {value}
      </dd>
      <dt
        className={cn(
          "order-2 truncate text-caption",
          tone === "neutral" ? "text-secondary-foreground" : "text-current",
        )}
      >
        {label}
      </dt>
    </div>
  );
}

function SummaryTile({
  action,
  children,
  className,
  icon: Icon,
  label,
  tone,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  icon: React.ComponentType<{ className?: string; weight?: "duotone" }>;
  label: string;
  tone: "primary" | "warning";
}) {
  return (
    <section
      className={cn(
        "relative flex min-w-0 gap-3.5 rounded-lg border border-border bg-card p-4 pr-5 shadow-[var(--shadow-soft)] transition-shadow duration-[var(--motion-fast)] has-[a.absolute:hover]:shadow-[var(--shadow-hover)]",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-full",
          tone === "warning"
            ? "bg-warning-muted text-warning-foreground"
            : "bg-primary-muted text-primary",
        )}
        aria-hidden="true"
      >
        <Icon className="size-6" weight="duotone" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-caption text-muted-foreground">{label}</h2>
        <div className="mt-1 min-w-0">{children}</div>
        {action ? (
          <div className="mt-auto flex justify-end pt-3">{action}</div>
        ) : null}
      </div>
    </section>
  );
}

/** Um ponto da linha do tempo: bolinha à esquerda e a linha que liga. */
function TimelineItem({
  children,
  first,
  last,
}: {
  children: React.ReactNode;
  first: boolean;
  last: boolean;
}) {
  return (
    <li className="relative pl-6">
      <span
        className={cn(
          "absolute left-[7px] w-px bg-border",
          first ? "top-1/2" : "top-0",
          last ? "bottom-1/2" : "bottom-0",
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "absolute left-[3px] top-1/2 size-[9px] -translate-y-1/2 rounded-full",
          first ? "bg-primary ring-4 ring-primary-muted" : "bg-border-strong",
        )}
        aria-hidden="true"
      />
      <div className={cn(!last && "border-b border-border")}>{children}</div>
    </li>
  );
}

function PrescriptionsPanel({
  prescriptions,
  professionalName,
  timeZone,
}: {
  prescriptions: PrescriptionRow[];
  professionalName: Map<string, string>;
  timeZone: string;
}) {
  return (
    <section className="grid gap-4">
      <ModuleHeading
        title="Prescrições"
        description={
          prescriptions.length
            ? `${prescriptions.length} prescriç${prescriptions.length === 1 ? "ão emitida" : "ões emitidas"} nos atendimentos.`
            : "Prescrições emitidas nos atendimentos do paciente."
        }
      />
      {prescriptions.length ? (
        <div className="grid gap-3">
          {prescriptions.map((prescription) => {
            const items = parsePrescriptionItems(prescription.body);
            return (
              <Card key={prescription.id}>
                <CardHeader className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      {prescription.title}
                    </h3>
                    <p className="text-caption text-muted-foreground">
                      {formatNumericDate(prescription.issued_at, timeZone)} ·{" "}
                      {professionalName.get(prescription.professional_id) ??
                        "Profissional"}
                    </p>
                  </div>
                  <Button asChild variant="secondary" size="sm">
                    <a
                      href={`/documentos/${prescription.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir PDF
                    </a>
                  </Button>
                </CardHeader>
                <CardContent className="py-3">
                  {items.length ? (
                    <ul className="grid gap-2">
                      {items.map((item, index) => (
                        <li
                          key={`${prescription.id}-${index}`}
                          className="flex min-w-0 items-center gap-3"
                        >
                          <span
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-full",
                              item.continuous
                                ? "bg-success-muted text-success-foreground"
                                : "bg-primary-muted text-primary",
                            )}
                            aria-hidden="true"
                          >
                            <Pill className="size-4" weight="fill" />
                          </span>
                          <span className="grid min-w-0">
                            <span className="truncate text-sm font-semibold">
                              {item.name}
                            </span>
                            {describePrescriptionItem(item) ? (
                              <span className="truncate text-caption text-muted-foreground">
                                {describePrescriptionItem(item)}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="whitespace-pre-line text-sm text-secondary-foreground">
                      {stripRichTextMarkers(prescription.body)}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Prescription}
            title="Nenhuma prescrição emitida"
            description="As prescrições são emitidas dentro do atendimento, na aba de documentos do prontuário."
          />
        </Card>
      )}
    </section>
  );
}

function normalizePatientSection(value?: string): PatientSection {
  // "history" era a aba antiga (agenda + prontuário juntos).
  if (value === "history") return "prontuario";
  return [
    "prontuario",
    "agenda",
    "documents",
    "finance",
    "messages",
    "prescriptions",
  ].includes(value ?? "")
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
  if (section === "agenda") return permissions.canSeeAgenda;
  if (
    section === "prontuario" ||
    section === "documents" ||
    section === "prescriptions"
  ) {
    return permissions.canSeeClinicalRecords;
  }
  if (section === "finance") return permissions.canSeeFinance;
  if (section === "messages") return permissions.canSeeMessages;
  return true;
}

/** Na linha do tempo "Atendido" aparece como "Concluído", como no Resumo. */
function timelineStatusLabel(status: string) {
  if (status === "attended") return "Concluído";
  return appointmentStatusLabel(status);
}

function formatEmergencyContact(summary?: ClinicalSummary | null) {
  const name = summary?.emergency_contact_name?.trim();
  const relationship = summary?.emergency_contact_relationship?.trim();
  const phone = summary?.emergency_contact_phone?.trim();
  const person = name
    ? relationship
      ? `${name} (${relationship})`
      : name
    : relationship;
  const parts = [person, phone ? formatPhoneBR(phone) : null].filter(Boolean);
  return parts.length ? parts.join(" - ") : "Não informado";
}

function formatCityState(address?: AddressRow | null) {
  if (!address) return "Não informado";
  return (
    [address.city, address.state?.toUpperCase()].filter(Boolean).join(" - ") ||
    formatAddress(address)
  );
}

/** "13 jul 2026". */
function formatShortDate(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month").replace(".", "")} ${part("year")}`;
}

/** "13 de julho de 2026". */
function formatLongDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone,
  }).format(new Date(value));
}

/** "13/07/2026". */
function formatNumericDate(value: string, timeZone: string) {
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
        <h2 className="text-heading-sm font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </section>
  );
}

function AppointmentsPanel({
  action,
  appointments,
  canEditAgenda,
  canStartClinicalEncounter,
  encounters,
  encounterProfessionals,
  encounterTemplates,
  patientId,
  professionalName,
  timeZone,
  total,
}: {
  appointments: AppointmentRow[];
  canEditAgenda: boolean;
  canStartClinicalEncounter: boolean;
  encounters: EncounterRow[];
  encounterProfessionals: EncounterProfessionalOption[];
  encounterTemplates: EncounterTemplateOption[];
  patientId: string;
  professionalName: Map<string, string>;
  timeZone: string;
  total: number;
  action?: React.ReactNode;
}) {
  const encounterByAppointmentId = new Map(
    encounters.flatMap((encounter) =>
      encounter.appointment_id
        ? ([[encounter.appointment_id, encounter]] as const)
        : [],
    ),
  );

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-48 flex-1">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Agenda</h2>
            <Badge variant="neutral">{total}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Compromissos agendados, concluídos, cancelados e faltas.
          </p>
        </div>
        {action}
      </CardHeader>
      <CardContent className="grid gap-2">
        {appointments.map((appointment) => {
          const encounter = encounterByAppointmentId.get(appointment.id);

          return (
            <PatientAppointmentActions
              key={appointment.id}
              id={appointment.id}
              procedureName={appointment.procedures?.name ?? "Atendimento"}
              status={appointment.status}
              statusLabel={appointmentStatusLabel(appointment.status)}
              statusVariant={appointmentStatusVariant(appointment.status)}
              dateTimeLabel={formatDateTimeRange(
                appointment.start_at,
                appointment.end_at,
                timeZone,
              )}
              professionalName={
                professionalName.get(appointment.professional_id) ??
                "Profissional"
              }
              insuranceName={appointment.health_insurances?.name ?? null}
              agendaHref={`/agenda?date=${localDateKey(
                appointment.start_at,
                timeZone,
              )}`}
              canEditAgenda={canEditAgenda}
              canStartEncounter={canStartClinicalEncounter}
              patientId={patientId}
              professionalId={appointment.professional_id}
              professionals={encounterProfessionals}
              templates={encounterTemplates}
              encounterStatus={encounter?.status}
              encounterHref={
                encounter
                  ? `/prontuario/${encounter.id}?from=paciente`
                  : undefined
              }
            />
          );
        })}
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
  timeZone,
}: {
  encounters: EncounterRow[];
  entryByEncounter: Map<string, EncounterEntryRow>;
  diagnosisByEncounter: Map<string, DiagnosisRow>;
  professionalName: Map<string, string>;
  appointmentById: Map<string, AppointmentRow>;
  timeZone: string;
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
                      {formatDateTime(encounter.started_at, timeZone)}
                    </p>
                    {encounter.finalized_at ? (
                      <p className="mt-1 text-xs">
                        Finalizado em{" "}
                        {formatDateTime(encounter.finalized_at, timeZone)}
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

function FinancePanel({
  openBalance,
  overdueBalance,
  partialBalance = false,
  receivables,
  today,
  total,
  viewAll = false,
}: {
  openBalance: number;
  overdueBalance: number;
  partialBalance?: boolean;
  receivables: PatientReceivableRow[];
  /** Hoje (yyyy-mm-dd) no fuso da clínica. */
  today: string;
  total: number;
  viewAll?: boolean;
}) {
  const visibleReceivables = viewAll ? receivables.slice(0, 5) : receivables;

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-48 flex-1">
          <h2 className="font-semibold">Financeiro</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {partialBalance ? "Saldo nos itens recentes" : "Saldo em aberto"}:{" "}
            {formatCurrency(openBalance)}
            {overdueBalance > 0 ? (
              <>
                {" · "}
                <span className="font-medium text-destructive-foreground">
                  {formatCurrency(overdueBalance)} vencido
                </span>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {total} lançamento{total === 1 ? "" : "s"} vinculado
            {total === 1 ? "" : "s"} ao paciente.
          </p>
        </div>
        {/* shrink-0: no card estreito o botão encolhia e o rótulo
            quebrava em "Ver / todos". */}
        {viewAll && total ? (
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <TabSelectionButton value="finance">
              Ver todos
              <ArrowRight className="size-4" aria-hidden="true" />
            </TabSelectionButton>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        {total > visibleReceivables.length ? (
          <p className="text-xs text-muted-foreground">
            Exibindo os {visibleReceivables.length} lançamentos mais recentes.
          </p>
        ) : null}
        {visibleReceivables.map((receivable) => {
          const overdue = isReceivableOverdue(receivable, today);

          return (
            // min-w-0: sem ele o título em linha única esticava a linha além
            // do card e a página inteira ganhava rolagem lateral.
            <FinancialRecordTrigger
              key={receivable.id}
              kind="receivable"
              recordId={receivable.id}
              label={receivable.description}
              card
            >
              <span className="min-w-0 flex-1">
                <span
                  className="block truncate text-sm font-medium"
                  title={receivable.description}
                >
                  {receivable.description}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Venc. {formatDate(receivable.due_date)} ·{" "}
                  {formatCurrency(receivable.paid_amount)} recebido de{" "}
                  {formatCurrency(receivable.amount)}
                </span>
              </span>
              {/* Vencido é o "Aberto" (ou "Parcial") que passou da data:
                  aparecia igual ao que ainda vai vencer. */}
              <Badge
                variant={
                  overdue
                    ? "destructive"
                    : receivableStatusVariant(receivable.status)
                }
              >
                {overdue ? (
                  <WarningCircle className="mr-1 size-3" aria-hidden="true" />
                ) : receivable.status === "paid" ? (
                  <CircleCheck className="mr-1 size-3" aria-hidden="true" />
                ) : receivable.status === "open" ? (
                  <Clock3 className="mr-1 size-3" aria-hidden="true" />
                ) : null}
                {overdue ? "Vencido" : receivableStatusLabel(receivable.status)}
              </Badge>
            </FinancialRecordTrigger>
          );
        })}
        {!visibleReceivables.length ? (
          // Vazio aqui é sem lançamento nenhum, nem pago: "pendência" dizia
          // menos do que isso.
          <EmptyState icon={CreditCard} title="Nenhum lançamento financeiro" />
        ) : null}
      </CardContent>
    </Card>
  );
}

function MessagesPanel({
  contactById,
  conversations,
  communications,
  organizationId,
  timeZone,
  viewAll = false,
}: {
  contactById: Map<string, WhatsAppContactRow>;
  conversations: WhatsAppConversationRow[];
  communications: PatientCommunicationRow[];
  organizationId: string;
  timeZone: string;
  viewAll?: boolean;
}) {
  const visibleConversations = viewAll
    ? conversations.slice(0, 3)
    : conversations;

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-48 flex-1">
          <h2 className="font-semibold">Mensagens</h2>
          {/* Sem conversa, o estado vazio abaixo já explica; repetir no
              cabeçalho dizia a mesma coisa duas vezes. */}
          {conversations.length ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {`${conversations.length} conversa${
                conversations.length === 1 ? "" : "s"
              } vinculada${conversations.length === 1 ? "" : "s"} ao paciente.`}
            </p>
          ) : null}
        </div>
        {viewAll && conversations.length ? (
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <TabSelectionButton value="messages">
              Ver mensagens
              <ArrowRight className="size-4" aria-hidden="true" />
            </TabSelectionButton>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {visibleConversations.map((conversation) => {
          const contact = contactById.get(conversation.contact_id);
          return (
            <div
              key={conversation.id}
              className="flex min-w-0 flex-col justify-between gap-3 rounded-md border border-border px-3 py-3 sm:flex-row sm:items-center"
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
                    {formatDateTime(conversation.last_message_at, timeZone)}
                  </p>
                ) : null}
              </div>
              <PatientConversationPreview
                conversationId={conversation.id}
                organizationId={organizationId}
                contactName={
                  contact?.wa_name ||
                  (contact?.phone
                    ? formatPhoneBR(contact.phone)
                    : "contato do WhatsApp")
                }
              />
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

        {!viewAll ? (
          <section className="grid gap-2 border-t border-border pt-4">
            <div>
              <h3 className="font-semibold">Comunicações enviadas</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Lembretes, confirmações e demais disparos das automações para
                este paciente. O conteúdo da conversa fica no atendimento.
              </p>
            </div>
            {communications.map((communication) => (
              <div
                key={communication.id}
                className="grid gap-1 rounded-md bg-muted/45 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                    {communication.automation_name ??
                      communication.template_name ??
                      "Comunicação avulsa"}
                  </p>
                  <Badge variant="neutral">
                    {communicationChannelLabel(communication.channel)}
                  </Badge>
                  <Badge
                    variant={communicationStatusVariant(communication.status)}
                  >
                    {communicationStatusLabel(communication.status)}
                  </Badge>
                </div>
                {communication.subject ? (
                  <p className="text-sm font-medium">{communication.subject}</p>
                ) : null}
                <p className="whitespace-pre-wrap break-words text-sm">
                  {communication.body}
                </p>
                <p className="text-caption text-muted-foreground">
                  {communication.sent_at
                    ? `Enviada em ${formatDateTime(communication.sent_at, timeZone)}`
                    : `Agendada para ${formatDateTime(
                        communication.scheduled_at,
                        timeZone,
                      )}`}
                  {" · "}
                  {communication.recipient}
                </p>
                {communication.error_message ? (
                  <p className="text-caption text-destructive">
                    {communication.error_message}
                  </p>
                ) : null}
              </div>
            ))}
            {!communications.length ? (
              <p className="rounded-md bg-muted/45 px-3 py-2.5 text-sm text-muted-foreground">
                Nenhuma comunicação registrada para este paciente.
              </p>
            ) : null}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
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

// Mesmos rótulos do módulo Financeiro: "partial", "cancelled" e
// "written_off" apareciam em inglês na ficha.
function receivableStatusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "Aberto",
    partial: "Parcial",
    paid: "Pago",
    cancelled: "Cancelado",
    written_off: "Baixado",
  };
  return labels[status] ?? status;
}

function receivableStatusVariant(
  status: string,
): "neutral" | "success" | "warning" {
  if (status === "paid") return "success";
  if (status === "open") return "warning";
  return "neutral";
}

/** Em aberto (ou parcial) com vencimento antes de hoje. */
function isReceivableOverdue(
  receivable: Pick<PatientReceivableRow, "due_date" | "status">,
  today: string,
) {
  return (
    ["open", "partial"].includes(receivable.status) &&
    receivable.due_date < today
  );
}

/** Alergias à vista no celular, com os dados do paciente recolhidos. */
function AllergyAlert({ items }: { items: string[] }) {
  return (
    <div className="flex gap-2 rounded-md border border-destructive-muted bg-destructive-muted/40 px-3 py-2">
      <ShieldAlert
        className="mt-0.5 size-4 shrink-0 text-destructive-foreground"
        aria-hidden="true"
      />
      <p className="min-w-0 break-words text-sm">
        <span className="font-semibold text-destructive-foreground">
          Alergias:
        </span>{" "}
        {items.join(", ")}
      </p>
    </div>
  );
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

function communicationChannelLabel(channel: string) {
  const labels: Record<string, string> = {
    whatsapp: "WhatsApp",
    email: "E-mail",
    sms: "SMS",
  };
  return labels[channel] ?? channel;
}

function communicationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "Na fila",
    sending: "Enviando",
    sent: "Enviada",
    failed: "Falhou",
    skipped: "Não enviada",
  };
  return labels[status] ?? status;
}

function communicationStatusVariant(
  status: string,
): "neutral" | "primary" | "success" | "warning" | "destructive" {
  if (status === "sent") return "success";
  if (status === "failed") return "destructive";
  if (status === "skipped") return "neutral";
  return "warning";
}

function splitSummary(value?: string | null) {
  return (value ?? "")
    .split(/\r?\n|;/)
    .map((item) => item.replace(/^[\s•·–—*-]+/, "").trim())
    .filter(Boolean);
}

function summarizeNotes(value?: string | null) {
  // As notas guardam a formatação do editor (**negrito**, "- item"): no
  // resumo de uma linha vale só o texto.
  const clean = value
    ? stripRichTextMarkers(value).replace(/\s+/g, " ").trim()
    : "";
  if (!clean) return null;
  return clean.length > 140 ? `${clean.slice(0, 139).trimEnd()}…` : clean;
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

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function formatDateTimeRange(startAt: string, endAt: string, timeZone: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const date = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone,
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return `${date}, ${timeFormatter.format(start)}–${timeFormatter.format(end)}`;
}

/** Data (yyyy-mm-dd) do instante no fuso da clínica, para links da agenda. */
function localDateKey(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}
