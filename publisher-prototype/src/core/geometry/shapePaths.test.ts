import { describe, expect, it } from "vitest";
import type { PathSeg } from "../model";
import {
  KAPPA,
  bannerPath,
  calloutPath,
  flowchartPath,
  roundedRectPath,
  starPath,
  type CalloutTailAnchor,
  type FlowchartSymbol,
} from "./shapePaths";

/**
 * Shape-tool path builder invariants: every builder emits one closed,
 * clockwise subpath (single M … Z) with all coordinates — control points
 * included — normalized inside [0, 1], and each shape's landmark vertices
 * land exactly where the tool contracts promise.
 */

/** Every builder's shared contract: starts with exactly one M, ends with Z,
 * single subpath, all coordinates (control points included) within [0, 1]. */
function expectClosedNormalizedSubpath(segs: readonly PathSeg[]): void {
  expect(segs.length).toBeGreaterThan(2);
  expect(segs[0]?.c).toBe("M");
  expect(segs[segs.length - 1]?.c).toBe("Z");
  expect(segs.filter((s) => s.c === "M").length).toBe(1);
  expect(segs.filter((s) => s.c === "Z").length).toBe(1);
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
  const anchors: CalloutTailAnchor[] = ["bottom-left", "bottom-right", "top-left", "top-right"];

  it("emits a closed subpath fully inside the unit box for every anchor", () => {
    for (const anchor of anchors) {
      expectClosedNormalizedSubpath(calloutPath(anchor));
    }
  });

  it("points the bottom-left tail tip at (0.06, 1) with the body edge on y 0.75", () => {
    const segs = calloutPath("bottom-left");
    expect(hasVertex(segs, 0.06, 1)).toBe(true);
    expect(hasVertex(segs, 1, 0.75)).toBe(true);
    expect(hasVertex(segs, 0.28, 0.75)).toBe(true);
  });

  it("points the bottom-right tail tip at (0.94, 1) with the body edge on y 0.75", () => {
    const segs = calloutPath("bottom-right");
    expect(hasVertex(segs, 0.94, 1)).toBe(true);
    expect(hasVertex(segs, 0, 0.75)).toBe(true);
    expect(hasVertex(segs, 0.72, 0.75)).toBe(true);
  });

  it("points the top-left tail tip at (0.06, 0) with the body edge on y 0.25", () => {
    const segs = calloutPath("top-left");
    expect(hasVertex(segs, 0.06, 0)).toBe(true);
    expect(hasVertex(segs, 1, 0.25)).toBe(true);
    expect(hasVertex(segs, 0.28, 0.25)).toBe(true);
  });

  it("points the top-right tail tip at (0.94, 0) with the body edge on y 0.25", () => {
    const segs = calloutPath("top-right");
    expect(hasVertex(segs, 0.94, 0)).toBe(true);
    expect(hasVertex(segs, 0, 0.25)).toBe(true);
    expect(hasVertex(segs, 0.72, 0.25)).toBe(true);
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
