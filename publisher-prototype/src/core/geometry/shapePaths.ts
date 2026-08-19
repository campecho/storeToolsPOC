import {
  tailTipFor,
  type FlowchartSymbol,
  type NormalizedPoint,
  type PathSeg,
  type ShapeObject,
} from "../model";

/**
 * Path builders for the Phase B shape tools (PLAN.md §4.4) — rounded
 * rectangle, star/polygon, callout, banner, flowchart. Framework-free pure
 * geometry: every builder returns one closed subpath (a single M … Z) whose
 * coordinates — on-curve and control points alike — are normalized 0–1
 * within the object's frame box, per the schema's path rule, so move/resize
 * tooling works on x/y/w/h unchanged and render/hit-test consume the
 * segments as-is. Shapes are baked from tool options at draw time; storing
 * the parameters instead (true parametric shapes) is a recorded deferral in
 * SEAMS.md.
 */

/**
 * Cubic arc-approximation constant: control-point offset that makes one
 * cubic Bézier best fit a quarter circle, 4·(√2 − 1)/3.
 */
export const KAPPA = 0.5522847498307936;

/** Snap values within 1e-12 of the landmark coordinates 0, 0.5, 1 to those
 * exact values, so vertex positions computed via trig assert exactly. */
function snapLandmarks(v: number): number {
  for (const target of [0, 0.5, 1]) {
    if (Math.abs(v - target) < 1e-12) return target;
  }
  return v;
}

type Vertex = { x: number; y: number };

/** Rebuild a straight-edged closed subpath from a vertex ring: first vertex
 * becomes M, the rest L, then Z. */
function ringToPath(ring: readonly Vertex[]): PathSeg[] {
  return [
    ...ring.map((v, i): PathSeg => ({ c: i === 0 ? "M" : "L", x: v.x, y: v.y })),
    { c: "Z" },
  ];
}

/**
 * Rounded rectangle traced clockwise from the top edge, corners as
 * quarter-circle cubics (KAPPA). `rx`/`ry` are normalized corner radii; the
 * caller clamps to [0, 0.5] already, but clamp again defensively. Both radii
 * zero degenerates to the plain rectangle.
 */
export function roundedRectPath(rx: number, ry: number): PathSeg[] {
  const cx = Math.min(Math.max(rx, 0), 0.5);
  const cy = Math.min(Math.max(ry, 0), 0.5);
  if (cx === 0 && cy === 0) {
    return ringToPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
  }
  const kx = KAPPA * cx;
  const ky = KAPPA * cy;
  return [
    { c: "M", x: cx, y: 0 },
    { c: "L", x: 1 - cx, y: 0 },
    { c: "C", x1: 1 - cx + kx, y1: 0, x2: 1, y2: cy - ky, x: 1, y: cy },
    { c: "L", x: 1, y: 1 - cy },
    { c: "C", x1: 1, y1: 1 - cy + ky, x2: 1 - cx + kx, y2: 1, x: 1 - cx, y: 1 },
    { c: "L", x: cx, y: 1 },
    { c: "C", x1: cx - kx, y1: 1, x2: 0, y2: 1 - cy + ky, x: 0, y: 1 - cy },
    { c: "L", x: 0, y: cy },
    { c: "C", x1: 0, y1: cy - ky, x2: cx - kx, y2: 0, x: cx, y: 0 },
    { c: "Z" },
  ];
}

/**
 * The corner radius a box can actually draw: inches, clamped to the
 * geometric bound of half the shorter side (the roundedRect contract's
 * runtime clamp). The STORED radius is deliberately not clamped — a resize
 * can shrink a frame under a radius the user set — so this is applied at
 * every point of use and growing the frame back restores the full radius.
 */
export function clampCornerRadius(radiusIn: number, w: number, h: number): number {
  const bound = Math.max(Math.min(w, h) / 2, 0);
  return Math.min(Math.max(radiusIn, 0), bound);
}

/** A rounded rect's outline in unit-box space: one inch radius normalized
    per axis, so it stays a circular arc once the box scales it back. */
