import { rotatePoint } from "../hittest";
import {
  objectRotateCommitted,
  type FrameBox,
  type LineEndpoints,
} from "../store/documentActions";
import { ROTATE_SNAP_DEG } from "./constants";
import { beginDrag, cancelResult, updateDrag, type DragState } from "./drag";
import type { GestureContext, GestureMachine, GestureModifiers, GesturePoint } from "./types";

/**
 * Rotate machine — mechanizes select.drag-rotate.rotates
 * (src/core/registry/tools/selection.ts): the pointer's angle about the
 * selection pivot, relative to where the drag began, is ONE delta the whole
 * selection turns by — a rigid body. Each member's own rotation takes the
 * delta, and each member's geometry ORBITS the pivot: frame centres swing
 * around it, line endpoints swing around it. Without the orbit a
 * multi-selection would spin every member about its own centre and fly apart,
 * because an object's `rotation` pivots at its own frame centre (framePivot,
 * the decision of record).
 *
 * The commit carries absolute results for both halves: per-object rotations
 * (initial + delta) and per-object geometry (the orbited boxes/endpoints).
 * Lines take no rotation entry — they have no such field — but their
 * endpoints orbit like any other member's geometry.
 *
 * A LONE frame object degenerates exactly: its pivot is its own centre, so
 * `rotatePoint` returns that centre bit-for-bit and the emitted box equals
 * the initial one. Rotating one object is still "turn it in place".
 *
 * A GROUP's frame carries its own angle, which this turn advances alongside
 * the members' (`initialGroupRotations`) — the frame is what the user aimed
 * at, and it must still be pointing there when the gesture ends.
 *
 * Shift snaps the SELECTION FRAME's resulting angle to ROTATE_SNAP_DEG
 * increments and every member takes the delta that produces — snapping each
 * member's own resulting angle independently would hand differently-rotated
 * members different deltas and break rigidity. For a lone object the frame
 * rotation IS that object's rotation, so this is the familiar "snap the
 * object to 15°"; for a multi-selection the frame is unrotated, so it snaps
 * the turn itself.
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
  /** The selection frame's rotation at press (selectionFrame): a lone
      object's own angle, 0 for every other selection. The angle Shift snaps. */
  frameRotation: number;
  /** Absolute starting rotation per selected object id, degrees. Lines carry
      no rotation field, so the caller must not list them. */
  initialRotations: Record<string, number>;
  /** Initial geometry of EVERY selected object — frames as boxes, lines as
      endpoints — the orbit swings about the pivot. */
  initial: Record<string, FrameBox | LineEndpoints>;
  /** Absolute starting angle per GROUP whose frame this turn advances —
      the selected group, empty for an ad-hoc multi-selection. A group stores
      the angle its frame is drawn at, so the turn has to advance it. */
  initialGroupRotations: Record<string, number>;
};

export type RotateState = DragState<RotateContext> & {
  /** Pointer angle about the pivot at press, degrees. */
  initialAngle: number;
};

function angleDeg(point: GesturePoint, pivot: GesturePoint): number {
  return (Math.atan2(point.y - pivot.y, point.x - pivot.x) * 180) / Math.PI;
}

/** The one angle the whole selection turns by. */
function bodyDelta(state: RotateState, modifiers: GestureModifiers): number {
  const raw = angleDeg(state.current, state.ctx.pivot) - state.initialAngle;
  if (!modifiers.shift) return raw;
  const { frameRotation } = state.ctx;
  const snapped = Math.round((frameRotation + raw) / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
  return snapped - frameRotation;
}

function advanced(initial: Record<string, number>, delta: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, from] of Object.entries(initial)) out[id] = from + delta;
  return out;
}

/** Every member's geometry swung `delta` degrees about the pivot: a frame by
    its centre (its size is untouched — rotation never resizes), a line by
    both endpoints. */
function orbited(ctx: RotateContext, delta: number): Record<string, FrameBox | LineEndpoints> {
  const out: Record<string, FrameBox | LineEndpoints> = {};
  for (const [id, geometry] of Object.entries(ctx.initial)) {
    if ("w" in geometry) {
      const center = rotatePoint(
        { x: geometry.x + geometry.w / 2, y: geometry.y + geometry.h / 2 },
        ctx.pivot,
        delta,
      );
      out[id] = {
        x: center.x - geometry.w / 2,
        y: center.y - geometry.h / 2,
        w: geometry.w,
        h: geometry.h,
      };
    } else {
      const a = rotatePoint({ x: geometry.x1, y: geometry.y1 }, ctx.pivot, delta);
      const b = rotatePoint({ x: geometry.x2, y: geometry.y2 }, ctx.pivot, delta);
      out[id] = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
  }
  return out;
}

export const rotateMachine: GestureMachine<RotateState, RotateContext> = {
  begin: (point, ctx) => ({ ...beginDrag(point, ctx), initialAngle: angleDeg(point, ctx.pivot) }),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state, modifiers) {
    if (!state.dragged) return { action: null };
    const delta = bodyDelta(state, modifiers);
    return {
      action: objectRotateCommitted({
        pageIndex: state.ctx.pageIndex,
        rotations: advanced(state.ctx.initialRotations, delta),
        boxes: orbited(state.ctx, delta),
        groupRotations: advanced(state.ctx.initialGroupRotations, delta),
      }),
    };
  },
  cancel: cancelResult,
  preview(state) {
    const delta = bodyDelta(state, state.modifiers);
    return {
      kind: "rotate",
      rotations: advanced(state.ctx.initialRotations, delta),
      boxes: orbited(state.ctx, delta),
    };
  },
};
