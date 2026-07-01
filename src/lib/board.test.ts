import { describe, it, expect } from "vitest";
import { filterItems, scopeLabel, type BoardFilters } from "./board";
import { seedItems } from "@/data";

const base: BoardFilters = { fType: "all", fStatus: "all", fScope: "all", query: "" };
const ids = (f: Partial<BoardFilters>) => filterItems(seedItems, { ...base, ...f }).map((i) => i.id);

describe("filterItems", () => {
  it("defaults to everything, ranked by votes descending", () => {
    const result = filterItems(seedItems, base);
    expect(result.length).toBe(seedItems.length);
    const votes = result.map((i) => i.votes);
    expect(votes).toEqual([...votes].sort((a, b) => b - a));
    expect(result[0].id).toBe(1); // 61 votes leads
  });

  it("filters by type", () => {
    const bugs = filterItems(seedItems, { ...base, fType: "bug" });
    expect(bugs.every((i) => i.type === "bug")).toBe(true);
    expect(bugs.length).toBe(7);
  });

  it("filters by status", () => {
    expect(ids({ fStatus: "done" }).sort()).toEqual([10, 11, 12, 9].sort());
    expect(ids({ fStatus: "declined" })).toEqual([8]);
  });

  it("scope 'mine' = items the store raised OR backed", () => {
    // mine: 2, 5, 9, 11 — votedByMe adds nothing new in the seed.
    expect(ids({ fScope: "mine" }).sort()).toEqual([11, 2, 5, 9].sort());
  });

  it("scope district/region = items with backing in that tier", () => {
    expect(ids({ fScope: "district" }).sort()).toEqual([1, 11, 2, 5, 9].sort());
    // Only items 7 and 8 lack region backing.
    expect(ids({ fScope: "region" })).not.toContain(7);
    expect(ids({ fScope: "region" })).not.toContain(8);
    expect(ids({ fScope: "region" }).length).toBe(10);
  });

  it("query matches title, area, and description, case-insensitively", () => {
    expect(ids({ query: "BARCODES" })).toEqual([4]);
    expect(ids({ query: "publisher converter" }).sort()).toEqual([12, 5].sort()); // area match
    expect(ids({ query: "scanners reject" })).toEqual([4]); // desc match
    expect(ids({ query: "zzz-no-match" })).toEqual([]);
  });

  it("composes filters and keeps votes-desc order", () => {
    // done + mine → the store's shipped/fixed items, best-backed first.
    expect(ids({ fStatus: "done", fScope: "mine" })).toEqual([11, 9]); // 44 then 38
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
