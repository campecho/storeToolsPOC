import type { DeliveredItem } from "@/schema";

/**
 * Credit line for a delivered item (wire: releases feature/fix rows), ported
 * from the prototype's buildReleases() decorator: contributing stores are
 * credited — "Your store + N asked" in red when this store backed it,
 * "N stores asked" in gray otherwise, nothing when no stores are recorded.
 */
export function creditLine(item: DeliveredItem): { text: string; color: string } {
  if (item.stores <= 0) return { text: "", color: "#999" };
  return item.yours
    ? { text: `Your store + ${item.stores - 1} asked`, color: "#CC0000" }
    : { text: `${item.stores} stores asked`, color: "#999" };
}
