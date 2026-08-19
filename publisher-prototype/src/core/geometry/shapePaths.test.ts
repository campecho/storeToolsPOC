import { describe, expect, it } from "vitest";
import { tailTipFor, type PathSeg } from "../model";
import {
  BANNER_DEFAULT_HEIGHT,
  BANNER_DEFAULT_INSET,
  BANNER_HEIGHT_MAX,
  BANNER_HEIGHT_MIN,
  BANNER_INSET_MAX,
  BANNER_INSET_MIN,
  CALLOUT_TAIL_HALF_BASE,
  KAPPA,
  bannerPath,
  outlineOvershoot,
  clampCornerRadius,
  calloutPath,
  roundedRectPath,
  roundedRectPathFor,
  starPath,
} from "./shapePaths";

/**
 * Shape-tool path builder invariants: every builder emits one closed,
 * clockwise subpath (single M … Z) with all coordinates — control points
 * included — normalized inside [0, 1], and each shape's landmark vertices
 * land exactly where the tool contracts promise.
 */

/** Every builder's shared contract: starts with exactly one M, ends with Z,
 * one subpath. The callout is the one builder whose coordinates leave [0, 1]
 * — its tail points past the body on purpose — so the range check is separate. */
function expectClosedSubpath(segs: readonly PathSeg[]): void {
  expect(segs.length).toBeGreaterThan(2);
  expect(segs[0]?.c).toBe("M");
  expect(segs[segs.length - 1]?.c).toBe("Z");
  expect(segs.filter((s) => s.c === "M").length).toBe(1);
  expect(segs.filter((s) => s.c === "Z").length).toBe(1);
}

function expectClosedNormalizedSubpath(segs: readonly PathSeg[]): void {
  expectClosedSubpath(segs);
  for (const seg of segs) {
    if (seg.c === "Z") continue;
    const coords =
      seg.c === "C" ? [seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y] : [seg.x, seg.y];
    for (const v of coords) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  }
}

/** On-curve vertices (M/L endpoints) as [x, y] pairs, in path order. */
function vertices(segs: readonly PathSeg[]): [number, number][] {
  return segs
    .filter((s): s is Extract<PathSeg, { c: "M" | "L" }> => s.c === "M" || s.c === "L")
    .map((s) => [s.x, s.y]);
}

/** The same vertices as points, for the callout's edge bookkeeping. */
function verticesOf(segs: readonly PathSeg[]): { x: number; y: number }[] {
  return vertices(segs).map(([x, y]) => ({ x, y }));
}

function hasVertex(segs: readonly PathSeg[], x: number, y: number): boolean {
  return vertices(segs).some(([vx, vy]) => vx === x && vy === y);
}

/** Same, tolerant of the float noise a derived coordinate carries. */
function hasVertexNear(segs: readonly PathSeg[], x: number, y: number): boolean {
  return vertices(segs).some(([vx, vy]) => Math.abs(vx - x) < 1e-9 && Math.abs(vy - y) < 1e-9);
}

/** Split a multi-ring path at its M commands — the banner is the one builder
    that emits more than one, so its rings are addressed by position. */
function subpaths(segs: readonly PathSeg[]): PathSeg[][] {
  const rings: PathSeg[][] = [];
  for (const seg of segs) {
    if (seg.c === "M") rings.push([]);
    rings[rings.length - 1]?.push(seg);
  }
  return rings;
}

/** One segment of a ring, narrowed to the command it must be. M and L share a
    schema variant, so they share a getter. */
function pointAt(
  ring: PathSeg[] | undefined,
  index: number,
  command: "M" | "L",
): Extract<PathSeg, { c: "M" | "L" }> {
  const seg = ring?.[index];
  if (seg === undefined || seg.c !== command) {
    throw new Error(`expected ${command} at ${index}, got ${seg?.c}`);
  }
  return seg;
}

function cubicAt(ring: PathSeg[] | undefined, index: number): Extract<PathSeg, { c: "C" }> {
  const seg = ring?.[index];
  if (seg?.c !== "C") throw new Error(`expected C at ${index}, got ${seg?.c}`);
  return seg;
}

