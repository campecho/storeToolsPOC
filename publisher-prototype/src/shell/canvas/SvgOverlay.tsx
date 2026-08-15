import { visibleDocRect, type Size, type Viewport } from "../../core/geometry/viewport";
import type { PageGeometry } from "../../core/store";

/**
 * The SVG interaction overlay (PLAN.md §6.2). It shares the stage transform
 * by setting its viewBox to the visible document rectangle in inches, so
 * everything drawn here is in the same canonical coordinates as the Konva
 * content — staying in sync is exactly this one attribute.
 *
 * Selection chrome, marquees, snap guides, and handles will render here.
 * Until they exist, the alignment probe (debug-bar toggle) draws the page
 * and bleed bounds so overlay↔canvas registration is verifiable by eye at
 * any zoom/pan.
 */
export function SvgOverlay({
  viewport,
  vpSize,
  page,
  showProbe,
}: {
  viewport: Viewport;
  vpSize: Size;
  page: PageGeometry;
  showProbe: boolean;
}) {
  if (vpSize.w <= 0 || vpSize.h <= 0) return null;
  const box = visibleDocRect(viewport, vpSize, { w: page.widthIn, h: page.heightIn });
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
            width={page.widthIn}
            height={page.heightIn}
            fill="none"
            stroke="#d0396b"
            vectorEffect="non-scaling-stroke"
          />
          <rect
            x={-page.bleedIn}
            y={-page.bleedIn}
            width={page.widthIn + 2 * page.bleedIn}
            height={page.heightIn + 2 * page.bleedIn}
            fill="none"
            stroke="#d0396b"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={page.widthIn / 2 - 0.25}
            y1={page.heightIn / 2}
            x2={page.widthIn / 2 + 0.25}
            y2={page.heightIn / 2}
            stroke="#d0396b"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={page.widthIn / 2}
            y1={page.heightIn / 2 - 0.25}
            x2={page.widthIn / 2}
            y2={page.heightIn / 2 + 0.25}
            stroke="#d0396b"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </svg>
  );
}
