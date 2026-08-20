import { copiesOf, type Group, type LayoutObject } from "../model";
import { objectDuplicateCommitted } from "../store/documentActions";
import { MOVE_SNAP_DEG } from "./constants";
import { beginDrag, cancelResult, snappedDelta, updateDrag, type DragState } from "./drag";
import type { GestureContext, GestureMachine, GestureModifiers } from "./types";

/**
 * Duplicate machine — mechanizes select.alt-drag.duplicates
 * (src/core/registry/tools/selection.ts): Alt-dragging a selection leaves the
 * originals where they are and drops a COPY at the drag's end. Shift
 * constrains the travel exactly as a plain move does.
 *
 * The copies are built in `end`, not at press: §6.3 allows one action per
 * gesture, so nothing is added to the document until the drag is released —
 * and the preview, which is the move ghost, already shows where they will
 * land. Alt-CLICK is a different clause (select.alt-click.selects-beneath);
 * this machine only ever commits after real travel, so the two never collide.
 *
 * The copying itself — fresh ids for objects and groups, membership carried
 * across — is model/copy.ts, shared with the keyboard duplicate and paste.
 * This machine contributes only the offset the drag travelled.
 */

export type DuplicateContext = GestureContext & {
  /** The objects being copied, in z-order. */
  objects: LayoutObject[];
  /** Every group those objects sit in, ancestors included — each is copied so
      the duplicate keeps the same nesting. */
  groups: Group[];
  idFactory: () => string;
  groupIdFactory: () => string;
};

export type DuplicateState = DragState<DuplicateContext>;

function delta(state: DuplicateState, modifiers: GestureModifiers): { dx: number; dy: number } {
  const dx = state.current.x - state.start.x;
  const dy = state.current.y - state.start.y;
  return modifiers.shift ? snappedDelta(dx, dy, MOVE_SNAP_DEG) : { dx, dy };
}

export const duplicateMachine: GestureMachine<DuplicateState, DuplicateContext> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state, modifiers) {
    if (!state.dragged) return { action: null };
    const { ctx } = state;
    const { dx, dy } = delta(state, modifiers);
    const { objects, groups } = copiesOf({
      objects: ctx.objects,
      groups: ctx.groups,
      dx,
      dy,
      idFactory: ctx.idFactory,
      groupIdFactory: ctx.groupIdFactory,
    });
    return { action: objectDuplicateCommitted({ pageIndex: ctx.pageIndex, objects, groups }) };
  },
  cancel: cancelResult,
  // The move ghost: the copies land exactly where the originals are drawn.
  preview: (state) => ({ kind: "move", ...delta(state, state.modifiers) }),
};
