import { DPI, visibleDocRect, type Size, type Viewport } from "../../core/geometry/viewport";
import {
  penDraftSegments,
  type GesturePreview,
  type LineEndpointHandle,
  type ResizeHandle,
} from "../../core/gestures";
import { shapeOutline } from "../../core/geometry/shapePaths";
import { rotatedFrameCorners, type Rect } from "../../core/hittest";
import type { LayoutObject } from "../../core/model";
import type { PenAnchor } from "../../core/store";
import type { EffectivePageSetup } from "../../core/render/pageSetup";
import { pathToSvg } from "../../core/render/path";
import { CHROME_COLOR, SelectionChrome } from "./SelectionChrome";

/**
 * The SVG interaction overlay (PLAN.md §6.2). It shares the stage transform
 * by setting its viewBox to the visible document rectangle in inches, so
 * everything drawn here is in the same canonical coordinates as the Konva
 * content — staying in sync is exactly this one attribute.
 *
 * Selection chrome and gesture previews render here (snap guides will join
 * them). While a gesture is active its preview REPLACES the committed
 * selection chrome — the workspace hides the chrome, and the preview renders
 * pure machine state (PLAN.md §6.3: never a store dispatch per pointermove).
 * The alignment probe (debug-bar toggle) draws the page and bleed bounds so
 * overlay↔canvas registration is verifiable by eye at any zoom/pan.
 */

/** A frame box drawn at its own rotation — the outline every preview that
    stands in for a frame object uses, so ghosts hug their object exactly the
    way the committed chrome does. */
function FramePolygon({
  box,
  rotation,
  ...outline
}: { box: Rect; rotation: number } & React.SVGProps<SVGPolygonElement>) {
  return (
    <polygon
      points={rotatedFrameCorners(box, rotation)
        .map((p) => `${p.x},${p.y}`)
        .join(" ")}
      {...outline}
    />
  );
}

/** Serializable GesturePreview → outline shapes, all in doc inches. The move
    preview derives its frames from the selected objects, which that machine
    deliberately does not carry (its payload is one delta); resize and rotate
    state absolute geometry and draw straight from it. */
function PreviewShapes({
  preview,
  selectedObjects,
  zoom,
}: {
  preview: GesturePreview;
  selectedObjects: readonly LayoutObject[];
  /** Chrome dots (pen anchors/handles) keep screen size through the zoom. */
  zoom: number;
}) {
  const outline = {
    fill: "none",
    stroke: CHROME_COLOR,
    vectorEffect: "non-scaling-stroke",
  } as const;
  switch (preview.kind) {
    case "draw":
      return preview.shape === "rect" ? (
        <rect x={preview.x} y={preview.y} width={preview.w} height={preview.h} {...outline} />
      ) : (
        <ellipse
          cx={preview.x + preview.w / 2}
          cy={preview.y + preview.h / 2}
          rx={preview.w / 2}
          ry={preview.h / 2}
          {...outline}
        />
      );
    case "draw-path":
      // Normalized d denormalizes into the live drag box — same converter the
      // content layer renders committed path shapes with.
      return <path d={pathToSvg(preview.d, preview)} {...outline} />;
    case "pen-handle": {
      // The rubber tangent handle of an in-flight curve-anchor drag: the
      // handle line through the anchor plus dots at its ends. An under-slop
      // press degenerates to a single dot at the anchor.
      const r = 3.5 / (DPI * zoom);
      return (
        <>
          <line
            x1={preview.handleIn.x}
            y1={preview.handleIn.y}
            x2={preview.handleOut.x}
            y2={preview.handleOut.y}
            {...outline}
          />
          <circle cx={preview.point.x} cy={preview.point.y} r={r} fill={CHROME_COLOR} />
          <circle cx={preview.handleOut.x} cy={preview.handleOut.y} r={r * 0.7} fill={CHROME_COLOR} />
        </>
      );
    }
    case "line":
      return <line x1={preview.x1} y1={preview.y1} x2={preview.x2} y2={preview.y2} {...outline} />;
    case "marquee":
      return (
        <rect
          x={preview.x}
          y={preview.y}
          width={preview.w}
          height={preview.h}
          strokeDasharray="4 3"
          {...outline}
        />
      );
    case "move":
      // Ghosts hug what is moving — a rotated frame at its own rotation, a
      // line as a line — matching the committed chrome they replace.
      return (
        <>
          {selectedObjects.map((o) =>
            o.type === "line" ? (
              <line
                key={o.id}
                x1={o.x1 + preview.dx}
                y1={o.y1 + preview.dy}
                x2={o.x2 + preview.dx}
                y2={o.y2 + preview.dy}
                {...outline}
              />
            ) : (
              <FramePolygon
                key={o.id}
                box={{ x: o.x + preview.dx, y: o.y + preview.dy, w: o.w, h: o.h }}
                rotation={o.rotation}
                {...outline}
              />
            ),
          )}
        </>
      );
    case "resize": {
      // Resize never changes rotation, so the live frame is the scaled box
      // drawn at the object's committed angle.
      const rotationOf = new Map(
        selectedObjects.map((o) => [o.id, o.type === "line" ? 0 : o.rotation] as const),
      );
      return (
        <>
          {Object.entries(preview.boxes).map(([id, box]) =>
            "w" in box ? (
              <FramePolygon key={id} box={box} rotation={rotationOf.get(id) ?? 0} {...outline} />
            ) : (
              <line key={id} x1={box.x1} y1={box.y1} x2={box.x2} y2={box.y2} {...outline} />
            ),
          )}
        </>
      );
    }
    case "shape-param": {
      // The dragged parameters merged over the shape they belong to, drawn
      // through the same resolver the renderer uses — so the ghost is exactly
      // what commits. Only a lone shape starts an adjust gesture.
      const target = selectedObjects.find((o) => o.type === "shape");
      if (target === undefined || target.type !== "shape") return null;
      return (
        <path
          d={pathToSvg(shapeOutline({ ...target, ...preview.params }, target.w, target.h), {
            x: 0,
            y: 0,
            w: target.w,
            h: target.h,
          })}
          transform={`translate(${target.x} ${target.y}) rotate(${target.rotation} ${target.w / 2} ${target.h / 2})`}
          {...outline}
        />
      );
    }
    case "rotate":
      // A rigid-body turn moves members as well as turning them, so each
      // ghost is drawn on the ORBITED geometry at its new angle — lines
      // included, which carry the whole turn in their endpoints.
      return (
        <>
          {Object.entries(preview.boxes).map(([id, box]) =>
            "w" in box ? (
              <FramePolygon key={id} box={box} rotation={preview.rotations[id] ?? 0} {...outline} />
            ) : (
              <line key={id} x1={box.x1} y1={box.y1} x2={box.x2} y2={box.y2} {...outline} />
            ),
          )}
        </>
      );
  }
}

