import { objectResizeCommitted, type LineEndpoints } from "../store/documentActions";
import { LINE_SNAP_DEG } from "./constants";
import { beginDrag, cancelResult, updateDrag, type DragState } from "./drag";
import type { GestureContext, GestureMachine, GestureModifiers, GesturePoint } from "./types";

/**
 * Line-endpoint machine — mechanizes select.drag-endpoint.moves-endpoint
 * (src/core/registry/tools/selection.ts). A line IS two points, so its
 * selection offers those two points: dragging one moves only it, and the
 * other anchors the segment. That is what makes this an edit of the line
 * rather than a resize of a box drawn around it.
 *
 * The grabbed end follows the drag DELTA from where it started, not the raw
 * pointer — pressing a few thousandths off the handle's centre must not jump
 * the endpoint to the pointer.
 *
 * Shift snaps the segment to LINE_SNAP_DEG increments about the anchor, the
 * same constraint the line tool draws under (line.shift-drag.constrains-angle):
 * placing an endpoint is the same act whether the line is new or not, and the
 * length is the drag projected onto the snapped direction.
 *
 * The commit is object/resizeCommitted carrying this line's endpoints — the
 * store already speaks absolute line geometry, so an endpoint drag needs no
 * vocabulary of its own.
 */

export type LineEndpointHandle = "p1" | "p2";

export type LineEndpointContext = GestureContext & {
  id: string;
  /** Which end the drag grabbed; the other one anchors the segment. */
  which: LineEndpointHandle;
  /** The line's endpoints at press. */
  initial: LineEndpoints;
};

export type LineEndpointState = DragState<LineEndpointContext>;

/** `point` pulled onto the nearest LINE_SNAP_DEG ray from `anchor`, at the
    length the drag projects onto that ray. */
function snapAbout(anchor: GesturePoint, point: GesturePoint): GesturePoint {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const step = (LINE_SNAP_DEG * Math.PI) / 180;
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
  const cos = Math.cos(snapped);
  const sin = Math.sin(snapped);
  const len = dx * cos + dy * sin;
  return { x: anchor.x + len * cos, y: anchor.y + len * sin };
}

function endpoints(state: LineEndpointState, modifiers: GestureModifiers): LineEndpoints {
  const { initial, which } = state.ctx;
  const grabbed =
    which === "p1" ? { x: initial.x1, y: initial.y1 } : { x: initial.x2, y: initial.y2 };
  const anchor =
    which === "p1" ? { x: initial.x2, y: initial.y2 } : { x: initial.x1, y: initial.y1 };
  const moved = {
    x: grabbed.x + (state.current.x - state.start.x),
    y: grabbed.y + (state.current.y - state.start.y),
  };
  const placed = modifiers.shift ? snapAbout(anchor, moved) : moved;
  return which === "p1"
    ? { x1: placed.x, y1: placed.y, x2: anchor.x, y2: anchor.y }
    : { x1: anchor.x, y1: anchor.y, x2: placed.x, y2: placed.y };
}

export const lineEndpointMachine: GestureMachine<LineEndpointState, LineEndpointContext> = {
  begin: (point, ctx) => beginDrag(point, ctx),
  update: (state, point, modifiers) => updateDrag(state, point, modifiers),
  end(state, modifiers) {
    if (!state.dragged) return { action: null };
    const next = endpoints(state, modifiers);
    // A line collapsed onto its own anchor is nothing to see — the same
    // refusal the line tool makes for a zero-length draw.
    if (next.x1 === next.x2 && next.y1 === next.y2) return { action: null };
    return {
      action: objectResizeCommitted({
        pageIndex: state.ctx.pageIndex,
        boxes: { [state.ctx.id]: next },
      }),
    };
  },
  cancel: cancelResult,
  // The resize preview already draws endpoints as a line; an endpoint drag
  // changes exactly the same thing, so it reuses that arm rather than adding
  // a second way to say "this line, here".
  preview: (state) => ({
    kind: "resize",
    boxes: { [state.ctx.id]: endpoints(state, state.modifiers) },
  }),
};
