import { outlineOvershoot } from "../geometry/shapePaths";
import type { LayoutObject } from "../model";
import {
  PT_PER_IN,
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
 * How far a shape's paint reaches past its geometry: half its stroke width,
 * in inches, since a stroke straddles the path it follows.
 *
 * SHAPES ONLY, by decision (2026-09-08). Lines and arrows have the same gap —
 * a 12pt line's box is a zero-height segment through its middle, and an
 * arrowhead leaves the box entirely — but they are deliberately left on
 * centreline bounds for now, so this returns 0 for them rather than pretending
 * otherwise. An unstroked shape returns 0 too, which makes every caller below
 * a no-op on it.
 */
export function strokeOutsetIn(obj: LayoutObject): number {
  if (obj.type !== "shape" || obj.stroke === null) return 0;
  return obj.stroke.width / PT_PER_IN / 2;
}

function outsetRect(rect: Rect, by: number): Rect {
  if (by === 0) return rect;
  return { x: rect.x - by, y: rect.y - by, w: rect.w + 2 * by, h: rect.h + 2 * by };
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
 *
 * `outsetStroke` adds each shape's stroke halo — the preview-bounds reading,
 * used by the selection frame; measurement (`objectAabb`, and align through
 * it) stays geometric.
 */
function outlinePoints(objects: readonly LayoutObject[], outsetStroke = false): Point[] {
  return objects.flatMap((obj) => {
    if (obj.type === "line") {
      return [
        { x: obj.x1, y: obj.y1 },
        { x: obj.x2, y: obj.y2 },
      ];
    }
    const geo = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
    const outset = outsetStroke ? strokeOutsetIn(obj) : 0;
    // The halo grows the box in the object's OWN space, before the rotation is
    // applied — that is what keeps it an even band around a turned shape
    // rather than a band around the shape's axis-aligned bounds. Growing it
    // symmetrically leaves the centre alone, so the pivot is the geometric
    // one either way.
    const corners = rotatedFrameCorners(outsetRect(geo, outset), obj.rotation);
    if (obj.type !== "shape") return corners;
    const pivot = framePivot(geo);
    return corners.concat(
      outlineOvershoot(obj).flatMap((u) => {
        // Overshoot maps through the GEOMETRIC box — it is a point on the
        // outline, not a fraction of the halo — and its own paint then
        // reaches `outset` in every direction from it.
        const p = { x: geo.x + u.x * geo.w, y: geo.y + u.y * geo.h };
        const around =
          outset === 0
            ? [p]
            : [
                { x: p.x - outset, y: p.y - outset },
                { x: p.x + outset, y: p.y - outset },
                { x: p.x + outset, y: p.y + outset },
                { x: p.x - outset, y: p.y + outset },
              ];
        return around.map((q) => (obj.rotation === 0 ? q : rotatePoint(q, pivot, obj.rotation)));
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
  outsetStroke = false,
): Rect | null {
  if (objects.length === 0) return null;
  if (rotation === 0) return unionBounds(objects, outsetStroke);
  const origin = { x: 0, y: 0 };
  const box = boundsOfPoints(
    outlinePoints(objects, outsetStroke).map((p) => rotatePoint(p, origin, -rotation)),
  );
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
  outsetStroke = false,
): SelectionFrame | null {
  const only = objects.length === 1 ? objects[0] : undefined;
  if (only !== undefined && only.type !== "line") {
    const geo = { x: only.x, y: only.y, w: only.w, h: only.h };
    const box = outsetStroke ? outsetRect(geo, strokeOutsetIn(only)) : geo;
    return { box, rotation: only.rotation };
  }
  const box = orientedSelectionBox(objects, rotation, outsetStroke);
  return box === null ? null : { box, rotation };
}

/**
 * The frame the user SEES: `selectionFrame` grown by each shape's stroke halo
 * (Illustrator's "preview bounds"). A stroke straddles the path it follows, so
 * a geometric frame cuts through the middle of a heavy outline and the chrome
 * reads as misaligned with the shape.
 *
 * The chrome draws this, and resize scales it (deflating each object's own
 * halo back off on commit, so the painted edge lands where the handle was
 * dragged — core/gestures/resize.ts). Its CENTRE is the geometric one, the
 * halo being symmetric, so rotation is unaffected and reads the plain frame.
 * Measurement — `objectAabb`, `selectionAabb`, align & distribute, and the
 * Transform panel's editable x/y/w/h — deliberately stays geometric: those
 * report and edit the object's own stored box.
 */
export function selectionPreviewFrame(
  objects: readonly LayoutObject[],
  rotation = 0,
): SelectionFrame | null {
  return selectionFrame(objects, rotation, true);
}

/** The axis-aligned union over a selection — bounding every object's points
    at once is the same box as unioning their individual bounds, and says so
    in one step. */
function unionBounds(objects: readonly LayoutObject[], outsetStroke = false): Rect | null {
  if (objects.length === 0) return null;
  return boundsOfPoints(outlinePoints(objects, outsetStroke));
}

/** Union AABB of a selection; null for an empty selection. Geometric — the
    measurement path (align & distribute) does not take in strokes. */
export function selectionAabb(objects: readonly LayoutObject[]): Rect | null {
  return unionBounds(objects);
}
