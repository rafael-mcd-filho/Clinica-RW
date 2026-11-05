import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSentryEnvelope,
  parseSentryDsn,
  reportError,
  resetAlertThrottle,
} from "./alerts";

describe("parseSentryDsn", () => {
  it("monta o endpoint de envelope", () => {
    expect(parseSentryDsn("https://abc123@o42.ingest.sentry.io/987")).toEqual({
      endpoint: "https://o42.ingest.sentry.io/api/987/envelope/",
      publicKey: "abc123",
      dsn: "https://abc123@o42.ingest.sentry.io/987",
    });
    expect(parseSentryDsn("")).toBeNull();
    expect(parseSentryDsn("nao-e-url")).toBeNull();
  });

  it("o envelope não leva dado pessoal", () => {
    const dsn = parseSentryDsn("https://abc@o1.ingest.sentry.io/1")!;
    const envelope = buildSentryEnvelope(
      dsn,
      "jobs.dispatch_failures",
      { failed: 2 },
      new Error("Falha ao enviar para maria@email.com"),
    );
    const [header, item, body] = envelope
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(header.dsn).toBe("https://abc@o1.ingest.sentry.io/1");
    expect(item.type).toBe("event");
    expect(body.tags.event).toBe("jobs.dispatch_failures");
    expect(body.exception.values[0].value).toBe(
      "Falha ao enviar para [e-mail]",
    );
    expect(JSON.stringify(body)).not.toContain("maria@email.com");
  });
});

describe("reportError", () => {
  const fetchMock = vi.fn<
    (url: string, init?: RequestInit) => Promise<Response>
  >(async () => new Response("ok"));

  beforeEach(() => {
    resetAlertThrottle();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sem destino configurado não envia nada", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("ALERT_WEBHOOK_URL", "");
    await reportError("teste", {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("avisa o canal uma vez a cada 5 minutos por evento", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.exemplo.com/abc");
    await reportError("whatsapp.webhook_failed", { patient_name: "Maria" });
    await reportError("whatsapp.webhook_failed", {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.text).toContain("whatsapp.webhook_failed");
    expect(body.text).not.toContain("Maria");
  });
});
