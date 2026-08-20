import { createAction } from "@reduxjs/toolkit";
import type { LayoutObject, Orientation, PageSize, Paint } from "../model";

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

/** fill commits: replace the identified objects' fill wholesale — a Paint or
    null (hollow). Lines carry no fill and are skipped by the reducer. */
export type FillCommit = {
  pageIndex: number;
  ids: string[];
  fill: Paint | null;
};

/** stroke-paint commits: set the identified objects' stroke color, keeping
    each object's own width — or remove the stroke entirely (null). A frame
    with no stroke gains one at the draw tools' default 1pt width; a line's
    stroke is required by schema, so the reducer ignores null for lines
    rather than producing an invisible, unparseable object. */
export type StrokePaintCommit = {
  pageIndex: number;
  ids: string[];
  paint: Paint | null;
};

/** stroke-width commits: set the width (points) of every identified object
    that HAS a stroke; a stroke-less frame is left alone — there is nothing
    to thicken, and inventing a paint here would hide a real edit. */
export type StrokeWidthCommit = {
  pageIndex: number;
  ids: string[];
  width: number;
};

/** lock commits: set the identified objects' locked flag. The one translate-
    family action that must NOT skip locked objects — unlocking is its point. */
export type LockCommit = {
  pageIndex: number;
  ids: string[];
  locked: boolean;
};

/** Document setup commits (§1.4, the Document setup panel): a partial of the
    document-level setup fields; only provided fields apply. One committed
    panel edit normally carries one field — the partial exists because an
    orientation toggle must swap `size` and set `orientation` in ONE action
    (one gesture, one history entry). The caller sends finished values
    (already-swapped dimensions), per this file's payload rule. */
export type DocumentSetupCommit = {
  size?: PageSize;
  orientation?: Orientation;
  bleed?: number;
  margin?: number;
  slug?: number;
  columns?: number;
};

/** Per-page size override commits (§1.2 mixed sizes, §1.4 per-page setup):
    set the page's sizeOverride, or clear it back to the document size
    (null). The whole override is the unit — panels edit both dimensions
    through one committed value. */
export type PageSizeOverrideCommit = {
  pageIndex: number;
  sizeOverride: PageSize | null;
};

export const rectDrawCommitted = createAction<DrawCommit>("rect/drawCommitted");
export const ellipseDrawCommitted = createAction<DrawCommit>("ellipse/drawCommitted");
export const lineDrawCommitted = createAction<DrawCommit>("line/drawCommitted");
export const arrowDrawCommitted = createAction<DrawCommit>("arrow/drawCommitted");
export const roundedRectDrawCommitted = createAction<DrawCommit>("roundedRect/drawCommitted");
export const starPolygonDrawCommitted = createAction<DrawCommit>("starPolygon/drawCommitted");
export const calloutDrawCommitted = createAction<DrawCommit>("callout/drawCommitted");
export const bannerDrawCommitted = createAction<DrawCommit>("banner/drawCommitted");
export const flowchartDrawCommitted = createAction<DrawCommit>("flowchart/drawCommitted");
export const penDrawCommitted = createAction<DrawCommit>("pen/drawCommitted");
export const objectMoveCommitted = createAction<TranslateCommit>("object/moveCommitted");
export const objectNudgeCommitted = createAction<TranslateCommit>("object/nudgeCommitted");
export const objectResizeCommitted = createAction<ResizeCommit>("object/resizeCommitted");
export const objectRotateCommitted = createAction<RotateCommit>("object/rotateCommitted");
export const objectFillCommitted = createAction<FillCommit>("object/fillCommitted");
export const objectStrokePaintCommitted = createAction<StrokePaintCommit>(
  "object/strokePaintCommitted",
);
export const objectStrokeWidthCommitted = createAction<StrokeWidthCommit>(
  "object/strokeWidthCommitted",
);
export const objectLockCommitted = createAction<LockCommit>("object/lockCommitted");
export const documentSetupCommitted = createAction<DocumentSetupCommit>(
  "document/setupCommitted",
);
export const pageSizeOverrideCommitted = createAction<PageSizeOverrideCommit>(
  "page/sizeOverrideCommitted",
);

/** The gesture pipeline's DevTools record for an aborted gesture (Esc during
    drag, discarded pen path). No DOCUMENT reducer handles it — an aborted
    gesture never changes the document — but the pen draft (app state,
    penSlice) clears on it: pen.esc.discards-path binds to this action, and a
    non-empty draft IS state to discard. */
export const gestureCancelled = createAction("gesture/cancelled");
