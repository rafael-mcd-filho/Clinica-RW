import { describe, expect, it } from "vitest";
import { parseFunnelBoardAggregate } from "./aggregates";

describe("parseFunnelBoardAggregate", () => {
  it("accepts last movements and stage metrics", () => {
    const input = {
      last_movements: [
        {
          card_id: "b74a0538-7b19-4caa-a309-80ae5a833dd1",
          moved_at: "2026-07-13T12:00:00.000Z",
        },
      ],
      stage_metrics: [
        {
          stage_id: "d7542937-50ee-4f15-bf07-66d1f668ff5b",
          entered_count: 4,
          conversion_rate: 75,
          average_duration_hours: 18.5,
        },
      ],
    };

    expect(parseFunnelBoardAggregate(input)).toEqual(input);
  });

  it("returns null for an unsafe response", () => {
    expect(
      parseFunnelBoardAggregate({ last_movements: [], stage_metrics: [{}] }),
    ).toBeNull();
  });
});
