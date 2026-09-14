import type { FrameObject, PathSeg } from "@/schema";
import { cmykPercent } from "@/lib/color/convert";
import { solidPaint } from "@/lib/color/paint";

/**
 * Pen / freeform tool core, merged from the publisher prototype
 * (publisher-prototype/src/core/gestures/pen.ts). Unlike every other drawing
 * tool, a pen path spans MANY pointer sessions: each press adds one anchor to
 * a draft, and the close/finish act commits the whole shape as ONE document
 * object (a normalized `path` frame) in one history entry.
 *
 * Curve anchors mirror their handles about the anchor point at placement —
 * the drag pulls handleOut, handleIn is its reflection (the Publisher/
 * Illustrator convention; independent handle editing stays out, as it does
 * in the prototype, where it belongs to the node-select tranche).
 */

export type PenPoint = { x: number; y: number };

/** One drafted anchor, in page inches. Straight anchors carry no handles. */
export type PenAnchor = {
  point: PenPoint;
  handleOut?: PenPoint;
  handleIn?: PenPoint;
};

/** How close (screen px) a press must land to the start anchor to close the
    path — the prototype's pen.click-start.closes-path tolerance. */
export const PEN_START_HIT_PX = 8;

export function mirrorPoint(point: PenPoint, about: PenPoint): PenPoint {
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
 * The draft as page-space path segments (open, no Z) — what the draft
 * overlay renders while drawing. Fewer than two anchors yield just the M (or
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

function segPoints(seg: PathSeg): PenPoint[] {
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
 * The committed pen shape: page-space draft segments (plus the closing
 * segment and Z when closed) normalized into their bounding box — control
 * points included, so every normalized coordinate stays within 0–1 (the
 * frame box is the control hull's box; carried ASSUMPTION: it may run
 * slightly larger than the drawn ink on strong curves — exact curve extrema
 * are node editing's concern).
 *
 * Null when the draft can't be a shape: fewer than 2 anchors open / 3
 * closed, or a degenerate (zero width or height) bounding box — an
 * axis-collinear straight draft is the line tool's job.
 */
export function penObjectFromDraft(
  anchors: readonly PenAnchor[],
  closed: boolean,
): FrameObject | null {
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
    id: crypto.randomUUID(),
    type: "path",
    d,
    x,
    y,
    w,
    h,
    rotation: 0,
    locked: false,
    fill: solidPaint(cmykPercent(0, 0, 0, 5)),
    stroke: { paint: solidPaint(cmykPercent(0, 0, 0, 44)), width: 1 },
  };
}
