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
  bannerShading,
  shapeShading,
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

/** Every ON-CURVE point of a path: the M/L vertices plus the endpoint of each
    cubic. The banner's wrap begins and ends on cubics, so its landmarks live
    here rather than in `vertices`. */
function hasAnchor(segs: readonly PathSeg[], x: number, y: number): boolean {
  return segs
    .filter((s): s is Exclude<PathSeg, { c: "Z" }> => s.c !== "Z")
    .some((s) => Math.abs(s.x - x) < 1e-9 && Math.abs(s.y - y) < 1e-9);
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

// A ribbon-shaped frame in inches. The builders take the frame because the
// plate's corners are round, and a round corner has to be one radius
// normalized per axis or the frame's aspect stretches it.
const W = 4;
const H = 1;
const banner = (inset: number, height: number) => bannerPath(inset, height, W, H);
const folds = (inset: number, height: number) => bannerShading(inset, height, W, H);

/** Where the left tail stops, having wrapped under the plate by one fold. */
const INNER = 0.2 + 0.125;

/** The wrap's two radii at inset 0.2 / height 0.6: a fixed share of the fold's
    length across, a quarter of the drop below the plate down. The plate's
    bottom corner, the fold's cap and the tail's inner bottom all turn through
    them, which is what makes the wrap one curve. */
const CAP_X = 0.125 * 0.18;
const CAP_Y = (1 - 0.6) / 4;

describe("bannerPath", () => {
  const DEFAULT = () => banner(BANNER_DEFAULT_INSET, BANNER_DEFAULT_HEIGHT);

  it("emits THREE closed subpaths — the centre plate and two side tails", () => {
    const segs = DEFAULT();
    expect(segs.filter((s) => s.c === "M")).toHaveLength(3);
    expect(segs.filter((s) => s.c === "Z")).toHaveLength(3);
    // The ribbon's internal lines are why it cannot be one ring: a single
    // silhouette has no way to draw the plate's edges where it crosses a tail.
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

  it("insets the plate's sides by panelInset, leaving the tails either side", () => {
    const segs = banner(0.2, 0.6);
    // The plate's sides run down the inset. They do not STOP at its bottom
    // edge — they carry on to the centre of the wrap, half a fold lower.
    expect(hasAnchor(segs, 0.2, 0.6 + CAP_Y)).toBe(true);
    expect(hasAnchor(segs, 0.8, 0.6 + CAP_Y)).toBe(true);
    // Each tail runs from the plate's side out to the frame edge and down.
    expect(hasVertex(segs, 0.2, 1 - 0.6)).toBe(true);
    expect(hasVertex(segs, 0, 1)).toBe(true);
    expect(hasVertex(segs, 1, 1)).toBe(true);
  });

  it("turns the plate's bottom corners into the wrap rather than squaring them", () => {
    // The whole reason the wrap reads as one curve: the bottom edge stops one
    // cap short of the side, turns down through a quarter ellipse, and meets
    // the side edge half a fold below. Square that corner off and a hard line
    // cuts across the top of the fold.
    const plate = subpaths(banner(0.2, 0.6))[0];
    expect(hasAnchor(plate ?? [], 0.2, 0.6)).toBe(false);
    expect(hasAnchor(plate ?? [], 0.2 + CAP_X, 0.6)).toBe(true);
    expect(hasAnchor(plate ?? [], 0.2, 0.6 + CAP_Y)).toBe(true);
    // Both bottom corners turn, and nothing else on the plate does.
    expect(plate?.filter((s) => s.c === "C")).toHaveLength(4);
  });

  it("TILES rather than overlaps: each tail wraps under the plate by one fold", () => {
    const [plate, left, right] = subpaths(banner(0.2, 0.6));
    // Plate and tail meet along the plate's side edge and its bottom edge —
    // the tail turns at both corners the plate owns, so the two share edges
    // and neither covers the other. Hit testing walks this outline even-odd,
    // and an overlap would punch itself out as a hole.
    expect(hasAnchor(plate ?? [], 0.2, 0.6 + CAP_Y)).toBe(true);
    expect(hasVertex(left ?? [], 0.2, 1 - 0.6)).toBe(true);
    expect(hasAnchor(left ?? [], 0.2, 0.6 + CAP_Y)).toBe(true);
    // …then reaches in exactly one fold's width past the plate's edge.
    expect(hasVertexNear(left ?? [], INNER, 0.6)).toBe(true);
    expect(hasVertexNear(right ?? [], 1 - INNER, 0.6)).toBe(true);
    // Below the plate the middle of the frame is empty: nothing reaches past
    // the fold, which is what stops the ribbon reading as one flat band.
    for (const p of verticesOf(banner(0.2, 0.6))) {
      if (p.y > 0.6) expect(p.x < INNER + 1e-9 || p.x > 1 - INNER - 1e-9).toBe(true);
    }
  });

  it("notches each tail end the same distance in whatever the inset", () => {
    // The V bites a fixed share of the FRAME, so widening the tails turns
    // them from arrowheads into swallowtails rather than scaling the bite
    // with them — the difference between the reference ribbons.
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

  it("mirrors the tails' band against the plate, so a deeper plate raises it", () => {
    const shallow = banner(0.2, 0.6);
    const deep = banner(0.2, 0.85);
    expect(hasAnchor(shallow, 0.2 + CAP_X, 0.6)).toBe(true);
    expect(hasAnchor(deep, 0.2 + CAP_X, 0.85)).toBe(true);
    // Plate and band are the same height, one anchored to the top and one to
    // the bottom: they always overlap across the middle, which is what makes
    // the plate read as standing in front of the band.
    expect(hasVertexNear(shallow, 0.2, 0.4)).toBe(true);
    expect(hasVertexNear(deep, 0.2, 0.15)).toBe(true);
  });

  it("curves the plate's top corners down circularly, not stretched by the frame", () => {
    // One radius in inches, normalized per axis — a wide ribbon's corners are
    // the same arc as a square one's, where a share of the width would flatten
    // them into a dome.
    const wide = banner(0.2, 0.6);
    const start = pointAt(subpaths(wide)[0], 0, "M");
    const corner = cubicAt(subpaths(wide)[0], 1);
    expect((corner.x - 0.2) * W).toBeCloseTo(start.y * H);
    // Square frame: the same radius normalizes identically on both axes.
    const square = subpaths(bannerPath(0.2, 0.6, 2, 2))[0];
    expect(cubicAt(square, 1).x - 0.2).toBeCloseTo(pointAt(square, 0, "M").y);
  });

  it("clamps both parameters into their ranges", () => {
    expect(banner(-5, 0.6)).toEqual(banner(BANNER_INSET_MIN, 0.6));
    expect(banner(5, 0.6)).toEqual(banner(BANNER_INSET_MAX, 0.6));
    expect(banner(0.2, -5)).toEqual(banner(0.2, BANNER_HEIGHT_MIN));
    expect(banner(0.2, 5)).toEqual(banner(0.2, BANNER_HEIGHT_MAX));
  });
});

describe("bannerShading", () => {
  it("emits one closed ring per fold", () => {
    const segs = folds(0.2, 0.6);
    expect(segs.filter((s) => s.c === "M")).toHaveLength(2);
    expect(segs.filter((s) => s.c === "Z")).toHaveLength(2);
  });

  it("hangs each fold off the plate's bottom edge, reaching the tail's inner end", () => {
    const [left, right] = subpaths(folds(0.2, 0.6));
    // Half the space between the plate's bottom edge and the frame's, so the
    // tail stays visible below the fold rather than the fold filling the gap.
    const bottom = 0.6 + (1 - 0.6) * 0.5;
    expect(hasVertexNear(left ?? [], INNER, 0.6)).toBe(true);
    expect(hasAnchor(left ?? [], INNER - CAP_X, bottom)).toBe(true);
    expect(hasVertexNear(right ?? [], 1 - INNER, 0.6)).toBe(true);
    expect(hasAnchor(right ?? [], 1 - INNER + CAP_X, bottom)).toBe(true);
    expect(bottom).toBeLessThan(1);
  });

  it("closes the fold onto the tail's own rise, so the two meet in a cusp", () => {
    // The underside descends to exactly the height the tail's bottom corner
    // rises to, leaving no straight edge between two corners — arithmetic,
    // not luck: capY is a quarter of the drop below the plate.
    const [left, right] = subpaths(folds(0.2, 0.6));
    expect(hasAnchor(left ?? [], INNER, 1 - CAP_Y)).toBe(true);
    expect(hasAnchor(right ?? [], 1 - INNER, 1 - CAP_Y)).toBe(true);
    // The tail turns up to the same point, off the same radii.
    const tail = subpaths(banner(0.2, 0.6))[1];
    expect(hasAnchor(tail ?? [], INNER, 1 - CAP_Y)).toBe(true);
  });

  it("sits wholly inside the silhouette, so bounds and hit testing never see it", () => {
    // The folds are shading, not geometry: every coordinate lies within the
    // stretch of tail that already covers that ground — below the plate's
    // bottom edge, and between the plate's side and the tail's inner end.
    for (const inset of [BANNER_INSET_MIN, BANNER_DEFAULT_INSET, BANNER_INSET_MAX]) {
      for (const height of [BANNER_HEIGHT_MIN, BANNER_DEFAULT_HEIGHT, BANNER_HEIGHT_MAX]) {
        const inner = inset + 0.125;
        for (const p of verticesOf(folds(inset, height))) {
          expect(p.y).toBeGreaterThanOrEqual(height - 1e-9);
          expect(p.y).toBeLessThanOrEqual(1);
          const inLeft = p.x >= inset - 1e-9 && p.x <= inner + 1e-9;
          const inRight = p.x >= 1 - inner - 1e-9 && p.x <= 1 - inset + 1e-9;
          expect(inLeft || inRight).toBe(true);
        }
      }
    }
  });

  it("caps the outer end of each fold where it turns around the plate's edge", () => {
    const [left, right] = subpaths(folds(0.2, 0.6));
    // Three cubics per fold: the cap's two quarters, and the turn onto the
    // tail at the inner end.
    expect(left?.filter((s) => s.c === "C")).toHaveLength(3);
    expect(right?.filter((s) => s.c === "C")).toHaveLength(3);
    // The cap turns about the plate's own side edge, reaching it and no
    // further, at the centre of the wrap.
    expect(hasAnchor(left ?? [], 0.2, 0.6 + CAP_Y)).toBe(true);
    expect(hasAnchor(right ?? [], 0.8, 0.6 + CAP_Y)).toBe(true);
  });
});

describe("shapeShading", () => {
  it("gives the banner its folds", () => {
    expect(shapeShading({ shape: "banner" }, 4, 1)).toEqual(
      bannerShading(BANNER_DEFAULT_INSET, BANNER_DEFAULT_HEIGHT, 4, 1),
    );
  });

  it("gives every other kind nothing — one tone is the whole shape", () => {
    for (const shape of [
      "rect",
      "ellipse",
      "roundedRect",
      "starPolygon",
      "callout",
      "path",
    ] as const) {
      expect(shapeShading({ shape }, 4, 1)).toEqual([]);
    }
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
