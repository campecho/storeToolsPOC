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
 * pen.esc.ends-path (src/core/registry/tools/shapes.ts). Unlike every
 * other drawing tool, a pen path spans MANY pointer sessions: each press is
 * its own gesture committing one anchor action into the pen draft slice, and
 * the close/finish gesture commits the whole shape. finishPenDraft covers
 * every pointer-less finish — Enter, Esc, the shell's double-click handler,
 * and switching away from the tool.
 *
 * Curve anchors mirror their handles about the anchor point at placement —
 * the drag pulls handleOut, handleIn is its reflection (the Publisher/
 * Illustrator convention; independent handle editing belongs to the
 * node-select tool).
 *
 * The path in progress previews LIVE, the way Illustrator's pen does: the
 * segment the next press would add rubber-bands from the last anchor to the
 * pointer (penRubberBand), and a curve-anchor drag draws the curve it is
 * shaping rather than only its handles (the machine's `pending` preview).
 * Both are pure functions of the draft and one point — the shell renders
 * them from React state, never from a per-pointermove dispatch (§6.3).
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

/**
 * Whether a press at `point` would CLOSE the draft: on the first anchor,
 * within the zoom-independent tolerance, with a ring closable at all (3+
 * anchors). The press machine and the rubber band share this one test, so
 * the preview can never promise a close the click won't make.
 */
export function penClosesAt(
  anchors: readonly PenAnchor[],
  point: Point,
  zoom: number,
): boolean {
  const start = anchors[0];
  if (anchors.length < 3 || start === undefined) return false;
  return (
    Math.hypot(point.x - start.point.x, point.y - start.point.y) <= penStartToleranceIn(zoom)
  );
}

/**
 * The rubber band between presses: the segment the NEXT press would add,
 * drawn live from the last placed anchor to the pointer. It is a complete
 * mini-path — its own M at the last anchor — so the overlay renders it
 * beside the committed draft without splicing into it.
 *
 * The far end snaps to the first anchor when a press there would close the
 * ring, so the band shows the closing segment exactly as it will commit. An
 * empty draft has nothing to rubber-band from and yields nothing.
 */
export function penRubberBand(
  anchors: readonly PenAnchor[],
  point: Point,
  zoom: number,
): PathSeg[] {
  const last = anchors[anchors.length - 1];
  const start = anchors[0];
  if (last === undefined) return [];
  const to = penClosesAt(anchors, point, zoom) && start !== undefined ? start : { point };
  return [{ c: "M", x: last.point.x, y: last.point.y }, segmentInto(last, to)];
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
 * A STRAIGHT draft keeps its zero-extent axis rather than vanishing: a
 * horizontal or vertical path commits with `h` (or `w`) of 0, which the
 * schema allows and the resize clamp already treats as an unscalable axis
 * (MIN_RESIZE_SIZE_IN's `bounds.w > 0` guard). Normalization divides by the
 * extent, so the flat axis normalizes to 0 for every point.
 * (Decision of record, user-ratified 2026-09-08, retiring the earlier
 * "axis-collinear straight drafts are the line tool's job" assumption — a
 * partial shape must never disappear on the way out of the tool.)
 *
 * Null when the draft can't be a shape at all: fewer than 2 anchors open / 3
 * closed, or a POINT-degenerate box — every point identical, which has no
 * geometry to keep in either axis.
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
  if (w === 0 && h === 0) return null;
  const nx = (v: number) => (w === 0 ? 0 : (v - x) / w);
  const ny = (v: number) => (h === 0 ? 0 : (v - y) / h);
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
    return { ...beginDrag(point, ctx), closing: penClosesAt(ctx.anchors, point, ctx.zoom) };
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
    const handleIn = mirror(handleOut, state.start);
    // …and the segment this press is shaping, live: from the last placed
    // anchor into the anchor being placed, THIS drag's handleIn already
    // applied, so the curve appears while the handle is pulled instead of
    // only once the next press finalizes it. A closing press previews the
    // closing segment into the first anchor.
    const last = state.ctx.anchors[state.ctx.anchors.length - 1];
    const into = state.closing
      ? state.ctx.anchors[0]
      : { point: state.start, ...(state.dragged ? { handleIn } : {}) };
    const pending: PathSeg[] =
      last === undefined || into === undefined
        ? []
        : [{ c: "M", x: last.point.x, y: last.point.y }, segmentInto(last, into)];
    return { kind: "pen-handle", point: state.start, handleOut, handleIn, pending };
  },
};

/**
 * Finish the draft as a shape — the one exit every way out of the pen takes:
 * pen.double-click.commits-open-path (Enter, and double-click via the shell,
 * which passes the draft minus the double-click's duplicate anchor),
 * pen.esc.ends-path, and the shell's switch-away-from-the-tool path. What
 * was drawn is KEPT in all of them (Illustrator parity, user-ratified
 * 2026-09-08); undo, one anchor at a time, is the only way to unmake it.
 *
 * The autoClose option turns a closable finish into a closed ring. A draft
 * with no shape in it at all (one anchor, or every point identical)
 * discards instead — the gesture still resolves in exactly one action.
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
