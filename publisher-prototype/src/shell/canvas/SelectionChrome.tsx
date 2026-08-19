import { clampCornerRadius } from "../../core/geometry/shapePaths";
import { DPI } from "../../core/geometry/viewport";
import { resizeHandlePoint, starInnerArmPoint, type ResizeHandle } from "../../core/gestures";
import {
  framePivot,
  rotatePoint,
  rotatedFrameCorners,
  selectionFrame,
  type Point,
  type Rect,
} from "../../core/hittest";
import type { LayoutObject, ShapeObject } from "../../core/model";
import { resizeCursor, rotateCursor } from "./cursors";

/**
 * Committed-selection chrome (select tool only): the selection frame as a
 * solid outline carrying 8 square resize handles and the stemmed rotation
 * handle off its top edge. Geometry is doc inches inside the viewBox-synced
 * overlay; handle SIZES compute from px via zoom so they stay constant on
 * screen at any zoom.
 *
 * The frame is `selectionFrame`'s (core/hittest/aabb.ts) — a lone object's
 * own rotated box, so the chrome HUGS the object instead of boxing the space
 * around it. Handles and the rotation stem rotate with it, which is also the
 * space the resize machine scales in. Multi-selections and lines fall back to
 * the union AABB drawn unrotated.
 *
 * Every selection carries the rotation handle: a rotation turns the frame as
 * a rigid body about its centre, which a line answers by orbiting its
 * endpoints even though it stores no angle of its own.
 *
 * Each handle carries the cursor of the direction it stretches, which turns
 * with the frame too (canvas/cursors.ts).
 *
 * A lone shape whose kind has a parameter to drag additionally carries its
 * ADJUST handle — Publisher's yellow diamond, each contract's overlay target
 * — drawn at the point that parameter puts it: the rounded rect's radius
 * along the top edge, the star's inner vertex, the callout's tail tip.
 */

export const CHROME_COLOR = "#2680eb";
/** Adjust handles read as a different KIND of control from the resize
    handles, so they take Publisher's/PowerPoint's amber rather than the
    chrome blue. */
const ADJUST_COLOR = "#f2b705";
const HANDLE_PX = 8;
const ROTATE_STEM_PX = 16;

const HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** The lone adjustable shape a handle would belong to: adjust handles show
    for one unlocked shape at a time — a multi-selection has no single
    parameter to drag, and a locked shape refuses the gesture, so neither
    gets a handle to offer. */
function loneShape(objects: readonly LayoutObject[]): ShapeObject | undefined {
  const only = objects.length === 1 ? objects[0] : undefined;
  if (only === undefined || only.type !== "shape" || only.locked) return undefined;
  return only;
}

/**
 * Where each adjustable kind's handle sits, in the frame's UNIT box — the
 * point the parameter puts it at, so the handle reads as the value it sets.
 * A kind absent from here has no adjustment to offer.
 */
function adjustPointFor(shape: ShapeObject, box: Rect, minInsetX: number): Point | null {
  switch (shape.shape) {
    case "roundedRect": {
      // On the top edge, inset by the radius: drag right to round, left to
      // square. At radius 0 it would land under the nw resize handle, so it
      // never draws closer than one handle-width in; the drag applies travel,
      // not position, so that floor costs the gesture nothing.
      const r = clampCornerRadius(shape.cornerRadius ?? 0, box.w, box.h);
      return { x: Math.max(r, minInsetX) / (box.w || 1), y: 0 };
    }
    case "starPolygon":
      // On the first inner vertex — the point the ratio literally places.
      return starInnerArmPoint(shape.points ?? 5, shape.innerRadiusRatio ?? 0.5);
    case "callout": {
      // On the tail's tip corner; dragging it to another quadrant moves the
      // tail there.
      const anchor = shape.tailAnchor ?? "bottom-left";
      return {
        x: anchor.endsWith("right") ? 0.94 : 0.06,
        y: anchor.startsWith("bottom") ? 1 : 0,
      };
    }
    default:
      return null;
  }
}

/** The gesture an adjustable kind's handle starts, and the test id it wears. */
const ADJUST_HANDLE_ID: Partial<Record<ShapeObject["shape"], string>> = {
  roundedRect: "corner-radius",
  starPolygon: "inner-radius",
  callout: "callout-tail",
};

