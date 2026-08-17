import { DPI } from "../../core/geometry/viewport";
import type { ResizeHandle } from "../../core/gestures";
import { rotatedFrameCorners, selectionAabb, type Rect } from "../../core/hittest";
import type { LayoutObject } from "../../core/model";

/**
 * Committed-selection chrome (select tool only): the selection AABB as a
 * dashed frame carrying 8 square resize handles and the stemmed rotation
 * handle above top-center. Geometry is doc inches inside the viewBox-synced
 * overlay; handle SIZES compute from px via zoom so they stay constant on
 * screen at any zoom.
 *
 * A single rotated object additionally draws its rotated outline; the AABB
 * frame stays the handle carrier. NOTE: rotated-selection chrome fidelity
 * (handles on the rotated frame itself) is an SME review item, matching the
 * resize machine's rotated-resize note.
 */

export const CHROME_COLOR = "#2680eb";
const HANDLE_PX = 8;
const ROTATE_STEM_PX = 16;

const HANDLES: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

function handleCenter(handle: ResizeHandle, b: Rect): { x: number; y: number } {
  return {
    x: handle.includes("w") ? b.x : handle.includes("e") ? b.x + b.w : b.x + b.w / 2,
    y: handle.includes("n") ? b.y : handle.includes("s") ? b.y + b.h : b.y + b.h / 2,
  };
}

export function SelectionChrome({
  objects,
  zoom,
  onResizeStart,
  onRotateStart,
}: {
  /** The selected objects, in z-order. */
  objects: readonly LayoutObject[];
  zoom: number;
  onResizeStart: (handle: ResizeHandle, e: React.PointerEvent<SVGElement>) => void;
  onRotateStart: (e: React.PointerEvent<SVGElement>) => void;
}) {
  const bounds = selectionAabb(objects);
  if (bounds === null) return null;
  const pxToIn = (px: number) => px / (DPI * zoom);
  const handleSize = pxToIn(HANDLE_PX);
  const cx = bounds.x + bounds.w / 2;
  const rotateY = bounds.y - pxToIn(ROTATE_STEM_PX);
  // Lines carry no rotation — an all-line selection shows no rotate handle,
  // matching the gesture router refusing to start a rotate for one.
  const rotatable = objects.some((o) => o.type !== "line");
  const single = objects.length === 1 ? objects[0] : undefined;
  return (
    <g data-testid="selection-chrome">
      {single !== undefined && single.type !== "line" && single.rotation !== 0 && (
        <polygon
          points={rotatedFrameCorners(
            { x: single.x, y: single.y, w: single.w, h: single.h },
            single.rotation,
          )
            .map((p) => `${p.x},${p.y}`)
            .join(" ")}
          fill="none"
          stroke={CHROME_COLOR}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.w}
        height={bounds.h}
        fill="none"
        stroke={CHROME_COLOR}
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
      />
      {rotatable && (
        <>
          <line
            x1={cx}
            y1={bounds.y}
            x2={cx}
            y2={rotateY}
            stroke={CHROME_COLOR}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            className="chrome-handle"
            data-handle="rotate"
            cx={cx}
            cy={rotateY}
            r={handleSize / 2}
            fill="#ffffff"
            stroke={CHROME_COLOR}
            vectorEffect="non-scaling-stroke"
            onPointerDown={onRotateStart}
          />
        </>
      )}
      {HANDLES.map((handle) => {
        const center = handleCenter(handle, bounds);
        return (
          <rect
            key={handle}
            className="chrome-handle"
            data-handle={handle}
            x={center.x - handleSize / 2}
            y={center.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#ffffff"
            stroke={CHROME_COLOR}
            vectorEffect="non-scaling-stroke"
            onPointerDown={(e) => onResizeStart(handle, e)}
          />
        );
      })}
    </g>
  );
}
