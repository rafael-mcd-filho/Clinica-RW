import { NextResponse } from "next/server";
import { googleCalendarUrl } from "@/lib/online-booking/calendar";
import { loadBookingCalendarEvent } from "@/lib/online-booking/calendar-event";

export const runtime = "nodejs";

/** Raio-X O4: abre o Google Agenda com a consulta preenchida. */
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
  return NextResponse.redirect(googleCalendarUrl(event), {
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
