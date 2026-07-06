import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, UserRound } from "lucide-react";
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
    schema?: {
      sections?: Array<{
        id: string;
        title: string;
        fields: Array<{
          id: string;
          label: string;
          type?: "text" | "textarea";
          required?: boolean;
        }>;
      }>;
    };
  };
  structured_data: Record<string, string>;
  free_notes: string | null;
};

export default async function EncounterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireCompanyPermission([
    "clinico.ver_prontuario",
    "clinico.ver_prontuario_proprios",
  ]);
  const { id } = await params;
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
  ] = await Promise.all([
    supabase
      .from("encounter_entries")
      .select("template_snapshot, structured_data, free_notes")
      .eq("organization_id", encounter.organization_id)
      .eq("encounter_id", encounter.id)
      .single<EntryRow>(),
    supabase
      .from("patients")
      .select("id, full_name, social_name, birth_date")
      .eq("organization_id", encounter.organization_id)
      .eq("id", encounter.patient_id)
      .single<{
        id: string;
        full_name: string;
        social_name: string | null;
        birth_date: string | null;
      }>(),
    supabase
      .from("professionals")
      .select("id, name")
      .eq("organization_id", encounter.organization_id)
      .eq("id", encounter.professional_id)
      .single<{ id: string; name: string }>(),
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
      .select("id, document_type, name, title_template, body_template")
      .eq("organization_id", encounter.organization_id)
      .eq("active", true)
      .order("document_type")
      .order("name")
      .returns<ClinicalDocumentTemplate[]>(),
    supabase
      .from("clinical_documents")
      .select("id, document_type, title, issued_at")
      .eq("organization_id", encounter.organization_id)
      .eq("encounter_id", encounter.id)
      .order("issued_at", { ascending: false })
      .returns<ClinicalDocument[]>(),
  ]);

  if (!entryResult.data || !patientResult.data || !professionalResult.data) {
    notFound();
  }

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

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/prontuario">
              <ArrowLeft className="size-4" /> Voltar
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
        schema={{
          sections: entryResult.data.template_snapshot.schema?.sections ?? [],
        }}
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
        templates={documentTemplatesResult.data ?? []}
        documents={documentsResult.data ?? []}
        canIssue={{
          prescription: context.permissionCodes.has("clinico.prescrever"),
          examRequest: context.permissionCodes.has("clinico.solicitar_exame"),
          certificate: context.permissionCodes.has("clinico.emitir_atestado"),
        }}
      />
    </div>
  );
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
