import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import {
  ArrowLeft,
  Faders as Settings2,
  Stethoscope,
  UserCircle as UserRound,
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
import { PatientLifeStatusPanel } from "../patient-life-status-panel";
import { PatientForm, type PatientFormValues } from "../../patient-form";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { requireCompanyPermission } from "@/lib/authz/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AddressRow = NonNullable<PatientFormValues["address"]>;
type PatientTagRow = { tag_id: string };
type EditablePatientRow = Omit<PatientFormValues, "address" | "cpf" | "rg"> & {
  cpf?: string | null;
  rg?: string | null;
  deceased_at: string | null;
  deleted_at: string | null;
  status: string;
};
type PatientDeathNotesRow = { death_notes: string | null };
type OrganizationTimeZoneRow = { timezone: string | null };

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireCompanyPermission(["paciente.ver"]);
  const { id } = await params;
  const canSeeSensitive = context.permissionCodes.has(
    "paciente.ver_dados_sensiveis",
  );
  const canEdit = context.permissionCodes.has("paciente.editar");
  const supabase = await createSupabaseServerClient();
  const organizationId = context.organization.id;
  const nowIso = new Date().toISOString();
  const patientSelect = canSeeSensitive
    ? "id, full_name, social_name, birth_date, sex_at_birth, cpf, rg, email, phone, whatsapp, preferred_contact, allow_whatsapp, allow_email, allow_sms, status, source, deceased_at, deleted_at"
    : "id, full_name, social_name, birth_date, sex_at_birth, email, phone, whatsapp, preferred_contact, allow_whatsapp, allow_email, allow_sms, status, source, deceased_at, deleted_at";

  const { data: patient } = await supabase
    .from("patients")
    .select(patientSelect as string)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle<EditablePatientRow>();

  if (!patient) notFound();

  const [
    addressResult,
    clinicalResult,
    consentsResult,
    tagsResult,
    patientTagsResult,
    deathNotesResult,
    timezoneResult,
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
    canSeeSensitive
      ? supabase
          .from("patients")
          .select("death_notes")
          .eq("id", id)
          .eq("organization_id", organizationId)
          .maybeSingle<PatientDeathNotesRow>()
      : Promise.resolve({ data: null }),
    supabase
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle<OrganizationTimeZoneRow>(),
  ]);

  const displayName = patient.social_name || patient.full_name;
  const today = formatInTimeZone(
    new Date(),
    timezoneResult.data?.timezone || "America/Fortaleza",
    "yyyy-MM-dd",
  );
  const formPatient: PatientFormValues = {
    ...patient,
    cpf: patient.cpf ?? null,
    rg: patient.rg ?? null,
    address: addressResult.data,
  };

  return (
    <div className="grid gap-6">
      <section className="grid min-w-0 gap-2">
        <Breadcrumb
          items={[
            { label: "Pacientes", href: "/pacientes" },
            { label: displayName, href: `/pacientes/${id}` },
            { label: "Editar" },
          ]}
        />
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="secondary" size="icon">
            <Link href={`/pacientes/${id}`} aria-label="Voltar para o resumo">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-heading-lg">Editar {displayName}</h1>
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
            <p className="mt-1 text-sm text-muted-foreground">
              Altere dados pessoais, informações clínicas ou configurações do
              cadastro.
            </p>
          </div>
        </div>
      </section>

      <Tabs
        ariaLabel="Seções editáveis do paciente"
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
                canEdit={canEdit}
              />
            ) : (
              <FutureModulePanel
                title="Conteúdo clínico protegido"
                description="Seu perfil não possui acesso aos dados clínicos permanentes."
              />
            ),
          },
          {
            id: "configuracoes",
            label: "Configurações",
            icon: <Settings2 />,
            content: (
              <div className="grid gap-5">
                {canSeeSensitive && (canEdit || patient.deceased_at) ? (
                  <PatientLifeStatusPanel
                    patientId={id}
                    patientName={displayName}
                    deceasedAt={patient.deceased_at}
                    deathNotes={deathNotesResult.data?.death_notes ?? null}
                    canEdit={canEdit}
                    today={today}
                  />
                ) : null}
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
