import type { ColorValue, FrameObject, LayoutObject, LineObject } from "@/schema";
import { cmykPercent } from "@/lib/color/convert";
import { solidPaint } from "@/lib/color/paint";
import {
  BANNER_DEFAULT_HEIGHT,
  BANNER_DEFAULT_INSET,
  outlineOvershoot,
  tailTipFor,
  type ParametricShapeType,
} from "./shape-paths";
import { defaultTextProps } from "./text";

/**
 * Object factories, bbox math, and the L4 ink palette. Geometry is canonical
 * inches (plan §3.4); drawn defaults stay inside the wireframe's grayscale
 * language.
 */

/** Smallest drawable/resizable frame edge, inches. */
export const MIN_OBJECT_IN = 0.1;
/** A draw gesture shorter than this (either axis, inches) creates nothing. */
export const DRAW_THRESHOLD_IN = 0.05;
/** Arrow-key nudge (plan L4): 1/32 in, ×10 with Shift. */
export const NUDGE_IN = 1 / 32;
/** Cmd/Ctrl+D places the copy this far right+down. */
export const DUPLICATE_OFFSET_IN = 0.25;
/** Shift while rotating snaps to this increment (plan L10). */
export const ROTATE_SNAP_DEG = 15;

/** Grayscale ramp + brand red — the wireframe language's ink set (plan L4),
    authored in CMYK since the shop prints CMYK (Phase 12): paper, a K-only
    ramp, and the brand red as its press separation. `id` is the swatch's
    test-id suffix; `color` the literal it applies. */
export const OBJECT_PALETTE: readonly { id: string; color: ColorValue }[] = [
  { id: "paper", color: cmykPercent(0, 0, 0, 0) },
  { id: "k5", color: cmykPercent(0, 0, 0, 5) },
  { id: "k15", color: cmykPercent(0, 0, 0, 15) },
  { id: "k31", color: cmykPercent(0, 0, 0, 31) },
  { id: "k44", color: cmykPercent(0, 0, 0, 44) },
  { id: "k67", color: cmykPercent(0, 0, 0, 67) },
  { id: "k93", color: cmykPercent(0, 0, 0, 93) },
  { id: "brand", color: cmykPercent(0, 100, 100, 20) },
];

/** The preset a stroke width edit paints with when the object had no stroke. */
export const DEFAULT_STROKE_PRESET: ColorValue = cmykPercent(0, 0, 0, 67);

export const STROKE_WIDTHS = [1, 1.5, 2, 3, 4] as const;

export type DrawableFrameType = "rect" | "ellipse" | "picture";

/** A frame with the wireframe-language defaults per drawn type. */
export function createFrame(
  type: DrawableFrameType,
  x: number,
  y: number,
  w: number,
  h: number,
): FrameObject {
  const picture = type === "picture";
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    w: Math.max(MIN_OBJECT_IN, w),
    h: Math.max(MIN_OBJECT_IN, h),
    rotation: 0,
    locked: false,
    // picture = the gray placeholder frame (design doc §4.5; real import deferred)
    fill: solidPaint(cmykPercent(0, 0, 0, picture ? 9 : 5)),
    stroke: { paint: solidPaint(cmykPercent(0, 0, 0, picture ? 31 : 44)), width: 1 },
  };
}

/**
 * A text frame with the wire's typographic defaults (Motiva Sans 11 pt,
 * left, 1.2). Transparent like Publisher's text boxes — no fill, no stroke;
 * the canvas shows a faint affordance while it's empty.
 */
export function createTextFrame(x: number, y: number, w: number, h: number): FrameObject {
  return {
    id: crypto.randomUUID(),
    type: "text",
    x,
    y,
    w: Math.max(MIN_OBJECT_IN, w),
    h: Math.max(MIN_OBJECT_IN, h),
    rotation: 0,
    locked: false,
    fill: null,
    stroke: null,
    text: defaultTextProps(),
  };
}

export function createLine(x1: number, y1: number, x2: number, y2: number): LineObject {
  return {
    id: crypto.randomUUID(),
    type: "line",
    x1,
    y1,
    x2,
    y2,
    stroke: { paint: solidPaint(cmykPercent(0, 0, 0, 67)), width: 1.5 },
  };
}

