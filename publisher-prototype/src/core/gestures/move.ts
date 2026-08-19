import { objectMoveCommitted } from "../store/documentActions";
import { MOVE_SNAP_DEG } from "./constants";
import { beginDrag, cancelResult, snappedDelta, updateDrag, type DragState } from "./drag";
import type { GestureContext, GestureMachine, GestureModifiers } from "./types";

/**
 * Move machine — mechanizes select.drag.moves-selection and
 * select.shift-drag.constrains-move (src/core/registry/tools/selection.ts):
 * preview carries the live (dx, dy); one object/moveCommitted with the final
 * delta commits on release.
 *
 * Shift constrains travel to MOVE_SNAP_DEG increments — horizontal, vertical
 * or either diagonal, whichever the drag is nearest — at the distance the
 * drag projects onto that ray. The axis is re-chosen on every update from
 * where the pointer is NOW, so a drag that starts sideways and turns
 * downward follows it, and letting Shift go frees the move again mid-drag.
 *
 * The contract's "honoring snapping" is deliberately partial this phase: the
 * §2.3 snap pipeline is its own later surface that will intercept the delta
 * mid-gesture; until it lands, the machine passes the pointer delta through
 * unmodified but for the Shift constraint.
 *
 * An under-slop end commits nothing — the shell's click path owns selection
 * changes (select.click.* clauses), never this machine.
 */

export type MoveContext = GestureContext & {
  /** The selected object ids the commit translates. */
  ids: string[];
};

export type MoveState = DragState<MoveContext>;

export function moveDelta(
  state: MoveState,
  modifiers: GestureModifiers,
): { dx: number; dy: number } {
  const dx = state.current.x - state.start.x;
  const dy = state.current.y - state.start.y;
  return modifiers.shift ? snappedDelta(dx, dy, MOVE_SNAP_DEG) : { dx, dy };
}

export const moveMachine: GestureMachine<MoveState, MoveContext> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state, modifiers) {
    if (!state.dragged) return { action: null };
    return {
      action: objectMoveCommitted({
        pageIndex: state.ctx.pageIndex,
        ids: state.ctx.ids,
        ...moveDelta(state, modifiers),
      }),
    };
  },
  cancel: cancelResult,
  preview: (state) => ({ kind: "move", ...moveDelta(state, state.modifiers) }),
};
