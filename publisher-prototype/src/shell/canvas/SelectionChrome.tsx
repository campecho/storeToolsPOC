import {
  BANNER_DEFAULT_HEIGHT,
  BANNER_DEFAULT_INSET,
  clampBannerHeight,
  clampBannerInset,
  clampCornerRadius,
} from "../../core/geometry/shapePaths";
import { DPI } from "../../core/geometry/viewport";
import {
  resizeHandlePoint,
  starInnerArmPoint,
  type LineEndpointHandle,
  type ResizeHandle,
} from "../../core/gestures";
import {
  framePivot,
  rotatePoint,
  rotatedFrameCorners,
  selectionFrame,
  type Point,
  type Rect,
} from "../../core/hittest";
import { tailTipFor, type LayoutObject, type ShapeObject } from "../../core/model";
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
 * A LONE LINE is the exception, and the reason is that a line is two points
 * rather than a box: it shows those two points as its handles and NOTHING
 * else — no frame, no stretch handles, and no rotation knob either, because
 * dragging an endpoint is how you turn it. (An arrow is a line carrying head
 * decorations, so it takes the same chrome by the same branch.) Inside a
 * multi-selection it rejoins the union frame and scales and turns with it.
 *
 * Every other selection carries the rotation handle: a rotation turns the
 * frame as a rigid body about its centre, which a line inside one answers by
 * orbiting its endpoints even though it stores no angle of its own.
 *
 * Each handle carries the cursor of the direction it stretches, which turns
 * with the frame too (canvas/cursors.ts).
 *
 * A lone shape whose kind has a parameter to drag additionally carries its
 * ADJUST handle — Publisher's yellow diamond, each contract's overlay target
 * — drawn at the point that parameter puts it: the rounded rect's radius
 * along the top edge, the star's inner vertex, the callout's tail tip.
 */

/** Every line the interaction layer draws — the selection frame and its
    handles, and the gesture previews that stand in for them mid-drag. One
    constant because a preview REPLACES the chrome (§6.3): a second colour
    would flip the frame on pointer-down and back on release. */
export const CHROME_COLOR = "#cc0000";
/** Group members read as a hint inside the frame, not as competing chrome:
    the chrome colour, dashed and faded, so the frame's own outline still reads
    as the thing being transformed. */
const GROUP_MEMBER_OPACITY = 0.5;
/** Adjust handles read as a different KIND of control from the resize
    handles, so they take Publisher's/PowerPoint's amber rather than the
    chrome colour. */
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

/** One adjust handle: the gesture it starts (its `data-handle` id) and where
    it sits, in the frame's UNIT box. */
export type AdjustHandle = { id: string; point: Point };

/**
 * Where each adjustable kind's handles sit — the point each parameter puts
 * its handle at, so a handle reads as the value it sets. A kind absent from
 * here has no adjustment to offer, and the BANNER is the one kind with two:
 * its ribbon takes two numbers, so it takes two handles.
 */
function adjustHandlesFor(shape: ShapeObject, box: Rect, minInsetX: number): AdjustHandle[] {
  switch (shape.shape) {
    case "roundedRect": {
      // On the top edge, inset by the radius: drag right to round, left to
      // square. At radius 0 it would land under the nw resize handle, so it
      // never draws closer than one handle-width in; the drag applies travel,
      // not position, so that floor costs the gesture nothing.
      const r = clampCornerRadius(shape.cornerRadius ?? 0, box.w, box.h);
      return [{ id: "corner-radius", point: { x: Math.max(r, minInsetX) / (box.w || 1), y: 0 } }];
    }
    case "starPolygon":
      // On the first inner vertex — the point the ratio literally places.
      return [
        {
          id: "inner-radius",
          point: starInnerArmPoint(shape.points ?? 5, shape.innerRadiusRatio ?? 0.5),
        },
      ];
    case "callout":
      // ON the tail's tip — the handle IS the point it sets, so dragging it
      // changes the tail's length and angle at once. Usually outside the unit
      // box, which is why the handle can sit beyond the selection frame.
      return [{ id: "callout-tail", point: shape.tailTip ?? tailTipFor("bottom-left") }];
    case "banner": {
      // One at the foot of the panel's left edge, one at the centre of its
      // bottom edge — each sitting on the edge it moves, where the reference
      // ribbon puts them. The inset handle shares the bottom edge with the sw
      // resize handle, so it keeps the same one-handle-width floor the corner
      // radius does; the drag reads where it is DROPPED, so the floor only
      // moves the diamond on a tiny banner, never the value it sets.
      const inset = clampBannerInset(shape.panelInset ?? BANNER_DEFAULT_INSET);
      const height = clampBannerHeight(shape.panelHeight ?? BANNER_DEFAULT_HEIGHT);
      return [
        {
          id: "banner-inset",
          point: { x: Math.max(inset * box.w, minInsetX) / (box.w || 1), y: 1 },
        },
        { id: "banner-height", point: { x: 0.5, y: height } },
      ];
    }
    default:
      return [];
  }
}

