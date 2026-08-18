import { clampCornerRadius } from "../geometry/shapePaths";
import { framePivot, rotatePoint } from "../hittest";
import { roundedRectCornerRadiusCommitted, type FrameBox } from "../store/documentActions";
import { beginDrag, cancelResult, updateDrag, type DragState } from "./drag";
import type { GestureContext, GestureMachine, GesturePoint } from "./types";

/**
 * Corner-radius machine — mechanizes
 * rounded-rect.drag-adjust-handle.sets-corner-radius
 * (src/core/registry/tools/shapes.ts): dragging the adjust handle along the
 * frame's top edge grows the corner radius, clamped to the geometric bound
 * of half the shorter side (the contract's runtime clamp).
 *
 * The pointer rotates into the frame's own space first, so the handle tracks
 * the rotated top edge rather than the page's. Travel applies as a DELTA on
 * the starting radius, not as an absolute position, so the radius never
 * jumps to meet the pointer however the handle happens to be drawn.
 */

export type CornerRadiusContext = GestureContext & {
  /** The rounded rect being adjusted — one object; the handle shows for a
      lone rounded rect only. */
  id: string;
  /** Its frame, unrotated, and the rotation the handle rides. */
  frame: FrameBox;
  rotation: number;
  /** The stored radius at press, in inches. */
  initialRadius: number;
};

export type CornerRadiusState = DragState<CornerRadiusContext>;

/** The pointer in the frame's own space, where the top edge runs along +x. */
function toFrameSpace(ctx: CornerRadiusContext, point: GesturePoint): GesturePoint {
  if (ctx.rotation === 0) return point;
  return rotatePoint(point, framePivot(ctx.frame), -ctx.rotation);
}

function radiusOf(state: CornerRadiusState): number {
  const { ctx } = state;
  const travel = toFrameSpace(ctx, state.current).x - toFrameSpace(ctx, state.start).x;
  return clampCornerRadius(ctx.initialRadius + travel, ctx.frame.w, ctx.frame.h);
}

export const cornerRadiusMachine: GestureMachine<CornerRadiusState, CornerRadiusContext> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state) {
    if (!state.dragged) return { action: null };
    return {
      action: roundedRectCornerRadiusCommitted({
        pageIndex: state.ctx.pageIndex,
        ids: [state.ctx.id],
        radius: radiusOf(state),
      }),
    };
  },
  cancel: cancelResult,
  preview(state) {
    return { kind: "corner-radius", radius: radiusOf(state) };
  },
};
