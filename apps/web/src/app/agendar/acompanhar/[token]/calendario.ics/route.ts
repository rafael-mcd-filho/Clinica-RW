import { buildIcs } from "@/lib/online-booking/calendar";
import { loadBookingCalendarEvent } from "@/lib/online-booking/calendar-event";

export const runtime = "nodejs";

/** Raio-X O4: a consulta no calendário do celular (iPhone, Android, Outlook). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const event = await loadBookingCalendarEvent(
    token,
    process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin,
  );
  if (!event) {
    return new Response("Agendamento não encontrado.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(buildIcs(event), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="consulta.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
