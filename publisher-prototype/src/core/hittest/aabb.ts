import { outlineOvershoot } from "../geometry/shapePaths";
import type { LayoutObject } from "../model";
import {
  boundsOfPoints,
  framePivot,
  rotatePoint,
  rotatedFrameCorners,
  type Point,
  type Rect,
} from "./geometry";

/**
 * Axis-aligned bounds over schema-v3 objects — what the align/distribute math
 * and the selection frame consume. (The marquee does NOT: it tests the drawn
 * outline directly, in hitTest.ts.) Rotation-aware: a rotated frame's AABB is
 * the bounds of its rotated corners (pivot rule in geometry.ts); a line's
 * extent is the bounds of its endpoints; a callout's takes in its tail, which
 * is drawn outside the frame box.
 *
 * `selectionFrame` sits on top: the ROTATED frame the selection chrome draws
 * and the resize/rotate contexts scale about.
 */

export function objectAabb(obj: LayoutObject): Rect {
  return boundsOfPoints(outlinePoints([obj]));
}

/**
 * Every point a selection's bounds must contain: a frame's rotated corners, a
 * line's two endpoints, and — for a shape whose outline leaves its box — the
 * points it reaches past those corners.
 *
 * Only the callout does that today, and only at its tail tip: its base points
 * clamp to the body edge. So this stays exact without flattening anything,
 * which matters because bounds are taken per object, per align and per
 * selection frame. `outlineOvershoot` is the one place a kind declares it.
 */
function outlinePoints(objects: readonly LayoutObject[]): Point[] {
  return objects.flatMap((obj) => {
    if (obj.type === "line") {
      return [
        { x: obj.x1, y: obj.y1 },
        { x: obj.x2, y: obj.y2 },
      ];
    }
    const frame = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    const corners = rotatedFrameCorners(frame, obj.rotation);
    if (obj.type !== "shape") return corners;
    const pivot = framePivot(frame);
    return corners.concat(
      outlineOvershoot(obj).map((u) => {
        const p = { x: frame.x + u.x * frame.w, y: frame.y + u.y * frame.h };
        return obj.rotation === 0 ? p : rotatePoint(p, pivot, obj.rotation);
      }),
    );
  });
}

/**
 * The selection's bounds measured in a frame turned `rotation` degrees — the
 * smallest box at that angle that still contains everything. Zero is the
 * plain union AABB; any other angle un-turns the outline, bounds it square in
 * that space, and maps the result back.
 */
export function orientedSelectionBox(
  objects: readonly LayoutObject[],
  rotation: number,
): Rect | null {
  if (objects.length === 0) return null;
  if (rotation === 0) return selectionAabb(objects);
  const origin = { x: 0, y: 0 };
  const box = boundsOfPoints(outlinePoints(objects).map((p) => rotatePoint(p, origin, -rotation)));
  // The box lives in the un-turned space; its CENTRE maps back, and the frame
  // is that box about the mapped centre — drawing rotates about the centre
  // too, so the two agree corner for corner.
  const center = rotatePoint(framePivot(box), origin, rotation);
  return { x: center.x - box.w / 2, y: center.y - box.h / 2, w: box.w, h: box.h };
}

/**
 * The selection's transform frame: the box the chrome draws and the resize
 * machine scales, plus the rotation it is drawn at. A lone frame object
 * contributes its OWN box and rotation, so the chrome hugs the object rather
 * than the space around it.
 *
 * Every other selection takes `rotation` from its caller — a GROUP's stored
 * angle, or 0 for an ad-hoc multi-selection and for a lone line, which has no
 * angle of its own. A group's angle has to be stored rather than read back
 * from its members: rotating a group turns every member and orbits it, so the
 * members alone only ever yield an axis-aligned union and the frame would
 * spring back square after every turn. The BOX stays derived, so it keeps
 * hugging the members whatever happens to them inside the group.
 */
export type SelectionFrame = { box: Rect; rotation: number };

export function selectionFrame(
  objects: readonly LayoutObject[],
  rotation = 0,
): SelectionFrame | null {
  const only = objects.length === 1 ? objects[0] : undefined;
  if (only !== undefined && only.type !== "line") {
    return { box: { x: only.x, y: only.y, w: only.w, h: only.h }, rotation: only.rotation };
  }
  const box = orientedSelectionBox(objects, rotation);
  return box === null ? null : { box, rotation };
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
