import type {
  CalloutTailAnchor,
  FlowchartSymbol,
  PathSeg,
  ShapeObject,
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

/** Round off float noise from mirror arithmetic (1 − x) so mirrored vertices
 * land on the same exact doubles as their hand-traced counterparts. */
function snapNoise(v: number): number {
  return Math.round(v * 1e12) / 1e12;
}

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

/** Extract the vertex ring of a straight-edged closed subpath (M/L … Z). */
function pathToRing(segs: readonly PathSeg[]): Vertex[] {
  const ring: Vertex[] = [];
  for (const seg of segs) {
    if (seg.c === "M" || seg.c === "L") ring.push({ x: seg.x, y: seg.y });
  }
  return ring;
}

/** Mirror a straight-edged closed subpath across the frame's vertical
 * center line (x → 1 − x). Mirroring flips the winding, so the ring is
 * reversed to keep the outline clockwise, then re-normalized to M … Z. */
function mirrorAcrossVertical(segs: readonly PathSeg[]): PathSeg[] {
  const ring = pathToRing(segs)
    .map((v) => ({ x: snapNoise(1 - v.x), y: v.y }))
    .reverse();
  return ringToPath(ring);
}

/** Mirror a straight-edged closed subpath across the frame's horizontal
 * center line (y → 1 − y), reversing the ring to keep clockwise winding. */
function mirrorAcrossHorizontal(segs: readonly PathSeg[]): PathSeg[] {
  const ring = pathToRing(segs)
    .map((v) => ({ x: v.x, y: snapNoise(1 - v.y) }))
    .reverse();
  return ringToPath(ring);
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
 * Speech callout: rectangular body with a triangular pointer tail on the
 * anchored corner. Built from one bottom-left base shape and mirrored into
 * the other three anchors.
 *
 * ASSUMPTION: body takes the top 3/4 of the frame (tail zone 0.25 tall) and
 * the tail spans x 0.12–0.28 on the body edge with its tip at x 0.06 —
 * eyeballed from Publisher's callout proportions, working guess for SME
 * review.
 */
export function calloutPath(tailAnchor: CalloutTailAnchor): PathSeg[] {
  const base = ringToPath([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 0.75 },
    { x: 0.28, y: 0.75 },
    { x: 0.06, y: 1 },
    { x: 0.12, y: 0.75 },
    { x: 0, y: 0.75 },
  ]);
  switch (tailAnchor) {
    case "bottom-left":
      return base;
    case "bottom-right":
      return mirrorAcrossVertical(base);
    case "top-left":
      return mirrorAcrossHorizontal(base);
    case "top-right":
      return mirrorAcrossVertical(mirrorAcrossHorizontal(base));
  }
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

/** Everything an outline needs from a shape: its kind and the geometry
    fields that kind owns. A whole ShapeObject satisfies it, and so does a
    drawn shape's geometry before it has a frame. */
export type ShapeGeometry = Pick<
  ShapeObject,
  "shape" | "d" | "cornerRadius" | "points" | "innerRadiusRatio" | "tailAnchor" | "symbol"
>;

/**
 * The normalized outline a shape draws, from whatever it stores: a path's own
 * segments, or a parametric kind's parameter resolved against its frame. One
 * resolver for the renderer, hit-testing and the overlay previews, so a shape
 * can never be drawn as one thing and hit as another.
 */
export function shapeOutline(shape: ShapeGeometry, w: number, h: number): PathSeg[] {
  switch (shape.shape) {
    case "roundedRect":
      return roundedRectPathFor(shape.cornerRadius ?? 0, w, h);
    case "starPolygon":
      return starPath(shape.points ?? 5, shape.innerRadiusRatio ?? 0.5);
    case "callout":
      return calloutPath(shape.tailAnchor ?? "bottom-left");
    case "flowchart":
      return flowchartPath(shape.symbol ?? "process");
    default:
      return shape.d ?? [];
  }
}
