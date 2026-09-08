import { describe, expect, it } from "vitest";
import type { PathSeg } from "../model";
import { pathBounds } from "./geometry";

/**
 * Pure path geometry (PLAN.md §5 testing note): `pathBounds` is what a drawn
 * path's frame box is measured with, so these cases pin the property that
 * matters — the box is the box the INK occupies, never the box its control
 * points span.
 */

function expectRect(
  actual: ReturnType<typeof pathBounds>,
  expected: { x: number; y: number; w: number; h: number },
): void {
  if (actual === null) throw new Error("expected bounds");
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
  expect(actual.w).toBeCloseTo(expected.w, 10);
  expect(actual.h).toBeCloseTo(expected.h, 10);
}

describe("pathBounds", () => {
  it("bounds straight segments by their points", () => {
    const segs: PathSeg[] = [
      { c: "M", x: 1, y: 3 },
      { c: "L", x: 4, y: 3 },
      { c: "L", x: 4, y: 7 },
    ];
    expectRect(pathBounds(segs), { x: 1, y: 3, w: 3, h: 4 });
  });

  it("hugs an arch's ink, which reaches exactly three quarters of the way to its handles", () => {
    // The canonical case: both handles pulled 1 above the baseline, and the
    // curve crests at 0.75. Hulling the controls would claim a box a third
    // taller than the shape.
    const arch: PathSeg[] = [
      { c: "M", x: 0, y: 0 },
      { c: "C", x1: 0, y1: -1, x2: 1, y2: -1, x: 1, y: 0 },
    ];
    expectRect(pathBounds(arch), { x: 0, y: -0.75, w: 1, h: 0.75 });
  });

  it("takes endpoints alone when a cubic never turns inside the segment", () => {
    // Monotone in both axes: the extrema are the endpoints, and the interior
    // solver contributes nothing.
    const monotone: PathSeg[] = [
      { c: "M", x: 0, y: 0 },
      { c: "C", x1: 1, y1: 1, x2: 2, y2: 2, x: 3, y: 3 },
    ];
    expectRect(pathBounds(monotone), { x: 0, y: 0, w: 3, h: 3 });
  });

  it("solves the degenerate quadratic — a cubic whose axis accelerates uniformly still turns", () => {
    // x: p0=0 p1=2 p2=2 p3=0 makes the cubic term vanish (a === 0), leaving a
    // linear derivative whose single root is the turn at t = 1/2, x = 1.5.
    const flatA: PathSeg[] = [
      { c: "M", x: 0, y: 0 },
      { c: "C", x1: 2, y1: 0, x2: 2, y2: 0, x: 0, y: 0 },
    ];
    expectRect(pathBounds(flatA), { x: 0, y: 0, w: 1.5, h: 0 });
  });

  it("adds nothing for Z — the closing line joins two points already counted", () => {
    const open: PathSeg[] = [
      { c: "M", x: 0, y: 0 },
      { c: "L", x: 2, y: 0 },
      { c: "L", x: 2, y: 2 },
    ];
    expectRect(pathBounds(open), { x: 0, y: 0, w: 2, h: 2 });
    expectRect(pathBounds([...open, { c: "Z" }]), { x: 0, y: 0, w: 2, h: 2 });
  });

  it("is null for a path with no points", () => {
    expect(pathBounds([])).toBeNull();
    expect(pathBounds([{ c: "Z" }])).toBeNull();
  });
});
