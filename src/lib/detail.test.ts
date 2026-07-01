import { describe, it, expect } from "vitest";
import { buildTrail, buildDetail } from "./detail";
import { seedItems } from "@/data";

const byId = (id: number) => {
  const item = seedItems.find((i) => i.id === id);
  if (!item) throw new Error(`seed item ${id} missing`);
  return item;
};

describe("buildTrail", () => {
  it("new → single node, no trailing line", () => {
    const trail = buildTrail(byId(4)); // status: new
    expect(trail.map((t) => t.label)).toEqual(["New"]);
    expect(trail.at(-1)!.line).toBe(false);
  });

  it("planned → New → Planned", () => {
    const trail = buildTrail(byId(2)); // planned bug
    expect(trail.map((t) => t.label)).toEqual(["New", "Planned"]);
    expect(trail[0].line).toBe(true);
    expect(trail.at(-1)!.line).toBe(false);
  });

  it("done bug → New → Planned → Fixed", () => {
    const trail = buildTrail(byId(9)); // done bug
    expect(trail.map((t) => t.label)).toEqual(["New", "Planned", "Fixed"]);
  });

  it("done feature → New → Planned → Shipped", () => {
    const trail = buildTrail(byId(10)); // done feature
    expect(trail.map((t) => t.label)).toEqual(["New", "Planned", "Shipped"]);
  });

  it("declined feature → New → Declined (skips Planned)", () => {
    const trail = buildTrail(byId(8)); // declined feature
    expect(trail.map((t) => t.label)).toEqual(["New", "Declined"]);
  });
});

describe("buildDetail", () => {
  it("highlights the viewing store's own preserved report and keeps its words", () => {
    const detail = buildDetail(byId(2), "#1284");
    const own = detail.reportsList.find((r) => r.store === "#1284")!;
    expect(own.storeColor).toBe("#CC0000");
    expect(own.bg).toBe("#FBEBEB");
    expect(own.text).toBe("App freezes resizing large banners over 200MB.");
    expect(own.hasName).toBe(true);

    const other = detail.reportsList.find((r) => r.store !== "#1284")!;
    expect(other.storeColor).toBe("#555");
    expect(other.bg).toBe("#fff");
  });

  it("preserves every merged report — aggregate, never flatten", () => {
    const detail = buildDetail(byId(2), "#1284");
    expect(detail.reportsList).toHaveLength(3); // all three stores' originals kept
    expect(detail.backedLine).toBe("47 stores across 9 districts back this");
  });

  it("flags comment presence", () => {
    expect(buildDetail(byId(2), "#1284").hasComments).toBe(true);
    expect(buildDetail(byId(3), "#1284").hasComments).toBe(false); // no comments in seed
  });
});
