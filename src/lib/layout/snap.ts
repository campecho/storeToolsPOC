import type { LayoutDocument, LayoutObject } from "@/schema";
import { columnGuides } from "./geometry";
import { rotatedBBox, type BBox } from "./objects";

/**
 * Snapping (plan L7): candidate detection + resolution, pure and in inches so
 * it's testable away from the DOM. Targets are the page margins, page
 * centers, column guides (when the Guides toggle is on), and other objects'
 * edges/centers. The canvas converts the fixed px radius to inches at the
 * current zoom, feeds gestures through snapBBox/snapPoint, and renders the
 * returned lines as smart guides. Nearest target wins; ties resolve to the
 * lower coordinate (targets are sorted), so resolution is deterministic.
 */

// ASSUMPTION: a 6px screen-space snap radius feels right at any zoom —
// confirm with associates on real hardware.
export const SNAP_THRESHOLD_PX = 6;

/** A smart guide to render: a full-height (v) or full-width (h) line, inches. */
export type SnapLine = { axis: "v" | "h"; at: number };

/** Candidate coordinates per axis: v = x positions, h = y positions. */
export type SnapTargets = { v: number[]; h: number[] };

function dedupeSorted(list: number[]): number[] {
  const sorted = [...list].sort((a, b) => a - b);
  return sorted.filter((x, i) => i === 0 || x - sorted[i - 1] > 1e-6);
}

export function snapTargets(
  doc: LayoutDocument,
  objects: LayoutObject[],
  opts: { exclude?: Set<string>; columnGuidesOn?: boolean; guidesOn?: boolean } = {},
): SnapTargets {
  const { w, h } = doc.size;
  const m = doc.margin;
  const v: number[] = [m, w / 2, w - m];
  const hh: number[] = [m, h / 2, h - m];
  if (opts.columnGuidesOn) {
    for (const [a, b] of columnGuides(doc)) v.push(a, b);
  }
  if (opts.guidesOn) {
    // ruler-dragged guides (plan L11) — v guides are x-positions, h are y
    for (const x of doc.guides.v) v.push(x);
    for (const y of doc.guides.h) hh.push(y);
  }
  for (const o of objects) {
    if (opts.exclude?.has(o.id)) continue;
    // a rotated object contributes its axis-aligned footprint (plan L10)
    const b = rotatedBBox(o);
    v.push(b.x, b.x + b.w / 2, b.x + b.w);
    hh.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { v: dedupeSorted(v), h: dedupeSorted(hh) };
}

function nearest(
  cands: number[],
  targets: number[],
  thresholdIn: number,
): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const c of cands) {
    for (const t of targets) {
      const d = t - c;
      if (Math.abs(d) <= thresholdIn && (!best || Math.abs(d) < Math.abs(best.delta))) {
        best = { delta: d, at: t };
      }
    }
  }
  return best;
}

/**
 * Snap a box being moved: its edges and centers try both axes independently.
 * Returns the correction to add to the box position plus the guide lines.
 */
export function snapBBox(
  b: BBox,
  targets: SnapTargets,
  thresholdIn: number,
): { dx: number; dy: number; lines: SnapLine[] } {
  const sx = nearest([b.x, b.x + b.w / 2, b.x + b.w], targets.v, thresholdIn);
  const sy = nearest([b.y, b.y + b.h / 2, b.y + b.h], targets.h, thresholdIn);
  return {
    dx: sx?.delta ?? 0,
    dy: sy?.delta ?? 0,
    lines: [
      ...(sx ? [{ axis: "v" as const, at: sx.at }] : []),
      ...(sy ? [{ axis: "h" as const, at: sy.at }] : []),
    ],
  };
}

/**
 * Snap a single point — a draw corner, a dragged resize edge, or a line
 * endpoint. Axes are opt-out so edge handles snap only the axis they move.
 */
export function snapPoint(
  x: number,
  y: number,
  targets: SnapTargets,
  thresholdIn: number,
  axes: { x: boolean; y: boolean } = { x: true, y: true },
): { x: number; y: number; lines: SnapLine[] } {
  const sx = axes.x ? nearest([x], targets.v, thresholdIn) : null;
  const sy = axes.y ? nearest([y], targets.h, thresholdIn) : null;
  return {
    x: x + (sx?.delta ?? 0),
    y: y + (sy?.delta ?? 0),
    lines: [
      ...(sx ? [{ axis: "v" as const, at: sx.at }] : []),
      ...(sy ? [{ axis: "h" as const, at: sy.at }] : []),
    ],
  };
}
