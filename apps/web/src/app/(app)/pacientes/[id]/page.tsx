import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CircleCheck,
  Clock3,
  CreditCard,
  Edit3,
  FileText,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  Stethoscope,
  Tag,
  UserRound,
} from "lucide-react";
import { type ClinicalSummary, type TagRow } from "./patient-detail-panels";
import { PatientPhotoForm } from "./patient-photo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireCompanyPermission } from "@/lib/authz/guards";
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
  cpf: string | null;
  rg: string | null;
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

const documentTypeLabels: Record<string, string> = {
  prescription: "Prescrição",
  exam_request: "Solicitação de exame",
  medical_certificate: "Atestado",
  attendance_declaration: "Declaração de comparecimento",
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
  const canSeeClinicalRecords =
    context.permissionCodes.has("clinico.ver_prontuario") ||
    context.permissionCodes.has("clinico.ver_prontuario_proprios");
  const canSeeFinance =
    context.permissionCodes.has("financeiro.ver_geral") ||
    context.permissionCodes.has("financeiro.receber_pagamento");
  const canEdit = context.permissionCodes.has("paciente.editar");
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const nowIso = new Date().toISOString();

  const patientResult = await supabase
    .from("patients")
    .select(
      "id, full_name, social_name, birth_date, sex_at_birth, cpf, rg, email, phone, whatsapp, preferred_contact, allow_whatsapp, allow_email, allow_sms, status, source, photo_path, deleted_at, created_at",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle<PatientRow>();

  if (!patientResult.data) notFound();
  const patient = patientResult.data;

  const [
    addressResult,
    clinicalResult,
    tagsResult,
    patientTagsResult,
    documentsResult,
    receivablesResult,
    encountersResult,
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
      ? supabase
          .from("clinical_documents")
          .select("id, document_type, title, issued_at")
          .eq("patient_id", id)
          .eq("organization_id", organizationId)
          .order("issued_at", { ascending: false })
          .limit(5)
          .returns<PatientDocumentRow[]>()
      : Promise.resolve({ data: [] as PatientDocumentRow[] }),
    canSeeFinance
      ? supabase
          .from("accounts_receivable")
          .select("id, description, amount, paid_amount, due_date, status")
          .eq("patient_id", id)
          .eq("organization_id", organizationId)
          .order("due_date", { ascending: false })
          .limit(5)
          .returns<PatientReceivableRow[]>()
      : Promise.resolve({ data: [] as PatientReceivableRow[] }),
    canSeeClinicalRecords
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
  ]);

  const encounters = encountersResult.data ?? [];
  const encounterIds = encounters.map((encounter) => encounter.id);
  const professionalIds = [
    ...new Set(encounters.map((encounter) => encounter.professional_id)),
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
    appointmentsResult,
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
            "id, start_at, end_at, status, procedures(name), health_insurances(name)",
          )
          .eq("organization_id", organizationId)
          .in("id", appointmentIds)
          .returns<AppointmentRow[]>()
      : Promise.resolve({ data: [] as AppointmentRow[] }),
  ]);

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
    (appointmentsResult.data ?? []).map((item) => [item.id, item]),
  );
  const openBalance = (receivablesResult.data ?? [])
    .filter((item) => ["open", "partial"].includes(item.status))
    .reduce(
      (sum, item) =>
        sum + Math.max(0, Number(item.amount) - Number(item.paid_amount)),
      0,
    );

  return (
    <div className="grid gap-6">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="secondary" size="icon">
            <Link href="/pacientes" aria-label="Voltar para pacientes">
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{displayName}</h1>
              <Badge variant={patient.deleted_at ? "neutral" : "success"}>
                {patient.deleted_at ? "Arquivado" : "Ativo"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Prontuário #{patient.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
        {canEdit ? (
          <Button asChild>
            <Link href={`/pacientes/${patient.id}/editar`}>
              <Edit3 className="size-4" aria-hidden="true" />
              Editar paciente
            </Link>
          </Button>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="grid self-start overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-soft)] lg:sticky lg:top-24">
          <div className="grid justify-items-center gap-3 bg-gradient-to-b from-primary-muted to-transparent px-5 pb-5 pt-6">
            <PatientPhotoForm
              patientId={patient.id}
              photoUrl={photoUrl}
              initials={initialsFromName(displayName)}
              canEdit={canEdit}
            />

            <div className="text-center">
              <h2 className="font-semibold">{displayName}</h2>
              <p className="mt-1 font-mono text-xs font-semibold uppercase tracking-wide text-primary">
                Prontuário #{patient.id.slice(0, 8).toUpperCase()}
              </p>
              {patient.social_name ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nome civil: {patient.full_name}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 px-5 pb-5">
            <div className="h-px bg-border" />

            <div className="grid gap-4">
              <SidebarInfo
                icon={CalendarDays}
                label="Nascimento"
                value={
                  patient.birth_date
                    ? `${formatDate(patient.birth_date)} (${patientAge(
                        patient.birth_date,
                      )})`
                    : "Não informado"
                }
              />
              <SidebarInfo
                icon={UserRound}
                label="Sexo"
                value={sexLabel(patient.sex_at_birth)}
              />
              <SidebarInfo
                icon={CreditCard}
                label="CPF"
                value={patient.cpf ? formatCPF(patient.cpf) : "Não informado"}
              />
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
                      className="rounded-md border px-2 py-1 text-xs font-medium"
                      style={{
                        borderColor: tag.color,
                        color: tag.color,
                        backgroundColor: `${tag.color}12`,
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

        <main className="grid min-w-0 gap-5">
          <section>
            <h2 className="text-xl font-semibold">Histórico de atendimentos</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {encounters.length} atendimentos registrados. Clique em um
              atendimento para visualizar os detalhes preenchidos pelo
              profissional.
            </p>
          </section>

          {canSeeClinicalRecords ? (
            <EncounterTimeline
              encounters={encounters}
              entryByEncounter={entryByEncounter}
              diagnosisByEncounter={diagnosisByEncounter}
              professionalName={professionalName}
              appointmentById={appointmentById}
            />
          ) : (
            <ProtectedPanel
              title="Histórico clínico protegido"
              description="Seu perfil não possui permissão para visualizar prontuários."
            />
          )}

          <section className="grid gap-4 xl:grid-cols-2">
            {canSeeClinicalRecords ? (
              <DocumentsPanel documents={documentsResult.data ?? []} />
            ) : null}
            {canSeeFinance ? (
              <FinancePanel
                receivables={receivablesResult.data ?? []}
                openBalance={openBalance}
              />
            ) : null}
          </section>
        </main>
      </div>
    </div>
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
                    <Link href={`/prontuario/${encounter.id}`}>
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

function DocumentsPanel({ documents }: { documents: PatientDocumentRow[] }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Documentos recentes</h2>
      </CardHeader>
      <CardContent className="grid gap-3">
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
  receivables,
  openBalance,
}: {
  receivables: PatientReceivableRow[];
  openBalance: number;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Financeiro</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Saldo em aberto: {formatCurrency(openBalance)}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
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

function patientAge(birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }
  return `${age} anos`;
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);
}
