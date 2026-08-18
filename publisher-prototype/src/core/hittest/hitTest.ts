import { roundedRectPathFor } from "../geometry/shapePaths";
import type { LayoutObject, PathSeg, Stroke } from "../model";
import {
  convexPolygonsOverlap,
  distToSegment,
  flattenEllipse,
  flattenPath,
  framePivot,
  pointInRect,
  pointInRingsEvenOdd,
  rectCorners,
  ringEdges,
  rotatePoint,
  rotatedFrameCorners,
  segmentIntersectsRect,
  PT_PER_IN,
  type FlattenedSubpath,
  type Point,
  type Rect,
} from "./geometry";

/**
 * Hit-testing per the ToolContract HitTestSpec (PLAN.md §5): the registry
 * declares tolerance / unfilled-interior / locked rules per tool; these pure
 * functions are the mechanics every tool shares.
 *
 * Tolerance is in INCHES. The contracts declare `tolerancePx` in screen
 * space, independent of zoom — the shell converts px → inches via the
 * viewport zoom (`pxToIn`) before calling in, keeping this module
 * render-agnostic pure math (§6.2).
 *
 * Edge rule: an object's outline hits within the tolerance band regardless of
 * stroke presence — an unfilled, unstroked frame stays selectable by its
 * edge. ASSUMPTION: a non-null stroke widens the band by half its width in
 * inches (width pt / 72 / 2) on every object type — the contracts spell this
 * out only for lines; applying it uniformly is a working guess for SME
 * review.
 */

export type HitTestOptions = {
  /** Tolerance band around edges/strokes, inches (shell converts contract px via zoom). */
  toleranceIn: number;
  /** Does a click inside an unfilled interior select the object? */
  unfilledInterior: "selects" | "passesThrough";
  /** How locked objects respond to the pointer. */
  lockedObjects: "skips" | "hits";
};

/** Marquee intersection needs no tolerance or interior rule — only the locked rule. */
export type MarqueeOptions = Pick<HitTestOptions, "lockedObjects">;

function strokeHalfIn(stroke: Stroke | null): number {
  return stroke ? stroke.width / PT_PER_IN / 2 : 0;
}

function distToRectEdge(p: Point, rect: Rect): number {
  let min = Infinity;
  for (const [a, b] of ringEdges(rectCorners(rect))) {
    min = Math.min(min, distToSegment(p, a, b));
  }
  return min;
}

function ellipseHitsPoint(local: Point, frame: Rect, interiorSelectable: boolean, band: number): boolean {
  const rx = frame.w / 2;
  const ry = frame.h / 2;
  if (rx === 0 || ry === 0) return false;
  const dx = local.x - (frame.x + rx);
  const dy = local.y - (frame.y + ry);
  // norm < 1 inside the ellipse, 1 on it, > 1 outside.
  const norm = Math.hypot(dx / rx, dy / ry);
  if (interiorSelectable && norm <= 1) return true;
  // Radial edge distance: the edge point along the center ray sits at 1/norm
  // of the point's distance, so |dist − dist/norm| approximates the true
  // distance to the ellipse (exact for circles, tight near the edge).
  const dist = Math.hypot(dx, dy);
  const edgeDist = norm === 0 ? Math.min(rx, ry) : Math.abs(dist - dist / norm);
  return edgeDist <= band;
}

function subpathStrokeHit(sub: FlattenedSubpath, p: Point, band: number): boolean {
  for (let i = 0; i < sub.points.length - 1; i++) {
    const a = sub.points[i];
    const b = sub.points[i + 1];
    if (a && b && distToSegment(p, a, b) <= band) return true;
  }
  if (sub.closed && sub.points.length >= 2) {
    const first = sub.points[0];
    const last = sub.points[sub.points.length - 1];
    if (first && last && distToSegment(p, last, first) <= band) return true;
  }
  return false;
}

function pathHitsPoint(
  local: Point,
  subs: readonly FlattenedSubpath[],
  interiorSelectable: boolean,
  band: number,
): boolean {
  for (const sub of subs) {
    if (subpathStrokeHit(sub, local, band)) return true;
  }
  if (!interiorSelectable) return false;
  // Interior exists only where subpaths close (even-odd over closed rings).
  const rings = subs.filter((s) => s.closed).map((s) => s.points);
  return rings.length > 0 && pointInRingsEvenOdd(local, rings);
}

