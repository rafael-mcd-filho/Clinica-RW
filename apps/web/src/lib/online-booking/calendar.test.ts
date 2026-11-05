import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl } from "./calendar";

const event = {
  uid: "abc@hiclinic",
  title: "Consulta clínica - Clínica Aurora",
  start: "2026-11-10T13:30:00.000Z",
  end: "2026-11-10T14:00:00.000Z",
  description: "Profissional: Dr. Rafael Nunes\nAcompanhe: https://app/x",
  location: "Unidade Paulista, Av. Paulista, 1500; São Paulo",
};

describe("buildIcs", () => {
  it("gera um evento válido com alarme e quebras CRLF", () => {
    const ics = buildIcs(event, new Date("2026-11-05T12:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261110T133000Z");
    expect(ics).toContain("DTEND:20261110T140000Z");
    expect(ics).toContain("DTSTAMP:20261105T120000Z");
    expect(ics).toContain(
      "LOCATION:Unidade Paulista\\, Av. Paulista\\, 1500\; São Paulo",
    );
    expect(ics).toContain("TRIGGER:-PT2H");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n /g, "")).toContain(
      "DESCRIPTION:Profissional: Dr. Rafael Nunes\\nAcompanhe: https://app/x",
    );
  });

  it("dobra linhas longas em até 75 octetos", () => {
    const ics = buildIcs({ ...event, description: "á".repeat(120) });
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});

describe("googleCalendarUrl", () => {
  it("monta o link do Google Agenda", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe(
      "20261110T133000Z/20261110T140000Z",
    );
    expect(url.searchParams.get("text")).toBe(event.title);
  });
});
