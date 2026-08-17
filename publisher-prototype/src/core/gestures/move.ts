import { objectMoveCommitted } from "../store/documentActions";
import { beginDrag, cancelResult, updateDrag, type DragState } from "./drag";
import type { GestureContext, GestureMachine } from "./types";

/**
 * Move machine — mechanizes select.drag.moves-selection
 * (src/core/registry/tools/selection.ts): preview carries the live (dx, dy);
 * one object/moveCommitted with the final delta commits on release.
 *
 * The contract's "honoring snapping" is deliberately partial this phase: the
 * §2.3 snap pipeline is its own later surface that will intercept the delta
 * mid-gesture; until it lands, the machine passes the raw pointer delta
 * through unmodified.
 *
 * An under-slop end commits nothing — the shell's click path owns selection
 * changes (select.click.* clauses), never this machine.
 */

export type MoveContext = GestureContext & {
  /** The selected object ids the commit translates. */
  ids: string[];
};

export type MoveState = DragState<MoveContext>;

export const moveMachine: GestureMachine<MoveState, MoveContext> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  // Modifiers take no part in the move commit (no axis-constraint clause is
  // contracted); the parameter is omitted.
  end(state) {
    if (!state.dragged) return { action: null };
    const { ctx } = state;
    return {
      action: objectMoveCommitted({
        pageIndex: ctx.pageIndex,
        ids: ctx.ids,
        dx: state.current.x - state.start.x,
        dy: state.current.y - state.start.y,
      }),
    };
  },
  cancel: cancelResult,
  preview: (state) => ({
    kind: "move",
    dx: state.current.x - state.start.x,
    dy: state.current.y - state.start.y,
  }),
};
