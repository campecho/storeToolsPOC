import type { FeedbackItem } from "@/schema";

/**
 * Board filter semantics, ported exactly from the handoff prototype's filtered():
 * type/status match, scope rolls up by the store hierarchy, query matches
 * title + area + description, and the list is ALWAYS ranked by votes descending.
 */

export type TypeFilter = "all" | "bug" | "feature";
export type StatusFilter = "all" | "new" | "planned" | "done" | "declined";
export type ScopeFilter = "all" | "region" | "district" | "mine";

export interface BoardFilters {
  fType: TypeFilter;
  fStatus: StatusFilter;
  fScope: ScopeFilter;
  query: string;
}

export function filterItems(items: FeedbackItem[], f: BoardFilters): FeedbackItem[] {
  let list = items.slice();
  if (f.fType !== "all") list = list.filter((i) => i.type === f.fType);
  if (f.fStatus !== "all") list = list.filter((i) => i.status === f.fStatus);
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
