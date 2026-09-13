import type { FrameObject, LayoutObject } from "@/schema";
import { DPI, inToPx } from "@/lib/layout/geometry";
import { bboxOf, type HandleDir } from "@/lib/layout/objects";
import {
  BANNER_DEFAULT_HEIGHT,
  BANNER_DEFAULT_INSET,
  clampBannerHeight,
  clampBannerInset,
  clampCornerRadius,
  isParametricShape,
  starInnerArmPoint,
  tailTipFor,
} from "@/lib/layout/shape-paths";

/**
 * Selection chrome (plan §3.2): brand frame + 8 resize handles around a
 * frame's bbox, endpoint handles for a line, and a stemmed rotate handle
 * above the top edge (plan L10). The whole frame rotates with the object, so
 * the handles track its rotation. Handles are fixed-px chrome; only they take
 * pointer events — the frame itself lets drags fall through to the object.
 *
 * Parametric shapes (merged from the publisher prototype) add AMBER adjust
 * handles — a different KIND of control from resize, so they take
 * Publisher's/PowerPoint's amber, drawn as rotated squares (diamonds). Each
 * sits on the value it sets: the rounded rect's radius on the top edge, the
 * star's ratio on its first inner vertex, the callout's tail ON the tip
 * (usually outside the frame), the banner's two on the panel edges they move.
 */

const HANDLE = 9;
/** How far the rotate handle floats above the frame's top edge, px. */
const ROTATE_ARM = 20;
/** Adjust handles read as a different kind of control from resize —
    Publisher's/PowerPoint's amber (prototype ADJUST_COLOR). */
const ADJUST_COLOR = "#f2b705";

/** Adjust-handle ids — the gesture each starts in the viewport. */
export type AdjustHandleId =
  | "corner-radius"
  | "inner-radius"
  | "callout-tail"
  | "banner-inset"
  | "banner-height";

type AdjustHandle = { id: AdjustHandleId; fx: number; fy: number };

/**
 * Where each adjustable kind's handles sit, in the frame's UNIT box (ported
 * from the prototype's adjustHandlesFor). `minInset` keeps a zero-radius /
 * minimum-inset handle from landing under the corner resize handles; the
 * radius drag applies travel, not position, so the floor costs the gesture
 * nothing.
 */
function adjustHandlesFor(obj: FrameObject, wIn: number, hIn: number, minInset: number): AdjustHandle[] {
  switch (obj.type) {
    case "roundedRect": {
      const r = clampCornerRadius(obj.cornerRadius ?? 0, wIn, hIn);
      return [{ id: "corner-radius", fx: Math.max(r, minInset) / (wIn || 1), fy: 0 }];
    }
    case "starPolygon": {
      const p = starInnerArmPoint(obj.points ?? 5, obj.innerRadiusRatio ?? 0.5);
      return [{ id: "inner-radius", fx: p.x, fy: p.y }];
    }
    case "callout": {
      const tip = obj.tailTip ?? tailTipFor("bottom-left");
      return [{ id: "callout-tail", fx: tip.x, fy: tip.y }];
    }
    case "banner": {
      const inset = clampBannerInset(obj.panelInset ?? BANNER_DEFAULT_INSET);
      const height = clampBannerHeight(obj.panelHeight ?? BANNER_DEFAULT_HEIGHT);
      return [
        { id: "banner-inset", fx: Math.max(inset * wIn, minInset) / (wIn || 1), fy: 1 },
        { id: "banner-height", fx: 0.5, fy: height },
      ];
    }
    default:
      return [];
  }
}

const FRAME_HANDLES: { dir: HandleDir; fx: number; fy: number; cursor: string }[] = [
  { dir: "nw", fx: 0, fy: 0, cursor: "nwse-resize" },
  { dir: "n", fx: 0.5, fy: 0, cursor: "ns-resize" },
  { dir: "ne", fx: 1, fy: 0, cursor: "nesw-resize" },
  { dir: "e", fx: 1, fy: 0.5, cursor: "ew-resize" },
  { dir: "se", fx: 1, fy: 1, cursor: "nwse-resize" },
  { dir: "s", fx: 0.5, fy: 1, cursor: "ns-resize" },
  { dir: "sw", fx: 0, fy: 1, cursor: "nesw-resize" },
  { dir: "w", fx: 0, fy: 0.5, cursor: "ew-resize" },
];