describe("roundedRectPath", () => {
  it("emits a closed subpath fully inside the unit box", () => {
    expectClosedNormalizedSubpath(roundedRectPath(0.2, 0.3));
    expectClosedNormalizedSubpath(roundedRectPath(0, 0));
    expectClosedNormalizedSubpath(roundedRectPath(0.5, 0.5));
  });

  it("degenerates to the exact four-corner rectangle when both radii are zero", () => {
    expect(roundedRectPath(0, 0)).toEqual([
      { c: "M", x: 0, y: 0 },
      { c: "L", x: 1, y: 0 },
      { c: "L", x: 1, y: 1 },
      { c: "L", x: 0, y: 1 },
      { c: "Z" },
    ]);
  });

  it("rounds each of the four corners with one cubic at typical radii", () => {
    const segs = roundedRectPath(0.1, 0.2);
    expect(segs.filter((s) => s.c === "C").length).toBe(4);
    expect(segs[0]).toEqual({ c: "M", x: 0.1, y: 0 });
    expect(segs[2]).toEqual({
      c: "C",
      x1: 0.9 + KAPPA * 0.1,
      y1: 0,
      x2: 1,
      y2: 0.2 - KAPPA * 0.2,
      x: 1,
      y: 0.2,
    });
  });

  it("clamps radii above 0.5 down to 0.5", () => {
    expect(roundedRectPath(2, 2)).toEqual(roundedRectPath(0.5, 0.5));
  });
});

describe("starPath", () => {
  it("emits a closed subpath fully inside the unit box for the caller's 3–24 point range", () => {
    for (const points of [3, 5, 12, 24]) {
      expectClosedNormalizedSubpath(starPath(points, 0.4));
    }
  });

  it("gives a 5-point star 10 vertices (one M, nine L) starting at the top point (0.5, 0)", () => {
    const segs = starPath(5, 0.5);
    const ring = vertices(segs);
    expect(ring.length).toBe(10);
    expect(segs.filter((s) => s.c === "L").length).toBe(9);
    expect(ring[0]).toEqual([0.5, 0]);
  });

  it("places odd-index vertices at innerRatio distance from the center", () => {
    const ring = vertices(starPath(5, 0.4));
    const inner = ring[1];
    expect(inner).toBeDefined();
    const [x, y] = inner ?? [Number.NaN, Number.NaN];
    expect(Math.hypot(x - 0.5, y - 0.5)).toBeCloseTo(0.5 * 0.4, 12);
  });

  it("clamps the point count up to 3", () => {
    expect(starPath(2, 0.5)).toEqual(starPath(3, 0.5));
    expect(vertices(starPath(2, 0.5)).length).toBe(6);
  });
});

describe("calloutPath", () => {
  it("emits a closed subpath for every preset", () => {
    for (const anchor of ["bottom-left", "bottom-right", "top-left", "top-right"] as const) {
      expectClosedSubpath(calloutPath(tailTipFor(anchor)));
    }
  });

  it("runs the tail out to the tip, based on the body edge it leaves by", () => {
    // Bottom-left preset: the tip is below the box, so the tail leaves by the
    // bottom edge with its base either side of where the ray crosses y = 1.
    const segs = calloutPath(tailTipFor("bottom-left"));
    const tip = tailTipFor("bottom-left");
    expect(hasVertex(segs, tip.x, tip.y)).toBe(true);
    // Four vertices sit on y = 1: the two body corners and the tail's base.
    expect(verticesOf(segs).filter((p) => p.y === 1)).toHaveLength(4);
    const base = verticesOf(segs).filter((p) => p.y === 1 && p.x > 0 && p.x < 1);
    expect(base).toHaveLength(2);
    expect(Math.abs((base[1]?.x ?? 0) - (base[0]?.x ?? 0))).toBeCloseTo(
      2 * CALLOUT_TAIL_HALF_BASE,
      9,
    );
  });

  it("leaves by whichever edge the tip faces", () => {
    const rightward = verticesOf(calloutPath({ x: 1.5, y: 0.5 }));
    expect(rightward.filter((p) => p.x === 1)).toHaveLength(4); // 2 corners + 2 base
    const upward = verticesOf(calloutPath({ x: 0.5, y: -0.5 }));
    expect(upward.filter((p) => p.y === 0)).toHaveLength(4);
  });

  it("draws the body alone when the tip is inside it — there is no tail to see", () => {
    expect(calloutPath({ x: 0.5, y: 0.6 })).toEqual(calloutPath({ x: 0.5, y: 0.5 }));
    expect(verticesOf(calloutPath({ x: 0.5, y: 0.5 }))).toHaveLength(4);
  });

  it("keeps the base on the edge it leaves by, never wrapping past a corner", () => {
    // A tail leaving hard against the bottom-right corner narrows instead of
    // spilling onto the right-hand edge.
    for (const p of verticesOf(calloutPath({ x: 1.02, y: 1.6 }))) {
      expect(p.x).toBeLessThanOrEqual(1.02);
      expect(p.y).toBeLessThanOrEqual(1.6);
    }
  });
});

