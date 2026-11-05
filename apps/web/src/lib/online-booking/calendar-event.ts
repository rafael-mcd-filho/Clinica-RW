import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CalendarEvent } from "./calendar";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BookingRow = {
  id: string;
  organization_id: string;
  requested_start_at: string;
  requested_end_at: string;
  status: string;
  procedures: { name: string } | null;
  professionals: { name: string } | null;
  units: {
    name: string;
    address_line: string | null;
    address_number: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
  } | null;
};

/**
 * O evento de calendário de uma solicitação online, pelo token de
 * acompanhamento (o mesmo do link que o paciente recebe). Só para
 * solicitações em aberto ou confirmadas.
 */
export async function loadBookingCalendarEvent(
  token: string,
  appUrl: string,
): Promise<CalendarEvent | null> {
  if (!uuidPattern.test(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data: request } = await admin
    .from("online_booking_requests")
    .select(
      "id, organization_id, requested_start_at, requested_end_at, status, procedures(name), professionals(name), units(name, address_line, address_number, district, city, state)",
    )
    .eq("public_access_token", token)
    .maybeSingle<BookingRow>();
  if (!request || !["requested", "confirmed"].includes(request.status)) {
    return null;
  }
  const [{ data: clinic }, { data: organization }] = await Promise.all([
    admin
      .from("clinics")
      .select("trade_name")
      .eq("organization_id", request.organization_id)
      .maybeSingle<{ trade_name: string | null }>(),
    admin
      .from("organizations")
      .select("name")
      .eq("id", request.organization_id)
      .maybeSingle<{ name: string }>(),
  ]);
  const clinicName = clinic?.trade_name || organization?.name || "Clínica";
  const unit = request.units;
  const address = [
    [unit?.address_line, unit?.address_number].filter(Boolean).join(", "),
    unit?.district,
    [unit?.city, unit?.state].filter(Boolean).join(" - "),
  ]
    .filter(Boolean)
    .join(", ");
  const trackingUrl = `${appUrl.replace(/\/+$/, "")}/agendar/acompanhar/${token}`;

  return {
    uid: `${request.id}@hiclinic`,
    title: `${request.procedures?.name ?? "Consulta"} - ${clinicName}`,
    start: request.requested_start_at,
    end: request.requested_end_at,
    description: [
      request.professionals?.name
        ? `Profissional: ${request.professionals.name}`
        : null,
      request.status === "requested"
        ? "Aguardando a confirmação da clínica."
        : "Horário confirmado pela clínica.",
      `Acompanhe, remarque ou cancele: ${trackingUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
    location: [unit?.name, address].filter(Boolean).join(" - ") || undefined,
    url: trackingUrl,
  };
}
