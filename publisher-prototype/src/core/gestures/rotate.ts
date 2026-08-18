import { objectRotateCommitted } from "../store/documentActions";
import { ROTATE_SNAP_DEG } from "./constants";
import { beginDrag, cancelResult, updateDrag, type DragState } from "./drag";
import type { GestureContext, GestureMachine, GestureModifiers, GesturePoint } from "./types";

/**
 * Rotate machine — mechanizes select.drag-rotate.rotates
 * (src/core/registry/tools/selection.ts): the pointer's angle about the
 * selection pivot, relative to where the drag began, becomes a delta applied
 * to every member's initial rotation; Shift snaps each RESULTING rotation to
 * ROTATE_SNAP_DEG increments. The commit carries absolute per-object
 * rotations (initial + delta).
 *
 * Lines carry no rotation field — the caller's ctx.initialRotations must not
 * include them (the reducer would skip them anyway).
 *
 * The contract's "initial pointer angle" is computed in `begin` from the
 * press point (the drag begins ON the rotation handle) rather than passed in
 * ctx — same value, one fewer way for ctx to disagree with the pointer
 * stream.
 */

export type RotateContext = GestureContext & {
  /** The rotation pivot: the selection frame's center (selectionFrame's box
      through framePivot — for a lone object, the object's own center). */
  pivot: GesturePoint;
  /** Absolute starting rotation per selected object id, degrees. */
  initialRotations: Record<string, number>;
};

export type RotateState = DragState<RotateContext> & {
  /** Pointer angle about the pivot at press, degrees. */
  initialAngle: number;
};

function angleDeg(point: GesturePoint, pivot: GesturePoint): number {
  return (Math.atan2(point.y - pivot.y, point.x - pivot.x) * 180) / Math.PI;
}

function rotations(state: RotateState, modifiers: GestureModifiers): Record<string, number> {
  const delta = angleDeg(state.current, state.ctx.pivot) - state.initialAngle;
  const out: Record<string, number> = {};
  for (const [id, initial] of Object.entries(state.ctx.initialRotations)) {
    const resulting = initial + delta;
    out[id] = modifiers.shift
      ? Math.round(resulting / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG
      : resulting;
  }
  return out;
}

export const rotateMachine: GestureMachine<RotateState, RotateContext> = {
  begin: (point, ctx) => ({ ...beginDrag(point, ctx), initialAngle: angleDeg(point, ctx.pivot) }),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state, modifiers) {
    if (!state.dragged) return { action: null };
    return {
      action: objectRotateCommitted({
        pageIndex: state.ctx.pageIndex,
        rotations: rotations(state, modifiers),
      }),
    };
  },
  cancel: cancelResult,
  preview: (state) => ({ kind: "rotate", rotations: rotations(state, state.modifiers) }),
};
