import { statusMeta, type FeedbackItem, type StoreReport, type ItemComment } from "@/schema";

/**
 * Decorated detail view model, ported from the handoff prototype's buildDetail():
 * the status timeline trail and the preserved per-store reports (own store
 * highlighted). Merges aggregate but never flatten — every store sees its own
 * report kept verbatim.
 */

export interface TrailNode {
  label: string;
  dot: string;
  /** whether a connector line follows this node */
  line: boolean;
}

export interface DecoratedReport extends StoreReport {
  hasName: boolean;
  bg: string;
  storeColor: string;
}

export interface ItemDetail {
  item: FeedbackItem;
  trail: TrailNode[];
  reportsList: DecoratedReport[];
  commentsList: ItemComment[];
  hasComments: boolean;
  backedLine: string;
}

/** The status timeline: New → Planned → Fixed/Shipped, or → Declined/Closed. */
export function buildTrail(item: FeedbackItem): TrailNode[] {
  const trail: TrailNode[] = [{ label: "New", dot: "#9a9a9a", line: true }];
  if (item.status === "planned" || item.status === "done") {
    trail.push({ label: "Planned", dot: "#086DD2", line: item.status === "done" });
  }
  if (item.status === "done") {
    trail.push({ label: item.type === "bug" ? "Fixed" : "Shipped", dot: "#2e8b3d", line: false });
  }
  if (item.status === "declined") {
    trail.push({ label: item.type === "bug" ? "Closed" : "Declined", dot: "#bcbcbc", line: false });
  }
  trail[trail.length - 1].line = false;
  return trail;
}

export function buildDetail(item: FeedbackItem, store: string): ItemDetail {
  return {
    item,
    trail: buildTrail(item),
    reportsList: item.reports.map((r) => ({
      ...r,
      hasName: !!r.name,
      bg: r.store === store ? "#FBEBEB" : "#fff",
      storeColor: r.store === store ? "#CC0000" : "#555",
    })),
    commentsList: item.comments,
    hasComments: item.comments.length > 0,
    backedLine: `${item.votes} stores across ${item.districts} districts back this`,
  };
}

/** Convenience re-export so drawer code has one import for status labels. */
export { statusMeta };
