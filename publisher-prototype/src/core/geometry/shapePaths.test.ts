import { describe, expect, it } from "vitest";
import { tailTipFor, type FlowchartSymbol, type PathSeg } from "../model";
import {
  CALLOUT_TAIL_HALF_BASE,
  KAPPA,
  bannerPath,
  clampCornerRadius,
  calloutPath,
  flowchartPath,
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

describe("bannerPath", () => {
  it("emits a closed subpath fully inside the unit box", () => {
    expectClosedNormalizedSubpath(bannerPath());
  });

  it("cuts the V-notches inward to (0.15, 0.5) and (0.85, 0.5)", () => {
    const segs = bannerPath();
    expect(hasVertex(segs, 0.15, 0.5)).toBe(true);
    expect(hasVertex(segs, 0.85, 0.5)).toBe(true);
  });
});

describe("flowchartPath", () => {
  const symbols: FlowchartSymbol[] = ["process", "decision", "terminator", "data", "document"];

  it("emits a closed subpath fully inside the unit box for every symbol", () => {
    for (const symbol of symbols) {
      expectClosedNormalizedSubpath(flowchartPath(symbol));
    }
  });

  it("draws process as the exact unit rectangle", () => {
    expect(flowchartPath("process")).toEqual([
      { c: "M", x: 0, y: 0 },
      { c: "L", x: 1, y: 0 },
      { c: "L", x: 1, y: 1 },
      { c: "L", x: 0, y: 1 },
      { c: "Z" },
    ]);
  });

  it("draws decision as the exact diamond on the box midpoints", () => {
    expect(flowchartPath("decision")).toEqual([
      { c: "M", x: 0.5, y: 0 },
      { c: "L", x: 1, y: 0.5 },
      { c: "L", x: 0.5, y: 1 },
      { c: "L", x: 0, y: 0.5 },
      { c: "Z" },
    ]);
  });

  it("draws terminator as the stadium rounded rectangle (curved, via roundedRectPath)", () => {
    const segs = flowchartPath("terminator");
    expect(segs.filter((s) => s.c === "C").length).toBe(4);
    expect(segs).toEqual(roundedRectPath(0.25, 0.5));
  });

  it("draws data as the exact 0.2-skew parallelogram", () => {
    expect(flowchartPath("data")).toEqual([
      { c: "M", x: 0.2, y: 0 },
      { c: "L", x: 1, y: 0 },
      { c: "L", x: 0.8, y: 1 },
      { c: "L", x: 0, y: 1 },
      { c: "Z" },
    ]);
  });

  it("finishes document with a single wavy-bottom cubic right before Z", () => {
    const segs = flowchartPath("document");
    expect(segs.filter((s) => s.c === "C").length).toBe(1);
    expect(segs[segs.length - 2]?.c).toBe("C");
    expect(segs[segs.length - 1]?.c).toBe("Z");
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
