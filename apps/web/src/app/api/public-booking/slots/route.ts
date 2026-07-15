import { addDays } from "date-fns";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { buildOnlineBookingSlots } from "@/lib/online-booking/slots";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  slug: z.string().trim().toLowerCase().min(3).max(120),
  schedule_id: z.string().uuid(),
  procedure_id: z.string().uuid(),
});

type PortalRow = { organization_id: string };
type ScheduleRow = { id: string };
type ProcedureRow = { id: string; duration_minutes: number };
type ScheduleOnlineSettingsRow = {
  enabled: boolean;
  min_notice_hours: number;
  max_days_ahead: number;
};
type TimezoneRow = { timezone: string };
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
  schedule_id: string;
  requested_start_at: string;
  requested_end_at: string;
};

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    slug: request.nextUrl.searchParams.get("slug"),
    schedule_id: request.nextUrl.searchParams.get("schedule_id"),
    procedure_id: request.nextUrl.searchParams.get("procedure_id"),
  });

  if (!parsed.success) {
    return noStoreJson({ error: "Parâmetros inválidos." }, 400);
  }

  const supabase = createSupabaseAdminClient();
  const { data: portal, error: portalError } = await supabase
    .from("online_booking_settings")
    .select("organization_id")
    .eq("public_slug", parsed.data.slug)
    .eq("enabled", true)
    .maybeSingle<PortalRow>();

  if (portalError) return loadError();
  if (!portal) return unavailable();

  const organizationId = portal.organization_id;
  const [schedule, procedure, scheduleSettings, procedureMapping, timezone] =
    await Promise.all([
      supabase
        .from("schedules")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("id", parsed.data.schedule_id)
        .eq("active", true)
        .maybeSingle<ScheduleRow>(),
      supabase
        .from("procedures")
        .select("id, duration_minutes")
        .eq("organization_id", organizationId)
        .eq("id", parsed.data.procedure_id)
        .eq("active", true)
        .maybeSingle<ProcedureRow>(),
      supabase
        .from("schedule_online_booking_settings")
        .select("enabled, min_notice_hours, max_days_ahead")
        .eq("organization_id", organizationId)
        .eq("schedule_id", parsed.data.schedule_id)
        .eq("enabled", true)
        .maybeSingle<ScheduleOnlineSettingsRow>(),
      supabase
        .from("schedule_online_booking_procedures")
        .select("procedure_id")
        .eq("organization_id", organizationId)
        .eq("schedule_id", parsed.data.schedule_id)
        .eq("procedure_id", parsed.data.procedure_id)
        .maybeSingle<{ procedure_id: string }>(),
      supabase
        .from("organization_settings")
        .select("timezone")
        .eq("organization_id", organizationId)
        .maybeSingle<TimezoneRow>(),
    ]);

  if (
    schedule.error ||
    procedure.error ||
    scheduleSettings.error ||
    procedureMapping.error ||
    timezone.error
  ) {
    return loadError();
  }
  if (
    !schedule.data ||
    !procedure.data ||
    !scheduleSettings.data ||
    !procedureMapping.data
  ) {
    return unavailable();
  }

  const now = new Date();
  const until = addDays(now, scheduleSettings.data.max_days_ahead);
  const [availability, appointments, blocks, pendingRequests] =
    await Promise.all([
      supabase
        .from("schedule_availability")
        .select("schedule_id, weekday, start_time, end_time, slot_minutes")
        .eq("organization_id", organizationId)
        .eq("schedule_id", schedule.data.id)
        .returns<AvailabilityRow[]>(),
      supabase
        .from("appointments")
        .select("schedule_id, start_at, end_at")
        .eq("organization_id", organizationId)
        .eq("schedule_id", schedule.data.id)
        .in("status", ["scheduled", "confirmed", "waiting", "in_progress"])
        .lt("start_at", until.toISOString())
        .gt("end_at", now.toISOString())
        .returns<BusyRange[]>(),
      supabase
        .from("schedule_blocks")
        .select("schedule_id, start_at, end_at")
        .eq("organization_id", organizationId)
        .eq("schedule_id", schedule.data.id)
        .lt("start_at", until.toISOString())
        .gt("end_at", now.toISOString())
        .returns<BusyRange[]>(),
      supabase
        .from("online_booking_requests")
        .select("schedule_id, requested_start_at, requested_end_at")
        .eq("organization_id", organizationId)
        .eq("schedule_id", schedule.data.id)
        .eq("status", "requested")
        .lt("requested_start_at", until.toISOString())
        .gt("requested_end_at", now.toISOString())
        .returns<PendingRange[]>(),
    ]);

  if (
    availability.error ||
    appointments.error ||
    blocks.error ||
    pendingRequests.error
  ) {
    return loadError();
  }

  const slots = buildOnlineBookingSlots({
    schedules: [
      {
        id: schedule.data.id,
        enabled: scheduleSettings.data.enabled,
        minNoticeHours: scheduleSettings.data.min_notice_hours,
        maxDaysAhead: scheduleSettings.data.max_days_ahead,
        procedureIds: [procedure.data.id],
      },
    ],
    procedures: [procedure.data],
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
    timezone: timezone.data?.timezone ?? "America/Fortaleza",
    from: now,
    until,
    maxDaysAhead: scheduleSettings.data.max_days_ahead,
    limit: 240,
  });

  return noStoreJson({ slots });
}

function unavailable() {
  return noStoreJson({ error: "Agenda ou serviço indisponível." }, 404);
}

function loadError() {
  return noStoreJson(
    { error: "Não foi possível consultar os horários agora." },
    500,
  );
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
