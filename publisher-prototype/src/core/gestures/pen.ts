import type { UnknownAction } from "@reduxjs/toolkit";
import type { PathSeg, ShapeObject } from "../model";
import { gestureCancelled, penDrawCommitted } from "../store/documentActions";
import { penAnchorCommitted, penCurveAnchorCommitted, type PenAnchor } from "../store/penSlice";
import { penStartToleranceIn } from "./constants";
import { beginDrag, cancelResult, updateDrag, type DragState } from "./drag";
import type { DrawStyle, GestureMachine, GestureContext, GesturePoint } from "./types";

/**
 * Pen / freeform tool core — mechanizes pen.click.adds-anchor,
 * pen.click-drag.adds-curve-anchor, pen.click-start.closes-path, and
 * pen.esc.discards-path (src/core/registry/tools/shapes.ts). Unlike every
 * other drawing tool, a pen path spans MANY pointer sessions: each press is
 * its own gesture committing one anchor action into the pen draft slice, and
 * the close/finish gesture commits the whole shape. finishPenDraft covers
 * the pointer-less half of pen.double-click.commits-open-path (Enter and
 * the shell's double-click handler).
 *
 * Curve anchors mirror their handles about the anchor point at placement —
 * the drag pulls handleOut, handleIn is its reflection (the Publisher/
 * Illustrator convention; independent handle editing belongs to the
 * node-select tool).
 */

export type PenContext = GestureContext & {
  /** The draft so far (penSlice state) — the machine needs the first anchor
      for the close-target test and the whole draft to build the commit. */
  anchors: readonly PenAnchor[];
  style: DrawStyle;
  idFactory: () => string;
};

export type PenPressState = DragState<PenContext> & {
  /** Decided at press time: this press lands on the start anchor and closes
      the path (needs a closable ring — at least 3 anchors). */
  closing: boolean;
};

type Point = GesturePoint;

function mirror(point: Point, about: Point): Point {
  return { x: 2 * about.x - point.x, y: 2 * about.y - point.y };
}

/** One drafted segment INTO `to`: a cubic when either adjoining handle
    exists (missing handles degenerate to their endpoints), a line when
    neither does. */
function segmentInto(from: PenAnchor, to: PenAnchor): PathSeg {
  const c1 = from.handleOut;
  const c2 = to.handleIn;
  if (c1 === undefined && c2 === undefined) {
    return { c: "L", x: to.point.x, y: to.point.y };
  }
  const p1 = c1 ?? from.point;
  const p2 = c2 ?? to.point;
  return { c: "C", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: to.point.x, y: to.point.y };
}

/**
 * The draft as document-space path segments (open, no Z) — what the overlay
 * renders while drawing. Fewer than two anchors yield just the M (or
 * nothing), which renders as nothing.
 */
export function penDraftSegments(anchors: readonly PenAnchor[]): PathSeg[] {
  const first = anchors[0];
  if (first === undefined) return [];
  const segs: PathSeg[] = [{ c: "M", x: first.point.x, y: first.point.y }];
  for (let i = 1; i < anchors.length; i++) {
    const from = anchors[i - 1];
    const to = anchors[i];
    if (from && to) segs.push(segmentInto(from, to));
  }
  return segs;
}

function segPoints(seg: PathSeg): Point[] {
  switch (seg.c) {
    case "M":
    case "L":
      return [{ x: seg.x, y: seg.y }];
    case "C":
      return [
        { x: seg.x1, y: seg.y1 },
        { x: seg.x2, y: seg.y2 },
        { x: seg.x, y: seg.y },
      ];
    case "Z":
      return [];
  }
}

/**
 * The committed pen shape: document-space draft segments (plus the closing
 * segment and Z when closed) normalized into their bounding box — control
 * points included, so every normalized coordinate stays within 0–1 (the
 * frame box is the control hull's box; ASSUMPTION: it may run slightly
 * larger than the drawn ink on strong curves — exact curve extrema are the
 * node-editing tranche's concern, working simplification for SME review).
 *
 * Null when the draft can't be a shape: fewer than 2 anchors open / 3
 * closed, or a degenerate (zero width or height) bounding box —
 * ASSUMPTION: axis-collinear straight drafts are the line tool's job.
 */
