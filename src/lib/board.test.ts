import { describe, it, expect } from "vitest";
import {
  filterItems,
  scopeLabel,
  recentlyShipped,
  shippedAgoLabel,
  type BoardFilters,
} from "./board";
import { seedItems } from "@/data";

const base: BoardFilters = { fType: "all", fStatus: "open", fScope: "all", query: "" };
const ids = (f: Partial<BoardFilters>) => filterItems(seedItems, { ...base, ...f }).map((i) => i.id);

describe("filterItems", () => {
  it("defaults to all open items (new + planned), ranked by votes descending", () => {
    const result = filterItems(seedItems, base);
    expect(result.length).toBe(7); // 12 seeded − 4 delivered − 1 declined
    const votes = result.map((i) => i.votes);
    expect(votes).toEqual([...votes].sort((a, b) => b - a));
    expect(result[0].id).toBe(1); // 61 votes leads
  });

  it("delivered items never appear in the ranked list, under any filter", () => {
    for (const fStatus of ["open", "new", "planned", "declined"] as const) {
      const result = ids({ fStatus });
      expect(result).not.toContain(9);
      expect(result).not.toContain(10);
      expect(result).not.toContain(11);
      expect(result).not.toContain(12);
    }
  });

  it("filters by type within open items", () => {
    const bugs = filterItems(seedItems, { ...base, fType: "bug" });
    expect(bugs.every((i) => i.type === "bug")).toBe(true);
    expect(bugs.map((i) => i.id).sort()).toEqual([2, 4, 5, 7].sort());
  });

  it("filters by status", () => {
    expect(ids({ fStatus: "new" }).sort()).toEqual([4, 5, 6, 7].sort());
    expect(ids({ fStatus: "planned" })).toEqual([1, 3, 2]); // 61, 52, 47
    expect(ids({ fStatus: "declined" })).toEqual([8]);
  });

  it("scope 'mine' = open items the store raised OR backed", () => {
    expect(ids({ fScope: "mine" })).toEqual([2, 5]); // 47 then 29
  });

  it("scope district/region = open items with backing in that tier", () => {
    expect(ids({ fScope: "district" }).sort()).toEqual([1, 2, 5].sort());
    const region = ids({ fScope: "region" });
    expect(region).not.toContain(7);
    expect(region.length).toBe(6);
  });

  it("query matches title, area, and description, case-insensitively", () => {
    expect(ids({ query: "BARCODES" })).toEqual([4]);
    // area match — item 12 also matches but is delivered, so only item 5 shows
    expect(ids({ query: "publisher converter" })).toEqual([5]);
    expect(ids({ query: "scanners reject" })).toEqual([4]); // desc match
    expect(ids({ query: "zzz-no-match" })).toEqual([]);
  });

  it("composes filters and keeps votes-desc order", () => {
    expect(ids({ fStatus: "planned", fScope: "mine" })).toEqual([2]);
  });
});

describe("recentlyShipped", () => {
  it("returns deliveries from the last 7 days, most recent first", () => {
    expect(recentlyShipped(seedItems).map((i) => i.id)).toEqual([11, 9, 10]); // 2, 5, 6 days
  });

  it("week-old deliveries fall off", () => {
    // item 12 shipped 43 days ago (v1.3) — outside the window
    expect(recentlyShipped(seedItems).map((i) => i.id)).not.toContain(12);
    // a tighter window trims the tail
    expect(recentlyShipped(seedItems, 5).map((i) => i.id)).toEqual([11, 9]);
  });

  it("acknowledged deliveries are cleared from the band", () => {
    const acked = seedItems.map((i) => (i.id === 9 ? { ...i, recentShipAcked: true } : i));
    expect(recentlyShipped(acked).map((i) => i.id)).toEqual([11, 10]);
  });
});

describe("shippedAgoLabel", () => {
  it("pluralizes", () => {
    expect(shippedAgoLabel(1)).toBe("1 day ago");
    expect(shippedAgoLabel(2)).toBe("2 days ago");
  });
});

describe("scopeLabel", () => {
  it("labels every tier", () => {
    expect(scopeLabel("all", "#1284")).toBe("All stores");
    expect(scopeLabel("region", "#1284")).toBe("Region · Northeast");
    expect(scopeLabel("district", "#1284")).toBe("District 118");
    expect(scopeLabel("mine", "#1284")).toBe("My store #1284");
  });
});
