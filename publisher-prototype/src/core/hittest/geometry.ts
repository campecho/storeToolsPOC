import type { PathSeg } from "../model";

/**
 * Shared hit-testing math — portable, framework-free pure geometry over
 * canonical document inches (PLAN.md §6.2). Everything here is deterministic:
 * fixed flattening resolutions, no adaptive subdivision, no zoom dependence —
 * screen-space concerns (px tolerance → inches) are converted by callers.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** Stroke widths are stored in points (model StrokeSchema); geometry is inches. */
export const PT_PER_IN = 72;

/**
 * Fixed flattening resolution: each cubic segment samples this many line
 * steps. Constant — not adaptive — so hit results are deterministic and
 * zoom-independent; 16 keeps worst-case chord error well below the contract
 * tolerances at page scale.
 */
export const PATH_FLATTEN_STEPS = 16;

/**
 * Ellipse marquee outline sample count. The sampled polygon is convex, so
 * marquee overlap uses the exact separating-axis test on it.
 */
export const ELLIPSE_FLATTEN_STEPS = 32;

/**
 * Frame rotation pivots at the frame's CENTER — decision of record
 * (user-ratified 2026-08-17, superseding the earlier top-left ASSUMPTION;
 * recorded in SEAMS.md). Every rotation-aware computation in hit-testing,
 * AABB math, and the renderer routes through this helper.
 */
export function framePivot(frame: Rect): Point {
  return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
}

export function rotatePoint(p: Point, center: Point, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** Corners in ring order: tl, tr, br, bl. */
export function rectCorners(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
}

/** The frame's corner polygon in document space, rotation applied. */
export function rotatedFrameCorners(frame: Rect, rotation: number): Point[] {
  const corners = rectCorners(frame);
  if (rotation === 0) return corners;
  const pivot = framePivot(frame);
  return corners.map((c) => rotatePoint(c, pivot, rotation));
}

export function boundsOfPoints(points: readonly Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function pointInRect(p: Point, rect: Rect): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Closed-ring edge list: [pᵢ, pᵢ₊₁] pairs, wrapping last→first. */
export function ringEdges(poly: readonly Point[]): [Point, Point][] {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length] ?? p]);
}

function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  );
}

export function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

export function segmentIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
  for (const [e1, e2] of ringEdges(rectCorners(rect))) {
    if (segmentsIntersect(a, b, e1, e2)) return true;
  }
  return false;
}

/** Even-odd ray-cast for one ring. */
export function pointInPolygonEvenOdd(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (const [a, b] of ringEdges(poly)) {
    if (a.y > p.y !== b.y > p.y) {
      const xCross = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (p.x < xCross) inside = !inside;
    }
  }
  return inside;
}

/** Even-odd over a union of rings: total crossing parity (XOR of ring parities). */
export function pointInRingsEvenOdd(p: Point, rings: readonly (readonly Point[])[]): boolean {
  return rings.reduce((inside, ring) => inside !== pointInPolygonEvenOdd(p, ring), false);
}

function projectionOverlap(a: readonly Point[], b: readonly Point[], nx: number, ny: number): boolean {
  let minA = Infinity;
  let maxA = -Infinity;
  for (const p of a) {
    const d = p.x * nx + p.y * ny;
    minA = Math.min(minA, d);
    maxA = Math.max(maxA, d);
  }
  let minB = Infinity;
  let maxB = -Infinity;
  for (const p of b) {
    const d = p.x * nx + p.y * ny;
    minB = Math.min(minB, d);
    maxB = Math.max(maxB, d);
  }
  return maxA >= minB && maxB >= minA;
}

/**
 * Separating-axis overlap for two CONVEX polygons. Handles containment in
 * either direction (a fully inside b overlaps), which is exactly the
 * marquee's intersect-not-contain rule.
 */
export function convexPolygonsOverlap(a: readonly Point[], b: readonly Point[]): boolean {
  for (const poly of [a, b]) {
    for (const [p1, p2] of ringEdges(poly)) {
      const nx = -(p2.y - p1.y);
      const ny = p2.x - p1.x;
      if (nx === 0 && ny === 0) continue;
      if (!projectionOverlap(a, b, nx, ny)) return false;
    }
  }
  return true;
}

export type FlattenedSubpath = { points: Point[]; closed: boolean };

