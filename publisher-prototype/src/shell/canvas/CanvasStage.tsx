import type { ReactNode } from "react";
import { Circle, Ellipse, Group, Layer, Line, Path, Rect, Stage, Text } from "react-konva";
import { clampCornerRadius, shapeOutline, shapeShading } from "../../core/geometry/shapePaths";
import { DPI, pageOriginPx, type Size, type Viewport } from "../../core/geometry/viewport";
import type { LayoutObject, LineObject, Paint, Stroke, Swatch } from "../../core/model";
import {
  arrowheadShape,
  dashPatternIn,
  headInsetIn,
  headLengthIn,
  trimmedSegment,
} from "../../core/render/lineDecor";
import type { EffectivePageSetup } from "../../core/render/pageSetup";
import { paintToCss, paintToShadedCss } from "../../core/render/paint";
import { pathToSvg } from "../../core/render/path";

/**
 * The Konva render surface (PLAN.md §6.2): furniture and content layers in
 * canonical inches, with `zoom` applied as the stage scale and pan as the
 * stage position. Neither layer listens — interaction belongs to the SVG
 * overlay and the workspace's pointer handlers, never to Konva hit graphs.
 *
 * Content renders schema-v3 objects: shapes and lines for real; textFrame,
 * pictureFrame, table, and mergeField as labeled placeholder frames until
 * their tools are wired. Frame rotation pivots at the frame CENTER —
 * decision of record (user-ratified 2026-08-17, recorded in SEAMS.md),
 * matching core/hittest's framePivot: each node positions at its center
 * with matching offsets so Konva rotation happens about that point.
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

/** One end's head, filled with the line's stroke color. `angle` is the
    direction the head points (from the other endpoint toward the tip). */
function renderHead(o: LineObject, end: "start" | "end", color: string): ReactNode {
  const head = end === "start" ? o.headStart : o.headEnd;
  const angle =
    end === "end"
      ? Math.atan2(o.y2 - o.y1, o.x2 - o.x1)
      : Math.atan2(o.y1 - o.y2, o.x1 - o.x2);
  const tip = end === "end" ? { x: o.x2, y: o.y2 } : { x: o.x1, y: o.y1 };
  const shape = arrowheadShape(head, tip, angle, headLengthIn(o.headSize, o.stroke.width));
  if (shape === null) return null;
  if (shape.kind === "circle") {
    return (
      <Circle
        x={shape.center.x}
        y={shape.center.y}
        radius={shape.radius}
        fill={color}
        perfectDrawEnabled={false}
      />
    );
  }
  return (
    <Line
      points={shape.points.flatMap((p) => [p.x, p.y])}
      closed
      fill={color}
      perfectDrawEnabled={false}
    />
  );
}

/** Line with its decorations: dash pattern from the schema's dash field and
    optional heads at either end (§4.4 arrows) — all geometry from
    core/render/lineDecor, so the dev team's output path shares it. */
function renderLine(o: LineObject, swatches: readonly Swatch[]): ReactNode {
  const color = paintToCss(o.stroke.paint, swatches);
  const dash = dashPatternIn(o.dash, o.stroke.width);
  // The stroke stops at each head's base rather than at the endpoint: a head
  // narrows to a point there, so a full-width stroke run all the way in spills
  // out past the point instead of meeting it.
  const headLength = headLengthIn(o.headSize, o.stroke.width);
  const [from, to] = trimmedSegment(
    { x: o.x1, y: o.y1 },
    { x: o.x2, y: o.y2 },
    headInsetIn(o.headStart, headLength),
    headInsetIn(o.headEnd, headLength),
  );
  return (
    <Group key={o.id}>
      <Line
        points={[from.x, from.y, to.x, to.y]}
        stroke={color}
        strokeWidth={o.stroke.width / PT_PER_IN}
        {...(dash !== null ? { dash } : {})}
        perfectDrawEnabled={false}
      />
      {renderHead(o, "start", color)}
      {renderHead(o, "end", color)}
    </Group>
  );
}

function renderObject(o: LayoutObject, swatches: readonly Swatch[]): ReactNode {
  switch (o.type) {
    case "shape": {
      const paint = { ...fillProps(o.fill, swatches), ...strokeProps(o.stroke, swatches) };
      if (o.shape === "rect") {
        return (
          <Rect
            key={o.id}
            x={o.x + o.w / 2}
            y={o.y + o.h / 2}
            offsetX={o.w / 2}
            offsetY={o.h / 2}
            width={o.w}
            height={o.h}
            rotation={o.rotation}
            {...paint}
            perfectDrawEnabled={false}
          />
        );
      }
      if (o.shape === "roundedRect") {
        // Parametric, not a baked path: Konva rounds the corners itself from
        // the inch radius, so they stay circular arcs however the frame is
        // scaled. The bound is applied here, never to the stored value.
        return (
          <Rect
            key={o.id}
            x={o.x + o.w / 2}
            y={o.y + o.h / 2}
            offsetX={o.w / 2}
            offsetY={o.h / 2}
            width={o.w}
            height={o.h}
            cornerRadius={clampCornerRadius(o.cornerRadius ?? 0, o.w, o.h)}
            rotation={o.rotation}
            {...paint}
            perfectDrawEnabled={false}
          />
        );
      }
      if (o.shape === "ellipse") {
        // An Ellipse's own origin is its center — positioning at the frame
        // center makes rotation pivot there with no offset needed.
        return (
          <Ellipse
            key={o.id}
            x={o.x + o.w / 2}
            y={o.y + o.h / 2}
            radiusX={o.w / 2}
            radiusY={o.h / 2}
            rotation={o.rotation}
            {...paint}
            perfectDrawEnabled={false}
          />
        );
      }
      // Every remaining kind draws its outline: a stored path, or a
      // parametric shape resolved from its parameters and this frame. Path
      // data is local to the frame box; center position + matching offsets
      // put the rotation pivot at the frame center like the others.
      const box = { x: 0, y: 0, w: o.w, h: o.h };
      const frame = {
        x: o.x + o.w / 2,
        y: o.y + o.h / 2,
        offsetX: o.w / 2,
        offsetY: o.h / 2,
        rotation: o.rotation,
      };
      // A kind whose outline needs more than one tone declares the darker
      // parts separately (the banner's folds). They paint OVER the outline in
      // the same fill scaled toward black, wearing the object's own stroke,
      // and sit inside the silhouette — so nothing but this renderer changes.
      // A HOLLOW shape has no fill to darken but still draws their edges: the
      // folds are part of how the shape is built, not decoration on the fill.
      const shading = shapeShading(o, o.w, o.h);
      return (
        <Group key={o.id}>
          <Path
            {...frame}
            data={pathToSvg(shapeOutline(o, o.w, o.h), box)}
            {...paint}
            perfectDrawEnabled={false}
          />
          {shading.length > 0 && (
            <Path
              {...frame}
              data={pathToSvg(shading, box)}
              {...(o.fill === null ? {} : { fill: paintToShadedCss(o.fill, swatches) })}
              {...strokeProps(o.stroke, swatches)}
              perfectDrawEnabled={false}
            />
          )}
        </Group>
      );
    }
    case "line":
      return renderLine(o, swatches);
    case "textFrame":
    case "pictureFrame":
    case "table":
    case "mergeField":
      // Light placeholder frame until these objects' tools are wired: a
      // stroked box plus a small type label, rotating as one node about the
      // frame center.
      return (
        <Group
          key={o.id}
          x={o.x + o.w / 2}
          y={o.y + o.h / 2}
          offsetX={o.w / 2}
          offsetY={o.h / 2}
          rotation={o.rotation}
        >
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
