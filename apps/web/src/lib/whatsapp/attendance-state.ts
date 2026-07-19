import type { ConversationStatus } from "./types";

export type AttendanceCapabilities = Readonly<{
  start: boolean;
  transfer: boolean;
  complete: boolean;
  compose: boolean;
  reopen: boolean;
}>;

export type AttendanceQueue = "new" | "mine" | "others" | "resolved";

const noCapabilities: AttendanceCapabilities = {
  start: false,
  transfer: false,
  complete: false,
  compose: false,
  reopen: false,
};

/**
 * Resolves which attendance controls are available for the current user.
 *
 * Composing is intentionally stricter than the other actions: an open
 * conversation can only be answered by its assigned user.
 */
export function getAttendanceCapabilities(
  status: ConversationStatus,
  assignedUserId: string | null,
  currentUserId: string | null,
  canAttend: boolean,
): AttendanceCapabilities {
  if (!canAttend) return noCapabilities;

  if (status === "pending") {
    return {
      start: true,
      transfer: true,
      complete: true,
      compose: false,
      reopen: false,
    };
  }

  if (status === "open") {
    return {
      start: false,
      transfer: true,
      complete: true,
      compose: Boolean(currentUserId && assignedUserId === currentUserId),
      reopen: false,
    };
  }

  return {
    start: false,
    transfer: false,
    complete: false,
    compose: false,
    reopen: true,
  };
}

/** Classifies a conversation into the inbox queue independently of UI state. */
export function getAttendanceQueue(
  status: ConversationStatus,
  assignedUserId: string | null,
  currentUserId: string | null,
): AttendanceQueue {
  if (status === "pending") return "new";
  if (status === "resolved") return "resolved";

  return currentUserId && assignedUserId === currentUserId ? "mine" : "others";
}