/**
 * Where one axis of a cubic turns around: the roots of B'(t) strictly inside
 * (0, 1). B'(t)/3 is the quadratic at² + bt + c below, so this is the
 * ordinary quadratic formula with the degenerate cases named — a === 0 makes
 * it linear (the curve's axis accelerates uniformly), and b === 0 with it
 * means the axis never turns at all.
 *
 * Endpoints are the caller's business: these are the INTERIOR extrema, which
 * together with the two endpoints give a cubic's exact extent on that axis.
 */
function cubicTurningPoints(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const inside = (t: number) => t > 0 && t < 1;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return [];
    return [-c / b].filter(inside);
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const root = Math.sqrt(disc);
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)].filter(inside);
}

/**
 * The EXACT bounds of a path in absolute coordinates — the box the drawn ink
 * occupies, not the box its control points span. A cubic's control points can
 * sit well outside the curve they steer (a half-circle-ish arc reaches only
 * ~3/4 of the way to its handles), so hulling them yields a box visibly
 * larger than the shape; solving each cubic's turning points instead makes it
 * hug what is painted. Straight segments and endpoints contribute directly.
 *
 * Null for a path with no points at all. The two axes are solved
 * independently, which is why x and y are collected apart: a turn in x says
 * nothing about where y turns.
 */
export function pathBounds(segs: readonly PathSeg[]): Rect | null {
  const xs: number[] = [];
  const ys: number[] = [];
  let current: Point | null = null;
  for (const seg of segs) {
    switch (seg.c) {
      case "M":
      case "L":
        current = { x: seg.x, y: seg.y };
        xs.push(current.x);
        ys.push(current.y);
        break;
      case "C": {
        const from = current ?? { x: seg.x1, y: seg.y1 };
        xs.push(seg.x);
        ys.push(seg.y);
        for (const t of cubicTurningPoints(from.x, seg.x1, seg.x2, seg.x)) {
          xs.push(cubicAt(from.x, seg.x1, seg.x2, seg.x, t));
        }
        for (const t of cubicTurningPoints(from.y, seg.y1, seg.y2, seg.y)) {
          ys.push(cubicAt(from.y, seg.y1, seg.y2, seg.y, t));
        }
        current = { x: seg.x, y: seg.y };
        break;
      }
      case "Z":
        // The closing segment is a straight line between two points already
        // counted, so it can reach nothing new.
        break;
    }
  }
  if (xs.length === 0 || ys.length === 0) return null;
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Flatten normalized path segments (0–1 in the frame box — model PathSeg
 * convention, same denormalization as render/path.ts) into polylines in the
 * frame's UNROTATED document coordinates. Cubics sample PATH_FLATTEN_STEPS
 * fixed steps; `closed: true` means the ring closes last→first (the Z
 * segment) without repeating the start point.
 */
export function flattenPath(segs: readonly PathSeg[], box: Rect): FlattenedSubpath[] {
  const px = (nx: number) => box.x + nx * box.w;
  const py = (ny: number) => box.y + ny * box.h;
  const out: FlattenedSubpath[] = [];
  let current: Point[] = [];
  const flush = (closed: boolean) => {
    if (current.length >= 2) out.push({ points: current, closed });
    current = [];
  };
  for (const seg of segs) {
    switch (seg.c) {
      case "M":
        flush(false);
        current = [{ x: px(seg.x), y: py(seg.y) }];
        break;
      case "L":
        current.push({ x: px(seg.x), y: py(seg.y) });
        break;
      case "C": {
        const from = current[current.length - 1] ?? { x: px(0), y: py(0) };
        if (current.length === 0) current.push(from);
        for (let i = 1; i <= PATH_FLATTEN_STEPS; i++) {
          const t = i / PATH_FLATTEN_STEPS;
          current.push({
            x: cubicAt(from.x, px(seg.x1), px(seg.x2), px(seg.x), t),
            y: cubicAt(from.y, py(seg.y1), py(seg.y2), py(seg.y), t),
          });
        }
        break;
      }
      case "Z":
        flush(true);
        break;
    }
  }
  flush(false);
  return out;
}

/**
 * Sample the ellipse inscribed in `frame` as a convex polygon in document
 * space, rotation applied about the frame pivot.
 */
export function flattenEllipse(frame: Rect, rotation: number): Point[] {
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  const rx = frame.w / 2;
  const ry = frame.h / 2;
  const pivot = framePivot(frame);
  const points: Point[] = [];
  for (let i = 0; i < ELLIPSE_FLATTEN_STEPS; i++) {
    const a = (i / ELLIPSE_FLATTEN_STEPS) * 2 * Math.PI;
    const p = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
    points.push(rotation === 0 ? p : rotatePoint(p, pivot, rotation));
  }
  return points;
}
