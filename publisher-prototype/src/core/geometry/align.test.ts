import { describe, expect, it } from "vitest";
import {
  createEmptyDocument,
  type LayoutDocument,
  type LayoutObject,
  type LineObject,
  type ShapeObject,
} from "../model";
import { objectAabb, type Rect } from "../hittest";
import { documentSlice, objectResizeCommitted } from "../store";
import { alignBoxes, distributeBoxes } from "./align";

/**
 * Align & distribute contract: alignBoxes translates each unlocked object so
 * its ROTATION-AWARE AABB edge lands on the target rect (sizes untouched,
 * lines move by endpoint translation, locked objects omitted); distributeBoxes
 * equalizes the gaps between AABBs along one axis, anchoring the outermost
 * two, and needs at least three movable objects. The output is the absolute
 * geometry an object/resizeCommitted commit applies.
 */

function shape(id: string, overrides: Partial<ShapeObject> = {}): ShapeObject {
  return {
    type: "shape",
    shape: "rect",
    id,
    x: 1,
    y: 1,
    w: 2,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
    ...overrides,
  };
}

function line(id: string, overrides: Partial<LineObject> = {}): LineObject {
  return {
    type: "line",
    id,
    x1: 0,
    y1: 0,
    x2: 2,
    y2: 1,
    locked: false,
    stroke: { paint: { kind: "color", color: { space: "rgb", values: [0, 0, 0] } }, width: 1 },
    ...overrides,
  };
}

const page: Rect = { x: 0, y: 0, w: 8.5, h: 11 };
const margins: Rect = { x: 0.5, y: 0.5, w: 7.5, h: 10 };

describe("alignBoxes", () => {
  it("lands the AABB left edge on target.x, leaving y and size untouched", () => {
    const boxes = alignBoxes([shape("a", { x: 2, w: 1 })], "left", margins);
    expect(boxes).toEqual({ a: { x: 0.5, y: 1, w: 1, h: 1 } });
  });

  it("lands the AABB right edge on target.x + target.w", () => {
    const boxes = alignBoxes([shape("a")], "right", page);
    expect(boxes).toEqual({ a: { x: 6.5, y: 1, w: 2, h: 1 } });
  });

  it("aligns a callout by its VISUAL bounds, tail included", () => {
    // A 2×1in callout whose tail points 0.5 box-lengths left of the body: its
    // visual left edge is 1in left of its frame, so aligning left puts the
    // TAIL on the margin and the body an inch inside it.
    const callout = shape("c", { shape: "callout", x: 4, tailTip: { x: -0.5, y: 0.5 } });
    const boxes = alignBoxes([callout], "left", margins);
    expect(boxes).toEqual({ c: { x: 1.5, y: 1, w: 2, h: 1 } });
  });

  it("centers the AABB horizontally on the target center", () => {
    const boxes = alignBoxes([shape("a")], "centerH", page);
    expect(boxes).toEqual({ a: { x: 3.25, y: 1, w: 2, h: 1 } });
  });

  it("aligns top, middleV, and bottom vertically, leaving x untouched", () => {
    const objects = [shape("a")];
    expect(alignBoxes(objects, "top", page)).toEqual({ a: { x: 1, y: 0, w: 2, h: 1 } });
    expect(alignBoxes(objects, "middleV", page)).toEqual({ a: { x: 1, y: 5, w: 2, h: 1 } });
    expect(alignBoxes(objects, "bottom", page)).toEqual({ a: { x: 1, y: 10, w: 2, h: 1 } });
  });

  it("translates BOTH endpoints of a line by the same delta", () => {
    const boxes = alignBoxes([line("l", { x1: 1, y1: 1, x2: 3, y2: 2 })], "top", page);
    expect(boxes).toEqual({ l: { x1: 1, y1: 0, x2: 3, y2: 1 } });
  });

  it("aligns a rotated frame by its visual AABB, moving the stored origin", () => {
    const rotated = shape("r", { x: 2, y: 2, rotation: 90 });
    const aabb = objectAabb(rotated);
    // Premise: a 2x1 frame rotated 90 deg has a 1x2 AABB about its center (3, 2.5).
    expect(aabb.x).toBeCloseTo(2.5);
    expect(aabb.y).toBeCloseTo(1.5);
    expect(aabb.w).toBeCloseTo(1);
    expect(aabb.h).toBeCloseTo(2);
    const boxes = alignBoxes([rotated], "left", page);
    expect(boxes).toEqual({
      r: { x: rotated.x + (page.x - aabb.x), y: 2, w: 2, h: 1 },
    });
  });

  it("omits locked objects from the result entirely", () => {
    const boxes = alignBoxes([shape("a", { locked: true }), shape("b")], "left", page);
    expect(Object.keys(boxes)).toEqual(["b"]);
  });

  it("keeps already-aligned objects in the result with unchanged geometry", () => {
    const boxes = alignBoxes([shape("a", { x: 0.5, w: 1 })], "left", margins);
    expect(boxes).toEqual({ a: { x: 0.5, y: 1, w: 1, h: 1 } });
  });
});

