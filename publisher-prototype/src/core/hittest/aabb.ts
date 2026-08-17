import type { LayoutObject } from "../model";
import { boundsOfPoints, rotatedFrameCorners, type Rect } from "./geometry";

/**
 * Axis-aligned bounds over schema-v3 objects — what the overlay's selection
 * frame and the marquee/resize/rotate gesture contexts consume. Rotation-aware:
 * a rotated frame's AABB is the bounds of its rotated corners (pivot rule in
 * geometry.ts); a line's extent is the bounds of its endpoints.
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
