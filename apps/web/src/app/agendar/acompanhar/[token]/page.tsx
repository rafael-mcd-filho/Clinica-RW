import { Suspense } from "react";
import { addDays } from "date-fns";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ShieldCheck } from "lucide-react";
import {
  CancelCard,
  ManageBookingPanel,
  RescheduleCard,
  type BookingDetails,
} from "./manage-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/loader";
import { buildOnlineBookingSlots } from "@/lib/online-booking/slots";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RequestRow = {
  id: string;
  organization_id: string;
  schedule_id: string;
  procedure_id: string;
  requested_start_at: string;
  requested_end_at: string;
  patient_name: string;
  status: "requested" | "confirmed" | "rejected" | "cancelled";
  public_access_token: string;
  procedures: { name: string; duration_minutes: number } | null;
  professionals: { name: string } | null;
  units: { name: string } | null;
};

type SettingsRow = {
  public_slug: string;
  enabled: boolean;
  min_notice_hours: number;
  max_days_ahead: number;
  cancellation_notice_hours: number;
};

type ScheduleOnlineSettingsRow = {
  enabled: boolean;
  min_notice_hours: number;
  max_days_ahead: number;
  cancellation_notice_hours: number;
};

type ClinicRow = {
  trade_name: string;
};

type OrganizationRow = {
  name: string;
};

type TimezoneRow = {
  timezone: string;
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

type PendingRange = {
  id: string;
  schedule_id: string;
  requested_start_at: string;
  requested_end_at: string;
};

export default async function ManageOnlineBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isUuid(token)) notFound();

  const supabase = createSupabaseAdminClient();
  const { data: request, error: requestError } = await supabase
    .from("online_booking_requests")
    .select(
      "id, organization_id, schedule_id, procedure_id, requested_start_at, requested_end_at, patient_name, status, public_access_token, procedures(name, duration_minutes), professionals(name), units(name)",
    )
    .eq("public_access_token", token)
    .maybeSingle<RequestRow>();

  if (requestError) {
    throw new Error("Unable to load the public booking request.");
  }
  if (!request) notFound();

  const organizationId = request.organization_id;
  const [
    settings,
    scheduleSettings,
    procedureMapping,
    clinic,
    organization,
    timezone,
  ] = await Promise.all([
    supabase
      .from("online_booking_settings")
      .select(
        "public_slug, enabled, min_notice_hours, max_days_ahead, cancellation_notice_hours",
      )
      .eq("organization_id", organizationId)
      .maybeSingle<SettingsRow>(),
    supabase
      .from("schedule_online_booking_settings")
      .select(
        "enabled, min_notice_hours, max_days_ahead, cancellation_notice_hours",
      )
      .eq("organization_id", organizationId)
      .eq("schedule_id", request.schedule_id)
      .maybeSingle<ScheduleOnlineSettingsRow>(),
    supabase
      .from("schedule_online_booking_procedures")
      .select("procedure_id")
      .eq("organization_id", organizationId)
      .eq("schedule_id", request.schedule_id)
      .eq("procedure_id", request.procedure_id)
      .maybeSingle<{ procedure_id: string }>(),
    supabase
      .from("clinics")
      .select("trade_name")
      .eq("organization_id", organizationId)
      .maybeSingle<ClinicRow>(),
    supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single<OrganizationRow>(),
    supabase
      .from("organization_settings")
      .select("timezone")
      .eq("organization_id", organizationId)
      .maybeSingle<TimezoneRow>(),
  ]);

  const settingsRow = settings.data;
  if (settings.error || scheduleSettings.error || procedureMapping.error) {
    throw new Error("Unable to load the online booking settings.");
  }
  if (!settingsRow) notFound();

  const scheduleRules = scheduleSettings.data;

  const timezoneName = timezone.data?.timezone ?? "America/Fortaleza";
  const clinicName =
    clinic.data?.trade_name ?? organization.data?.name ?? "Clinica";
  const booking: BookingDetails = {
    token,
    status: request.status,
    patientName: request.patient_name,
    requestedStartAt: request.requested_start_at,
    requestedEndAt: request.requested_end_at,
    clinicName,
    professionalName: request.professionals?.name ?? "Profissional",
    procedureName: request.procedures?.name ?? "Procedimento",
    unitName: request.units?.name ?? "Unidade",
    timezone: timezoneName,
    cancellationNoticeHours:
      scheduleRules?.cancellation_notice_hours ??
      settingsRow.cancellation_notice_hours,
  };
  const cancellationDeadline =
    new Date(request.requested_start_at).getTime() -
    booking.cancellationNoticeHours * 3_600_000;
  const serverTimestamp = await getServerTimestamp();
  const canCancel =
    (request.status === "requested" || request.status === "confirmed") &&
    serverTimestamp < cancellationDeadline;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-6 md:px-6">
        <ManageBookingPanel booking={booking} />

        {request.status === "requested" &&
        settingsRow.enabled &&
        scheduleRules?.enabled &&
        procedureMapping.data ? (
          <Suspense fallback={<RescheduleLoadingCard />}>
            <RescheduleSection
              request={request}
              timezone={timezoneName}
              scheduleRules={scheduleRules}
            />
          </Suspense>
        ) : null}

        {canCancel ? <CancelCard token={token} /> : null}

        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <ShieldCheck
              className="mt-0.5 size-5 text-primary"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              Este link permite consultar e alterar apenas esta solicitacao de
              agendamento. Nao compartilhe o link com terceiros.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