export function SelectionChrome({
  objects,
  zoom,
  onResizeStart,
  onRotateStart,
  onShapeAdjustStart,
}: {
  /** The selected objects, in z-order. */
  objects: readonly LayoutObject[];
  zoom: number;
  onResizeStart: (handle: ResizeHandle, e: React.PointerEvent<SVGElement>) => void;
  onRotateStart: (e: React.PointerEvent<SVGElement>) => void;
  /** Starts whichever adjust gesture the selected shape's kind owns. */
  onShapeAdjustStart: (e: React.PointerEvent<SVGElement>) => void;
}) {
  const frame = selectionFrame(objects);
  if (frame === null) return null;
  const { box, rotation } = frame;
  const pivot = framePivot(box);
  /** Frame space → document space: the chrome's one rotation-aware step. */
  const toDoc = (p: Point): Point => (rotation === 0 ? p : rotatePoint(p, pivot, rotation));
  const pxToIn = (px: number) => px / (DPI * zoom);
  const handleSize = pxToIn(HANDLE_PX);
  // The stem leaves the top edge along the frame's own up direction, so it
  // stays perpendicular to that edge at any rotation.
  const stemFoot = toDoc({ x: pivot.x, y: box.y });
  const knob = toDoc({ x: pivot.x, y: box.y - pxToIn(ROTATE_STEM_PX) });
  // The adjust handle, where the selected kind's parameter puts it.
  const shape = loneShape(objects);
  const unit =
    shape === undefined
      ? null
      : adjustPointFor(shape, box, Math.min(handleSize, box.w / 2));
  const adjust =
    unit === null ? null : toDoc({ x: box.x + unit.x * box.w, y: box.y + unit.y * box.h });
  const adjustId = shape === undefined ? undefined : ADJUST_HANDLE_ID[shape.shape];
  return (
    <g data-testid="selection-chrome">
      <polygon
        points={rotatedFrameCorners(box, rotation)
          .map((p) => `${p.x},${p.y}`)
          .join(" ")}
        fill="none"
        stroke={CHROME_COLOR}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={stemFoot.x}
        y1={stemFoot.y}
        x2={knob.x}
        y2={knob.y}
        stroke={CHROME_COLOR}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        className="chrome-handle"
        data-handle="rotate"
        cx={knob.x}
        cy={knob.y}
        r={handleSize / 2}
        fill="#ffffff"
        stroke={CHROME_COLOR}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: rotateCursor(rotation) }}
        onPointerDown={onRotateStart}
      />
      {adjust !== null && adjustId !== undefined && (
        <rect
          className="chrome-handle"
          data-handle={adjustId}
          x={adjust.x - handleSize / 2}
          y={adjust.y - handleSize / 2}
          width={handleSize}
          height={handleSize}
          // A diamond, turned with the frame — the shape Publisher and
          // PowerPoint both use to say "this one adjusts, it does not resize".
          transform={`rotate(${rotation + 45} ${adjust.x} ${adjust.y})`}
          fill={ADJUST_COLOR}
          stroke="#8a6800"
          vectorEffect="non-scaling-stroke"
          // It travels along the top edge, the axis the e/w handles stretch.
          style={{ cursor: resizeCursor("e", rotation) }}
          onPointerDown={onShapeAdjustStart}
        />
      )}
      {HANDLES.map((handle) => {
        const center = toDoc(resizeHandlePoint(handle, box));
        return (
          <rect
            key={handle}
            className="chrome-handle"
            data-handle={handle}
            x={center.x - handleSize / 2}
            y={center.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            // Squares sit square to the frame's edges, not the page's.
            transform={
              rotation === 0 ? undefined : `rotate(${rotation} ${center.x} ${center.y})`
            }
            fill="#ffffff"
            stroke={CHROME_COLOR}
            vectorEffect="non-scaling-stroke"
            // The cursor names the direction the handle stretches, which the
            // frame's rotation turns along with the handle itself.
            style={{ cursor: resizeCursor(handle, rotation) }}
            onPointerDown={(e) => onResizeStart(handle, e)}
          />
        );
      })}
    </g>
  );
}
