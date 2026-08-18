import { clampCornerRadius } from "../../core/geometry/shapePaths";
import { DPI } from "../../core/geometry/viewport";
import { resizeHandlePoint, type ResizeHandle } from "../../core/gestures";
import {
  framePivot,
  rotatePoint,
  rotatedFrameCorners,
  selectionFrame,
  type Point,
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
 * Each handle carries the cursor of the direction it stretches, which turns
 * with the frame too (canvas/cursors.ts).
 *
 * A lone rounded rectangle additionally carries the corner-radius ADJUST
 * handle — Publisher's yellow diamond, the roundedRect contract's overlay
 * target — inset along the top edge by the radius it sets.
 */

export const CHROME_COLOR = "#2680eb";
/** Adjust handles read as a different KIND of control from the resize
    handles, so they take Publisher's/PowerPoint's amber rather than the
    chrome blue. */
const ADJUST_COLOR = "#f2b705";
const HANDLE_PX = 8;
const ROTATE_STEM_PX = 16;

const HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** The lone rounded rectangle an adjust handle belongs to, if that is what
    is selected — every other selection has no corner to round, and a locked
    one refuses the gesture, so it gets no handle to offer. */
function loneRoundedRect(objects: readonly LayoutObject[]): ShapeObject | undefined {
  const only = objects.length === 1 ? objects[0] : undefined;
  if (only === undefined || only.type !== "shape") return undefined;
  return only.shape === "roundedRect" && !only.locked ? only : undefined;
}

export function SelectionChrome({
  objects,
  zoom,
  onResizeStart,
  onRotateStart,
  onCornerRadiusStart,
}: {
  /** The selected objects, in z-order. */
  objects: readonly LayoutObject[];
  zoom: number;
  onResizeStart: (handle: ResizeHandle, e: React.PointerEvent<SVGElement>) => void;
  onRotateStart: (e: React.PointerEvent<SVGElement>) => void;
  onCornerRadiusStart: (e: React.PointerEvent<SVGElement>) => void;
}) {
  const frame = selectionFrame(objects);
  if (frame === null) return null;
  const { box, rotation } = frame;
  const pivot = framePivot(box);
  /** Frame space → document space: the chrome's one rotation-aware step. */
  const toDoc = (p: Point): Point => (rotation === 0 ? p : rotatePoint(p, pivot, rotation));
  const pxToIn = (px: number) => px / (DPI * zoom);
  const handleSize = pxToIn(HANDLE_PX);
  // Lines carry no rotation — an all-line selection shows no rotate handle,
  // matching the gesture router refusing to start a rotate for one.
  const rotatable = objects.some((o) => o.type !== "line");
  // The stem leaves the top edge along the frame's own up direction, so it
  // stays perpendicular to that edge at any rotation.
  const stemFoot = toDoc({ x: pivot.x, y: box.y });
  const knob = toDoc({ x: pivot.x, y: box.y - pxToIn(ROTATE_STEM_PX) });
  // The adjust handle sits on the top edge, inset by the radius it sets —
  // drag it right to round the corners, left to square them. At radius 0 it
  // would land under the nw resize handle, so it never draws closer than one
  // handle-width in; the drag applies travel, not position, so that floor
  // costs the gesture nothing.
  const rounded = loneRoundedRect(objects);
  const adjust =
    rounded === undefined
      ? null
      : toDoc({
          x:
            box.x +
            Math.max(
              clampCornerRadius(rounded.cornerRadius ?? 0, box.w, box.h),
              Math.min(handleSize, box.w / 2),
            ),
          y: box.y,
        });
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
      {rotatable && (
        <>
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
        </>
      )}
      {adjust !== null && (
        <rect
          className="chrome-handle"
          data-handle="corner-radius"
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
          onPointerDown={onCornerRadiusStart}
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
