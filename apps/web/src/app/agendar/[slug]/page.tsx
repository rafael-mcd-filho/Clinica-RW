import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CalendarDots as CalendarDays,
  CheckCircle as CircleCheck,
  Clock as Clock3,
  CreditCard,
  MapPin,
  PhoneCall,
  Users,
  Hospital,
  CaretDown,
  ShieldCheck,
  Stethoscope,
  Star,
  UserCircle as UserRound,
} from "@phosphor-icons/react/dist/ssr";
import {
  BookingForm,
  type PublicInsurance,
  type PublicProcedure,
  type PublicSchedule,
} from "./booking-form";
import { BookServiceButton } from "./book-service-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPlatformSettings } from "@/lib/platform/settings";
import { formatPhoneBR } from "@/lib/validation/br";
import styles from "./booking-page.module.css";

type SettingsRow = {
  organization_id: string;
  public_slug: string;
  enabled: boolean;
  min_notice_hours: number;
  max_days_ahead: number;
  cancellation_notice_hours: number;
  require_contact_verification: boolean;
  contact_verification_ttl_minutes: number;
  public_instructions: string | null;
  cancellation_policy: string | null;
  profile_headline: string | null;
  profile_summary: string | null;
  experience_text: string | null;
  education_count: number;
  accepted_plan_count: number;
  excellence_badge_year: number | null;
  treated_conditions: string[];
  patient_groups: string[];
  consultation_formats: string[];
  profile_highlights: string[];
  accepted_health_insurance_ids: string[];
  accepted_payment_method_ids: string[];
  accepted_plan_notes: string | null;
};

type OrganizationRow = { name: string; logo_url: string | null };
type ClinicRow = {
  trade_name: string;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  address_number: string | null;
  city: string | null;
  state: string | null;
};
type ScheduleRow = {
  id: string;
  name: string;
  professional_id: string;
  unit_id: string;
  professionals: {
    name: string;
    council_type: string | null;
    council_number: string | null;
    council_state: string | null;
  } | null;
  units: { name: string } | null;
};
type ProcedureRow = {
  id: string;
  name: string;
  duration_minutes: number;
  base_price: number;
};
type ScheduleOnlineSettingsRow = {
  schedule_id: string;
  enabled: boolean;
  min_notice_hours: number;
  max_days_ahead: number;
  cancellation_notice_hours: number;
};
type ScheduleProcedureRow = {
  schedule_id: string;
  procedure_id: string;
};
type InsuranceRow = { id: string; name: string };
type PaymentMethodRow = { id: string; name: string };
type ReviewRow = {
  id: string;
  patient_display_name: string;
  rating: number;
  title: string | null;
  body: string;
  tags: string[];
  source_label: string | null;
  verified: boolean;
  highlighted: boolean;
  review_date: string;
  professional_response: string | null;
};
// Título e descrição ao compartilhar o link (WhatsApp, redes sociais).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: settings } = await supabase
    .from("online_booking_settings")
    .select("organization_id")
    .eq("public_slug", slug.toLowerCase())
    .eq("enabled", true)
    .maybeSingle<{ organization_id: string }>();
  if (!settings) return { title: "Agendamento online" };
  const [{ data: clinic }, { data: organization }] = await Promise.all([
    supabase
      .from("clinics")
      .select("trade_name")
      .eq("organization_id", settings.organization_id)
      .maybeSingle<{ trade_name: string | null }>(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", settings.organization_id)
      .maybeSingle<{ name: string }>(),
  ]);
  const name = clinic?.trade_name || organization?.name || "Clínica";
  return {
    title: `Agendar em ${name}`,
    description: `Escolha o profissional, o serviço e o horário e solicite seu agendamento em ${name}.`,
  };
}