describe("distributeBoxes", () => {
  it("returns null with fewer than three UNLOCKED objects", () => {
    const objects = [shape("a"), shape("b", { x: 4 }), shape("c", { x: 7, locked: true })];
    expect(distributeBoxes(objects, "horizontal")).toBeNull();
  });

  it("equalizes horizontal gaps, anchoring the outermost objects", () => {
    const objects = [
      shape("a", { x: 0, w: 1 }),
      shape("b", { x: 2, w: 1 }),
      shape("c", { x: 6, w: 2 }),
    ];
    // span 0..8 = 8, extents 1+1+2 = 4, gap (8-4)/2 = 2 -> middle at 0+1+2 = 3.
    expect(distributeBoxes(objects, "horizontal")).toEqual({
      a: { x: 0, y: 1, w: 1, h: 1 },
      b: { x: 3, y: 1, w: 1, h: 1 },
      c: { x: 6, y: 1, w: 2, h: 1 },
    });
  });

  it("equalizes vertical gaps the same way along y", () => {
    const objects = [
      shape("a", { y: 0, h: 1 }),
      shape("b", { y: 2, h: 1 }),
      shape("c", { y: 6, h: 2 }),
    ];
    expect(distributeBoxes(objects, "vertical")).toEqual({
      a: { x: 1, y: 0, w: 2, h: 1 },
      b: { x: 1, y: 3, w: 2, h: 1 },
      c: { x: 1, y: 6, w: 2, h: 2 },
    });
  });

  it("spaces overlapping objects evenly with a negative gap", () => {
    const objects = [
      shape("a", { x: 0, w: 2 }),
      shape("b", { x: 0.5, w: 2 }),
      shape("c", { x: 3, w: 2 }),
    ];
    // span 0..5 = 5, extents 6, gap (5-6)/2 = -0.5 -> 0, 1.5, 3.
    expect(distributeBoxes(objects, "horizontal")).toEqual({
      a: { x: 0, y: 1, w: 2, h: 1 },
      b: { x: 1.5, y: 1, w: 2, h: 1 },
      c: { x: 3, y: 1, w: 2, h: 1 },
    });
  });

  it("excludes locked objects from both the anchors and the result", () => {
    const objects = [
      shape("a", { x: 0, w: 1 }),
      shape("padlock", { x: 1.5, w: 1, locked: true }),
      shape("b", { x: 2, w: 1 }),
      shape("c", { x: 6, w: 2 }),
    ];
    // The locked object neither moves nor counts: a/b/c distribute as if alone.
    expect(distributeBoxes(objects, "horizontal")).toEqual({
      a: { x: 0, y: 1, w: 1, h: 1 },
      b: { x: 3, y: 1, w: 1, h: 1 },
      c: { x: 6, y: 1, w: 2, h: 1 },
    });
  });

  it("breaks sort-axis ties deterministically by id", () => {
    const objects = [
      shape("b", { x: 0, w: 1 }),
      shape("a", { x: 0, w: 1 }),
      shape("c", { x: 6, w: 2 }),
    ];
    // span 8, extents 4, gap 2; id order puts "a" first: a -> 0, b -> 3, c -> 6.
    const expected = {
      a: { x: 0, y: 1, w: 1, h: 1 },
      b: { x: 3, y: 1, w: 1, h: 1 },
      c: { x: 6, y: 1, w: 2, h: 1 },
    };
    expect(distributeBoxes(objects, "horizontal")).toEqual(expected);
    expect(distributeBoxes(objects, "horizontal")).toEqual(expected);
  });

  it("moves a distributed line by endpoint translation", () => {
    const objects: LayoutObject[] = [
      shape("a", { x: 0, w: 1 }),
      line("l", { x1: 2, y1: 0, x2: 3, y2: 1 }),
      shape("c", { x: 6, w: 2 }),
    ];
    // Line AABB spans x 2..3; the middle slot starts at 3 -> both endpoints +1.
    expect(distributeBoxes(objects, "horizontal")).toEqual({
      a: { x: 0, y: 1, w: 1, h: 1 },
      l: { x1: 3, y1: 0, x2: 4, y2: 1 },
      c: { x: 6, y: 1, w: 2, h: 1 },
    });
  });
});

describe("alignBoxes output through object/resizeCommitted", () => {
  it("applies the computed alignment to the document's stored geometry", () => {
    const objects: LayoutObject[] = [
      shape("a", { x: 2, w: 1 }),
      line("l", { x1: 1, y1: 1, x2: 3, y2: 2 }),
    ];
    const doc: LayoutDocument = createEmptyDocument();
    const firstPage = doc.pages[0];
    if (!firstPage) throw new Error("createEmptyDocument must yield a page");
    firstPage.objects = objects;

    const boxes = alignBoxes(objects, "left", margins);
    const state = documentSlice.reducer(doc, objectResizeCommitted({ pageIndex: 0, boxes }));

    const [a, l] = state.pages[0]?.objects ?? [];
    expect(a).toMatchObject({ x: 0.5, y: 1, w: 1, h: 1 });
    expect(l).toMatchObject({ x1: 0.5, y1: 1, x2: 2.5, y2: 2 });
    expect(a).toMatchObject(boxes["a"] ?? {});
    expect(l).toMatchObject(boxes["l"] ?? {});
  });
});
