/**
 * Raio-X O4: "Adicionar ao calendário" depois do agendamento online. O
 * paciente salva a consulta no Google Agenda ou no calendário do celular
 * (arquivo .ics, que iPhone, Android e Outlook abrem).
 */

export type CalendarEvent = {
  uid: string;
  title: string;
  /** ISO em UTC. */
  start: string;
  end: string;
  description?: string;
  location?: string;
  url?: string;
};

function compactUtc(iso: string) {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Linhas de até 75 octetos, continuação começando com espaço (RFC 5545). */
function fold(line: string) {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length ? 74 : 75;
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(event: CalendarEvent, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hi Clinic//Agendamento online//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${compactUtc(now.toISOString())}`,
    `DTSTART:${compactUtc(event.start)}`,
    `DTEND:${compactUtc(event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : null,
    event.location ? `LOCATION:${escapeIcs(event.location)}` : null,
    event.url ? `URL:${event.url}` : null,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs(event.title)}`,
    "TRIGGER:-PT2H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => Boolean(line));
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function googleCalendarUrl(event: CalendarEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compactUtc(event.start)}/${compactUtc(event.end)}`,
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
