import type { FrameObject, LayoutObject, LineObject } from "@/schema";

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

/** Grayscale ramp + brand red — the wireframe language's ink set (plan L4). */
export const OBJECT_PALETTE = [
  "#ffffff",
  "#f2f2f2",
  "#d9d9d9",
  "#b0b0b0",
  "#8f8f8f",
  "#555555",
  "#111111",
  "#CC0000",
] as const;

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
    fill: picture ? "#e8e8e8" : "#f2f2f2",
    stroke: { color: picture ? "#b0b0b0" : "#8f8f8f", width: 1 },
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
    stroke: { color: "#555555", width: 1.5 },
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
