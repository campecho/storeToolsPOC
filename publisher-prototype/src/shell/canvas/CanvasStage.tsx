import { Layer, Rect, Stage } from "react-konva";
import { DPI, pageOriginPx, type Size, type Viewport } from "../../core/geometry/viewport";
import type { PageSetup, PlaceholderObject } from "../../core/store";

/**
 * The Konva render surface (PLAN.md §6.2): furniture and content layers in
 * canonical inches, with `zoom` applied as the stage scale and pan as the
 * stage position. Neither layer listens — interaction belongs to the SVG
 * overlay and the workspace's pointer handlers, never to Konva hit graphs.
 */
export function CanvasStage({
  viewport,
  vpSize,
  page,
  objects,
}: {
  viewport: Viewport;
  vpSize: Size;
  page: PageSetup;
  objects: PlaceholderObject[];
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
        {objects.map((o) => (
          <Rect
            key={o.id}
            x={o.xIn}
            y={o.yIn}
            width={o.wIn}
            height={o.hIn}
            rotation={o.rotationDeg}
            fill={o.fill}
            perfectDrawEnabled={false}
          />
        ))}
      </Layer>
    </Stage>
  );
}
