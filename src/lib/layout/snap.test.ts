import { describe, it, expect } from "vitest";
import { snapBBox, snapPoint, snapTargets } from "./snap";
import { createDefaultDocument } from "@/store";
import { createFrame } from "./objects";

/** Letter document with margin 0.5 → v targets 0.5 · 4.25 · 8, h 0.5 · 5.5 · 10.5. */
function doc(columns = 1) {
  const d = createDefaultDocument();
  d.columns = columns;
  return d;
}

describe("snapTargets", () => {
  it("always offers margins and page centers", () => {
    const t = snapTargets(doc(), []);
    expect(t.v).toEqual([0.5, 4.25, 8]);
    expect(t.h).toEqual([0.5, 5.5, 10.5]);
  });

  it("includes column guides only while the Guides toggle allows them", () => {
    const off = snapTargets(doc(2), [], { columnGuidesOn: false });
    const on = snapTargets(doc(2), [], { columnGuidesOn: true });
    expect(off.v).toHaveLength(3);
    expect(on.v.length).toBe(5); // + both gutter edges
    // the gutter straddles the page center: 4.25 ± 0.1 (fp-tolerant)
    expect(on.v.some((x) => Math.abs(x - 4.15) < 1e-9)).toBe(true);
    expect(on.v.some((x) => Math.abs(x - 4.35) < 1e-9)).toBe(true);
  });

  it("offers other objects' edges and centers, excluding the moving set", () => {
    const r = createFrame("rect", 1, 2, 2, 2);
    const t = snapTargets(doc(), [r]);
    expect(t.v).toEqual(expect.arrayContaining([1, 2, 3]));
    expect(t.h).toEqual(expect.arrayContaining([2, 3, 4]));
    const excluded = snapTargets(doc(), [r], { exclude: new Set([r.id]) });
    expect(excluded.v).toEqual([0.5, 4.25, 8]);
  });

  it("dedupes coincident targets", () => {
    const r = createFrame("rect", 0.5, 0.5, 2, 2); // left edge on the margin
    const t = snapTargets(doc(), [r]);
    expect(t.v.filter((x) => x === 0.5)).toHaveLength(1);
  });
});

describe("snapBBox", () => {
  const targets = { v: [0.5, 4.25, 8], h: [0.5, 5.5, 10.5] };

  it("snaps the nearest edge within the threshold and reports the line", () => {
    const r = snapBBox({ x: 0.47, y: 3, w: 2, h: 1 }, targets, 0.1);
    expect(r.dx).toBeCloseTo(0.03, 10);
    expect(r.dy).toBe(0); // nothing within reach vertically
    expect(r.lines).toEqual([{ axis: "v", at: 0.5 }]);
  });

  it("centers snap too — the box middle finds the page center", () => {
    const r = snapBBox({ x: 3.3, y: 0, w: 2, h: 1 }, targets, 0.1);
    expect(r.dx).toBeCloseTo(-0.05, 10); // center 4.3 → 4.25
    expect(r.lines[0]).toEqual({ axis: "v", at: 4.25 });
  });

  it("prefers the nearest candidate when several are in range", () => {
    // left edge 0.44 (Δ+0.06 to 0.5) vs right edge 4.335 (Δ-0.085 to 4.25)
    const r = snapBBox({ x: 0.44, y: 0, w: 3.895, h: 1 }, targets, 0.1);
    expect(r.dx).toBeCloseTo(0.06, 10);
    expect(r.lines[0]).toEqual({ axis: "v", at: 0.5 });
  });

  it("does nothing outside the threshold", () => {
    const r = snapBBox({ x: 2, y: 2, w: 1, h: 1 }, targets, 0.05);
    expect(r).toEqual({ dx: 0, dy: 0, lines: [] });
  });

  it("both axes snap independently", () => {
    const r = snapBBox({ x: 0.46, y: 0.53, w: 1, h: 1 }, targets, 0.1);
    expect(r.dx).toBeCloseTo(0.04, 10);
    expect(r.dy).toBeCloseTo(-0.03, 10);
    expect(r.lines).toHaveLength(2);
  });
});

describe("snapPoint", () => {
  const targets = { v: [0.5, 4.25, 8], h: [0.5, 5.5, 10.5] };

  it("snaps a free point on both axes", () => {
    const p = snapPoint(4.2, 5.55, targets, 0.1);
    expect(p.x).toBe(4.25);
    expect(p.y).toBe(5.5);
    expect(p.lines).toHaveLength(2);
  });

  it("axis filtering keeps edge handles on their own axis", () => {
    const p = snapPoint(4.2, 5.55, targets, 0.1, { x: true, y: false });
    expect(p.x).toBe(4.25);
    expect(p.y).toBe(5.55); // untouched
    expect(p.lines).toEqual([{ axis: "v", at: 4.25 }]);
  });
});
