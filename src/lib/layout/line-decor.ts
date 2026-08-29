import type { ArrowHead, ArrowHeadSize, LineDash } from "@/schema";
import { DPI } from "./geometry";

/**
 * Line decorations — framework-free dash-pattern and arrowhead geometry for
 * line objects, merged from the publisher prototype
 * (publisher-prototype/src/core/render/lineDecor.ts). Geometry is in
 * canonical document inches. One unit adaptation from the prototype: stroke
 * widths arrive in this app's px-at-zoom-1 (1px = 1/96 in) rather than
 * points; the prototype's 0.75 pt dash floor is exactly 1 px, so the
 * numeric behavior carries over unchanged. Every numeric constant is a
 * Publisher-parity guess carried from the prototype's ASSUMPTION notes.
 */

export type DecorPoint = { x: number; y: number };

/** Stroke widths below 1px use 1px for dash sizing, so hairlines don't
    produce invisible patterns. */
const DASH_WIDTH_FLOOR_PX = 1;

/** Dash pattern is 6/4 stroke widths on/off; dotted is 1.5/3 (near-round
    dots with a two-width gap). */
const DASHED_PATTERN = [6, 4] as const;
const DOTTED_PATTERN = [1.5, 3] as const;

/** Dash pattern in inches for a line's dash style, scaled by stroke width
    ("solid" or absent → null, no dash). */
export function dashPatternIn(dash: LineDash | undefined, strokeWidthPx: number): number[] | null {
  if (dash === undefined || dash === "solid") return null;
  const w = Math.max(strokeWidthPx, DASH_WIDTH_FLOOR_PX) / DPI;
  const pattern = dash === "dashed" ? DASHED_PATTERN : DOTTED_PATTERN;
  return pattern.map((k) => k * w);
}

/** Arrowhead base lengths in inches for s/m/l. */
const HEAD_BASE_IN: Record<ArrowHeadSize, number> = { s: 0.09, m: 0.14, l: 0.2 };

/** Arrowhead length in inches: the size's base length (absent means medium,
    per the schema's additive rule) plus one stroke width, so heavier lines
    get proportionally bigger heads. */
export function headLengthIn(size: ArrowHeadSize | undefined, strokeWidthPx: number): number {
  return HEAD_BASE_IN[size ?? "m"] + strokeWidthPx / DPI;
}

export type ArrowheadShape =
  | { kind: "polygon"; points: DecorPoint[] }
  | { kind: "circle"; center: DecorPoint; radius: number };

/** Arrow half-width is 0.4 of head length, diamond half-width 0.35, circle
    radius 0.3. */
const ARROW_HALF_WIDTH = 0.4;
const DIAMOND_HALF_WIDTH = 0.35;
const CIRCLE_RADIUS = 0.3;

/** Where the diamond reaches its full width, as a fraction of head length —
    halfway, which makes it symmetric about that waist. */
const DIAMOND_WAIST = 0.5;

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
      at(DIAMOND_WAIST * len, DIAMOND_HALF_WIDTH * len),
      at(len, 0),
      at(DIAMOND_WAIST * len, -DIAMOND_HALF_WIDTH * len),
    ],
  };
}

/**
 * How far behind the tip the stroke has to stop: the first point going back
 * from the tip where the head is wide enough to cover the stroke's end.
 *
 * A head narrows to a POINT at the tip while the stroke keeps its full width
 * right up to it, so a segment drawn to the endpoint spills out either side of
 * that point instead of meeting the head. The arrow's cover is its back edge,
 * one whole head length in. The diamond's is its WAIST, not its rear vertex —
 * that vertex is another point, and stopping there would leave a wedge of gap
 * either side of the stroke's square end. A circle is centred ON the tip and
 * covers the end from every direction, so it asks for nothing.
 */
export function headInsetIn(head: ArrowHead | undefined, lengthIn: number): number {
  if (head === "arrow") return lengthIn;
  return head === "diamond" ? DIAMOND_WAIST * lengthIn : 0;
}

/** The segment a decorated line actually draws: each end pulled in by what
    its head covers. Heads longer than the line between them would cross over
    and draw it backwards, so they scale down together to meet at one point —
    the line vanishes under its own heads rather than reversing. */
export function trimmedSegment(
  p1: DecorPoint,
  p2: DecorPoint,
  startInset: number,
  endInset: number,
): [DecorPoint, DecorPoint] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  const total = startInset + endInset;
  if (length === 0 || total === 0) return [p1, p2];
  const scale = total > length ? length / total : 1;
  const start = (startInset * scale) / length;
  const end = (endInset * scale) / length;
  return [
    { x: p1.x + dx * start, y: p1.y + dy * start },
    { x: p2.x - dx * end, y: p2.y - dy * end },
  ];
}
