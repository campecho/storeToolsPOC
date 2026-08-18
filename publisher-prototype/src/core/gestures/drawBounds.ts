import type { ActionCreatorWithPayload } from "@reduxjs/toolkit";
import type { PathSeg, ShapeObject } from "../model";
import {
  ellipseDrawCommitted,
  rectDrawCommitted,
  type DrawCommit,
} from "../store/documentActions";
import { DEFAULT_SHAPE_SIZE_IN } from "./constants";
import { beginDrag, cancelResult, updateDrag, type DragState } from "./drag";
import type {
  DrawStyle,
  GestureContext,
  GestureMachine,
  GestureModifiers,
  GesturePoint,
} from "./types";

/**
 * Bounds-drawing machine for the rect and ellipse tools — mechanizes the
 * registry clauses rect|ellipse.drag.creates, .shift-drag.constrains-*,
 * .alt-drag.draws-from-center, .click.creates-default-size, and
 * .esc.cancels-draw (src/core/registry/tools/shapes.ts).
 *
 * Corner-to-corner bounds; Shift constrains to a square of the larger drag
 * dimension, growing toward the drag direction; Alt draws from the press
 * point outward as center. Modifiers re-evaluate on every update — releasing
 * Shift mid-drag un-constrains the very next preview.
 */

export type DrawBoundsShape = "rect" | "ellipse";

export type DrawBoundsContext = GestureContext & {
  style: DrawStyle;
  /** Injected id source — no randomness inside the machine, so identical
      pointer streams commit identical objects (test determinism). */
  idFactory: () => string;
};

export type DrawBoundsState = DragState<DrawBoundsContext>;

type Box = { x: number; y: number; w: number; h: number };

function dragBounds(start: GesturePoint, current: GesturePoint, modifiers: GestureModifiers): Box {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  let w = Math.abs(dx);
  let h = Math.abs(dy);
  if (modifiers.shift) {
    const side = Math.max(w, h);
    w = side;
    h = side;
  }
  if (modifiers.alt) {
    return { x: start.x - w, y: start.y - h, w: 2 * w, h: 2 * h };
  }
  return {
    x: dx >= 0 ? start.x : start.x - w,
    y: dy >= 0 ? start.y : start.y - h,
    w,
    h,
  };
}

/** ASSUMPTION: the click-default 1×1 in shape is CENTERED at the click point
    (not corner-anchored) — the contract says "at the click point" without
    picking an anchor; centered is the Publisher convention, pending SME
    review. */
function clickDefaultBox(point: GesturePoint): Box {
  const half = DEFAULT_SHAPE_SIZE_IN / 2;
  return { x: point.x - half, y: point.y - half, w: DEFAULT_SHAPE_SIZE_IN, h: DEFAULT_SHAPE_SIZE_IN };
}

/**
 * Bounds-drawing machine for the path-shape tools (rounded rect, star /
 * polygon, callout, banner, flowchart) — the same drag/Shift/Alt/click/Esc
 * clause set as rect and ellipse, committing a `shape: "path"` object whose
 * normalized `d` is built for the final box. `pathForBox` receives the box
 * because inch-denominated parameters (a corner radius) normalize against
 * the box dimensions; the preview rebuilds `d` per update so the shape is
 * live while dragging.
 */
export type DrawPathContext = DrawBoundsContext & {
  pathForBox: (box: { x: number; y: number; w: number; h: number }) => PathSeg[];
};

export type DrawPathState = DragState<DrawPathContext>;

export function drawPathMachine(
  creator: ActionCreatorWithPayload<DrawCommit>,
): GestureMachine<DrawPathState, DrawPathContext> {
  return {
    begin: (point, ctx) => beginDrag(point, ctx),
    update: (state, point, modifiers) => updateDrag(state, point, modifiers),
    end(state, modifiers) {
      const { ctx } = state;
      const box = state.dragged
        ? dragBounds(state.start, state.current, modifiers)
        : clickDefaultBox(state.start);
      if (box.w === 0 || box.h === 0) return { action: null };
      const object: ShapeObject = {
        id: ctx.idFactory(),
        type: "shape",
        shape: "path",
        d: ctx.pathForBox(box),
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        rotation: 0,
        locked: false,
        fill: ctx.style.fill,
        stroke: ctx.style.stroke,
      };
      return { action: creator({ pageIndex: ctx.pageIndex, object }) };
    },
    cancel: cancelResult,
    preview(state) {
      const box = dragBounds(state.start, state.current, state.modifiers);
      return { kind: "draw-path", ...box, d: state.ctx.pathForBox(box) };
    },
  };
}

export function drawBoundsMachine(
  shape: DrawBoundsShape,
): GestureMachine<DrawBoundsState, DrawBoundsContext> {
  const creator = shape === "rect" ? rectDrawCommitted : ellipseDrawCommitted;
  return {
    begin: (point, ctx) => beginDrag(point, ctx),
    update: (state, point, modifiers) => updateDrag(state, point, modifiers),
    end(state, modifiers) {
      const { ctx } = state;
      const box = state.dragged
        ? dragBounds(state.start, state.current, modifiers)
        : clickDefaultBox(state.start);
      // Degenerate zero-area drag (e.g. a purely horizontal drag): nothing
      // commits — the caller simply discards the preview.
      if (box.w === 0 || box.h === 0) return { action: null };
      const object: ShapeObject = {
        id: ctx.idFactory(),
        type: "shape",
        shape,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        rotation: 0,
        locked: false,
        fill: ctx.style.fill,
        stroke: ctx.style.stroke,
      };
      return { action: creator({ pageIndex: ctx.pageIndex, object }) };
    },
    cancel: cancelResult,
    preview: (state) => ({
      kind: "draw",
      shape,
      ...dragBounds(state.start, state.current, state.modifiers),
    }),
  };
}
