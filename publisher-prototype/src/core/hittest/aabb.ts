import type { LayoutObject } from "../model";
import { boundsOfPoints, rotatedFrameCorners, type Rect } from "./geometry";

/**
 * Axis-aligned bounds over schema-v3 objects — what the marquee gesture and
 * the align/distribute math consume. Rotation-aware: a rotated frame's AABB
 * is the bounds of its rotated corners (pivot rule in geometry.ts); a line's
 * extent is the bounds of its endpoints.
 *
 * `selectionFrame` sits on top: the ROTATED frame the selection chrome draws
 * and the resize/rotate contexts scale about.
 */

export function objectAabb(obj: LayoutObject): Rect {
  if (obj.type === "line") {
    return boundsOfPoints([
      { x: obj.x1, y: obj.y1 },
      { x: obj.x2, y: obj.y2 },
    ]);
  }
  return boundsOfPoints(rotatedFrameCorners({ x: obj.x, y: obj.y, w: obj.w, h: obj.h }, obj.rotation));
}

/**
 * The selection's transform frame: the box the chrome draws and the resize
 * machine scales, plus the rotation it is drawn at. A lone frame object
 * contributes its OWN box and rotation, so the chrome hugs the object rather
 * than the space around it. Every other selection — several objects, or a
 * line, which carries no rotation — falls back to the union AABB, drawn
 * unrotated.
 */
export type SelectionFrame = { box: Rect; rotation: number };

export function selectionFrame(objects: readonly LayoutObject[]): SelectionFrame | null {
  const only = objects.length === 1 ? objects[0] : undefined;
  if (only !== undefined && only.type !== "line") {
    return { box: { x: only.x, y: only.y, w: only.w, h: only.h }, rotation: only.rotation };
  }
  const box = selectionAabb(objects);
  return box === null ? null : { box, rotation: 0 };
}

/** Union AABB of a selection; null for an empty selection. */
export function selectionAabb(objects: readonly LayoutObject[]): Rect | null {
  if (objects.length === 0) return null;
  let acc: Rect | null = null;
  for (const obj of objects) {
    const box = objectAabb(obj);
    if (acc === null) {
      acc = { ...box };
      continue;
    }
    const maxX = Math.max(acc.x + acc.w, box.x + box.w);
    const maxY = Math.max(acc.y + acc.h, box.y + box.h);
    acc.x = Math.min(acc.x, box.x);
    acc.y = Math.min(acc.y, box.y);
    acc.w = maxX - acc.x;
    acc.h = maxY - acc.y;
  }
  return acc;
}