export default async function OnlineBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: settings } = await supabase
    .from("online_booking_settings")
    .select(
      "organization_id, public_slug, enabled, min_notice_hours, max_days_ahead, cancellation_notice_hours, require_contact_verification, contact_verification_ttl_minutes, public_instructions, cancellation_policy, profile_headline, profile_summary, experience_text, education_count, accepted_plan_count, excellence_badge_year, treated_conditions, patient_groups, consultation_formats, profile_highlights, accepted_health_insurance_ids, accepted_payment_method_ids, accepted_plan_notes",
    )
    .eq("public_slug", slug.toLowerCase())
    .eq("enabled", true)
    .maybeSingle<SettingsRow>();

  if (!settings) notFound();

  const organizationId = settings.organization_id;

  const [
    organization,
    clinic,
    schedules,
    scheduleOnlineSettings,
    scheduleProcedureMappings,
    procedures,
    insurances,
    paymentMethods,
    reviews,
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, logo_url")
      .eq("id", organizationId)
      .single<OrganizationRow>(),
    supabase
      .from("clinics")
      .select(
        "trade_name, phone, email, address_line, address_number, city, state",
      )
      .eq("organization_id", organizationId)
      .maybeSingle<ClinicRow>(),
    supabase
      .from("schedules")
      .select(
        "id, name, professional_id, unit_id, professionals(name, council_type, council_number, council_state), units(name)",
      )
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .returns<ScheduleRow[]>(),
    supabase
      .from("schedule_online_booking_settings")
      .select(
        "schedule_id, enabled, min_notice_hours, max_days_ahead, cancellation_notice_hours",
      )
      .eq("organization_id", organizationId)
      .returns<ScheduleOnlineSettingsRow[]>(),
    supabase
      .from("schedule_online_booking_procedures")
      .select("schedule_id, procedure_id")
      .eq("organization_id", organizationId)
      .returns<ScheduleProcedureRow[]>(),
    supabase
      .from("procedures")
      .select("id, name, duration_minutes, base_price")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .returns<ProcedureRow[]>(),
    supabase
      .from("health_insurances")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .returns<InsuranceRow[]>(),
    supabase
      .from("payment_methods")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("name")
      .returns<PaymentMethodRow[]>(),
    supabase
      .from("online_booking_reviews")
      .select(
        "id, patient_display_name, rating, title, body, tags, source_label, verified, highlighted, review_date, professional_response",
      )
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("highlighted", { ascending: false })
      .order("review_date", { ascending: false })
      .limit(12)
      .returns<ReviewRow[]>(),
  ]);

  if (
    schedules.error ||
    scheduleOnlineSettings.error ||
    scheduleProcedureMappings.error ||
    procedures.error
  ) {
    throw new Error("Não foi possível carregar o agendamento online.");
  }

  const clinicName =
    clinic.data?.trade_name ?? organization.data?.name ?? "Clínica";
  const onlineSettingsBySchedule = new Map(
    (scheduleOnlineSettings.data ?? [])
      .filter((item) => item.enabled)
      .map((item) => [item.schedule_id, item]),
  );
  const activeProcedureIds = new Set(
    (procedures.data ?? []).map((procedure) => procedure.id),
  );
  const procedureIdsBySchedule = new Map<string, string[]>();
  for (const mapping of scheduleProcedureMappings.data ?? []) {
    if (!activeProcedureIds.has(mapping.procedure_id)) continue;
    const procedureIds = procedureIdsBySchedule.get(mapping.schedule_id) ?? [];
    procedureIds.push(mapping.procedure_id);
    procedureIdsBySchedule.set(mapping.schedule_id, procedureIds);
  }
  const publishedScheduleRows = (schedules.data ?? []).filter(
    (schedule) =>
      onlineSettingsBySchedule.has(schedule.id) &&
      (procedureIdsBySchedule.get(schedule.id)?.length ?? 0) > 0,
  );
  const publicSchedules: PublicSchedule[] = publishedScheduleRows.map(
    (schedule) => {
      const scheduleSettings = onlineSettingsBySchedule.get(schedule.id)!;
      return {
        id: schedule.id,
        name: schedule.name,
        professionalId: schedule.professional_id,
        professionalName: schedule.professionals?.name ?? "Profissional",
        unitName: schedule.units?.name ?? "Unidade",
        procedureIds: procedureIdsBySchedule.get(schedule.id) ?? [],
        minNoticeHours: scheduleSettings.min_notice_hours,
        maxDaysAhead: scheduleSettings.max_days_ahead,
        cancellationNoticeHours: scheduleSettings.cancellation_notice_hours,
      };
    },
  );
  const publishedProcedureIds = new Set(
    publicSchedules.flatMap((schedule) => schedule.procedureIds),
  );
  const publishedProcedureRows = (procedures.data ?? []).filter((procedure) =>
    publishedProcedureIds.has(procedure.id),
  );
  const publicProcedures: PublicProcedure[] = publishedProcedureRows.map(
    (procedure) => ({
      id: procedure.id,
      name: procedure.name,
      durationMinutes: procedure.duration_minutes,
      basePrice: Number(procedure.base_price ?? 0),
    }),
  );
  const acceptedInsuranceIds = new Set(
    settings.accepted_health_insurance_ids ?? [],
  );
  const acceptedPaymentMethodIds = new Set(
    settings.accepted_payment_method_ids ?? [],
  );
  const acceptedInsurances = (insurances.data ?? []).filter(
    (insurance) =>
      !acceptedInsuranceIds.size || acceptedInsuranceIds.has(insurance.id),
  );
  const publicInsurances: PublicInsurance[] = acceptedInsurances.map(
    (insurance) => ({
      id: insurance.id,
      name: insurance.name,
    }),
  );
  const acceptedPaymentMethods = (paymentMethods.data ?? []).filter(
    (method) =>
      !acceptedPaymentMethodIds.size || acceptedPaymentMethodIds.has(method.id),
  );
  const reviewRows = reviews.data ?? [];
  const averageRating = reviewRows.length
    ? reviewRows.reduce((sum, review) => sum + Number(review.rating), 0) /
      reviewRows.length
    : 0;
  // Com vários profissionais, a página é da clínica: pôr o primeiro no topo
  // fazia parecer que só ele atendia.
  const publishedProfessionalCount = new Set(
    publishedScheduleRows.map((schedule) => schedule.professional_id),
  ).size;
  const singleProfessional = publishedProfessionalCount === 1;
  const representativeSchedule = singleProfessional
    ? publishedScheduleRows[0]
    : null;
  const professionalName =
    representativeSchedule?.professionals?.name ?? clinicName;
  const councilLine = representativeSchedule?.professionals
    ? [
        representativeSchedule.professionals.council_type,
        representativeSchedule.professionals.council_state,
        representativeSchedule.professionals.council_number,
      ]
        .filter(Boolean)
        .join(" ")
    : "";
  const cancellationNotices = new Set(
    publicSchedules.map((schedule) => schedule.cancellationNoticeHours),
  );
  const platform = await getPlatformSettings();
  const publishedUnitCount = new Set(
    publishedScheduleRows.map((schedule) => schedule.unit_id).filter(Boolean),
  ).size;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className="relative mx-auto flex min-h-[4.25rem] w-full max-w-[1240px] items-center gap-7 px-4 py-3 sm:px-6">
          <div className="hidden shrink-0 items-center gap-2 border-r border-white/35 pr-7 sm:flex">
            {platform.logo_full_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={platform.logo_full_url}
                alt={platform.app_name}
                className="h-9 max-w-40 object-contain brightness-0 invert"
              />
            ) : (
              <>
                <Hospital className="size-9" aria-hidden="true" />
                <span className="text-2xl font-semibold tracking-tight">
                  {platform.app_name}
                </span>
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold">{clinicName}</h1>
            <p className="mt-0.5 text-xs leading-relaxed text-white/90">
              Agende online: escolha o profissional, o serviço e o horário.
              Depois, informe seus dados.
            </p>
          </div>
          <div className="hidden items-center gap-3 text-xs leading-snug xl:flex">
            <span className="flex size-11 items-center justify-center rounded-full bg-white/15">
              <CalendarDays className="size-6" aria-hidden="true" />
            </span>
            <span>
              Cuidado médico,
              <br />
              de forma mais simples.
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1240px] items-start gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.42fr)_minmax(0,1fr)]">
        <div className="order-2 grid min-w-0 gap-3 lg:order-1">
          <ProfileHero
            clinicName={clinicName}
            professionalName={professionalName}
            headline={
              settings.profile_headline ||
              (singleProfessional
                ? null
                : publishedProfessionalCount > 1
                  ? `${publishedProfessionalCount} profissionais com agenda online`
                  : null)
            }
            summary={settings.profile_summary}
            councilLine={councilLine}
            logoUrl={organization.data?.logo_url}
            rating={averageRating}
            reviewCount={reviewRows.length}
            professionalCount={publishedProfessionalCount}
            unitCount={publishedUnitCount}
          />
          <ServicesCard procedures={publishedProcedureRows} />
          <AcceptedPlansCard
            insurances={acceptedInsurances}
            notes={settings.accepted_plan_notes}
          />
          <PaymentMethodsCard methods={acceptedPaymentMethods} />
          <ExperienceCard settings={settings} />
          {reviewRows.length ? (
            <ReviewsCard reviews={reviewRows} rating={averageRating} />
          ) : null}
        </div>

        <aside
          id="agendamento"
          className="order-1 grid min-w-0 scroll-mt-5 content-start gap-3 lg:order-2"
        >
          <div className="min-w-0">
            <BookingForm
              slug={settings.public_slug}
              schedules={publicSchedules}
              procedures={publicProcedures}
              insurances={publicInsurances}
              requireContactVerification={settings.require_contact_verification}
              verificationTtlMinutes={settings.contact_verification_ttl_minutes}
            />
          </div>
          <Card>
            <CardContent className="grid gap-3 p-3.5">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary">
                  <PhoneCall className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium">{clinicName}</p>
                  <p className="text-sm text-muted-foreground">
                    {clinic.data?.phone ? (
                      <a
                        href={`tel:${clinic.data.phone.replace(/[^+\d]/g, "")}`}
                        className="hover:text-primary hover:underline"
                      >
                        {formatClinicPhone(clinic.data.phone)}
                      </a>
                    ) : clinic.data?.email ? (
                      <a
                        href={`mailto:${clinic.data.email}`}
                        className="break-all hover:text-primary hover:underline"
                      >
                        {clinic.data.email}
                      </a>
                    ) : (
                      "Contato pela clínica"
                    )}
                  </p>
                </div>
              </div>
              {clinic.data?.address_line || clinic.data?.city ? (
                <div className="flex items-start gap-3">
                  <MapPin
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground">
                    {formatAddress(clinic.data)}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="relative grid gap-2 py-3.5 pl-[4.5rem] pr-4">
              <span className="absolute left-4 top-3.5 flex size-10 items-center justify-center rounded-xl bg-primary-muted text-primary">
                <CalendarDays className="size-6" aria-hidden="true" />
              </span>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Política de agenda</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">
                  <CircleCheck className="mr-1 size-3.5" aria-hidden="true" />
                  Confirmação pela clínica
                </Badge>
                <Badge variant="neutral">
                  <Clock3 className="mr-1 size-3.5" aria-hidden="true" />
                  {cancellationNotices.size === 1
                    ? `Cancelamento com ${[...cancellationNotices][0]}h`
                    : "Prazo de cancelamento por agenda"}
                </Badge>
              </div>
              {settings.public_instructions ? (
                <p className="text-sm text-muted-foreground">
                  {settings.public_instructions}
                </p>
              ) : null}
              {settings.cancellation_policy ? (
                <p className="text-sm text-muted-foreground">
                  {settings.cancellation_policy}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-primary-muted-hover bg-primary-muted/40">
            <CardContent className="grid gap-3 p-3.5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-muted text-primary">
                  <ShieldCheck className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Seus dados protegidos</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Este portal recebe apenas dados administrativos de
                    agendamento. Documentos e informações clínicas ficam
                    protegidos no sistema da clínica.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}

function ProfileHero({
  clinicName,
  professionalName,
  headline,
  summary,
  councilLine,
  logoUrl,
  rating,
  reviewCount,
  professionalCount,
  unitCount,
}: {
  clinicName: string;
  professionalName: string;
  headline: string | null;
  summary: string | null;
  councilLine: string;
  logoUrl: string | null | undefined;
  rating: number;
  reviewCount: number;
  professionalCount: number;
  unitCount: number;
}) {
  return (
    <Card className="relative overflow-hidden">
      <ClinicIllustration />
      <CardContent className="relative flex items-center gap-4 p-4 sm:gap-5">
        {logoUrl ? (
          // Logo inteira, sem recorte em círculo: marcas raramente são redondas.
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-3 sm:h-[6.5rem] sm:w-28">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={clinicName}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-border bg-white/80 text-primary sm:h-[6.5rem] sm:w-28">
            <Hospital className="size-12" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{professionalName}</h2>
          <p className="mt-1 text-sm text-secondary-foreground">
            {headline || clinicName}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="neutral">
              <MapPin
                className="mr-1.5 size-4 text-primary"
                aria-hidden="true"
              />
              Atendimento em {unitCount}{" "}
              {unitCount === 1 ? "unidade" : "unidades"}
            </Badge>
            <Badge variant="neutral">
              <Users
                className="mr-1.5 size-4 text-primary"
                aria-hidden="true"
              />
              {professionalCount}{" "}
              {professionalCount === 1 ? "profissional" : "profissionais"}
            </Badge>
          </div>
          {councilLine ? (
            <p className="mt-2 text-sm text-muted-foreground">{councilLine}</p>
          ) : null}
          {/* Só com avaliações de verdade: sem elas não há nota a mostrar. */}
          {reviewCount ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RatingStars rating={rating} />
              <span className="text-sm text-secondary-foreground">
                {rating.toFixed(1).replace(".", ",")} · {reviewCount}{" "}
                {reviewCount === 1 ? "opinião" : "opiniões"}
              </span>
            </div>
          ) : null}
          {summary ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-secondary-foreground">
              {summary}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ClinicIllustration() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 240 130"
      className="pointer-events-none absolute bottom-0 right-0 h-28 w-52 opacity-30 max-xl:hidden"
    >
      <path d="M12 117h221" stroke="#7db8dd" strokeWidth="2" />
      <path d="M68 117V36l56-15v96" fill="#b1cdf7" />
      <path d="m124 21 24 8v88h-24" fill="#78a7ec" />
      <path d="M131 117V61l45-12v68" fill="#d3e4fc" />
      <path d="m176 49 22 8v60h-22" fill="#8eb6ec" />
      <path d="M98 39v19m-9-9h18" stroke="#659feb" strokeWidth="6" />
      {[68, 87].map((y) => (
        <g key={y} fill="#6da7e8">
          <path
            d={`M80 ${y}h11v10H80zM105 ${y}h11v10h-11zM143 ${y}h10v9h-10zM162 ${y}h9v9h-9z`}
          />
        </g>
      ))}
      <path d="M94 117V99h14v18" fill="#72a7d5" />
      <g fill="#67b0bf">
        <ellipse cx="39" cy="101" rx="13" ry="15" />
        <circle cx="40" cy="84" r="9" />
        <ellipse cx="213" cy="102" rx="12" ry="13" />
        <circle cx="213" cy="90" r="8" />
      </g>
      <path
        d="M40 94v23m-8-15 8 6 7-8m166-3v20m-7-15 7 5 6-7"
        stroke="#468d9d"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M17 36a8 8 0 0 1 14-5 10 10 0 0 1 18 5h9v5H12v-5zm164-17a7 7 0 0 1 13-4 8 8 0 0 1 14 4h9v4h-42v-4z"
        fill="#dbeaff"
      />
    </svg>
  );
}

function ExperienceCard({ settings }: { settings: SettingsRow }) {
  // Número zero não é credencial: só aparece o que foi preenchido.
  const educationCount = settings.education_count ?? 0;
  const planCount = settings.accepted_plan_count ?? 0;
  const hasMetrics =
    educationCount > 0 ||
    planCount > 0 ||
    Boolean(settings.excellence_badge_year);
  const hasContent =
    hasMetrics ||
    Boolean(settings.experience_text) ||
    settings.treated_conditions.length > 0 ||
    settings.patient_groups.length > 0 ||
    settings.consultation_formats.length > 0 ||
    settings.profile_highlights.length > 0;
  if (!hasContent) return null;

  return (
    <Card>
      <CardContent className="grid gap-5 p-5">
        {hasMetrics ? (
          <div className="flex flex-wrap gap-8">
            {educationCount > 0 ? (
              <Metric label="Formação" value={educationCount} />
            ) : null}
            {planCount > 0 ? (
              <Metric label="Planos de saúde aceitos" value={planCount} />
            ) : null}
            {settings.excellence_badge_year ? (
              <div className="flex items-center gap-2">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <ShieldCheck className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold">
                    Certificado de excelência
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {settings.excellence_badge_year}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {settings.experience_text ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-secondary-foreground">
            {settings.experience_text}
          </p>
        ) : null}
        <TagBlock
          title="Principais doenças tratadas"
          items={settings.treated_conditions}
        />
        <IconList
          title="Pacientes que trato"
          icon={UserRound}
          items={settings.patient_groups}
        />
        <IconList
          title="Formatos de consulta"
          icon={Stethoscope}
          items={settings.consultation_formats}
        />
        <IconList
          title="Destaques"
          icon={Star}
          items={settings.profile_highlights}
        />
      </CardContent>
    </Card>
  );
}

function ServicesCard({ procedures }: { procedures: ProcedureRow[] }) {
  if (!procedures.length) return null;
  const visible = procedures.slice(0, 6);
  const hidden = procedures.slice(6);
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <Stethoscope
            className="mt-0.5 size-7 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-lg font-bold">Serviços e preços</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Escolha o serviço que deseja agendar.
            </p>
          </div>
        </div>
        <div className="mt-4 divide-y divide-border border-y border-border">
          {visible.map((procedure) => (
            <ServiceRow key={procedure.id} procedure={procedure} />
          ))}
        </div>
        {hidden.length ? (
          // Antes era um "+N serviços" que não abria nada.
          <details className="group mt-1">
            <summary className="flex cursor-pointer list-none items-center gap-2 pt-3 text-xs font-semibold text-primary hover:underline">
              <span className="group-open:hidden">
                Ver mais {hidden.length}{" "}
                {hidden.length === 1 ? "serviço" : "serviços"}
              </span>
              <span className="hidden group-open:inline">Ver menos</span>
              <CaretDown
                className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <div className="divide-y divide-border border-t border-border">
              {hidden.map((procedure) => (
                <ServiceRow key={procedure.id} procedure={procedure} />
              ))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ServiceRow({ procedure }: { procedure: ProcedureRow }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-primary-muted text-primary sm:flex">
        <Stethoscope className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{procedure.name}</p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {Number(procedure.base_price) > 0
            ? formatCurrency(Number(procedure.base_price))
            : "Preço a combinar"}
          {" · "}
          {procedure.duration_minutes} min
        </p>
      </div>
      <BookServiceButton procedureId={procedure.id} />
    </div>
  );
}

function AcceptedPlansCard({
  insurances,
  notes,
}: {
  insurances: InsuranceRow[];
  notes: string | null;
}) {
  const visible = insurances.slice(0, 8);
  const hidden = insurances.slice(8);
  return (
    <Card>
      <CardContent className="relative py-3.5 pl-[4.25rem] pr-4">
        <span className="absolute left-4 top-3.5 flex size-10 items-center justify-center rounded-xl bg-primary-muted text-primary">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-bold">Planos de saúde aceitos</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {notes ||
            "A cobertura varia por plano e serviço. Confirme com a clínica ao agendar."}
        </p>
        {insurances.length ? (
          <>
            <ul className="mt-2 flex flex-wrap gap-2 text-xs">
              {visible.map((insurance) => (
                <li
                  key={insurance.id}
                  className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 font-medium"
                >
                  <CircleCheck
                    weight="fill"
                    className="size-4 text-emerald-600"
                    aria-hidden="true"
                  />
                  {insurance.name}
                </li>
              ))}
            </ul>
            {hidden.length ? (
              <details className="group mt-2">
                <summary className="cursor-pointer list-none text-sm font-medium text-primary hover:underline">
                  <span className="group-open:hidden">
                    Ver mais {hidden.length}
                  </span>
                  <span className="hidden group-open:inline">Ver menos</span>
                </summary>
                <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                  {hidden.map((insurance) => (
                    <li
                      key={insurance.id}
                      className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 font-medium"
                    >
                      <CircleCheck
                        weight="fill"
                        className="size-4 text-emerald-600"
                        aria-hidden="true"
                      />
                      {insurance.name}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Nenhum plano informado publicamente.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentMethodsCard({ methods }: { methods: PaymentMethodRow[] }) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-muted text-primary">
            <CreditCard className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold">Modalidades de pagamento</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Pague de forma segura e prática.
            </p>
          </div>
        </div>
        {methods.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {methods.map((method) => (
              <Badge
                key={method.id}
                variant="primary"
                className="rounded-lg px-3 py-2"
              >
                <CreditCard className="mr-1 size-3.5" aria-hidden="true" />
                {method.name}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Formas de pagamento informadas durante a confirmação.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewsCard({
  reviews,
  rating,
}: {
  reviews: ReviewRow[];
  rating: number;
}) {
  const tags = [...new Set(reviews.flatMap((review) => review.tags))].slice(
    0,
    6,
  );
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="text-heading-sm font-semibold">Opiniões</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RatingStars rating={rating} />
          <span className="text-sm text-secondary-foreground">
            {reviews.length
              ? `${reviews.length} ${reviews.length === 1 ? "opinião" : "opiniões"}`
              : ""}
          </span>
        </div>
        {tags.length ? (
          <div className="mt-5">
            <p className="text-xs text-muted-foreground">
              Mais mencionado pelos pacientes
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="success">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-5 grid gap-4">
          {reviews.slice(0, 4).map((review) => (
            <article
              key={review.id}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                <div>
                  <p className="font-semibold">{review.patient_display_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(review.review_date)}
                    {review.source_label ? ` · ${review.source_label}` : ""}
                  </p>
                </div>
                <RatingStars rating={review.rating} />
              </div>
              {review.title ? (
                <p className="mt-3 text-sm font-semibold">{review.title}</p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-secondary-foreground">
                {review.body}
              </p>
              {review.professional_response ? (
                <div className="mt-4 rounded-md bg-muted p-3 text-sm">
                  <p className="font-semibold">Resposta</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {review.professional_response}
                  </p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-display font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-secondary-foreground">{label}</p>
    </div>
  );
}

function TagBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.slice(0, 12).map((item) => (
          <Badge key={item} variant="primary">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function IconList({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof Star;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2 grid gap-2 text-sm text-secondary-foreground">
        {items.map((item) => (
          <p key={item} className="flex items-start gap-2">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function RatingStars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5 text-primary">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={index < rounded ? "size-4 fill-current" : "size-4"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function formatAddress(clinic: ClinicRow | null | undefined) {
  if (!clinic) return "";
  return [
    [clinic.address_line, clinic.address_number].filter(Boolean).join(", "),
    [clinic.city, clinic.state].filter(Boolean).join(" - "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatClinicPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const national =
    digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  return national.length === 10 || national.length === 11
    ? formatPhoneBR(national)
    : value;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