/** The committed pen draft (penSlice state): the drafted path so far, a dot
    per anchor, and — once the ring is closable — a ring on the first anchor
    marking the close target (pen.click-start.closes-path). */
function PenDraft({ anchors, zoom }: { anchors: readonly PenAnchor[]; zoom: number }) {
  const first = anchors[0];
  if (first === undefined) return null;
  const r = 3.5 / (DPI * zoom);
  return (
    <g data-testid="pen-draft">
      <path
        // Draft segments are already document inches — the identity box
        // makes pathToSvg a pure formatter here.
        d={pathToSvg(penDraftSegments(anchors), { x: 0, y: 0, w: 1, h: 1 })}
        fill="none"
        stroke={CHROME_COLOR}
        vectorEffect="non-scaling-stroke"
      />
      {anchors.map((anchor, i) => (
        <circle key={i} cx={anchor.point.x} cy={anchor.point.y} r={r} fill={CHROME_COLOR} />
      ))}
      {anchors.length >= 3 && (
        <circle
          cx={first.point.x}
          cy={first.point.y}
          r={2 * r}
          fill="none"
          stroke={CHROME_COLOR}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}

export function SvgOverlay({
  viewport,
  vpSize,
  setup,
  showProbe,
  preview,
  selectedObjects,
  groupedSelection,
  frameRotation,
  penDraft,
  showChrome,
  onResizeStart,
  onRotateStart,
  onShapeAdjustStart,
  onLineEndpointStart,
}: {
  viewport: Viewport;
  vpSize: Size;
  setup: EffectivePageSetup;
  showProbe: boolean;
  preview: GesturePreview | null;
  selectedObjects: readonly LayoutObject[];
  /** The selection IS one group's membership — the chrome says so (§5.1). */
  groupedSelection: boolean;
  /** The selected group's stored frame angle; 0 for anything else. */
  frameRotation: number;
  /** The pen draft's anchors while the pen tool is active; empty otherwise. */
  penDraft: readonly PenAnchor[];
  /** Select tool active and no gesture preview showing. */
  showChrome: boolean;
  onResizeStart: (handle: ResizeHandle, e: React.PointerEvent<SVGElement>) => void;
  onRotateStart: (e: React.PointerEvent<SVGElement>) => void;
  onShapeAdjustStart: (e: React.PointerEvent<SVGElement>) => void;
  onLineEndpointStart: (which: LineEndpointHandle, e: React.PointerEvent<SVGElement>) => void;
}) {
  if (vpSize.w <= 0 || vpSize.h <= 0) return null;
  const { size, bleed } = setup;
  const box = visibleDocRect(viewport, vpSize, size);
  return (
    <svg
      className="svg-overlay"
      width={vpSize.w}
      height={vpSize.h}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      data-testid="svg-overlay"
    >
      {showProbe && (
        <g className="alignment-probe" data-testid="alignment-probe">
          <rect
            x={0}
            y={0}
            width={size.w}
            height={size.h}
            fill="none"
            stroke="#d0396b"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            x={-bleed}
            y={-bleed}
            width={size.w + 2 * bleed}
            height={size.h + 2 * bleed}
            fill="none"
            stroke="#d0396b"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={size.w / 2 - 0.25}
            y1={size.h / 2}
            x2={size.w / 2 + 0.25}
            y2={size.h / 2}
            stroke="#d0396b"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={size.w / 2}
            y1={size.h / 2 - 0.25}
            x2={size.w / 2}
            y2={size.h / 2 + 0.25}
            stroke="#d0396b"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
      {showChrome && (
        <SelectionChrome
          objects={selectedObjects}
          grouped={groupedSelection}
          frameRotation={frameRotation}
          zoom={viewport.zoom}
          onResizeStart={onResizeStart}
          onRotateStart={onRotateStart}
          onShapeAdjustStart={onShapeAdjustStart}
          onLineEndpointStart={onLineEndpointStart}
        />
      )}
      <PenDraft anchors={penDraft} zoom={viewport.zoom} />
      {preview !== null && (
        <g data-testid="gesture-preview">
          <PreviewShapes preview={preview} selectedObjects={selectedObjects} zoom={viewport.zoom} />
        </g>
      )}
    </svg>
  );
}
