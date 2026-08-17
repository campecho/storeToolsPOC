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
 * selection's AABB from the anchor (the opposite handle); Shift preserves
 * the aspect ratio (§4.4). The AABB's scale factors apply proportionally to
 * every member — frame boxes scale x/y/w/h, line endpoints scale per point —
 * about the same anchor.
 *
 * Rotated objects scale their frame box the same way and keep rotation
 * unchanged. This is correct for the axis-aligned common cases; a rotated
 * frame scaled non-uniformly shears in reality, so rotated-resize fidelity
 * is an SME review item.
 */

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type ResizeContext = GestureContext & {
  handle: ResizeHandle;
  /** The scaling origin: the handle opposite the dragged one, on the initial
      selection AABB (corner for corner handles, edge midpoint for edges). */
  anchor: GesturePoint;
  /** The selection AABB at gesture start (rotation-aware, from selectionAabb)
      — locates the dragged handle's start position for the scale factors. */
  bounds: FrameBox;
  /** Initial geometry of every selected object: frames as boxes, lines as
      endpoints. */
  initial: Record<string, FrameBox | LineEndpoints>;
};

export type ResizeState = DragState<ResizeContext>;

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
  const affectsX = ctx.handle.includes("e") || ctx.handle.includes("w");
  const affectsY = ctx.handle.includes("n") || ctx.handle.includes("s");
  const handleStartX = ctx.handle.includes("w") ? ctx.bounds.x : ctx.bounds.x + ctx.bounds.w;
  const handleStartY = ctx.handle.includes("n") ? ctx.bounds.y : ctx.bounds.y + ctx.bounds.h;
  let sx =
    affectsX && handleStartX !== ctx.anchor.x
      ? (point.x - ctx.anchor.x) / (handleStartX - ctx.anchor.x)
      : 1;
  let sy =
    affectsY && handleStartY !== ctx.anchor.y
      ? (point.y - ctx.anchor.y) / (handleStartY - ctx.anchor.y)
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

function scaledBoxes(
  ctx: ResizeContext,
  sx: number,
  sy: number,
): Record<string, FrameBox | LineEndpoints> {
  const out: Record<string, FrameBox | LineEndpoints> = {};
  for (const [id, g] of Object.entries(ctx.initial)) {
    if ("w" in g) {
      out[id] = {
        x: ctx.anchor.x + (g.x - ctx.anchor.x) * sx,
        y: ctx.anchor.y + (g.y - ctx.anchor.y) * sy,
        w: g.w * sx,
        h: g.h * sy,
      };
    } else {
      out[id] = {
        x1: ctx.anchor.x + (g.x1 - ctx.anchor.x) * sx,
        y1: ctx.anchor.y + (g.y1 - ctx.anchor.y) * sy,
        x2: ctx.anchor.x + (g.x2 - ctx.anchor.x) * sx,
        y2: ctx.anchor.y + (g.y2 - ctx.anchor.y) * sy,
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
