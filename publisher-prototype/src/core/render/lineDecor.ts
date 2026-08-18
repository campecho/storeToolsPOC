import type { ArrowHead, ArrowHeadSize, LineDash } from "../model";

/**
 * Line decorations — portable, framework-free dash-pattern and arrowhead
 * geometry for schema-v3 line objects, shared by the Konva stage, the SVG
 * overlay, and any future preview surface. Geometry is in canonical
 * document inches; stroke widths arrive in points. Every numeric constant
 * here is a Publisher-parity guess the doc doesn't specify — see the
 * ASSUMPTION notes.
 */

export const PT_PER_IN = 72;

export type DecorPoint = { x: number; y: number };

/** ASSUMPTION: stroke widths below 0.75pt use 0.75pt for dash sizing, so
    hairlines don't produce invisible patterns — working guess for SME
    review. */
const DASH_WIDTH_FLOOR_PT = 0.75;

/** ASSUMPTION: dash pattern is 6/4 stroke widths on/off and dotted is
    1.5/3 (near-round dots with a two-width gap) — working guess for SME
    review. */
const DASHED_PATTERN = [6, 4] as const;
const DOTTED_PATTERN = [1.5, 3] as const;

/** Dash pattern in inches for a line's dash style, scaled by stroke width
    ("solid" or absent → null, no dash). */
export function dashPatternIn(dash: LineDash | undefined, strokeWidthPt: number): number[] | null {
  if (dash === undefined || dash === "solid") return null;
  const w = Math.max(strokeWidthPt, DASH_WIDTH_FLOOR_PT) / PT_PER_IN;
  const pattern = dash === "dashed" ? DASHED_PATTERN : DOTTED_PATTERN;
  return pattern.map((k) => k * w);
}

/** ASSUMPTION: arrowhead base lengths of 0.09/0.14/0.2 inches for s/m/l —
    working guess for SME review. */
const HEAD_BASE_IN: Record<ArrowHeadSize, number> = { s: 0.09, m: 0.14, l: 0.2 };

/** Arrowhead length in inches: the size's base length (absent means medium,
    per the schema's additive rule) plus one stroke width, so heavier lines
    get proportionally bigger heads.

    ASSUMPTION: the width term is exactly one stroke width — working guess
    for SME review. */
export function headLengthIn(size: ArrowHeadSize | undefined, strokeWidthPt: number): number {
  return HEAD_BASE_IN[size ?? "m"] + strokeWidthPt / PT_PER_IN;
}

export type ArrowheadShape =
  | { kind: "polygon"; points: DecorPoint[] }
  | { kind: "circle"; center: DecorPoint; radius: number };

/** ASSUMPTION: arrow half-width is 0.4 of head length, diamond half-width
    0.35, circle radius 0.3 — working guesses for SME review. */
const ARROW_HALF_WIDTH = 0.4;
const DIAMOND_HALF_WIDTH = 0.35;
const CIRCLE_RADIUS = 0.3;

/** Arrowhead geometry in inches at a line endpoint. `angle` is the
    direction the head points, in radians — the direction from the line's
    other endpoint toward `tip`. Absent or "none" → null, no head. */
export function arrowheadShape(
  head: ArrowHead | undefined,
  tip: DecorPoint,
  angle: number,
  lengthIn: number,
): ArrowheadShape | null {
  if (head === undefined || head === "none") return null;
  if (head === "circle") {
    return { kind: "circle", center: tip, radius: CIRCLE_RADIUS * lengthIn };
  }
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  // tip − k·dir + j·perp, with dir = (cos angle, sin angle) and
  // perp = (−sin angle, cos angle).
  const at = (k: number, j: number): DecorPoint => ({
    x: tip.x - k * cosA - j * sinA,
    y: tip.y - k * sinA + j * cosA,
  });
  const len = lengthIn;
  if (head === "arrow") {
    return {
      kind: "polygon",
      points: [tip, at(len, ARROW_HALF_WIDTH * len), at(len, -ARROW_HALF_WIDTH * len)],
    };
  }
  return {
    kind: "polygon",
    points: [
      tip,
      at(0.5 * len, DIAMOND_HALF_WIDTH * len),
      at(len, 0),
      at(0.5 * len, -DIAMOND_HALF_WIDTH * len),
    ],
  };
}
