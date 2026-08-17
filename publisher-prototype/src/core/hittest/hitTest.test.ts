import { describe, expect, it } from "vitest";
import type { LineObject, MergeFieldObject, Paint, ShapeObject, Stroke } from "../model";
import { hitTestMarquee, hitTestPoint, type HitTestOptions } from "./hitTest";

/**
 * Hit-testing unit probes (PLAN.md §5 testing note): describe names carry the
 * registry clause / HitTestSpec rule each block mechanizes, so the clause↔test
 * discipline holds below the Playwright layer.
 */

const BLACK: Paint = { kind: "color", color: { space: "rgb", values: [0, 0, 0] } };

function stroke(widthPt: number): Stroke {
  return { paint: BLACK, width: widthPt };
}

function shapeRect(id: string, over: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id,
    type: "shape",
    shape: "rect",
    x: 1,
    y: 1,
    w: 2,
    h: 1,
    rotation: 0,
    locked: false,
    fill: BLACK,
    stroke: null,
    ...over,
  };
}

function line(id: string, over: Partial<LineObject> = {}): LineObject {
  return {
    id,
    type: "line",
    x1: 0,
    y1: 0,
    x2: 2,
    y2: 0,
    locked: false,
    stroke: stroke(1),
    ...over,
  };
}

function mergeField(id: string, over: Partial<MergeFieldObject> = {}): MergeFieldObject {
  return {
    id,
    type: "mergeField",
    field: "firstName",
    x: 1,
    y: 1,
    w: 2,
    h: 1,
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
    ...over,
  };
}

/** Normalized triangle spanning the frame box: (0,0) → (1,0) → (0.5,1), closed. */
const TRIANGLE_D: ShapeObject["d"] = [
  { c: "M", x: 0, y: 0 },
  { c: "L", x: 1, y: 0 },
  { c: "L", x: 0.5, y: 1 },
  { c: "Z" },
];

const OPTS: HitTestOptions = {
  toleranceIn: 0.05,
  unfilledInterior: "passesThrough",
  lockedObjects: "skips",
};

describe("select.click.selects-topmost / select.alt-click.selects-beneath", () => {
  it("returns ALL hits ordered topmost-first (z-order is array order, last on top)", () => {
    const below = shapeRect("below");
    const above = shapeRect("above", { x: 1.5, y: 1.2 });
    const hits = hitTestPoint([below, above], { x: 1.8, y: 1.5 }, OPTS);
    expect(hits.map((o) => o.id)).toEqual(["above", "below"]);
  });
});

describe("hitTest.tolerance (contract tolerancePx, converted to inches by the shell)", () => {
  const unfilled = shapeRect("r", { fill: null });
  it("hits just inside the tolerance band on either side of the edge", () => {
    expect(hitTestPoint([unfilled], { x: 0.96, y: 1.5 }, OPTS)).toHaveLength(1);
    expect(hitTestPoint([unfilled], { x: 1.04, y: 1.5 }, OPTS)).toHaveLength(1);
  });
  it("misses just outside the tolerance band", () => {
    expect(hitTestPoint([unfilled], { x: 0.94, y: 1.5 }, OPTS)).toHaveLength(0);
  });
});

describe("hitTest.unfilledInterior (passesThrough vs selects)", () => {
  const center = { x: 2, y: 1.5 };
  it("passes through an unfilled interior", () => {
    expect(hitTestPoint([shapeRect("r", { fill: null })], center, OPTS)).toHaveLength(0);
  });
  it("selects an unfilled interior when the spec says selects", () => {
    const hits = hitTestPoint([shapeRect("r", { fill: null })], center, {
      ...OPTS,
      unfilledInterior: "selects",
    });
    expect(hits).toHaveLength(1);
  });
  it("always selects a filled interior", () => {
    expect(hitTestPoint([shapeRect("r")], center, OPTS)).toHaveLength(1);
  });
});

describe("hitTest.lockedObjects (skips vs hits)", () => {
  const locked = shapeRect("locked", { locked: true });
  it("skips locked objects under the pointer by default", () => {
    expect(hitTestPoint([locked], { x: 2, y: 1.5 }, OPTS)).toHaveLength(0);
  });
  it("hits locked objects when the spec says hits", () => {
    const hits = hitTestPoint([locked], { x: 2, y: 1.5 }, { ...OPTS, lockedObjects: "hits" });
    expect(hits.map((o) => o.id)).toEqual(["locked"]);
  });
});

