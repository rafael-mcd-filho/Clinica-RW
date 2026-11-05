import { describe, expect, it } from "vitest";
import { buildReminderMap, describeReminder } from "./reminder-status";

describe("buildReminderMap", () => {
  it("usa a melhor situação de cada agendamento", () => {
    const map = buildReminderMap([
      {
        aggregate_id: "a1",
        occurred_at: "2026-11-04T12:00:00Z",
        notification_outbox: [
          {
            status: "failed",
            sent_at: null,
            created_at: "2026-11-04T12:00:01Z",
          },
        ],
      },
      {
        aggregate_id: "a1",
        occurred_at: "2026-11-04T13:00:00Z",
        notification_outbox: [
          {
            status: "sent",
            sent_at: "2026-11-04T13:00:05Z",
            created_at: "2026-11-04T13:00:01Z",
          },
        ],
      },
      {
        aggregate_id: "a2",
        occurred_at: "2026-11-04T12:00:00Z",
        notification_outbox: null,
      },
      {
        aggregate_id: "a3",
        occurred_at: "2026-11-04T12:00:00Z",
        notification_outbox: { status: "skipped", sent_at: null },
      },
      { aggregate_id: null, occurred_at: "x", notification_outbox: [] },
    ]);
    expect(map.a1).toEqual({ status: "sent", at: "2026-11-04T13:00:05Z" });
    expect(map.a2).toEqual({ status: "queued", at: "2026-11-04T12:00:00Z" });
    expect(map.a3.status).toBe("failed");
    expect(Object.keys(map)).toHaveLength(3);
  });

  it("aceita lista vazia ou nula", () => {
    expect(buildReminderMap(null)).toEqual({});
    expect(buildReminderMap([])).toEqual({});
  });
});

describe("describeReminder", () => {
  it("mostra data e hora no fuso da clínica", () => {
    expect(
      describeReminder(
        { status: "sent", at: "2026-11-04T13:00:00Z" },
        "America/Sao_Paulo",
      ),
    ).toBe("Lembrete enviado em 04/11 às 10:00");
  });
});
