import type { LayoutObject } from "@/schema";
import { bboxOf, withBBox, type BBox } from "./objects";

/**
 * Align & distribute math (plan L7) — pure bbox transforms, unit-tested away
 * from the DOM. Everything works on an explicit reference box, so "Relative
 * to" Page vs Selection is the caller's choice of `ref`; lines participate
 * via their bboxes (withBBox maps endpoints back proportionally).
 */

export type AlignKind = "left" | "centerH" | "right" | "top" | "centerV" | "bottom";
export type DistributeAxis = "h" | "v";
export type AlignRelativeTo = "page" | "selection";

/** Union bbox of a set of objects — the "Relative to selection" reference. */
export function unionBBox(objects: LayoutObject[]): BBox | null {
  if (!objects.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const o of objects) {
    const b = bboxOf(o);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function alignedPos(kind: AlignKind, ref: BBox, b: BBox): Partial<BBox> {
  switch (kind) {
    case "left":
      return { x: ref.x };
    case "centerH":
      return { x: ref.x + (ref.w - b.w) / 2 };
    case "right":
      return { x: ref.x + ref.w - b.w };
    case "top":
      return { y: ref.y };
    case "centerV":
      return { y: ref.y + (ref.h - b.h) / 2 };
    case "bottom":
      return { y: ref.y + ref.h - b.h };
  }
}

/** Each object aligned to the reference box; order and sizes are untouched. */
export function alignObjects(objects: LayoutObject[], kind: AlignKind, ref: BBox): LayoutObject[] {
  return objects.map((o) => {
    const b = bboxOf(o);
    return withBBox(o, { ...b, ...alignedPos(kind, ref, b) });
  });
}

/**
 * Equal-gap distribution along one axis: objects keep their current order and
 * sizes; the gaps between neighboring edges equalize across the reference
 * span. With `ref = unionBBox(selection)` the outermost objects stay anchored
 * (the classic distribute); with the page box the run spans the page. A
 * negative gap (objects overflow the span) overlaps them evenly.
 */
export function distributeObjects(
  objects: LayoutObject[],
  axis: DistributeAxis,
  ref: BBox,
): LayoutObject[] {
  if (objects.length < 2) return objects;
  const main = axis === "h" ? ("x" as const) : ("y" as const);
  const size = axis === "h" ? ("w" as const) : ("h" as const);
  const sorted = objects
    .map((o) => ({ o, b: bboxOf(o) }))
    .sort((p, q) => p.b[main] - q.b[main]);
  const total = sorted.reduce((acc, it) => acc + it.b[size], 0);
  const gap = (ref[size] - total) / (sorted.length - 1);
  const placed = new Map<string, number>();
  let cursor = ref[main];
  for (const it of sorted) {
    placed.set(it.o.id, cursor);
    cursor += it.b[size] + gap;
  }
  return objects.map((o) => {
    const b = bboxOf(o);
    return withBBox(o, { ...b, [main]: placed.get(o.id)! });
  });
}