export function roundedRectPathFor(radiusIn: number, w: number, h: number): PathSeg[] {
  const r = clampCornerRadius(radiusIn, w, h);
  return roundedRectPath(w > 0 ? r / w : 0, h > 0 ? r / h : 0);
}

/**
 * Star inscribed in the unit box: 2·points vertices alternating between the
 * outer radius (1) and `innerRatio`, starting from the top point at
 * (0.5, 0) and proceeding clockwise. `points` floors and clamps to at least
 * 3; `innerRatio` clamps to [0.05, 0.95].
 */
export function starPath(points: number, innerRatio: number): PathSeg[] {
  const n = Math.max(3, Math.floor(points));
  const ratio = Math.min(Math.max(innerRatio, 0.05), 0.95);
  const ring: Vertex[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = ((-90 + i * (180 / n)) * Math.PI) / 180;
    const r = i % 2 === 0 ? 1 : ratio;
    ring.push({
      x: snapLandmarks(0.5 + 0.5 * r * Math.cos(a)),
      y: snapLandmarks(0.5 + 0.5 * r * Math.sin(a)),
    });
  }
  return ringToPath(ring);
}



/**
 * How wide the tail's base sits on the body edge, as a fraction of the unit
 * box, measured either side of where the tail leaves. ASSUMPTION: 0.09 keeps
 * the base close to the proportions the fixed four-corner callout drew —
 * eyeballed from Publisher, working guess for SME review.
 */
export const CALLOUT_TAIL_HALF_BASE = 0.09;

/** How far outside the frame the tip may be dragged, in box lengths. The tip
    is deliberately allowed OUT of the box — that is what gives the tail real
    length — but not so far that its handle leaves the page. */
export const CALLOUT_TIP_MIN = -1;
export const CALLOUT_TIP_MAX = 2;

export function clampCalloutTip(tip: NormalizedPoint): NormalizedPoint {
  const axis = (v: number) => Math.min(CALLOUT_TIP_MAX, Math.max(CALLOUT_TIP_MIN, v));
  return { x: axis(tip.x), y: axis(tip.y) };
}

/** The unit-box corners the body ring walks, in order: tl, tr, br, bl. Edge i
    runs from corner i to corner i+1, so inserting the tail after corner i
    keeps the ring wound the way it started. */
const BODY_CORNERS: NormalizedPoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Unit vector along edge i, in the ring's direction. */
const EDGE_DIRECTION: NormalizedPoint[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

/**
 * Where a tail aimed at `tip` leaves the body, and along which edge — the ray
 * from the body's centre, stopped at the first side it crosses. Null when the
 * tip is inside the body (or at its centre): there is no tail to draw, and a
 * ray with nowhere to go would divide by zero.
 */
function tailExit(tip: NormalizedPoint): { point: NormalizedPoint; edge: number } | null {
  const dx = tip.x - 0.5;
  const dy = tip.y - 0.5;
  const toX = dx === 0 ? Infinity : 0.5 / Math.abs(dx);
  const toY = dy === 0 ? Infinity : 0.5 / Math.abs(dy);
  const t = Math.min(toX, toY);
  if (!Number.isFinite(t) || t >= 1) return null;
  return {
    point: { x: 0.5 + dx * t, y: 0.5 + dy * t },
    edge: toX <= toY ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0,
  };
}

/**
 * Speech callout: a rectangular body filling the frame, with a triangular
 * pointer running from a fixed-width base on the body edge out to `tip`.
 * Dragging the tip changes the tail's LENGTH and ANGLE together, PowerPoint's
 * behaviour, rather than snapping it to one of four corners.
 *
 * The tip is in unit-box coordinates and normally sits OUTSIDE the box, which
 * is what gives the tail length to have. The body ring is the frame, so the
 * selection frame hugs the body and the tail extends past it — again as
 * PowerPoint does. A tip inside the body draws no tail at all.
 */
export function calloutPath(tip: NormalizedPoint): PathSeg[] {
  const exit = tailExit(tip);
  if (exit === null) return ringToPath(BODY_CORNERS);
  const u = EDGE_DIRECTION[exit.edge] ?? { x: 1, y: 0 };
  // The base spans the edge either side of the exit, never past its corners —
  // a tail leaving near a corner narrows rather than wrapping onto the
  // neighbouring side.
  const clamped = (v: number) => Math.min(1, Math.max(0, v));
  const base = (sign: number): NormalizedPoint => ({
    x: clamped(exit.point.x + sign * u.x * CALLOUT_TAIL_HALF_BASE),
    y: clamped(exit.point.y + sign * u.y * CALLOUT_TAIL_HALF_BASE),
  });
  return ringToPath([
    ...BODY_CORNERS.slice(0, exit.edge + 1),
    base(-1),
    tip,
    base(1),
    ...BODY_CORNERS.slice(exit.edge + 1),
  ]);
}

/**
 * Ribbon banner: rectangle with a V-notch cut inward at each end.
 *
 * ASSUMPTION: notch depth 0.15 of the width — looks right at typical banner
 * aspect ratios, working guess for SME review.
 */
export function bannerPath(): PathSeg[] {
  return ringToPath([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.85, y: 0.5 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: 0.15, y: 0.5 },
  ]);
}



