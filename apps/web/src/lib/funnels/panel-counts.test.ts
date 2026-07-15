import { describe, expect, it } from "vitest";
import { parseFunnelPanelCardCounts } from "./panel-counts";

describe("parseFunnelPanelCardCounts", () => {
  it("accepts numeric and serialized bigint counts", () => {
    expect(
      parseFunnelPanelCardCounts([
        {
          funnel_id: "b74a0538-7b19-4caa-a309-80ae5a833dd1",
          active_card_count: "12",
        },
        {
          funnel_id: "d7542937-50ee-4f15-bf07-66d1f668ff5b",
          active_card_count: 0,
        },
      ]),
    ).toEqual([
      {
        funnel_id: "b74a0538-7b19-4caa-a309-80ae5a833dd1",
        active_card_count: 12,
      },
      {
        funnel_id: "d7542937-50ee-4f15-bf07-66d1f668ff5b",
        active_card_count: 0,
      },
    ]);
  });

  it("rejects unsafe or negative counts", () => {
    expect(
      parseFunnelPanelCardCounts([
        {
          funnel_id: "not-a-uuid",
          active_card_count: -1,
        },
      ]),
    ).toBeNull();
  });
});