/**
 * What tells a GROUP apart from an ad-hoc multi-selection: each member
 * outlined inside the shared frame, so the frame reads as holding things
 * rather than merely spanning them (§5.1 "selection behavior must clearly
 * indicate grouped status"). Members are drawn where they are — a frame at
 * its own rotation, a line as a line — exactly like the move ghost.
 */
function GroupMembers({ objects }: { objects: readonly LayoutObject[] }) {
  const outline = {
    fill: "none",
    stroke: CHROME_COLOR,
    strokeDasharray: "3 2",
    opacity: GROUP_MEMBER_OPACITY,
    vectorEffect: "non-scaling-stroke",
  } as const;
  return (
    <g data-testid="group-members">
      {objects.map((o) =>
        o.type === "line" ? (
          <line key={o.id} x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2} {...outline} />
        ) : (
          <polygon
            key={o.id}
            points={rotatedFrameCorners({ x: o.x, y: o.y, w: o.w, h: o.h }, o.rotation)
              .map((p) => `${p.x},${p.y}`)
              .join(" ")}
            {...outline}
          />
        ),
      )}
    </g>
  );
}

export function SelectionChrome({
  objects,
  grouped,
  frameRotation,
  zoom,
  onResizeStart,
  onRotateStart,
  onShapeAdjustStart,
  onLineEndpointStart,
}: {
  /** The selected objects, in z-order. */
  objects: readonly LayoutObject[];
  /** True when the selection IS exactly one group's membership. */
  grouped: boolean;
  /** The angle the frame is drawn at when it is not a lone object's own: a
      group's stored rotation, 0 otherwise. */
  frameRotation: number;
  zoom: number;
  onResizeStart: (handle: ResizeHandle, e: React.PointerEvent<SVGElement>) => void;
  onRotateStart: (e: React.PointerEvent<SVGElement>) => void;
  /** Starts the adjust gesture the named handle owns. */
  onShapeAdjustStart: (handleId: string, e: React.PointerEvent<SVGElement>) => void;
  /** Starts the drag of one end of a lone line. */
  onLineEndpointStart: (which: LineEndpointHandle, e: React.PointerEvent<SVGElement>) => void;
}) {
  const frame = selectionFrame(objects, frameRotation);
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
  // The adjust handles, each where its own parameter puts it.
  const shape = loneShape(objects);
  const adjusts =
    shape === undefined
      ? []
      : adjustHandlesFor(shape, box, Math.min(handleSize, box.w / 2)).map((handle) => ({
          id: handle.id,
          at: toDoc({ x: box.x + handle.point.x * box.w, y: box.y + handle.point.y * box.h }),
        }));
  // A LONE line shows its two points and nothing else: a line is two points,
  // so a frame with eight stretch handles would be chrome for an object it is
  // not (the POC's SelectionOverlay draws exactly these two). No rotation knob
  // either — an endpoint drag already turns the segment, and two ways to do
  // one thing is one too many. Inside a multi-selection a line rejoins the
  // union frame, where the knob turns the whole body.
  const loneLine = objects.length === 1 && objects[0]?.type === "line" ? objects[0] : undefined;
  return (
    <g data-testid="selection-chrome">
      {grouped && <GroupMembers objects={objects} />}
      {loneLine === undefined && (
        <polygon
          points={rotatedFrameCorners(box, rotation)
            .map((p) => `${p.x},${p.y}`)
            .join(" ")}
          fill="none"
          stroke={CHROME_COLOR}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {loneLine === undefined && (
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
      {adjusts.map(({ id, at }) => (
        <rect
          key={id}
          className="chrome-handle"
          data-handle={id}
          x={at.x - handleSize / 2}
          y={at.y - handleSize / 2}
          width={handleSize}
          height={handleSize}
          // A diamond, turned with the frame — the shape Publisher and
          // PowerPoint both use to say "this one adjusts, it does not resize".
          transform={`rotate(${rotation + 45} ${at.x} ${at.y})`}
          fill={ADJUST_COLOR}
          stroke="#8a6800"
          vectorEffect="non-scaling-stroke"
          style={{ cursor: resizeCursor("e", rotation) }}
          onPointerDown={(e) => onShapeAdjustStart(id, e)}
        />
      ))}
      {loneLine !== undefined
        ? (["p1", "p2"] as const).map((which) => (
            <circle
              key={which}
              className="chrome-handle"
              data-handle={which}
              cx={which === "p1" ? loneLine.x1 : loneLine.x2}
              cy={which === "p1" ? loneLine.y1 : loneLine.y2}
              r={handleSize / 2}
              fill="#ffffff"
              stroke={CHROME_COLOR}
              vectorEffect="non-scaling-stroke"
              // An endpoint goes wherever it is dragged — no axis to name.
              style={{ cursor: "move" }}
              onPointerDown={(e) => onLineEndpointStart(which, e)}
            />
          ))
        : HANDLES.map((handle) => {
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
                // The cursor names the direction the handle stretches, which
                // the frame's rotation turns along with the handle itself.
                style={{ cursor: resizeCursor(handle, rotation) }}
                onPointerDown={(e) => onResizeStart(handle, e)}
              />
            );
          })}
    </g>
  );
}