describe("hitTest.rotation (center pivot — the framePivot decision of record)", () => {
  // (1,1,2,1) rotated 90° about its center (2,1.5) occupies x∈[1.5,2.5], y∈[0.5,2.5].
  const rotated = shapeRect("rot", { rotation: 90 });
  it("hits a point inside the rotated frame that misses the unrotated box", () => {
    expect(hitTestPoint([rotated], { x: 2, y: 0.75 }, OPTS)).toHaveLength(1);
  });
  it("misses a point inside the unrotated box that the rotated frame left", () => {
    expect(hitTestPoint([rotated], { x: 1.2, y: 1.5 }, OPTS)).toHaveLength(0);
  });
});

describe("hitTest.ellipse (exact geometry, not the bounding box)", () => {
  const ellipse = shapeRect("e", { shape: "ellipse", x: 0, y: 0, w: 2, h: 1 });
  it("hits the filled interior", () => {
    expect(hitTestPoint([ellipse], { x: 1, y: 0.5 }, OPTS)).toHaveLength(1);
  });
  it("misses the frame corner outside the curve", () => {
    expect(hitTestPoint([ellipse], { x: 0.05, y: 0.05 }, OPTS)).toHaveLength(0);
  });
  it("hits the edge band just outside the curve and misses beyond it", () => {
    const unfilled = { ...ellipse, fill: null };
    expect(hitTestPoint([unfilled], { x: 2.04, y: 0.5 }, OPTS)).toHaveLength(1);
    expect(hitTestPoint([unfilled], { x: 2.06, y: 0.5 }, OPTS)).toHaveLength(0);
  });
});

describe("hitTest.path (flattened stroke + even-odd interior)", () => {
  // Frame (0,0,2,2): triangle (0,0) → (2,0) → (1,2), closed.
  const tri = shapeRect("p", { shape: "path", x: 0, y: 0, w: 2, h: 2, d: TRIANGLE_D });
  const triUnfilled = { ...tri, fill: null };
  it("hits the filled interior via even-odd over the closed outline", () => {
    expect(hitTestPoint([tri], { x: 1, y: 0.5 }, OPTS)).toHaveLength(1);
  });
  it("passes through the same interior when unfilled", () => {
    expect(hitTestPoint([triUnfilled], { x: 1, y: 0.5 }, OPTS)).toHaveLength(0);
  });
  it("hits the stroke within tolerance, including the Z closing segment", () => {
    expect(hitTestPoint([triUnfilled], { x: 1, y: 0.02 }, OPTS)).toHaveLength(1);
    // (0.5, 1) lies on the closing segment (1,2) → (0,0).
    expect(hitTestPoint([triUnfilled], { x: 0.5, y: 1 }, OPTS)).toHaveLength(1);
  });
  it("misses outside the concave gap beside the outline", () => {
    expect(hitTestPoint([triUnfilled], { x: 1.9, y: 1.9 }, OPTS)).toHaveLength(0);
  });
  it("flattens cubic segments onto the sampled curve", () => {
    const curve = shapeRect("c", {
      shape: "path",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      fill: null,
      d: [
        { c: "M", x: 0, y: 0 },
        { c: "C", x1: 0, y1: 1, x2: 1, y2: 1, x: 1, y: 0 },
      ],
    });
    // The cubic passes through (0.5, 0.75) at t = 0.5.
    expect(hitTestPoint([curve], { x: 0.5, y: 0.75 }, OPTS)).toHaveLength(1);
    expect(hitTestPoint([curve], { x: 0.5, y: 0.5 }, OPTS)).toHaveLength(0);
  });
});

describe("hitTest.line (tolerance + half stroke width in inches)", () => {
  it("widens the band by half the stroke width (width pt / 72 / 2)", () => {
    // 7.2pt stroke → half width 0.05in; band = 0.05 tolerance + 0.05 = 0.1.
    const wide = line("l", { stroke: stroke(7.2) });
    expect(hitTestPoint([wide], { x: 1, y: 0.09 }, OPTS)).toHaveLength(1);
    expect(hitTestPoint([wide], { x: 1, y: 0.11 }, OPTS)).toHaveLength(0);
  });
});

