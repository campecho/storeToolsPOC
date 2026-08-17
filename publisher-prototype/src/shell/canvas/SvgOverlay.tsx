import { visibleDocRect, type Size, type Viewport } from "../../core/geometry/viewport";
import type { EffectivePageSetup } from "../../core/render/pageSetup";

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
  setup,
  showProbe,
}: {
  viewport: Viewport;
  vpSize: Size;
  setup: EffectivePageSetup;
  showProbe: boolean;
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
    </svg>
  );
}