export function penObjectFromDraft(
  anchors: readonly PenAnchor[],
  closed: boolean,
  style: DrawStyle,
  id: string,
): ShapeObject | null {
  if (anchors.length < (closed ? 3 : 2)) return null;
  const docSegs = penDraftSegments(anchors);
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (closed && first && last) {
    docSegs.push(segmentInto(last, first), { c: "Z" });
  }
  const pts = docSegs.flatMap(segPoints);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  if (w === 0 || h === 0) return null;
  const nx = (v: number) => (v - x) / w;
  const ny = (v: number) => (v - y) / h;
  const d: PathSeg[] = docSegs.map((seg) => {
    switch (seg.c) {
      case "M":
      case "L":
        return { c: seg.c, x: nx(seg.x), y: ny(seg.y) };
      case "C":
        return {
          c: "C",
          x1: nx(seg.x1),
          y1: ny(seg.y1),
          x2: nx(seg.x2),
          y2: ny(seg.y2),
          x: nx(seg.x),
          y: ny(seg.y),
        };
      case "Z":
        return seg;
    }
  });
  return {
    id,
    type: "shape",
    shape: "path",
    d,
    x,
    y,
    w,
    h,
    rotation: 0,
    locked: false,
    fill: style.fill,
    stroke: style.stroke,
  };
}

/**
 * One pen press. Press location decides the gesture at begin: on the start
 * anchor (within the close tolerance, ring closable) it is the close-click;
 * anywhere else an under-slop release adds a straight anchor and a drag
 * adds a curve anchor with mirrored handles. Exactly one action per press.
 */
export const penMachine: GestureMachine<PenPressState, PenContext> = {
  begin(point, ctx) {
    const start = ctx.anchors[0];
    const closing =
      ctx.anchors.length >= 3 &&
      start !== undefined &&
      Math.hypot(point.x - start.point.x, point.y - start.point.y) <=
        penStartToleranceIn(ctx.zoom);
    return { ...beginDrag(point, ctx), closing };
  },
  update: (state, point, modifiers) => ({ ...updateDrag(state, point, modifiers), closing: state.closing }),
  end(state) {
    const { ctx } = state;
    if (state.closing) {
      // Close commits the existing ring; a drag on the close press is
      // ignored (ASSUMPTION: drag-to-curve the closing segment is deferred
      // with the node-editing tranche). A degenerate ring commits nothing.
      const object = penObjectFromDraft(ctx.anchors, true, ctx.style, ctx.idFactory());
      if (object === null) return { action: null };
      return { action: penDrawCommitted({ pageIndex: ctx.pageIndex, object }) };
    }
    if (!state.dragged) {
      return { action: penAnchorCommitted({ anchor: { point: state.start } }) };
    }
    return {
      action: penCurveAnchorCommitted({
        anchor: {
          point: state.start,
          handleOut: state.current,
          handleIn: mirror(state.current, state.start),
        },
      }),
    };
  },
  cancel: cancelResult,
  preview(state) {
    // The rubber handle: out where the pointer is, in mirrored. Under-slop
    // (or a closing press) both coincide with the point and render as a dot.
    const handleOut = state.dragged ? state.current : state.start;
    return {
      kind: "pen-handle",
      point: state.start,
      handleOut,
      handleIn: mirror(handleOut, state.start),
    };
  },
};

/**
 * Finish the draft as a shape — the pen.double-click.commits-open-path
 * clause (Enter, and double-click via the shell, which passes the draft
 * minus the double-click's duplicate anchor). The autoClose option turns a
 * closable finish into a closed ring. An unfinishable draft (too few
 * anchors, degenerate box) discards instead — the gesture still resolves
 * in exactly one action.
 */
export function finishPenDraft(
  anchors: readonly PenAnchor[],
  pageIndex: number,
  autoClose: boolean,
  style: DrawStyle,
  idFactory: () => string,
): UnknownAction | null {
  if (anchors.length === 0) return null;
  const closed = autoClose && anchors.length >= 3;
  const object = penObjectFromDraft(anchors, closed, style, idFactory());
  if (object === null) return gestureCancelled();
  return penDrawCommitted({ pageIndex, object });
}