async function RescheduleSection({
  request,
  timezone,
  scheduleRules,
}: {
  request: RequestRow;
  timezone: string;
  scheduleRules: ScheduleOnlineSettingsRow;
}) {
  let slots: Awaited<ReturnType<typeof loadRescheduleSlots>> = [];
  let loadError = false;

  try {
    slots = await loadRescheduleSlots({
      supabase: createSupabaseAdminClient(),
      request,
      timezone,
      scheduleRules,
    });
  } catch (error) {
    console.error("Unable to load public booking reschedule slots", error);
    loadError = true;
  }

  if (loadError) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Os dados da solicitação foram carregados, mas não foi possível buscar
          novos horários agora. Tente atualizar a página em alguns instantes.
        </CardContent>
      </Card>
    );
  }

  if (slots.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Não há outros horários disponíveis para remarcação no momento.
        </CardContent>
      </Card>
    );
  }

  return <RescheduleCard token={request.public_access_token} slots={slots} />;
}

function RescheduleLoadingCard() {
  return (
    <Card aria-busy="true" aria-label="Carregando horários para remarcação">
      <CardContent className="grid gap-3 p-4">
        <Skeleton className="h-5 w-56" />
        <div className="grid gap-3 md:grid-cols-[1fr_8rem]">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

async function loadRescheduleSlots({
  supabase,
  request,
  timezone,
  scheduleRules,
}: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  request: RequestRow;
  timezone: string;
  scheduleRules: ScheduleOnlineSettingsRow;
}) {
  if (!request.procedures) return [];

  const from = new Date();
  const until = addDays(from, scheduleRules.max_days_ahead);

  const [availability, appointments, blocks, pendingRequests] =
    await Promise.all([
      supabase
        .from("schedule_availability")
        .select("schedule_id, weekday, start_time, end_time, slot_minutes")
        .eq("organization_id", request.organization_id)
        .eq("schedule_id", request.schedule_id)
        .returns<AvailabilityRow[]>(),
      supabase
        .from("appointments")
        .select("schedule_id, start_at, end_at")
        .eq("organization_id", request.organization_id)
        .eq("schedule_id", request.schedule_id)
        .in("status", ["scheduled", "confirmed", "waiting", "in_progress"])
        .lt("start_at", until.toISOString())
        .gt("end_at", from.toISOString())
        .returns<BusyRange[]>(),
      supabase
        .from("schedule_blocks")
        .select("schedule_id, start_at, end_at")
        .eq("organization_id", request.organization_id)
        .eq("schedule_id", request.schedule_id)
        .lt("start_at", until.toISOString())
        .gt("end_at", from.toISOString())
        .returns<BusyRange[]>(),
      supabase
        .from("online_booking_requests")
        .select("id, schedule_id, requested_start_at, requested_end_at")
        .eq("organization_id", request.organization_id)
        .eq("schedule_id", request.schedule_id)
        .eq("status", "requested")
        .neq("id", request.id)
        .lt("requested_start_at", until.toISOString())
        .gt("requested_end_at", from.toISOString())
        .returns<PendingRange[]>(),
    ]);

  const queryError = [
    availability.error,
    appointments.error,
    blocks.error,
    pendingRequests.error,
  ].find(Boolean);
  if (queryError) {
    throw new Error("Unable to load availability for public rescheduling.");
  }

  return buildOnlineBookingSlots({
    schedules: [
      {
        id: request.schedule_id,
        enabled: scheduleRules.enabled,
        minNoticeHours: scheduleRules.min_notice_hours,
        maxDaysAhead: scheduleRules.max_days_ahead,
        procedureIds: [request.procedure_id],
      },
    ],
    procedures: [
      {
        id: request.procedure_id,
        duration_minutes: request.procedures.duration_minutes,
      },
    ],
    availability: availability.data ?? [],
    busyRanges: [
      ...(appointments.data ?? []),
      ...(blocks.data ?? []),
      ...(pendingRequests.data ?? []).map((item) => ({
        schedule_id: item.schedule_id,
        start_at: item.requested_start_at,
        end_at: item.requested_end_at,
      })),
    ],
    timezone,
    from,
    until,
    maxDaysAhead: scheduleRules.max_days_ahead,
    limit: 80,
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function getServerTimestamp() {
  await connection();
  return Date.now();
}
