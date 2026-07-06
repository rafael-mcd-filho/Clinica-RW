import { addDays } from "date-fns";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  CircleCheck,
  Clock3,
  CreditCard,
  MapPin,
  ShieldCheck,
  Stethoscope,
  Star,
  UserRound,
} from "lucide-react";
import {
  BookingForm,
  type PublicInsurance,
  type PublicProcedure,
  type PublicSchedule,
} from "./booking-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buildOnlineBookingSlots } from "@/lib/online-booking/slots";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
type TimezoneRow = { timezone: string };
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
type AvailabilityRow = {
  schedule_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
};
type BusyRange = {
  schedule_id: string;
  start_at: string;
  end_at: string;
};
type PendingRequestRange = {
  schedule_id: string;
  requested_start_at: string;
  requested_end_at: string;
};

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
  const now = new Date();
  const from = new Date(now.getTime() + settings.min_notice_hours * 3_600_000);
  const until = addDays(now, settings.max_days_ahead);

  const [
    organization,
    clinic,
    timezone,
    schedules,
    procedures,
    insurances,
    paymentMethods,
    reviews,
    availability,
    appointments,
    blocks,
    pendingRequests,
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
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle<TimezoneRow>(),
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
    supabase
      .from("schedule_availability")
      .select("schedule_id, weekday, start_time, end_time, slot_minutes")
      .eq("organization_id", organizationId)
      .order("weekday")
      .order("start_time")
      .returns<AvailabilityRow[]>(),
    supabase
      .from("appointments")
      .select("schedule_id, start_at, end_at")
      .eq("organization_id", organizationId)
      .in("status", ["scheduled", "confirmed", "waiting", "in_progress"])
      .gte("start_at", from.toISOString())
      .lte("start_at", until.toISOString())
      .returns<BusyRange[]>(),
    supabase
      .from("schedule_blocks")
      .select("schedule_id, start_at, end_at")
      .eq("organization_id", organizationId)
      .lte("start_at", until.toISOString())
      .gte("end_at", from.toISOString())
      .returns<BusyRange[]>(),
    supabase
      .from("online_booking_requests")
      .select("schedule_id, requested_start_at, requested_end_at")
      .eq("organization_id", organizationId)
      .eq("status", "requested")
      .gte("requested_start_at", from.toISOString())
      .lte("requested_start_at", until.toISOString())
      .returns<PendingRequestRange[]>(),
  ]);

  const clinicName =
    clinic.data?.trade_name ?? organization.data?.name ?? "Clínica";
  const timezoneName = timezone.data?.timezone ?? "America/Fortaleza";
  const publicSchedules: PublicSchedule[] = (schedules.data ?? []).map(
    (schedule) => ({
      id: schedule.id,
      name: schedule.name,
      professionalName: schedule.professionals?.name ?? "Profissional",
      unitName: schedule.units?.name ?? "Unidade",
    }),
  );
  const publicProcedures: PublicProcedure[] = (procedures.data ?? []).map(
    (procedure) => ({
      id: procedure.id,
      name: procedure.name,
      durationMinutes: procedure.duration_minutes,
      basePrice: Number(procedure.base_price ?? 0),
    }),
  );
  const publicInsurances: PublicInsurance[] = (insurances.data ?? []).map(
    (insurance) => ({
      id: insurance.id,
      name: insurance.name,
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
  const acceptedPaymentMethods = (paymentMethods.data ?? []).filter(
    (method) =>
      !acceptedPaymentMethodIds.size || acceptedPaymentMethodIds.has(method.id),
  );
  const reviewRows = reviews.data ?? [];
  const averageRating = reviewRows.length
    ? reviewRows.reduce((sum, review) => sum + Number(review.rating), 0) /
      reviewRows.length
    : 0;
  const representativeSchedule = (schedules.data ?? [])[0] ?? null;
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
  const slots = buildOnlineBookingSlots({
    schedules: schedules.data ?? [],
    procedures: procedures.data ?? [],
    availability: availability.data ?? [],
    busyRanges: [
      ...(appointments.data ?? []),
      ...(blocks.data ?? []),
      ...(pendingRequests.data ?? []).map((request) => ({
        schedule_id: request.schedule_id,
        start_at: request.requested_start_at,
        end_at: request.requested_end_at,
      })),
    ],
    timezone: timezoneName,
    from,
    maxDaysAhead: settings.max_days_ahead,
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-primary-muted/50 via-background to-background text-foreground">
      <header className="bg-gradient-to-r from-primary to-primary-hover text-primary-foreground">
        <div className="mx-auto flex min-h-24 w-full max-w-6xl flex-col justify-center gap-1 px-4 py-6 md:px-6">
          <p className="text-sm font-medium text-primary-foreground/80">
            Agendamento online
          </p>
          <h1 className="text-2xl font-bold">{clinicName}</h1>
          <p className="text-sm text-primary-foreground/80">
            Escolha o profissional, o procedimento e o melhor horário.
          </p>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 md:px-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-5">
          <ProfileHero
            clinicName={clinicName}
            professionalName={professionalName}
            headline={settings.profile_headline}
            summary={settings.profile_summary}
            councilLine={councilLine}
            logoUrl={organization.data?.logo_url}
            rating={averageRating}
            reviewCount={reviewRows.length}
            address={formatAddress(clinic.data)}
          />
          <ExperienceCard settings={settings} />
          <ServicesCard procedures={procedures.data ?? []} />
          <AcceptedPlansCard
            insurances={acceptedInsurances}
            notes={settings.accepted_plan_notes}
          />
          <PaymentMethodsCard methods={acceptedPaymentMethods} />
          <ReviewsCard reviews={reviewRows} rating={averageRating} />
        </div>

        <aside
          id="agendamento"
          className="grid content-start gap-4 lg:sticky lg:top-4"
        >
          <BookingForm
            slug={settings.public_slug}
            schedules={publicSchedules}
            procedures={publicProcedures}
            insurances={publicInsurances}
            slots={slots}
            minNoticeHours={settings.min_notice_hours}
            maxDaysAhead={settings.max_days_ahead}
            requireContactVerification={settings.require_contact_verification}
            verificationTtlMinutes={settings.contact_verification_ttl_minutes}
          />
          <Card>
            <CardContent className="grid gap-4 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-muted text-primary">
                  <Stethoscope className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium">{clinicName}</p>
                  <p className="text-sm text-muted-foreground">
                    {clinic.data?.phone ??
                      clinic.data?.email ??
                      "Contato pela clínica"}
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
                    {[
                      [clinic.data.address_line, clinic.data.address_number]
                        .filter(Boolean)
                        .join(", "),
                      [clinic.data.city, clinic.data.state]
                        .filter(Boolean)
                        .join(" - "),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-3 p-4">
              <div className="flex items-center gap-2">
                <CalendarDays
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">Política de agenda</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="neutral">
                  <CircleCheck className="mr-1 size-3.5" aria-hidden="true" />
                  Confirmação pela clínica
                </Badge>
                <Badge variant="neutral">
                  <Clock3 className="mr-1 size-3.5" aria-hidden="true" />
                  Cancelamento com {settings.cancellation_notice_hours}h
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
            <CardContent className="grid gap-3 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="mt-0.5 size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold">Seus dados protegidos</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Este portal recebe apenas dados administrativos de
                    agendamento. Documentos e informações clínicas ficam
                    protegidos no sistema da clínica.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="primary">Conforme a LGPD</Badge>
                <Badge variant="primary">Conexão segura</Badge>
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
  address,
}: {
  clinicName: string;
  professionalName: string;
  headline: string | null;
  summary: string | null;
  councilLine: string;
  logoUrl: string | null | undefined;
  rating: number;
  reviewCount: number;
  address: string;
}) {
  return (
    <Card>
      <CardContent className="grid gap-4 p-5 md:grid-cols-[7rem_minmax(0,1fr)]">
        <div className="flex size-28 items-center justify-center overflow-hidden rounded-full bg-primary-muted text-primary">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={clinicName}
              className="h-full w-full object-cover"
            />
          ) : (
            <UserRound className="size-12" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">{professionalName}</h2>
          <p className="mt-1 text-sm text-secondary-foreground">
            {headline || clinicName}
          </p>
          {councilLine ? (
            <p className="mt-2 text-sm text-muted-foreground">{councilLine}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <RatingStars rating={rating || 5} />
            <span className="text-sm text-secondary-foreground">
              {reviewCount
                ? `${reviewCount} opinioes`
                : "Avaliacoes verificadas"}
            </span>
          </div>
          {summary ? (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-secondary-foreground">
              {summary}
            </p>
          ) : null}
          {address ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" />
              {address}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ExperienceCard({ settings }: { settings: SettingsRow }) {
  return (
    <Card>
      <CardContent className="grid gap-5 p-5">
        <div className="flex flex-wrap gap-8">
          <Metric label="Formacao" value={settings.education_count ?? 0} />
          <Metric
            label="Planos de saude aceitos"
            value={settings.accepted_plan_count ?? 0}
          />
          {settings.excellence_badge_year ? (
            <div className="flex items-center gap-2">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">
                  Certificado de excelencia
                </p>
                <p className="text-sm text-muted-foreground">
                  {settings.excellence_badge_year}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        {settings.experience_text ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-secondary-foreground">
            {settings.experience_text}
          </p>
        ) : null}
        <TagBlock
          title="Principais doencas tratadas"
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
  const visible = procedures.slice(0, 6);
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="text-lg font-semibold">Servicos e precos</h2>
        <div className="mt-4 divide-y divide-border">
          {visible.map((procedure) => (
            <div
              key={procedure.id}
              className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
            >
              <div>
                <p className="font-semibold">{procedure.name}</p>
                <p className="mt-1 text-sm text-secondary-foreground">
                  {Number(procedure.base_price) > 0
                    ? formatCurrency(Number(procedure.base_price))
                    : "Preco a combinar"}
                  {" - "}
                  {procedure.duration_minutes} min
                </p>
              </div>
              <a
                href="#agendamento"
                className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                Agendar consulta
              </a>
            </div>
          ))}
        </div>
        {procedures.length > visible.length ? (
          <p className="mt-3 text-sm text-primary">
            + {procedures.length - visible.length} servicos
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AcceptedPlansCard({
  insurances,
  notes,
}: {
  insurances: InsuranceRow[];
  notes: string | null;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="text-lg font-semibold">Planos de saude aceitos</h2>
        <p className="mt-3 text-sm leading-6 text-secondary-foreground">
          {notes ||
            "Os planos de saude sao aceitos, mas a cobertura varia por local e servico. Confirme durante o agendamento."}
        </p>
        {insurances.length ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
            {insurances.slice(0, 8).map((insurance) => (
              <li key={insurance.id}>{insurance.name}</li>
            ))}
          </ul>
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
      <CardContent className="p-5">
        <h2 className="text-lg font-semibold">Modalidades de pagamento</h2>
        {methods.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {methods.map((method) => (
              <Badge key={method.id} variant="primary">
                <CreditCard className="mr-1 size-3.5" aria-hidden="true" />
                {method.name}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Formas de pagamento informadas durante a confirmacao.
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
        <h2 className="text-lg font-semibold">Opinioes</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RatingStars rating={rating || 5} />
          <span className="text-sm text-secondary-foreground">
            {reviews.length ? `${reviews.length} opinioes` : "Sem opinioes"}
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
                    {review.source_label ? ` - ${review.source_label}` : ""}
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
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
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
    .join(" - ");
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
