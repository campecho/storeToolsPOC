import type { AppNotification } from "@/schema";

/**
 * Notification decoration + routing, ported from the handoff prototype's
 * buildNotifs()/notifSee(): kind-tinted icon bubbles, unread row tint, the
 * action link label, and where a tap routes — shipped fires the celebrate
 * moment (when celebrations are on), release-tied updates open the release
 * note, everything else opens the item on the board.
 */

export interface NotificationDecor {
  iconBg: string;
  action: string;
}

export function decorateNotification(n: AppNotification): NotificationDecor {
  return {
    iconBg: n.kind === "shipped" ? "#FBEBEB" : n.kind === "status" ? "#eef4fb" : "#eef7ef",
    action: n.kind === "shipped" ? "See what shipped →" : n.release ? "See detail →" : "View on the board →",
  };
}

export type NotificationDestination =
  | { type: "celebrate"; itemId: number; release: string | null }
  | { type: "releases" }
  | { type: "board"; itemId: number };

export function notificationDestination(
  n: AppNotification,
  celebrations: boolean,
): NotificationDestination {
  if (n.kind === "shipped" && celebrations) {
    return { type: "celebrate", itemId: n.itemId, release: n.release };
  }
  // Celebrations off (or non-shipped): release-tied updates go straight to the
  // release note; the rest open the item on the board.
  if (n.release) return { type: "releases" };
  return { type: "board", itemId: n.itemId };
}
