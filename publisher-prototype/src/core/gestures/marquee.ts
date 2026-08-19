import { hitTestMarquee, type Rect } from "../hittest";
import { selectionUnit, type Group, type LayoutObject } from "../model";
import { selectionClearedCommitted, selectionMarqueeCommitted } from "../store/selectionSlice";
import { beginDrag, cancelResult, updateDrag, type DragState } from "./drag";
import type { GestureContext, GestureMachine, GesturePoint } from "./types";

/**
 * Marquee machine — mechanizes select.drag-empty.marquee-selects and, for the
 * under-slop case, select.click-empty.clears (src/core/registry/tools/
 * selection.ts): a drag that never leaves the slop radius IS the empty-canvas
 * click, so it clears the selection.
 *
 * Commit selects every UNLOCKED object the marquee intersects (not contains),
 * topmost-first — the contract's "every unlocked object it intersects" is why
 * hitTestMarquee runs with lockedObjects: "skips" unconditionally. Each hit
 * then expands to its SELECTION UNIT (core/model/groups.ts), so touching one
 * member of a group takes the whole group: partially selecting a group would
 * tear it apart on the next transform.
 *
 * ASSUMPTION: a marquee leaves the entered group context as it found it — it
 * selects units resolved in that context but never enters or exits one, so
 * the only ways out stay the empty-canvas click and clicking elsewhere.
 */

export type MarqueeContext = GestureContext & {
  /** The active page's objects in z-order, as hit-testing expects. */
  objects: LayoutObject[];
  /** The document's groups — hits expand to whole groups through these. */
  groups: readonly Group[];
  /** The group context the selection is currently inside; null at top level. */
  enteredGroupId: string | null;
};

export type MarqueeState = DragState<MarqueeContext>;

function marqueeRect(start: GesturePoint, current: GesturePoint): Rect {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    w: Math.abs(current.x - start.x),
    h: Math.abs(current.y - start.y),
  };
}

export const marqueeMachine: GestureMachine<MarqueeState, MarqueeContext> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  // Modifiers take no part in the marquee commit; the parameter is omitted.
  end(state) {
    if (!state.dragged) return { action: selectionClearedCommitted() };
    const rect = marqueeRect(state.start, state.current);
    const { objects, groups, enteredGroupId } = state.ctx;
    const ids: string[] = [];
    for (const hit of hitTestMarquee(objects, rect, { lockedObjects: "skips" })) {
      // A group swept twice contributes its members once, in the z-order the
      // first hit found it at.
      for (const id of selectionUnit(objects, groups, hit.id, enteredGroupId).ids) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
    return { action: selectionMarqueeCommitted({ ids }) };
  },
  cancel: cancelResult,
  preview: (state) => ({ kind: "marquee", ...marqueeRect(state.start, state.current) }),
};