describe("hitTest.frames (textFrame/pictureFrame/table/mergeField follow the fill rule)", () => {
  it("passes through an unfilled frame interior but hits its edge", () => {
    const frame = mergeField("m");
    expect(hitTestPoint([frame], { x: 2, y: 1.5 }, OPTS)).toHaveLength(0);
    expect(hitTestPoint([frame], { x: 1.02, y: 1.5 }, OPTS)).toHaveLength(1);
  });
  it("hits a filled frame interior", () => {
    expect(hitTestPoint([mergeField("m", { fill: BLACK })], { x: 2, y: 1.5 }, OPTS)).toHaveLength(1);
  });
});

describe("select.drag-empty.marquee-selects (intersect, not contain)", () => {
  it("selects partially-overlapped objects, topmost-first, skipping locked", () => {
    const a = shapeRect("a", { x: 0, y: 0, w: 1, h: 1 });
    const b = shapeRect("b", { x: 0.5, y: 0.5, w: 1, h: 1 });
    const locked = shapeRect("locked", { x: 0.5, y: 0.5, w: 1, h: 1, locked: true });
    const crossing = line("crossing", { x1: 0, y1: 0, x2: 2, y2: 2 });
    const far = shapeRect("far", { x: 5, y: 5, w: 1, h: 1 });
    const hits = hitTestMarquee(
      [a, b, locked, crossing, far],
      { x: 0.9, y: 0.9, w: 0.4, h: 0.4 },
      { lockedObjects: "skips" },
    );
    expect(hits.map((o) => o.id)).toEqual(["crossing", "b", "a"]);
  });

  it("selects a line whose endpoints both lie outside the marquee", () => {
    const crossing = line("l", { x1: 0, y1: 0, x2: 2, y2: 2 });
    const hits = hitTestMarquee([crossing], { x: 0.9, y: 0.9, w: 0.2, h: 0.2 }, { lockedObjects: "skips" });
    expect(hits).toHaveLength(1);
  });

  it("intersects a rotated frame the unrotated box would miss", () => {
    // (1,1,2,1) rotated 90° about its center occupies x∈[1.5,2.5], y∈[0.5,2.5].
    const marquee = { x: 1.7, y: 0.2, w: 0.4, h: 0.4 };
    expect(
      hitTestMarquee([shapeRect("rot", { rotation: 90 })], marquee, { lockedObjects: "skips" }),
    ).toHaveLength(1);
    expect(
      hitTestMarquee([shapeRect("flat")], marquee, { lockedObjects: "skips" }),
    ).toHaveLength(0);
  });

  it("tests the ellipse outline, not its frame corners", () => {
    const circle = shapeRect("c", { shape: "ellipse", x: 0, y: 0, w: 2, h: 2 });
    const cornerMarquee = { x: 0, y: 0, w: 0.15, h: 0.15 };
    const edgeMarquee = { x: 0.9, y: 0, w: 0.2, h: 0.1 };
    expect(hitTestMarquee([circle], cornerMarquee, { lockedObjects: "skips" })).toHaveLength(0);
    expect(hitTestMarquee([circle], edgeMarquee, { lockedObjects: "skips" })).toHaveLength(1);
  });

  it("tests paths against the flattened outline and its closed interior", () => {
    const tri = shapeRect("p", { shape: "path", x: 0, y: 0, w: 2, h: 2, fill: null, d: TRIANGLE_D });
    const onEdge = { x: 0.4, y: 0.9, w: 0.2, h: 0.2 };
    const insideInterior = { x: 0.9, y: 0.9, w: 0.2, h: 0.2 };
    const outsideGap = { x: 1.8, y: 1.8, w: 0.1, h: 0.1 };
    expect(hitTestMarquee([tri], onEdge, { lockedObjects: "skips" })).toHaveLength(1);
    expect(hitTestMarquee([tri], insideInterior, { lockedObjects: "skips" })).toHaveLength(1);
    expect(hitTestMarquee([tri], outsideGap, { lockedObjects: "skips" })).toHaveLength(0);
  });

  it("can include locked objects when the spec says hits", () => {
    const locked = shapeRect("locked", { locked: true });
    const hits = hitTestMarquee([locked], { x: 0.5, y: 0.5, w: 1, h: 1 }, { lockedObjects: "hits" });
    expect(hits.map((o) => o.id)).toEqual(["locked"]);
  });
});
