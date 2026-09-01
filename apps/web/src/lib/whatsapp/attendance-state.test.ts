import { describe, expect, it } from "vitest";
import type { ConversationStatus } from "./types";
import {
  getAttendanceCapabilities,
  getAttendanceQueue,
  getAttendanceQueueCounts,
} from "./attendance-state";

const none = {
  start: false,
  transfer: false,
  complete: false,
  compose: false,
  reopen: false,
};

describe("getAttendanceCapabilities", () => {
  it("allows starting, transferring or completing a pending conversation without composing", () => {
    expect(
      getAttendanceCapabilities("pending", null, "current-user", true),
    ).toEqual({
      start: true,
      transfer: true,
      complete: true,
      compose: false,
      reopen: false,
    });
  });

  it("never enables the composer for a pending conversation, even with a stale assignment", () => {
    expect(
      getAttendanceCapabilities(
        "pending",
        "current-user",
        "current-user",
        true,
      ),
    ).toMatchObject({ compose: false });
  });

  it("allows the assigned user to compose, transfer and complete an open conversation", () => {
    expect(
      getAttendanceCapabilities("open", "current-user", "current-user", true),
    ).toEqual({
      start: false,
      transfer: true,
      complete: true,
      compose: true,
      reopen: false,
    });
  });

  it("does not allow another user to compose in an open conversation", () => {
    expect(
      getAttendanceCapabilities("open", "other-user", "current-user", true),
    ).toEqual({
      start: false,
      transfer: true,
      complete: true,
      compose: false,
      reopen: false,
    });
  });

  it("does not allow composing in an unassigned open conversation", () => {
    expect(
      getAttendanceCapabilities("open", null, "current-user", true),
    ).toMatchObject({ compose: false });
  });

  it("does not treat two missing user ids as ownership", () => {
    expect(getAttendanceCapabilities("open", null, null, true)).toMatchObject({
      compose: false,
    });
  });

  it("only allows reopening a resolved conversation", () => {
    expect(
      getAttendanceCapabilities(
        "resolved",
        "current-user",
        "current-user",
        true,
      ),
    ).toEqual({
      start: false,
      transfer: false,
      complete: false,
      compose: false,
      reopen: true,
    });
  });

  it.each<ConversationStatus>(["pending", "open", "resolved"])(
    "disables every capability for read-only users when status is %s",
    (status) => {
      expect(
        getAttendanceCapabilities(
          status,
          "current-user",
          "current-user",
          false,
        ),
      ).toEqual(none);
    },
  );
});

describe("getAttendanceQueue", () => {
  it("always classifies pending conversations as new", () => {
    expect(getAttendanceQueue("pending", null, "current-user")).toBe("new");
    expect(getAttendanceQueue("pending", "current-user", "current-user")).toBe(
      "new",
    );
  });

  it("classifies an open conversation assigned to the current user as mine", () => {
    expect(getAttendanceQueue("open", "current-user", "current-user")).toBe(
      "mine",
    );
  });

  it("classifies open conversations assigned to someone else as others", () => {
    expect(getAttendanceQueue("open", "other-user", "current-user")).toBe(
      "others",
    );
  });

  it("classifies unassigned open conversations as others", () => {
    expect(getAttendanceQueue("open", null, "current-user")).toBe("others");
  });

  it("does not infer ownership when the current user is missing", () => {
    expect(getAttendanceQueue("open", null, null)).toBe("others");
    expect(getAttendanceQueue("open", "assigned-user", null)).toBe("others");
  });

  it("always classifies resolved conversations as resolved", () => {
    expect(getAttendanceQueue("resolved", null, "current-user")).toBe(
      "resolved",
    );
    expect(getAttendanceQueue("resolved", "current-user", "current-user")).toBe(
      "resolved",
    );
  });
});

describe("getAttendanceQueueCounts", () => {
  it("counts only conversations with unread customer responses in active queues", () => {
    expect(
      getAttendanceQueueCounts(
        [
          {
            status: "pending",
            assignedUserId: null,
            unreadCount: 3,
          },
          {
            status: "pending",
            assignedUserId: null,
            unreadCount: 0,
          },
          {
            status: "open",
            assignedUserId: "current-user",
            unreadCount: 1,
          },
          {
            status: "open",
            assignedUserId: "other-user",
            unreadCount: 0,
          },
        ],
        "current-user",
      ),
    ).toEqual({ new: 1, mine: 1, others: 0, resolved: 0 });
  });

  it("counts an unread conversation once regardless of its message count", () => {
    expect(
      getAttendanceQueueCounts(
        [
          {
            status: "open",
            assignedUserId: "current-user",
            unreadCount: 42,
          },
        ],
        "current-user",
      ).mine,
    ).toBe(1);
  });

  it("keeps the resolved shortcut as a conversation total", () => {
    expect(
      getAttendanceQueueCounts(
        [
          {
            status: "resolved",
            assignedUserId: "current-user",
            unreadCount: 0,
          },
          {
            status: "resolved",
            assignedUserId: null,
            unreadCount: 0,
          },
        ],
        "current-user",
      ).resolved,
    ).toBe(2);
  });
});
