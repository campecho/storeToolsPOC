import { objectAabb, type Rect } from "../hittest";
import type { LayoutObject } from "../model";
import type { FrameBox, LineEndpoints } from "../store/documentActions";

/**
 * Align & distribute math (PLAN.md §4.3 "align-distribute", §2.3):
 * framework-free geometry producing the absolute boxes an
 * object/resizeCommitted panel commit applies — alignment and distribution
 * are pure translations, so sizes pass through untouched (§2.3's
 * "distribution should preserve object size while adjusting position").
 *
 * Everything measures ROTATION-AWARE AABBs (core/hittest objectAabb): a
 * rotated frame aligns by the bounds it visually occupies, and the computed
 * delta translates the object's stored geometry (frame origin or line
 * endpoints). Locked objects are excluded here — the reducer would skip
 * them anyway, but the panel's payload states its intent.
 */

export type AlignEdge = "left" | "centerH" | "right" | "top" | "middleV" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

function translated(obj: LayoutObject, dx: number, dy: number): FrameBox | LineEndpoints {
  if (obj.type === "line") {
    return { x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy };
  }
  return { x: obj.x + dx, y: obj.y + dy, w: obj.w, h: obj.h };
}

function edgeDelta(aabb: Rect, edge: AlignEdge, target: Rect): { dx: number; dy: number } {
  switch (edge) {
    case "left":
      return { dx: target.x - aabb.x, dy: 0 };
    case "centerH":
      return { dx: target.x + target.w / 2 - (aabb.x + aabb.w / 2), dy: 0 };
    case "right":
      return { dx: target.x + target.w - (aabb.x + aabb.w), dy: 0 };
    case "top":
      return { dx: 0, dy: target.y - aabb.y };
    case "middleV":
      return { dx: 0, dy: target.y + target.h / 2 - (aabb.y + aabb.h / 2) };
    case "bottom":
      return { dx: 0, dy: target.y + target.h - (aabb.y + aabb.h) };
  }
}

/**
 * Absolute geometry aligning every unlocked object's AABB edge to the
 * target rectangle (the selection bounds, the page, or the margin box —
 * the panel resolves the reference). Objects already in place still appear
 * in the result: the commit is one deterministic absolute application.
 */
export function alignBoxes(
  objects: readonly LayoutObject[],
  edge: AlignEdge,
  target: Rect,
): Record<string, FrameBox | LineEndpoints> {
  const boxes: Record<string, FrameBox | LineEndpoints> = {};
  for (const obj of objects) {
    if (obj.locked) continue;
    const { dx, dy } = edgeDelta(objectAabb(obj), edge, target);
    boxes[obj.id] = translated(obj, dx, dy);
  }
  return boxes;
}

/**
 * Absolute geometry distributing the unlocked objects along one axis with
 * EQUAL GAPS between neighboring AABBs: the outermost two stay fixed, the
 * others move so every gap equals (span − Σ extents) / (n − 1) — negative
 * when the objects overlap, which still spaces them evenly. Needs at least
 * three movable objects; null otherwise.
 *
 * ASSUMPTION: distribution runs within the selection's own extent
 * (outermost objects anchor it) regardless of the panel's align reference —
 * §2.3 names the operation, not its container; working guess for SME
 * review.
 */
export function distributeBoxes(
  objects: readonly LayoutObject[],
  axis: DistributeAxis,
): Record<string, FrameBox | LineEndpoints> | null {
  const movable = objects
    .filter((o) => !o.locked)
    .map((obj) => ({ obj, aabb: objectAabb(obj) }));
  if (movable.length < 3) return null;
  const start = (r: Rect) => (axis === "horizontal" ? r.x : r.y);
  const extent = (r: Rect) => (axis === "horizontal" ? r.w : r.h);
  const sorted = [...movable].sort(
    (a, b) => start(a.aabb) - start(b.aabb) || a.obj.id.localeCompare(b.obj.id),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return null;
  const span = start(last.aabb) + extent(last.aabb) - start(first.aabb);
  const total = sorted.reduce((sum, m) => sum + extent(m.aabb), 0);
  const gap = (span - total) / (sorted.length - 1);
  const boxes: Record<string, FrameBox | LineEndpoints> = {};
  let cursor = start(first.aabb);
  for (const m of sorted) {
    const delta = cursor - start(m.aabb);
    boxes[m.obj.id] =
      axis === "horizontal" ? translated(m.obj, delta, 0) : translated(m.obj, 0, delta);
    cursor += extent(m.aabb) + gap;
  }
  return boxes;
}
