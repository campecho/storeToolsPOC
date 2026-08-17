import { visibleDocRect, type Size, type Viewport } from "../../core/geometry/viewport";
import type { GesturePreview, ResizeHandle } from "../../core/gestures";
import { objectAabb, rotatedFrameCorners } from "../../core/hittest";
import type { LayoutObject } from "../../core/model";
import type { EffectivePageSetup } from "../../core/render/pageSetup";
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

/** Serializable GesturePreview → outline shapes, all in doc inches. Move and
    rotate previews derive their frames from the selected objects, which the
    machines deliberately do not carry (their payloads are deltas/rotations). */
function PreviewShapes({
  preview,
  selectedObjects,
}: {
  preview: GesturePreview;
  selectedObjects: readonly LayoutObject[];
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
      return (
        <>
          {selectedObjects.map((o) => {
            const box = objectAabb(o);
            return (
              <rect
                key={o.id}
                x={box.x + preview.dx}
                y={box.y + preview.dy}
                width={box.w}
                height={box.h}
                {...outline}
              />
            );
          })}
        </>
      );
    case "resize":
      return (
        <>
          {Object.entries(preview.boxes).map(([id, box]) =>
            "w" in box ? (
              <rect key={id} x={box.x} y={box.y} width={box.w} height={box.h} {...outline} />
            ) : (
              <line key={id} x1={box.x1} y1={box.y1} x2={box.x2} y2={box.y2} {...outline} />
            ),
          )}
        </>
      );
    case "rotate":
      return (
        <>
          {selectedObjects.map((o) => {
            if (o.type === "line") return null;
            const rotation = preview.rotations[o.id];
            if (rotation === undefined) return null;
            const corners = rotatedFrameCorners({ x: o.x, y: o.y, w: o.w, h: o.h }, rotation);
            return (
              <polygon
                key={o.id}
                points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
                {...outline}
              />
            );
          })}
        </>
      );
  }
}

export function SvgOverlay({
  viewport,
  vpSize,
  setup,
  showProbe,
  preview,
  selectedObjects,
  showChrome,
  onResizeStart,
  onRotateStart,
}: {
  viewport: Viewport;
  vpSize: Size;
  setup: EffectivePageSetup;
  showProbe: boolean;
  preview: GesturePreview | null;
  selectedObjects: readonly LayoutObject[];
  /** Select tool active and no gesture preview showing. */
  showChrome: boolean;
  onResizeStart: (handle: ResizeHandle, e: React.PointerEvent<SVGElement>) => void;
  onRotateStart: (e: React.PointerEvent<SVGElement>) => void;
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
          zoom={viewport.zoom}
          onResizeStart={onResizeStart}
          onRotateStart={onRotateStart}
        />
      )}
      {preview !== null && (
        <g data-testid="gesture-preview">
          <PreviewShapes preview={preview} selectedObjects={selectedObjects} />
        </g>
      )}
    </svg>
  );
}
