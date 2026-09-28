import { describe, expect, it } from "vitest";
import { availableAppointmentStatuses } from "./status";

describe("availableAppointmentStatuses", () => {
  it.each([
    ["scheduled", ["confirmed", "waiting", "no_show", "cancelled"]],
    ["confirmed", ["waiting", "no_show", "cancelled"]],
    ["waiting", ["in_progress", "no_show", "cancelled"]],
    ["in_progress", ["attended", "cancelled"]],
    ["attended", []],
    ["no_show", []],
    ["cancelled", []],
    ["unknown", []],
  ])("offers only valid transitions from %s", (status, expected) => {
    expect(availableAppointmentStatuses(status as string)).toEqual(expected);
  });

  it("routes clinical start and completion through the encounter", () => {
    expect(
      availableAppointmentStatuses("waiting", { startThroughEncounter: true }),
    ).toEqual(["no_show", "cancelled"]);
    expect(
      availableAppointmentStatuses("in_progress", {
        finishThroughEncounter: true,
      }),
    ).toEqual(["cancelled"]);
  });
});
