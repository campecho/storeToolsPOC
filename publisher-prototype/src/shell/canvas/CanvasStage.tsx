import type { ReactNode } from "react";
import { Ellipse, Group, Layer, Line, Path, Rect, Stage, Text } from "react-konva";
import { DPI, pageOriginPx, type Size, type Viewport } from "../../core/geometry/viewport";
import type { LayoutObject, Paint, Stroke, Swatch } from "../../core/model";
import type { EffectivePageSetup } from "../../core/render/pageSetup";
import { paintToCss } from "../../core/render/paint";
import { pathToSvg } from "../../core/render/path";

/**
 * The Konva render surface (PLAN.md §6.2): furniture and content layers in
 * canonical inches, with `zoom` applied as the stage scale and pan as the
 * stage position. Neither layer listens — interaction belongs to the SVG
 * overlay and the workspace's pointer handlers, never to Konva hit graphs.
 *
 * Content renders schema-v3 objects: shapes and lines for real; textFrame,
 * pictureFrame, table, and mergeField as labeled placeholder frames until
 * their tools are wired. ASSUMPTION: frame rotation is about the frame's
 * top-left corner (the Konva Rect default the placeholder renderer
 * established); SME review may move it to the frame center.
 */

/** Stroke widths are points (the print-rule convention); the stage draws in
    inches, so widths divide by 72 and scale with zoom like real ink. */
const PT_PER_IN = 72;

const PLACEHOLDER_COLOR = "#8a97a8";

function fillProps(fill: Paint | null, swatches: readonly Swatch[]): { fill?: string } {
  return fill ? { fill: paintToCss(fill, swatches) } : {};
}

function strokeProps(
  stroke: Stroke | null,
  swatches: readonly Swatch[],
): { stroke?: string; strokeWidth?: number } {
  return stroke
    ? { stroke: paintToCss(stroke.paint, swatches), strokeWidth: stroke.width / PT_PER_IN }
    : {};
}

function renderObject(o: LayoutObject, swatches: readonly Swatch[]): ReactNode {
  switch (o.type) {
    case "shape": {
      const paint = { ...fillProps(o.fill, swatches), ...strokeProps(o.stroke, swatches) };
      if (o.shape === "rect") {
        return (
          <Rect
            key={o.id}
            x={o.x}
            y={o.y}
            width={o.w}
            height={o.h}
            rotation={o.rotation}
            {...paint}
            perfectDrawEnabled={false}
          />
        );
      }
      if (o.shape === "ellipse") {
        // Negative offsets keep the node's origin — and so its rotation
        // pivot — at the frame's top-left, matching rect semantics.
        return (
          <Ellipse
            key={o.id}
            x={o.x}
            y={o.y}
            offsetX={-o.w / 2}
            offsetY={-o.h / 2}
            radiusX={o.w / 2}
            radiusY={o.h / 2}
            rotation={o.rotation}
            {...paint}
            perfectDrawEnabled={false}
          />
        );
      }
      // Path data is local to the frame box; the node's position carries the
      // frame origin so rotation pivots at the top-left like the others.
      return (
        <Path
          key={o.id}
          x={o.x}
          y={o.y}
          rotation={o.rotation}
          data={pathToSvg(o.d ?? [], { x: 0, y: 0, w: o.w, h: o.h })}
          {...paint}
          perfectDrawEnabled={false}
        />
      );
    }
    case "line":
      return (
        <Line
          key={o.id}
          points={[o.x1, o.y1, o.x2, o.y2]}
          {...strokeProps(o.stroke, swatches)}
          perfectDrawEnabled={false}
        />
      );
    case "textFrame":
    case "pictureFrame":
    case "table":
    case "mergeField":
      // Light placeholder frame until these objects' tools are wired: a
      // stroked box plus a small type label, rotating as one node.
      return (
        <Group key={o.id} x={o.x} y={o.y} rotation={o.rotation}>
          <Rect
            width={o.w}
            height={o.h}
            stroke={PLACEHOLDER_COLOR}
            strokeWidth={1}
            strokeScaleEnabled={false}
            dash={[4, 3]}
            perfectDrawEnabled={false}
          />
          <Text text={o.type} x={0.06} y={0.06} fontSize={0.14} fill={PLACEHOLDER_COLOR} />
        </Group>
      );
  }
}

export function CanvasStage({
  viewport,
  vpSize,
  setup,
  objects,
  swatches,
}: {
  viewport: Viewport;
  vpSize: Size;
  setup: EffectivePageSetup;
  objects: readonly LayoutObject[];
  swatches: readonly Swatch[];
}) {
  if (vpSize.w <= 0 || vpSize.h <= 0) return null;
  const { size, bleed, margin } = setup;
  const origin = pageOriginPx(viewport, vpSize, size);
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
        <Rect x={0.06} y={0.06} width={size.w} height={size.h} fill="rgba(0,0,0,0.18)" />
        <Rect x={0} y={0} width={size.w} height={size.h} fill="#ffffff" />
        <Rect
          x={-bleed}
          y={-bleed}
          width={size.w + 2 * bleed}
          height={size.h + 2 * bleed}
          stroke="#c33"
          strokeWidth={1}
          strokeScaleEnabled={false}
          dash={[4, 4]}
        />
        <Rect
          x={margin}
          y={margin}
          width={size.w - 2 * margin}
          height={size.h - 2 * margin}
          stroke="#69c"
          strokeWidth={1}
          strokeScaleEnabled={false}
          dash={[6, 3]}
        />
      </Layer>
      {/* Content: document mutation cadence; z-order is array order. */}
      <Layer listening={false}>{objects.map((o) => renderObject(o, swatches))}</Layer>
    </Stage>
  );
}