function objectHitsPoint(obj: LayoutObject, p: Point, opts: HitTestOptions): boolean {
  if (obj.type === "line") {
    const band = opts.toleranceIn + obj.stroke.width / PT_PER_IN / 2;
    return distToSegment(p, { x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }) <= band;
  }
  const frame: Rect = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
  // Rotation-aware: inverse-rotate the point about the frame pivot into the
  // frame's unrotated coordinates, then test axis-aligned.
  const local = obj.rotation === 0 ? p : rotatePoint(p, framePivot(frame), -obj.rotation);
  const interiorSelectable = obj.fill !== null || opts.unfilledInterior === "selects";
  const band = opts.toleranceIn + strokeHalfIn(obj.stroke);
  if (obj.type === "shape" && obj.shape === "ellipse") {
    return ellipseHitsPoint(local, frame, interiorSelectable, band);
  }
  if (obj.type === "shape" && (obj.shape === "path" || obj.shape === "roundedRect")) {
    return pathHitsPoint(local, flattenPath(shapeOutline(obj, frame), frame), interiorSelectable, band);
  }
  // Rect shape and all rectangular frames (textFrame / pictureFrame / table /
  // mergeField): their `fill` field governs the interior rule the same way.
  if (interiorSelectable && pointInRect(local, frame)) return true;
  return distToRectEdge(local, frame) <= band;
}

/**
 * Every object hit at `point`, ordered topmost-first (z-order is array order,
 * last = topmost). Callers take [0] for a plain click and walk the ordered
 * list for Alt-click stack cycling.
 */
export function hitTestPoint(
  objects: readonly LayoutObject[],
  point: Point,
  opts: HitTestOptions,
): LayoutObject[] {
  const hits: LayoutObject[] = [];
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (!obj) continue;
    if (obj.locked && opts.lockedObjects === "skips") continue;
    if (objectHitsPoint(obj, point, opts)) hits.push(obj);
  }
  return hits;
}

/** The normalized outline a shape kind carries: a path's own segments, or
    the rounded rect's derived from its stored radius and the frame. */
function shapeOutline(obj: LayoutObject & { type: "shape" }, frame: Rect): PathSeg[] {
  return obj.shape === "roundedRect"
    ? roundedRectPathFor(obj.cornerRadius ?? 0, frame.w, frame.h)
    : (obj.d ?? []);
}

/** Doc-space flattened path: local polylines rotated about the frame pivot. */
function flattenPathToDoc(obj: LayoutObject & { type: "shape" }, frame: Rect): FlattenedSubpath[] {
  const subs = flattenPath(shapeOutline(obj, frame), frame);
  if (obj.rotation === 0) return subs;
  const pivot = framePivot(frame);
  return subs.map((s) => ({
    closed: s.closed,
    points: s.points.map((p) => rotatePoint(p, pivot, obj.rotation)),
  }));
}

function pathIntersectsRect(subs: readonly FlattenedSubpath[], rect: Rect): boolean {
  for (const sub of subs) {
    for (let i = 0; i < sub.points.length - 1; i++) {
      const a = sub.points[i];
      const b = sub.points[i + 1];
      if (a && b && segmentIntersectsRect(a, b, rect)) return true;
    }
    if (sub.closed && sub.points.length >= 2) {
      const first = sub.points[0];
      const last = sub.points[sub.points.length - 1];
      if (first && last && segmentIntersectsRect(last, first, rect)) return true;
    }
  }
  // Marquee entirely inside the outline: even-odd over closed rings (fill
  // presence deliberately ignored — the marquee contract intersects geometry).
  const rings = subs.filter((s) => s.closed).map((s) => s.points);
  return rings.length > 0 && rectCorners(rect).some((c) => pointInRingsEvenOdd(c, rings));
}

function objectIntersectsRect(obj: LayoutObject, rect: Rect): boolean {
  if (obj.type === "line") {
    return segmentIntersectsRect({ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }, rect);
  }
  const frame: Rect = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
  if (obj.type === "shape" && (obj.shape === "path" || obj.shape === "roundedRect")) {
    return pathIntersectsRect(flattenPathToDoc(obj, frame), rect);
  }
  if (obj.type === "shape" && obj.shape === "ellipse") {
    // The sampled ellipse outline is convex, so SAT is exact against it —
    // a marquee clipping only the frame corner does NOT select.
    return convexPolygonsOverlap(flattenEllipse(frame, obj.rotation), rectCorners(rect));
  }
  return convexPolygonsOverlap(rotatedFrameCorners(frame, obj.rotation), rectCorners(rect));
}

/**
 * Every object the (normalized, w/h ≥ 0) marquee rect INTERSECTS — not
 * containment: the select contract selects "every unlocked object it
 * intersects". Topmost-first, same ordering rule as hitTestPoint.
 */
export function hitTestMarquee(
  objects: readonly LayoutObject[],
  rect: Rect,
  opts: MarqueeOptions,
): LayoutObject[] {
  const hits: LayoutObject[] = [];
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (!obj) continue;
    if (obj.locked && opts.lockedObjects === "skips") continue;
    if (objectIntersectsRect(obj, rect)) hits.push(obj);
  }
  return hits;
}
