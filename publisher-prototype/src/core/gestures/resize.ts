import { framePivot, rotatePoint } from "../hittest";
import {
  objectResizeCommitted,
  type FrameBox,
  type LineEndpoints,
} from "../store/documentActions";
import { MIN_RESIZE_SIZE_IN } from "./constants";
import { beginDrag, cancelResult, updateDrag, type DragState } from "./drag";
import type { GestureContext, GestureMachine, GestureModifiers, GesturePoint } from "./types";

/**
 * Resize machine — mechanizes select.drag-handle.resizes
 * (src/core/registry/tools/selection.ts): dragging a handle scales the
 * selection frame from the anchor (the opposite handle); Shift preserves the
 * aspect ratio (§4.4). The frame's scale factors apply proportionally to
 * every member — frame boxes scale x/y/w/h, line endpoints scale per point —
 * about the same anchor.
 *
 * The frame is `selectionFrame`'s (core/hittest/aabb.ts): a lone object's own
 * rotated box, or the union AABB for anything else. Scaling happens in that
 * frame's OWN unrotated space — the pointer rotates into it, so dragging a
 * handle on a rotated frame stretches along the object's edges rather than
 * the document axes, and the grabbed anchor stays pinned where the user is
 * holding it (`anchorPin`). Rotation itself is never touched.
 *
 * NOTE: that leaves one open case. A MULTI-selection has no single rotation,
 * so it scales along the document axes and each rotated member keeps its own
 * angle — which shears in reality. Multi-selection resize over rotated
 * members stays an SME review item.
 */

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type ResizeContext = GestureContext & {
  handle: ResizeHandle;
  /** The scaling origin: the handle opposite the dragged one, in the frame's
      unrotated space (corner for corner handles, edge midpoint for edges). */
  anchor: GesturePoint;
  /** The selection frame at gesture start, UNROTATED (selectionFrame's box)
      — locates the dragged handle's start position for the scale factors. */
  bounds: FrameBox;
  /** The frame's rotation in degrees: a lone object's own rotation, else 0
      (selectionFrame). Zero makes every step below an identity. */
  rotation: number;
  /** Initial geometry of every selected object: frames as boxes, lines as
      endpoints. */
  initial: Record<string, FrameBox | LineEndpoints>;
};

const OPPOSITE_HANDLE: Record<ResizeHandle, ResizeHandle> = {
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
};

/** A handle's point on the UNROTATED frame — corner for corner handles, edge
    midpoint for edge handles. The chrome rotates these about the frame pivot
    to place its handles on the frame it draws. */
export function resizeHandlePoint(handle: ResizeHandle, box: FrameBox): GesturePoint {
  return {
    x: handle.includes("w") ? box.x : handle.includes("e") ? box.x + box.w : box.x + box.w / 2,
    y: handle.includes("n") ? box.y : handle.includes("s") ? box.y + box.h : box.y + box.h / 2,
  };
}

/** The scaling origin this machine expects: the handle opposite the dragged
    one, on the initial frame. */
export function resizeAnchor(handle: ResizeHandle, box: FrameBox): GesturePoint {
  return resizeHandlePoint(OPPOSITE_HANDLE[handle], box);
}

/**
 * The line a handle stretches along, named by the compass pair it runs
 * between — what the shell turns into a two-headed cursor. Direction only:
 * the two ends are interchangeable, so `ns` covers both up and down.
 */
export type ResizeAxis = "ns" | "ew" | "nesw" | "nwse";

/** Each handle's outward direction on the unrotated frame, degrees clockwise
    from east (document y points down, so south is +90°). */
const HANDLE_HEADING_DEG: Record<ResizeHandle, number> = {
  e: 0,
  se: 45,
  s: 90,
  sw: 135,
  w: 180,
  nw: 225,
  n: 270,
  ne: 315,
};

/**
 * The axis a handle stretches along once the frame's rotation is applied —
 * an `n` handle on a quarter-turned frame points east and stretches `ew`.
 * The heading snaps to the nearest eighth turn, which is all a cursor can
 * express, and opposite eighths share an axis.
 */
export function resizeHandleAxis(handle: ResizeHandle, rotation: number): ResizeAxis {
  const eighth = Math.round((HANDLE_HEADING_DEG[handle] + rotation) / 45);
  switch (((eighth % 4) + 4) % 4) {
    case 0:
      return "ew";
    case 1:
      return "nwse";
    case 2:
      return "ns";
    default:
      return "nesw";
  }
}

export type ResizeState = DragState<ResizeContext>;

/** The pointer in the frame's own unrotated space, where the anchor and the
    scale factors live. Identity for an unrotated frame. */
function toFrameSpace(ctx: ResizeContext, point: GesturePoint): GesturePoint {
  if (ctx.rotation === 0) return point;
  return rotatePoint(point, framePivot(ctx.bounds), -ctx.rotation);
}

