import { addDays } from "date-fns";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ManageBookingPanel } from "./manage-panel";
import { Card, CardContent } from "@/components/ui/card";
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
  const { data: request } = await supabase
    .from("online_booking_requests")
    .select(
      "id, organization_id, schedule_id, procedure_id, requested_start_at, requested_end_at, patient_name, status, public_access_token, procedures(name, duration_minutes), professionals(name), units(name)",
    )
    .eq("public_access_token", token)
    .maybeSingle<RequestRow>();

  if (!request) notFound();

  const organizationId = request.organization_id;
  const [settings, clinic, organization, timezone] = await Promise.all([
    supabase
      .from("online_booking_settings")
      .select(
        "public_slug, enabled, min_notice_hours, max_days_ahead, cancellation_notice_hours",
      )
      .eq("organization_id", organizationId)
      .maybeSingle<SettingsRow>(),
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
  if (!settingsRow) notFound();

  const timezoneName = timezone.data?.timezone ?? "America/Fortaleza";
  const clinicName =
    clinic.data?.trade_name ?? organization.data?.name ?? "Clinica";
  const slots =
    request.status === "requested" && settingsRow.enabled
      ? await loadRescheduleSlots({
          supabase,
          request,
          timezone: timezoneName,
          minNoticeHours: settingsRow.min_notice_hours,
          maxDaysAhead: settingsRow.max_days_ahead,
        })
      : [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-6 md:px-6">
        <ManageBookingPanel
          booking={{
            token,
            status: request.status,
            patientName: request.patient_name,
            requestedStartAt: request.requested_start_at,
            requestedEndAt: request.requested_end_at,
            clinicName,
            professionalName: request.professionals?.name ?? "Profissional",
            procedureName: request.procedures?.name ?? "Procedimento",
            unitName: request.units?.name ?? "Unidade",
            cancellationNoticeHours: settingsRow.cancellation_notice_hours,
          }}
          slots={slots}
        />

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

async function loadRescheduleSlots({
  supabase,
  request,
  timezone,
  minNoticeHours,
  maxDaysAhead,
}: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  request: RequestRow;
  timezone: string;
  minNoticeHours: number;
  maxDaysAhead: number;
}) {
  if (!request.procedures) return [];

  const from = new Date(Date.now() + minNoticeHours * 3_600_000);
  const until = addDays(new Date(), maxDaysAhead);

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
        .gte("start_at", from.toISOString())
        .lte("start_at", until.toISOString())
        .returns<BusyRange[]>(),
      supabase
        .from("schedule_blocks")
        .select("schedule_id, start_at, end_at")
        .eq("organization_id", request.organization_id)
        .eq("schedule_id", request.schedule_id)
        .lte("start_at", until.toISOString())
        .gte("end_at", from.toISOString())
        .returns<BusyRange[]>(),
      supabase
        .from("online_booking_requests")
        .select("id, schedule_id, requested_start_at, requested_end_at")
        .eq("organization_id", request.organization_id)
        .eq("schedule_id", request.schedule_id)
        .eq("status", "requested")
        .neq("id", request.id)
        .gte("requested_start_at", from.toISOString())
        .lte("requested_start_at", until.toISOString())
        .returns<PendingRange[]>(),
    ]);

  return buildOnlineBookingSlots({
    schedules: [{ id: request.schedule_id }],
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
    maxDaysAhead,
    limit: 80,
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
