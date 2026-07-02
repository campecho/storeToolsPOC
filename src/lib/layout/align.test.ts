import { describe, it, expect } from "vitest";
import { alignObjects, distributeObjects, unionBBox } from "./align";
import { bboxOf, createFrame, createLine } from "./objects";

const PAGE = { x: 0, y: 0, w: 8.5, h: 11 };

describe("unionBBox", () => {
  it("spans frames and line endpoints alike", () => {
    const u = unionBBox([createFrame("rect", 1, 2, 2, 1), createLine(5, 1, 7, 4)])!;
    expect(u).toEqual({ x: 1, y: 1, w: 6, h: 3 });
  });

  it("is null for an empty set", () => {
    expect(unionBBox([])).toBeNull();
  });
});

describe("alignObjects", () => {
  const a = createFrame("rect", 1, 1, 2, 1);
  const b = createFrame("rect", 4, 3, 1, 2);

  it("aligns each edge and center to the reference box", () => {
    expect(alignObjects([a, b], "left", PAGE).map((o) => bboxOf(o).x)).toEqual([0, 0]);
    expect(alignObjects([a, b], "right", PAGE).map((o) => bboxOf(o).x)).toEqual([6.5, 7.5]);
    expect(alignObjects([a, b], "centerH", PAGE).map((o) => bboxOf(o).x)).toEqual([3.25, 3.75]);
    expect(alignObjects([a, b], "top", PAGE).map((o) => bboxOf(o).y)).toEqual([0, 0]);
    expect(alignObjects([a, b], "bottom", PAGE).map((o) => bboxOf(o).y)).toEqual([10, 9]);
    expect(alignObjects([a, b], "centerV", PAGE).map((o) => bboxOf(o).y)).toEqual([5, 4.5]);
  });

  it("never changes sizes and leaves the other axis alone", () => {
    const [na, nb] = alignObjects([a, b], "left", PAGE);
    expect(bboxOf(na)).toMatchObject({ y: 1, w: 2, h: 1 });
    expect(bboxOf(nb)).toMatchObject({ y: 3, w: 1, h: 2 });
  });

  it("aligning to the selection union anchors the outermost member", () => {
    const ref = unionBBox([a, b])!;
    const [na, nb] = alignObjects([a, b], "left", ref);
    expect(bboxOf(na).x).toBe(1); // already at the union's left edge
    expect(bboxOf(nb).x).toBe(1);
  });

  it("moves a line by mapping its endpoints through the bbox", () => {
    const l = createLine(2, 2, 4, 3);
    const [nl] = alignObjects([l], "left", PAGE);
    expect(nl.type === "line" && [nl.x1, nl.y1, nl.x2, nl.y2]).toEqual([0, 2, 2, 3]);
  });
});

describe("distributeObjects", () => {
  const a = createFrame("rect", 0, 0, 1, 1);
  const b = createFrame("rect", 2, 0, 1, 1);
  const c = createFrame("rect", 7, 0, 1, 1);

  it("equalizes the gaps across the selection union, anchoring the ends", () => {
    const ref = unionBBox([a, b, c])!; // x 0..8, sizes sum 3 → gap 2.5
    const xs = distributeObjects([a, b, c], "h", ref).map((o) => bboxOf(o).x);
    expect(xs).toEqual([0, 3.5, 7]);
  });

  it("spans the page when that's the reference", () => {
    const xs = distributeObjects([a, b, c], "h", PAGE).map((o) => bboxOf(o).x);
    // span 8.5, sizes 3 → gap 2.75: 0 · 3.75 · 7.5
    expect(xs).toEqual([0, 3.75, 7.5]);
  });

  it("keeps positional order regardless of array order", () => {
    const ref = unionBBox([a, b, c])!;
    const xs = distributeObjects([c, a, b], "h", ref).map((o) => bboxOf(o).x);
    expect(xs).toEqual([7, 0, 3.5]); // c stays last, a first, b centered
  });

  it("works vertically too", () => {
    const p = createFrame("rect", 0, 0, 1, 1);
    const q = createFrame("rect", 0, 1.5, 1, 1);
    const r = createFrame("rect", 0, 6, 1, 1);
    const ys = distributeObjects([p, q, r], "v", unionBBox([p, q, r])!).map((o) => bboxOf(o).y);
    expect(ys).toEqual([0, 3, 6]);
  });

  it("overlaps evenly when the objects overflow the span (negative gap)", () => {
    const wide1 = createFrame("rect", 0, 0, 3, 1);
    const wide2 = createFrame("rect", 1, 0, 3, 1);
    const wide3 = createFrame("rect", 2, 0, 3, 1);
    const ref = unionBBox([wide1, wide2, wide3])!; // 0..5, sizes 9 → gap -2
    const xs = distributeObjects([wide1, wide2, wide3], "h", ref).map((o) => bboxOf(o).x);
    expect(xs).toEqual([0, 1, 2]);
  });
});