export function SelectionOverlay({
  obj,
  zoom,
  onHandleDown,
  onRotateDown,
  onEndpointDown,
  onAdjustDown,
}: {
  obj: LayoutObject;
  zoom: number;
  onHandleDown: (dir: HandleDir, e: React.PointerEvent) => void;
  /** Rotate-handle grab (frames only, plan L10). */
  onRotateDown: (e: React.PointerEvent) => void;
  onEndpointDown: (which: "p1" | "p2", e: React.PointerEvent) => void;
  /** Amber adjust-handle grab (parametric shapes, merged prototype tools). */
  onAdjustDown: (id: AdjustHandleId, e: React.PointerEvent) => void;
}) {
  if (obj.type === "line") {
    return (
      <>
        {(["p1", "p2"] as const).map((which) => (
          <div
            key={which}
            data-testid={`handle-${which}`}
            onPointerDown={(e) => onEndpointDown(which, e)}
            className="absolute rounded-full border border-brand bg-white"
            style={{
              width: HANDLE,
              height: HANDLE,
              left: inToPx(which === "p1" ? obj.x1 : obj.x2, zoom) - HANDLE / 2,
              top: inToPx(which === "p1" ? obj.y1 : obj.y2, zoom) - HANDLE / 2,
              cursor: "move",
            }}
          />
        ))}
      </>
    );
  }

  const b = bboxOf(obj);
  const x = inToPx(b.x, zoom);
  const y = inToPx(b.y, zoom);
  const w = inToPx(b.w, zoom);
  const h = inToPx(b.h, zoom);
  const rotation = obj.rotation;

  return (
    <div
      data-testid="selection-frame"
      className="pointer-events-none absolute"
      style={{
        left: x - 1,
        top: y - 1,
        width: w + 2,
        height: h + 2,
        // rotate the chrome about its center so handles track the object (L10)
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }}
    >
      <div className="absolute inset-0 border-[1.5px] border-brand" />

      {/* rotate handle — a dot on a short stem above the top edge */}
      <div
        className="pointer-events-none absolute bg-brand"
        style={{ left: (w + 2) / 2 - 0.5, top: -ROTATE_ARM, width: 1, height: ROTATE_ARM }}
      />
      <div
        data-testid="handle-rotate"
        onPointerDown={onRotateDown}
        className="pointer-events-auto absolute rounded-full border border-brand bg-white"
        style={{
          width: HANDLE,
          height: HANDLE,
          left: (w + 2) / 2 - HANDLE / 2,
          top: -ROTATE_ARM - HANDLE / 2,
          cursor: "grab",
        }}
      />

      {FRAME_HANDLES.map(({ dir, fx, fy, cursor }) => (
        <div
          key={dir}
          data-testid={`handle-${dir}`}
          onPointerDown={(e) => onHandleDown(dir, e)}
          className="pointer-events-auto absolute border border-brand bg-white"
          style={{
            width: HANDLE,
            height: HANDLE,
            left: fx * (w + 2) - HANDLE / 2,
            top: fy * (h + 2) - HANDLE / 2,
            cursor,
          }}
        />
      ))}

      {/* amber adjust handles — locked shapes keep chrome but refuse edits,
          so they get no adjust handle (prototype rule) */}
      {isParametricShape(obj) &&
        !obj.locked &&
        adjustHandlesFor(obj, b.w, b.h, HANDLE / (DPI * zoom)).map(({ id, fx, fy }) => (
          <div
            key={id}
            data-testid={`handle-adjust-${id}`}
            onPointerDown={(e) => onAdjustDown(id, e)}
            className="pointer-events-auto absolute rotate-45 border border-white"
            style={{
              width: HANDLE,
              height: HANDLE,
              left: fx * w - HANDLE / 2 + 1,
              top: fy * h - HANDLE / 2 + 1,
              backgroundColor: ADJUST_COLOR,
              cursor: "move",
            }}
          />
        ))}
    </div>
  );
}
