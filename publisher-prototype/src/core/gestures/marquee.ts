import { hitTestMarquee, type Rect } from "../hittest";
import type { LayoutObject } from "../model";
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
 * hitTestMarquee runs with lockedObjects: "skips" unconditionally.
 */

export type MarqueeContext = GestureContext & {
  /** The active page's objects in z-order, as hit-testing expects. */
  objects: LayoutObject[];
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
    const ids = hitTestMarquee(state.ctx.objects, rect, { lockedObjects: "skips" }).map(
      (obj) => obj.id,
    );
    return { action: selectionMarqueeCommitted({ ids }) };
  },
  cancel: cancelResult,
  preview: (state) => ({ kind: "marquee", ...marqueeRect(state.start, state.current) }),
};