/**
 * Standard flowchart symbols. Terminator reuses the rounded rectangle at the
 * stadium radii (0.25, 0.5).
 *
 * ASSUMPTION: data-parallelogram skew of 0.2 and the document wave (bottom
 * edge dipping to y 0.6 / 1.0 via one cubic from y 0.8) match the common
 * flowchart glyphs by eye — working guesses for SME review.
 */
export function flowchartPath(symbol: FlowchartSymbol): PathSeg[] {
  switch (symbol) {
    case "process":
      return ringToPath([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]);
    case "decision":
      return ringToPath([
        { x: 0.5, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0.5 },
      ]);
    case "terminator":
      return roundedRectPath(0.25, 0.5);
    case "data":
      return ringToPath([
        { x: 0.2, y: 0 },
        { x: 1, y: 0 },
        { x: 0.8, y: 1 },
        { x: 0, y: 1 },
      ]);
    case "document":
      return [
        { c: "M", x: 0, y: 0 },
        { c: "L", x: 1, y: 0 },
        { c: "L", x: 1, y: 0.8 },
        { c: "C", x1: 0.75, y1: 0.6, x2: 0.25, y2: 1.0, x: 0, y: 0.8 },
        { c: "Z" },
      ];
  }
}

/**
 * The normalized outline a shape draws, from whatever it stores: a path's own
 * segments, or a parametric kind's parameter resolved against its frame. One
 * resolver for the renderer, hit-testing and the overlay previews, so a shape
 * can never be drawn as one thing and hit as another.
 */
/** Everything an outline needs from a shape: its kind and the geometry
    fields that kind owns. A whole ShapeObject satisfies it, and so does a
    drawn shape's geometry before it has a frame. */
export type ShapeGeometry = Pick<
  ShapeObject,
  "shape" | "d" | "cornerRadius" | "points" | "innerRadiusRatio" | "tailTip" | "symbol"
>;

/**
 * The points a kind's outline reaches OUTSIDE its unit box, in unit-box
 * coordinates — the callout's tail tip is the only one, because it is the
 * only builder that leaves the box on purpose. Bounds math adds these so an
 * object's AABB covers what is actually drawn.
 *
 * Every other kind is normalized inside [0, 1] and returns nothing, which
 * this file's tests assert builder by builder. A future kind that overshoots
 * declares it HERE, next to the builder that draws it, rather than leaving
 * bounds math to guess.
 */
export function outlineOvershoot(shape: ShapeGeometry): NormalizedPoint[] {
  return shape.shape === "callout" ? [shape.tailTip ?? tailTipFor("bottom-left")] : [];
}

export function shapeOutline(shape: ShapeGeometry, w: number, h: number): PathSeg[] {
  switch (shape.shape) {
    case "roundedRect":
      return roundedRectPathFor(shape.cornerRadius ?? 0, w, h);
    case "starPolygon":
      return starPath(shape.points ?? 5, shape.innerRadiusRatio ?? 0.5);
    case "callout":
      return calloutPath(shape.tailTip ?? tailTipFor("bottom-left"));
    case "flowchart":
      return flowchartPath(shape.symbol ?? "process");
    default:
      return shape.d ?? [];
  }
}
