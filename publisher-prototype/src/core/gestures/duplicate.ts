import type { Group, LayoutObject } from "../model";
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
 * Group membership is copied, not shared: each group among the originals gets
 * a fresh id, and the copies join those instead. Sharing the originals' ids
 * would silently enlarge the source group with objects the user meant to
 * separate.
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

/** One object shifted by (dx, dy): a frame by its origin, a line by both
    endpoints — the same split every translate here makes. */
function translated(obj: LayoutObject, dx: number, dy: number): LayoutObject {
  return obj.type === "line"
    ? { ...obj, x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy }
    : { ...obj, x: obj.x + dx, y: obj.y + dy };
}

export const duplicateMachine: GestureMachine<DuplicateState, DuplicateContext> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state, modifiers) {
    if (!state.dragged) return { action: null };
    const { ctx } = state;
    const { dx, dy } = delta(state, modifiers);
    // Old group id → fresh one, minted before any object reads it so nesting
    // and membership both resolve against the same map.
    const groupIds = new Map(ctx.groups.map((g) => [g.id, ctx.groupIdFactory()] as const));
    const groups: Group[] = ctx.groups.map((g) => {
      const parent = g.parentGroupId === undefined ? undefined : groupIds.get(g.parentGroupId);
      return {
        id: groupIds.get(g.id) ?? ctx.groupIdFactory(),
        // A parent outside the copied set stays behind: the copy joins the
        // page at that level rather than reaching into the original's tree.
        ...(parent === undefined ? {} : { parentGroupId: parent }),
        ...(g.rotation === undefined ? {} : { rotation: g.rotation }),
      };
    });
    const objects = ctx.objects.map((obj) => {
      const groupId = obj.groupId === undefined ? undefined : groupIds.get(obj.groupId);
      const copy = { ...translated(obj, dx, dy), id: ctx.idFactory() };
      if (groupId === undefined) delete copy.groupId;
      else copy.groupId = groupId;
      return copy;
    });
    return { action: objectDuplicateCommitted({ pageIndex: ctx.pageIndex, objects, groups }) };
  },
  cancel: cancelResult,
  // The move ghost: the copies land exactly where the originals are drawn.
  preview: (state) => ({ kind: "move", ...delta(state, state.modifiers) }),
};