/** An arrow is a line with an end head (prototype vocabulary — no separate
    arrow object). Only the non-default head is stored, per the additive rule. */
export function createArrow(x1: number, y1: number, x2: number, y2: number): LineObject {
  return { ...createLine(x1, y1, x2, y2), headEnd: "arrow" };
}

/**
 * A parametric shape with its prototype draw defaults stored explicitly, so
 * the adjust handles and the Properties fields have a value to start from.
 * Fill/stroke stay in the wireframe language, like every drawn frame here.
 */
export function createShape(
  type: ParametricShapeType,
  x: number,
  y: number,
  w: number,
  h: number,
): FrameObject {
  const params: Partial<FrameObject> =
    type === "roundedRect"
      ? { cornerRadius: 0.1 }
      : type === "starPolygon"
        ? { points: 5, innerRadiusRatio: 0.5 }
        : type === "callout"
          ? { tailTip: tailTipFor("bottom-left") }
          : { panelInset: BANNER_DEFAULT_INSET, panelHeight: BANNER_DEFAULT_HEIGHT };
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    w: Math.max(MIN_OBJECT_IN, w),
    h: Math.max(MIN_OBJECT_IN, h),
    rotation: 0,
    locked: false,
    fill: solidPaint(cmykPercent(0, 0, 0, 5)),
    stroke: { paint: solidPaint(cmykPercent(0, 0, 0, 44)), width: 1 },
    ...params,
  };
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Axis-aligned bounds — a line's bbox spans its endpoints. */
export function bboxOf(obj: LayoutObject): BBox {
  if (obj.type === "line") {
    return {
      x: Math.min(obj.x1, obj.x2),
      y: Math.min(obj.y1, obj.y2),
      w: Math.abs(obj.x2 - obj.x1),
      h: Math.abs(obj.y2 - obj.y1),
    };
  }
  return { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
}

/**
 * The object refit to a new bbox (the Properties X/Y/W/H round-trip). Frames
 * take it directly; a line's endpoints map proportionally — a degenerate axis
 * (zero-length) collapses both endpoints to the new edge.
 */
export function withBBox(obj: LayoutObject, next: BBox): LayoutObject {
  if (obj.type === "line") {
    const old = bboxOf(obj);
    const mapX = (v: number) => next.x + (old.w > 0 ? ((v - old.x) / old.w) * next.w : 0);
    const mapY = (v: number) => next.y + (old.h > 0 ? ((v - old.y) / old.h) * next.h : 0);
    return { ...obj, x1: mapX(obj.x1), y1: mapY(obj.y1), x2: mapX(obj.x2), y2: mapY(obj.y2) };
  }
  return { ...obj, x: next.x, y: next.y, w: next.w, h: next.h };
}

export function translated<T extends LayoutObject>(obj: T, dx: number, dy: number): T {
  if (obj.type === "line") {
    return { ...obj, x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy };
  }
  return { ...obj, x: obj.x + dx, y: obj.y + dy };
}

export type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/**
 * 8-handle resize: the handle's opposite edge/corner stays anchored, edges
 * clamp at MIN_OBJECT_IN, and Shift on a corner preserves the aspect ratio
 * (scaled by the dominant axis).
 */
export function resizeBBox(
  start: BBox,
  dir: HandleDir,
  dx: number,
  dy: number,
  preserveAspect = false,
): BBox {
  let { x, y, w, h } = start;
  if (dir.includes("e")) w = start.w + dx;
  if (dir.includes("s")) h = start.h + dy;
  if (dir.includes("w")) {
    w = start.w - dx;
    x = start.x + dx;
  }
  if (dir.includes("n")) {
    h = start.h - dy;
    y = start.y + dy;
  }

  const corner = dir.length === 2;
  if (preserveAspect && corner && start.w > 0 && start.h > 0) {
    const scale = Math.max(w / start.w, h / start.h);
    w = start.w * scale;
    h = start.h * scale;
  }

  // clamp against the anchored edge
  if (w < MIN_OBJECT_IN) {
    if (dir.includes("w")) x = start.x + start.w - MIN_OBJECT_IN;
    w = MIN_OBJECT_IN;
  }
  if (h < MIN_OBJECT_IN) {
    if (dir.includes("n")) y = start.y + start.h - MIN_OBJECT_IN;
    h = MIN_OBJECT_IN;
  }
  // aspect scaling moved the free edges — re-anchor the fixed ones
  if (preserveAspect && corner) {
    if (dir.includes("w")) x = start.x + start.w - w;
    if (dir.includes("n")) y = start.y + start.h - h;
  }
  return { x, y, w, h };
}

/* ── Rotation (plan L10) — CSS convention: degrees clockwise, screen y-down, 0 = none ── */

/** Fold any angle into [0, 360). */
export function normalizeAngle(deg: number): number {
  const n = deg % 360;
  return n < 0 ? n + 360 : n;
}

/** Round to the nearest increment (Shift-rotate snaps to ROTATE_SNAP_DEG). */
export function snapAngle(deg: number, step = ROTATE_SNAP_DEG): number {
  return Math.round(deg / step) * step;
}

/** Rotate a point about a center by `deg` (same matrix CSS `rotate()` applies). */
export function rotatePoint(x: number, y: number, cx: number, cy: number, deg: number) {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/** Angle (deg, clockwise, 0 = straight up) from a center to a point — the rotate handle's reading. */
export function angleFromCenter(cx: number, cy: number, px: number, py: number): number {
  return (Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI;
}

/**
 * The object's axis-aligned VISUAL footprint: bounds after rotation (plan L10
 * snaps by these), a line its own bbox — plus whatever the outline reaches
 * outside its frame box (the callout's tail tip, via `outlineOvershoot`), so
 * marquee/snap/preflight see what is actually drawn (the prototype's "bounds
 * take in what is drawn" decision). The selection frame and the Properties
 * X/Y/W/H stay on `bboxOf` — the body box is what resize scales, and the tip
 * is normalized to it.
 */
export function rotatedBBox(obj: LayoutObject): BBox {
  const b = bboxOf(obj);
  if (obj.type === "line") return b;
  const overshoot = outlineOvershoot(obj).map((p) => ({
    x: b.x + p.x * b.w,
    y: b.y + p.y * b.h,
  }));
  if (!obj.rotation && !overshoot.length) return b;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const pts = [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
    ...overshoot,
  ].map((p) => (obj.rotation ? rotatePoint(p.x, p.y, cx, cy, obj.rotation) : p));
  const xs = pts.map((c) => c.x);
  const ys = pts.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/**
 * Resize a rotated frame in its own local axes (plan L10): the page-space
 * pointer delta is rotated into local space, `resizeBBox` anchors the opposite
 * local edge, then the whole rect is shifted so the fixed corner stays put in
 * *page* space (the rotation pivots about the box center). At rotation 0 this
 * is exactly `resizeBBox` — the fixed corner doesn't move.
 */
export function resizeRotatedBBox(
  start: BBox,
  dir: HandleDir,
  pageDx: number,
  pageDy: number,
  rotation: number,
  preserveAspect = false,
): BBox {
  const c0x = start.x + start.w / 2;
  const c0y = start.y + start.h / 2;
  // the corner opposite the dragged handle — fixed through the resize
  const anchorX = dir.includes("e") ? start.x : dir.includes("w") ? start.x + start.w : c0x;
  const anchorY = dir.includes("s") ? start.y : dir.includes("n") ? start.y + start.h : c0y;
  const anchorPage = rotatePoint(anchorX, anchorY, c0x, c0y, rotation);

  // pointer delta → local axes, resize the local rect
  const local = rotatePoint(pageDx, pageDy, 0, 0, -rotation);
  const next = resizeBBox(start, dir, local.x, local.y, preserveAspect);

  // put the anchor back where it was in page space (rotation about the new center)
  const c1x = next.x + next.w / 2;
  const c1y = next.y + next.h / 2;
  const anchorNow = rotatePoint(anchorX, anchorY, c1x, c1y, rotation);
  return {
    x: next.x + (anchorPage.x - anchorNow.x),
    y: next.y + (anchorPage.y - anchorNow.y),
    w: next.w,
    h: next.h,
  };
}
