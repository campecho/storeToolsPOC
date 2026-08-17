import { createAction } from "@reduxjs/toolkit";
import type { LayoutObject } from "../model";

/**
 * Tool commit actions on the document (PLAN.md §6.3). These are cross-tool
 * vocabulary — the registry's gesture clauses name them, several tools share
 * them — so they live here as createAction creators rather than inside the
 * document slice, whose extraReducers handle them. Action types ARE the
 * registry's gesture-clause action strings (viewportSlice discipline): the
 * contract, the action, and the test share one string.
 *
 * Payloads are complete and geometry is canonical inches: the caller (the
 * gesture pipeline) constructs finished objects — ids included — and final
 * boxes/deltas, so reducers stay deterministic with no id generation and no
 * geometry math beyond application.
 */

/** rect/ellipse/line draw commits: the finished object, appended to the
    page's objects (z-order is array order — appended = topmost). */
export type DrawCommit = {
  pageIndex: number;
  object: LayoutObject;
};

/** move/nudge commits: translate the identified objects by (dx, dy) inches.
    Lines move by both endpoints. */
export type TranslateCommit = {
  pageIndex: number;
  ids: string[];
  dx: number;
  dy: number;
};

export type FrameBox = { x: number; y: number; w: number; h: number };
export type LineEndpoints = { x1: number; y1: number; x2: number; y2: number };

/** resize commits: absolute final geometry per object — frame objects get
    boxes, lines get endpoints; the reducer applies whichever matches the
    object and ignores a mismatched entry. */
export type ResizeCommit = {
  pageIndex: number;
  boxes: Record<string, FrameBox | LineEndpoints>;
};

/** rotate commits: absolute rotations in degrees per object id. Lines carry
    no rotation field and are skipped by the reducer. */
export type RotateCommit = {
  pageIndex: number;
  rotations: Record<string, number>;
};

export const rectDrawCommitted = createAction<DrawCommit>("rect/drawCommitted");
export const ellipseDrawCommitted = createAction<DrawCommit>("ellipse/drawCommitted");
export const lineDrawCommitted = createAction<DrawCommit>("line/drawCommitted");
export const objectMoveCommitted = createAction<TranslateCommit>("object/moveCommitted");
export const objectNudgeCommitted = createAction<TranslateCommit>("object/nudgeCommitted");
export const objectResizeCommitted = createAction<ResizeCommit>("object/resizeCommitted");
export const objectRotateCommitted = createAction<RotateCommit>("object/rotateCommitted");

/** The gesture pipeline's DevTools record for an aborted gesture (Esc during
    drag, discarded pen path). No reducer anywhere handles it — it is never a
    state change, only a visible timeline entry. */
export const gestureCancelled = createAction("gesture/cancelled");
