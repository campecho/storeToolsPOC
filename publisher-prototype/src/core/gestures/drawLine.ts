import type { ActionCreatorWithPayload } from "@reduxjs/toolkit";
import type { LineObject, Stroke } from "../model";
import { lineDrawCommitted, type DrawCommit, type LineEndpoints } from "../store/documentActions";
import { LINE_SNAP_DEG } from "./constants";
import { beginDrag, cancelResult, updateDrag, type DragState } from "./drag";
import type {
  DrawStyle,
  GestureContext,
  GestureMachine,
  GestureModifiers,
  GesturePoint,
} from "./types";

/**
 * Line-drawing machine — mechanizes the line AND arrow tools' drag.creates,
 * shift-drag.constrains-angle, and esc.cancels-draw clauses
 * (src/core/registry/tools/shapes.ts): both draw an endpoint segment; the
 * arrow differs only in the clause action it commits through and the
 * decoration fields (heads, dash) its options bake onto the object. Shift
 * snaps the segment to 45° increments, preserving the drag projected onto
 * the snapped direction.
 *
 * An under-slop click commits nothing: a zero-length line is nothing, and the
 * registry deliberately defines no click-default for either tool ("No
 * Alt-from-center and no click-for-default-size" in their notes).
 */

/** The additive line-decoration fields a tool's options bake onto the
    committed object. Callers OMIT schema defaults (none / m / solid) so
    documents stay lean — the additive rule. */
export type LineExtras = Partial<Pick<LineObject, "headStart" | "headEnd" | "headSize" | "dash">>;

export type DrawLineContext = GestureContext & {
  /** Only `stroke` applies to lines; `fill` is carried for tool-option
      uniformity and ignored. */
  style: DrawStyle;
  idFactory: () => string;
  extras?: LineExtras;
};

export type DrawLineState = DragState<DrawLineContext>;

/** ASSUMPTION: a line drawn while the tool ctx carries no stroke falls back
    to 1 pt literal black — a LineObject requires a non-null stroke and the
    doc names no default; working guess for SME review. */
const FALLBACK_LINE_STROKE: Stroke = {
  paint: { kind: "color", color: { space: "rgb", values: [0, 0, 0] } },
  width: 1,
};

function lineEndpoints(
  start: GesturePoint,
  current: GesturePoint,
  modifiers: GestureModifiers,
): LineEndpoints {
  if (!modifiers.shift) {
    return { x1: start.x, y1: start.y, x2: current.x, y2: current.y };
  }
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const step = (LINE_SNAP_DEG * Math.PI) / 180;
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
  const cos = Math.cos(snapped);
  const sin = Math.sin(snapped);
  // Length = the drag projected onto the snapped direction.
  const len = dx * cos + dy * sin;
  return { x1: start.x, y1: start.y, x2: start.x + len * cos, y2: start.y + len * sin };
}

export function drawLineMachineFor(
  creator: ActionCreatorWithPayload<DrawCommit>,
): GestureMachine<DrawLineState, DrawLineContext> {
  return {
    begin: (point, ctx) => beginDrag(point, ctx),
    update: (state, point, modifiers) => updateDrag(state, point, modifiers),
    end(state, modifiers) {
      if (!state.dragged) return { action: null };
      const endpoints = lineEndpoints(state.start, state.current, modifiers);
      if (endpoints.x1 === endpoints.x2 && endpoints.y1 === endpoints.y2) {
        return { action: null };
      }
      const { ctx } = state;
      const object: LineObject = {
        id: ctx.idFactory(),
        type: "line",
        ...endpoints,
        locked: false,
        stroke: ctx.style.stroke ?? FALLBACK_LINE_STROKE,
        ...ctx.extras,
      };
      return { action: creator({ pageIndex: ctx.pageIndex, object }) };
    },
    cancel: cancelResult,
    preview: (state) => ({
      kind: "line",
      ...lineEndpoints(state.start, state.current, state.modifiers),
    }),
  };
}

export const drawLineMachine = drawLineMachineFor(lineDrawCommitted);
