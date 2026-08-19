import { describe, expect, it } from "vitest";
import {
  PT_PER_IN,
  arrowheadShape,
  dashPatternIn,
  headInsetIn,
  headLengthIn,
  trimmedSegment,
  type ArrowheadShape,
  type DecorPoint,
} from "./lineDecor";

/**
 * Line decorations: dash patterns scale with stroke width (floored at
 * 0.75pt so hairlines stay visible), arrowhead length is a per-size base
 * plus one stroke width, and arrowhead geometry is built from the head's
 * pointing direction at the tip. All constants are Publisher-parity
 * guesses pending SME review — the tests pin them down exactly.
 */

function expectPointsCloseTo(actual: DecorPoint[], expected: DecorPoint[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((p, i) => {
    const q = expected[i] as DecorPoint;
    expect(p.x).toBeCloseTo(q.x, 10);
    expect(p.y).toBeCloseTo(q.y, 10);
  });
}

function polygonPoints(shape: ArrowheadShape | null): DecorPoint[] {
  if (shape?.kind !== "polygon") throw new Error("expected a polygon shape");
  return shape.points;
}

describe("dashPatternIn", () => {
  it("returns null for solid and absent dash styles", () => {
    expect(dashPatternIn("solid", 3)).toBeNull();
    expect(dashPatternIn(undefined, 3)).toBeNull();
  });

  it("scales the dashed pattern by stroke width in inches", () => {
    const w = 3 / PT_PER_IN;
    expect(dashPatternIn("dashed", 3)).toEqual([6 * w, 4 * w]);
  });

  it("scales the dotted pattern by stroke width in inches", () => {
    const w = 3 / PT_PER_IN;
    expect(dashPatternIn("dotted", 3)).toEqual([1.5 * w, 3 * w]);
  });

  it("floors the stroke width at 0.75pt so hairlines stay visible", () => {
    expect(dashPatternIn("dashed", 0.1)).toEqual(dashPatternIn("dashed", 0.75));
  });
});

describe("headLengthIn", () => {
  it("returns each size's base length at zero stroke width", () => {
    expect(headLengthIn("s", 0)).toBe(0.09);
    expect(headLengthIn("m", 0)).toBe(0.14);
    expect(headLengthIn("l", 0)).toBe(0.2);
  });

  it("treats an absent size as medium, per the schema's additive rule", () => {
    expect(headLengthIn(undefined, 0)).toBe(headLengthIn("m", 0));
    expect(headLengthIn(undefined, 4)).toBe(headLengthIn("m", 4));
  });

  it("adds one stroke width in inches to the base", () => {
    expect(headLengthIn("m", 7.2)).toBeCloseTo(0.14 + 0.1, 10);
  });
});

describe("arrowheadShape", () => {
  const tip: DecorPoint = { x: 2, y: 1 };

  it("returns null for none and absent heads", () => {
    expect(arrowheadShape("none", tip, 0, 0.1)).toBeNull();
    expect(arrowheadShape(undefined, tip, 0, 0.1)).toBeNull();
  });

  it("builds a rightward arrow as a closed triangle behind the tip", () => {
    const shape = arrowheadShape("arrow", tip, 0, 0.1);
    expectPointsCloseTo(polygonPoints(shape), [
      { x: 2, y: 1 },
      { x: 1.9, y: 1.04 },
      { x: 1.9, y: 0.96 },
    ]);
  });

  it("builds a rightward diamond as a four-point polygon behind the tip", () => {
    const shape = arrowheadShape("diamond", tip, 0, 0.1);
    expectPointsCloseTo(polygonPoints(shape), [
      { x: 2, y: 1 },
      { x: 1.95, y: 1.035 },
      { x: 1.9, y: 1 },
      { x: 1.95, y: 0.965 },
    ]);
  });

  it("builds a circle head centered on the tip at 0.3 of the head length", () => {
    const shape = arrowheadShape("circle", tip, 0, 0.1);
    if (shape?.kind !== "circle") throw new Error("expected a circle shape");
    expect(shape.center.x).toBeCloseTo(2, 10);
    expect(shape.center.y).toBeCloseTo(1, 10);
    expect(shape.radius).toBeCloseTo(0.03, 10);
  });

  it("rotates the arrow with the pointing angle", () => {
    const shape = arrowheadShape("arrow", { x: 0, y: 0 }, Math.PI / 2, 0.1);
    expectPointsCloseTo(polygonPoints(shape), [
      { x: 0, y: 0 },
      { x: -0.04, y: -0.1 },
      { x: 0.04, y: -0.1 },
    ]);
  });

  it("starts every polygon at the exact tip value", () => {
    for (const head of ["arrow", "diamond"] as const) {
      expect(polygonPoints(arrowheadShape(head, tip, 0.7, 0.12))[0]).toBe(tip);
    }
  });
});

describe("headInsetIn", () => {
  it("stops the stroke at the arrow's back edge, one whole head length in", () => {
    expect(headInsetIn("arrow", 0.12)).toBe(0.12);
  });

  it("stops the stroke at the diamond's waist, not its rear vertex", () => {
    // The rear vertex is a point like the tip is: ending there would leave a
    // wedge of gap either side of the stroke's square end. The waist is the
    // first place going back that is wide enough to cover it.
    expect(headInsetIn("diamond", 0.12)).toBeCloseTo(0.06, 10);
    const waist = polygonPoints(arrowheadShape("diamond", { x: 0, y: 0 }, 0, 0.12))[1];
    expect(headInsetIn("diamond", 0.12)).toBeCloseTo(-(waist as DecorPoint).x, 10);
  });

  it("asks for nothing where nothing covers the stroke's end", () => {
    // The circle is centred ON the tip, so it hides the stroke end already.
    expect(headInsetIn("circle", 0.12)).toBe(0);
    expect(headInsetIn("none", 0.12)).toBe(0);
    expect(headInsetIn(undefined, 0.12)).toBe(0);
  });
});

describe("trimmedSegment", () => {
  const p1: DecorPoint = { x: 1, y: 2 };
  const p2: DecorPoint = { x: 5, y: 2 };

  it("returns the segment untouched when neither end asks for room", () => {
    expect(trimmedSegment(p1, p2, 0, 0)).toEqual([p1, p2]);
  });

  it("pulls each end in by its own inset, along the line", () => {
    expectPointsCloseTo(trimmedSegment(p1, p2, 0.5, 1.5), [
      { x: 1.5, y: 2 },
      { x: 3.5, y: 2 },
    ]);
  });

  it("measures the inset in inches whatever the line's direction", () => {
    // A 3-4-5 diagonal: trimming 1 inch off the start moves it 0.6/0.8.
    const [from] = trimmedSegment({ x: 0, y: 0 }, { x: 3, y: 4 }, 1, 0);
    expect(Math.hypot(from.x, from.y)).toBeCloseTo(1, 10);
  });

  it("collapses to one point rather than reversing when the heads are longer than the line", () => {
    // Both insets scale down together, so the line vanishes under its heads
    // instead of being drawn backwards through them.
    const [from, to] = trimmedSegment(p1, p2, 6, 2);
    expectPointsCloseTo([from, to], [
      { x: 4, y: 2 },
      { x: 4, y: 2 },
    ]);
  });

  it("leaves a zero-length line alone, having no direction to trim along", () => {
    expect(trimmedSegment(p1, p1, 0.5, 0.5)).toEqual([p1, p1]);
  });
});