describe("outlineOvershoot", () => {
  it("reports a callout's tail tip — the one point any builder puts outside its box", () => {
    expect(outlineOvershoot({ shape: "callout", tailTip: { x: 1.4, y: -0.3 } })).toEqual([
      { x: 1.4, y: -0.3 },
    ]);
    expect(outlineOvershoot({ shape: "callout" })).toEqual([tailTipFor("bottom-left")]);
  });

  it("reports nothing for every kind whose outline stays inside its box", () => {
    for (const shape of [
      "rect",
      "ellipse",
      "roundedRect",
      "starPolygon",
      "banner",
      "path",
    ] as const) {
      expect(outlineOvershoot({ shape })).toEqual([]);
    }
  });
});

describe("bannerPath", () => {
  // A ribbon-shaped frame in inches. The builder takes the frame because two
  // of its parts are round, and a round part has to be one radius normalized
  // per axis or the frame's aspect stretches it.
  const W = 4;
  const H = 1;
  const banner = (inset: number, height: number) => bannerPath(inset, height, W, H);
  const DEFAULT = () => banner(BANNER_DEFAULT_INSET, BANNER_DEFAULT_HEIGHT);

  it("emits FIVE closed subpaths — panel, two tails, two folds", () => {
    const segs = DEFAULT();
    expect(segs.filter((s) => s.c === "M")).toHaveLength(5);
    expect(segs.filter((s) => s.c === "Z")).toHaveLength(5);
    // The ribbon's internal lines are why it cannot be one ring: a single
    // silhouette has no way to draw the fold and panel-bottom strokes.
    expect(segs[0]?.c).toBe("M");
    expect(segs[segs.length - 1]?.c).toBe("Z");
  });

  it("stays inside the unit box at every setting", () => {
    for (const inset of [BANNER_INSET_MIN, BANNER_DEFAULT_INSET, BANNER_INSET_MAX]) {
      for (const height of [BANNER_HEIGHT_MIN, BANNER_DEFAULT_HEIGHT, BANNER_HEIGHT_MAX]) {
        for (const p of verticesOf(banner(inset, height))) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(1);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("insets the panel's sides by panelInset, leaving the tails either side", () => {
    const segs = banner(0.2, 0.6);
    // The panel's bottom corners sit on the inset, and the tails start there.
    expect(hasVertex(segs, 0.2, 0.6)).toBe(true);
    expect(hasVertex(segs, 0.8, 0.6)).toBe(true);
    // Each tail runs from the inset out to the frame edge, down to the bottom.
    expect(hasVertex(segs, 0.2, 1)).toBe(true);
    expect(hasVertex(segs, 0, 1)).toBe(true);
    expect(hasVertex(segs, 1, 1)).toBe(true);
  });

  it("notches each tail end the same distance in whatever the inset", () => {
    // The V bites a fixed share of the FRAME, so widening the tails turns
    // them from arrowheads into flags rather than scaling the bite with them
    // — the difference between the two reference ribbons.
    const mid = (2 - 0.6) / 2;
    for (const inset of [0.2, BANNER_INSET_MAX]) {
      const segs = banner(inset, 0.6);
      expect(hasVertexNear(segs, 0.125, mid)).toBe(true);
      expect(hasVertexNear(segs, 0.875, mid)).toBe(true);
    }
    // Floored by the tail it cuts, so the narrowest tail keeps a body.
    const narrow = banner(BANNER_INSET_MIN, 0.6);
    expect(hasVertexNear(narrow, BANNER_INSET_MIN * 0.85, mid)).toBe(true);
  });

  it("mirrors the tails' band against the panel, so a deeper panel raises it", () => {
    const shallow = banner(0.2, 0.6);
    const deep = banner(0.2, 0.85);
    expect(hasVertex(shallow, 0.2, 0.6)).toBe(true);
    expect(hasVertex(deep, 0.2, 0.85)).toBe(true);
    // Panel and band are the same height, one anchored to the top and one to
    // the bottom: they always overlap across the middle, which is what makes
    // the panel read as standing in front of the band.
    expect(hasVertexNear(shallow, 0.2, 0.4)).toBe(true);
    expect(hasVertexNear(deep, 0.2, 0.15)).toBe(true);
  });

  it("rounds the panel's top corners circularly, not stretched by the frame", () => {
    // One radius in inches, normalized per axis — a wide ribbon's corners are
    // the same arc as a square one's, where a share of the width would flatten
    // them into a dome.
    const wide = banner(0.2, 0.6);
    const start = wide[0];
    const corner = wide[1];
    if (start?.c !== "M" || corner?.c !== "C") throw new Error("panel must open with M then C");
    expect((corner.x - 0.2) * W).toBeCloseTo(start.y * H);
    // Square frame: the same radius normalizes identically on both axes.
    const square = bannerPath(0.2, 0.6, 2, 2);
    const squareStart = square[0];
    const squareCorner = square[1];
    if (squareStart?.c !== "M" || squareCorner?.c !== "C") {
      throw new Error("panel must open with M then C");
    }
    expect(squareCorner.x - 0.2).toBeCloseTo(squareStart.y);
  });

  it("runs each fold in from the panel's edge to the frame's bottom, curling only its inner corner", () => {
    const [, , , left, right] = subpaths(banner(0.2, 0.6));
    // A fixed reach in from the panel's side edge, like the notch — not a
    // share of the inset.
    const inner = 0.2 + 0.125;
    // 0.4 of the fold's own height, as one radius normalized per axis.
    const ry = 0.4 * (1 - 0.6);
    expect(left?.[0]).toEqual({ c: "M", x: 0.2, y: 0.6 });
    const top = pointAt(left, 1, "L");
    expect(top.x).toBeCloseTo(inner);
    expect(top.y).toBeCloseTo(0.6);
    // Down the inner edge, then one cubic curling onto the bottom edge.
    const shoulder = pointAt(left, 2, "L");
    expect(shoulder.x).toBeCloseTo(inner);
    expect(shoulder.y).toBeCloseTo(1 - ry);
    const curl = cubicAt(left, 3);
    expect(curl.y).toBe(1);
    expect(curl.x).toBeLessThan(inner);
    // Circular, the same treatment the panel's corners get: the corner spans
    // the same distance in inches across as it does down.
    expect((inner - curl.x) * W).toBeCloseTo((1 - shoulder.y) * H);
    // Square where it meets the tail, so the two share one bottom edge.
    expect(left?.[4]).toEqual({ c: "L", x: 0.2, y: 1 });
    expect(left?.[5]).toEqual({ c: "Z" });
    // The right fold is the mirror of it.
    expect(right?.[0]).toEqual({ c: "M", x: 0.8, y: 0.6 });
    expect(pointAt(right, 1, "L").x).toBeCloseTo(0.8 - 0.125);
    expect(cubicAt(right, 3).x).toBeGreaterThan(0.8 - 0.125);
    expect(right?.[4]).toEqual({ c: "L", x: 0.8, y: 1 });
  });

  it("clamps both parameters into their ranges", () => {
    expect(banner(-5, 0.6)).toEqual(banner(BANNER_INSET_MIN, 0.6));
    expect(banner(5, 0.6)).toEqual(banner(BANNER_INSET_MAX, 0.6));
    expect(banner(0.2, -5)).toEqual(banner(0.2, BANNER_HEIGHT_MIN));
    expect(banner(0.2, 5)).toEqual(banner(0.2, BANNER_HEIGHT_MAX));
  });
});


describe("clampCornerRadius", () => {
  it("bounds the radius at half the shorter side", () => {
    expect(clampCornerRadius(0.2, 2, 1)).toBe(0.2);
    expect(clampCornerRadius(9, 2, 1)).toBe(0.5);
    expect(clampCornerRadius(9, 1, 4)).toBe(0.5);
  });

  it("never returns a negative radius, and survives a degenerate box", () => {
    expect(clampCornerRadius(-3, 2, 2)).toBe(0);
    expect(clampCornerRadius(1, 0, 0)).toBe(0);
  });
});

describe("roundedRectPathFor", () => {
  it("normalizes one inch radius per axis, so the drawn corner stays circular", () => {
    // 0.25in of a 2×1in box is an eighth across and a quarter down — the
    // normalized pair that a 2:1 box scales back to equal radii.
    expect(roundedRectPathFor(0.25, 2, 1)).toEqual(roundedRectPath(0.125, 0.25));
  });

  it("applies the bound rather than the stored value", () => {
    expect(roundedRectPathFor(99, 2, 1)).toEqual(roundedRectPath(0.25, 0.5));
  });

  it("degenerates to the plain rectangle at radius zero", () => {
    expect(roundedRectPathFor(0, 2, 1)).toEqual(roundedRectPath(0, 0));
  });
});
