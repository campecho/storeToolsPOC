import { Layer, Line, Rect, Stage } from "react-konva";
import { DPI, pageOriginPx, type Size, type Viewport } from "../../core/geometry/viewport";
import { resolveColorRef } from "../../core/model/color";
import type { LayoutObject } from "../../core/model/objects";
import { objectPaint, type BoxedObject } from "../../core/model/paint";
import type { Swatch } from "../../core/model/primitives";
import type { PageGeometry } from "../../core/store";

/** Canvas furniture, not document ink: the greys the foundation draws with. */
const PLACEHOLDER_FILL = "#e4e4ea";
const BOUNDARY_STROKE = "#9aa0b4";

type KonvaPaint = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeScaleEnabled?: boolean;
  dash?: number[];
};

/** Core decides what an object amounts to; this maps that onto Konva props. */
function konvaPaint(o: BoxedObject, swatches: Swatch[]): KonvaPaint {
  const paint = objectPaint(o, swatches);

  // A hairline boundary stays 1px at every zoom; a document stroke is in
  // inches and must scale with the stage.
  const hairline = { strokeWidth: 1, strokeScaleEnabled: false } as const;

  if (paint.kind === "boundary") {
    return { stroke: BOUNDARY_STROKE, dash: [4, 3], ...hairline };
  }
  if (paint.kind === "placeholder") {
    return paint.stroke !== null && paint.strokeWidthIn !== null
      ? { fill: PLACEHOLDER_FILL, stroke: paint.stroke, strokeWidth: paint.strokeWidthIn }
      : { fill: PLACEHOLDER_FILL, stroke: BOUNDARY_STROKE, ...hairline };
  }
  return {
    ...(paint.fill !== null ? { fill: paint.fill } : {}),
    ...(paint.stroke !== null && paint.strokeWidthIn !== null
      ? { stroke: paint.stroke, strokeWidth: paint.strokeWidthIn }
      : {}),
  };
}

/**
 * The Konva render surface (PLAN.md §6.2): furniture and content layers in
 * canonical inches, with `zoom` applied as the stage scale and pan as the
 * stage position. Neither layer listens — interaction belongs to the SVG
 * overlay and the workspace's pointer handlers, never to Konva hit graphs.
 *
 * Content rendering is deliberately shallow: every object draws as its filled
 * box. Text, pictures, tables, and paths render as themselves with their own
 * Phase B groups; this is the canvas foundation, not the renderer.
 */
export function CanvasStage({
  viewport,
  vpSize,
  page,
  objects,
  swatches,
}: {
  viewport: Viewport;
  vpSize: Size;
  page: PageGeometry;
  objects: LayoutObject[];
  swatches: Swatch[];
}) {
  if (vpSize.w <= 0 || vpSize.h <= 0) return null;
  const origin = pageOriginPx(viewport, vpSize, { w: page.widthIn, h: page.heightIn });
  const scale = DPI * viewport.zoom;
  return (
    <Stage
      width={vpSize.w}
      height={vpSize.h}
      x={origin.x}
      y={origin.y}
      scaleX={scale}
      scaleY={scale}
      listening={false}
    >
      {/* Furniture: pasteboard is the container background; page fill, shadow,
          bleed and margin guides redraw only on page-setup or zoom change. */}
      <Layer listening={false}>
        <Rect
          x={0.06}
          y={0.06}
          width={page.widthIn}
          height={page.heightIn}
          fill="rgba(0,0,0,0.18)"
        />
        <Rect x={0} y={0} width={page.widthIn} height={page.heightIn} fill="#ffffff" />
        <Rect
          x={-page.bleedIn}
          y={-page.bleedIn}
          width={page.widthIn + 2 * page.bleedIn}
          height={page.heightIn + 2 * page.bleedIn}
          stroke="#c33"
          strokeWidth={1}
          strokeScaleEnabled={false}
          dash={[4, 4]}
        />
        <Rect
          x={page.marginIn}
          y={page.marginIn}
          width={page.widthIn - 2 * page.marginIn}
          height={page.heightIn - 2 * page.marginIn}
          stroke="#69c"
          strokeWidth={1}
          strokeScaleEnabled={false}
          dash={[6, 3]}
        />
      </Layer>
      {/* Content: document mutation cadence. */}
      <Layer listening={false}>
        {objects.map((o) =>
          o.type === "line" ? (
            <Line
              key={o.id}
              points={[o.x1In, o.y1In, o.x2In, o.y2In]}
              stroke={resolveColorRef(o.stroke.color, swatches) ?? undefined}
              strokeWidth={o.stroke.widthIn}
              opacity={o.opacity}
              perfectDrawEnabled={false}
            />
          ) : (
            <Rect
              key={o.id}
              x={o.xIn}
              y={o.yIn}
              width={o.wIn}
              height={o.hIn}
              rotation={o.rotationDeg}
              opacity={o.opacity}
              perfectDrawEnabled={false}
              {...konvaPaint(o, swatches)}
            />
          ),
        )}
      </Layer>
    </Stage>
  );
}