function clampScales(sx: number, sy: number, bounds: FrameBox): { sx: number; sy: number } {
  // The clamp keeps the scaled selection bounds at least MIN_RESIZE_SIZE_IN
  // per axis and, being a floor above zero, forbids negative scales — no
  // flip-resize this phase (constants.ts ASSUMPTION).
  const minSx = bounds.w > 0 ? MIN_RESIZE_SIZE_IN / bounds.w : 1;
  const minSy = bounds.h > 0 ? MIN_RESIZE_SIZE_IN / bounds.h : 1;
  return { sx: Math.max(sx, minSx), sy: Math.max(sy, minSy) };
}

function scaleFactors(
  ctx: ResizeContext,
  point: GesturePoint,
  modifiers: GestureModifiers,
): { sx: number; sy: number } {
  const local = toFrameSpace(ctx, point);
  const affectsX = ctx.handle.includes("e") || ctx.handle.includes("w");
  const affectsY = ctx.handle.includes("n") || ctx.handle.includes("s");
  const handleStartX = ctx.handle.includes("w") ? ctx.bounds.x : ctx.bounds.x + ctx.bounds.w;
  const handleStartY = ctx.handle.includes("n") ? ctx.bounds.y : ctx.bounds.y + ctx.bounds.h;
  let sx =
    affectsX && handleStartX !== ctx.anchor.x
      ? (local.x - ctx.anchor.x) / (handleStartX - ctx.anchor.x)
      : 1;
  let sy =
    affectsY && handleStartY !== ctx.anchor.y
      ? (local.y - ctx.anchor.y) / (handleStartY - ctx.anchor.y)
      : 1;
  ({ sx, sy } = clampScales(sx, sy, ctx.bounds));
  if (modifiers.shift) {
    // Preserve aspect: corner handles take the larger factor on both axes;
    // edge handles mirror the driven axis onto the other.
    if (affectsX && affectsY) {
      const uniform = Math.max(sx, sy);
      sx = uniform;
      sy = uniform;
    } else if (affectsX) {
      sy = sx;
    } else {
      sx = sy;
    }
    ({ sx, sy } = clampScales(sx, sy, ctx.bounds));
  }
  return { sx, sy };
}

function scaleBox(box: FrameBox, anchor: GesturePoint, sx: number, sy: number): FrameBox {
  return {
    x: anchor.x + (box.x - anchor.x) * sx,
    y: anchor.y + (box.y - anchor.y) * sy,
    w: box.w * sx,
    h: box.h * sy,
  };
}

/**
 * Rotation pivots at the frame's CENTER (hittest/geometry.ts decision of
 * record), and scaling moves that center — so the scaled frame, drawn at the
 * same rotation, would slide the grabbed anchor away from the spot the user
 * is holding. This is the correction: the translation that puts the anchor
 * back at its starting document position. Zero for an unrotated frame.
 */
function anchorPin(ctx: ResizeContext, sx: number, sy: number): GesturePoint {
  if (ctx.rotation === 0) return { x: 0, y: 0 };
  const pivot = framePivot(ctx.bounds);
  const started = rotatePoint(ctx.anchor, pivot, ctx.rotation);
  const scaled = rotatePoint(
    ctx.anchor,
    framePivot(scaleBox(ctx.bounds, ctx.anchor, sx, sy)),
    ctx.rotation,
  );
  return { x: started.x - scaled.x, y: started.y - scaled.y };
}

function scaledBoxes(
  ctx: ResizeContext,
  sx: number,
  sy: number,
): Record<string, FrameBox | LineEndpoints> {
  const pin = anchorPin(ctx, sx, sy);
  const out: Record<string, FrameBox | LineEndpoints> = {};
  for (const [id, g] of Object.entries(ctx.initial)) {
    if ("w" in g) {
      const box = scaleBox(g, ctx.anchor, sx, sy);
      out[id] = { ...box, x: box.x + pin.x, y: box.y + pin.y };
    } else {
      out[id] = {
        x1: ctx.anchor.x + (g.x1 - ctx.anchor.x) * sx + pin.x,
        y1: ctx.anchor.y + (g.y1 - ctx.anchor.y) * sy + pin.y,
        x2: ctx.anchor.x + (g.x2 - ctx.anchor.x) * sx + pin.x,
        y2: ctx.anchor.y + (g.y2 - ctx.anchor.y) * sy + pin.y,
      };
    }
  }
  return out;
}

export const resizeMachine: GestureMachine<ResizeState, ResizeContext> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state, modifiers) {
    if (!state.dragged) return { action: null };
    const { sx, sy } = scaleFactors(state.ctx, state.current, modifiers);
    return {
      action: objectResizeCommitted({
        pageIndex: state.ctx.pageIndex,
        boxes: scaledBoxes(state.ctx, sx, sy),
      }),
    };
  },
  cancel: cancelResult,
  preview(state) {
    const { sx, sy } = scaleFactors(state.ctx, state.current, state.modifiers);
    return { kind: "resize", boxes: scaledBoxes(state.ctx, sx, sy) };
  },
};
