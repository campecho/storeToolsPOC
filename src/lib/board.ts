import type { FeedbackItem } from "@/schema";

/**
 * Board filter semantics. Delivered ('done') items no longer appear in the
 * ranked list at all — they surface in the "Recently shipped" band for their
 * first 7 days and live permanently on the Releases surface. The status
 * filter is therefore open-centric: "All open" (new + planned) is the
 * default, with New / Planned / Declined available; there is no shipped
 * filter. The list is ALWAYS ranked by votes descending.
 */

export type TypeFilter = "all" | "bug" | "feature";
export type StatusFilter = "open" | "new" | "planned" | "declined";
export type ScopeFilter = "all" | "region" | "district" | "mine";

export interface BoardFilters {
  fType: TypeFilter;
  fStatus: StatusFilter;
  fScope: ScopeFilter;
  query: string;
}

export function filterItems(items: FeedbackItem[], f: BoardFilters): FeedbackItem[] {
  // Delivered items are never part of the ranked list.
  let list = items.filter((i) => i.status !== "done");
  if (f.fType !== "all") list = list.filter((i) => i.type === f.fType);
  if (f.fStatus === "open") list = list.filter((i) => i.status === "new" || i.status === "planned");
  else list = list.filter((i) => i.status === f.fStatus);
  // Scope: "mine" = items the store raised or backed; district/region = items
  // with backing in that tier; "all" = everything.
  if (f.fScope === "mine") list = list.filter((i) => i.mine || i.votedByMe);
  else if (f.fScope === "district") list = list.filter((i) => i.inDistrict);
  else if (f.fScope === "region") list = list.filter((i) => i.inRegion);
  if (f.query.trim()) {
    const q = f.query.toLowerCase();
    list = list.filter((i) => (i.title + " " + i.area + " " + (i.desc || "")).toLowerCase().includes(q));
  }
  return list.sort((a, b) => b.votes - a.votes);
}

/** Subline label for the active scope (wire: "{n} open items · {scope} · ranked by store votes"). */
export function scopeLabel(scope: ScopeFilter, store: string): string {
  switch (scope) {
    case "all":
      return "All stores";
    case "region":
      return "Region · Northeast";
    case "district":
      return "District 118";
    case "mine":
      return `My store ${store}`;
  }
}

/** How long a delivery stays in the "Recently shipped" band before falling off. */
export const RECENT_SHIP_WINDOW_DAYS = 7;

/**
 * Deliveries for the board's "Recently shipped" band: shipped within the
 * window and not yet acknowledged ("Got it" / "Clear all"), most recent first.
 */
export function recentlyShipped(
  items: FeedbackItem[],
  windowDays = RECENT_SHIP_WINDOW_DAYS,
): FeedbackItem[] {
  return items
    .filter(
      (i) =>
        i.status === "done" &&
        i.shippedDaysAgo != null &&
        i.shippedDaysAgo <= windowDays &&
        !i.recentShipAcked,
    )
    .sort((a, b) => a.shippedDaysAgo! - b.shippedDaysAgo!);
}

export function shippedAgoLabel(days: number): string {
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
