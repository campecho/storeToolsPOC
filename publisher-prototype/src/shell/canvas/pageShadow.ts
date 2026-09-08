/**
 * The page's drop shadow, matching the POC's page surface exactly
 * (storeToolsPOC src/components/layout-editor/canvas/PageSurface.tsx:
 * `box-shadow: 0 3px 16px rgba(0,0,0,.22)`). CSS blur radius and canvas
 * `shadowBlur` share a definition — both are twice the Gaussian standard
 * deviation — so the two surfaces read the same for the same numbers.
 *
 * The POC's shadow is CSS on a px-sized element, so it stays the same size on
 * screen at every zoom. Konva multiplies `shadowBlur` and `shadowOffset` by
 * the node's absolute scale, and the stage draws in inches at `96 × zoom`, so
 * the px values divide by that scale to land back at screen px once drawn —
 * fixed-px chrome, like the guides' `strokeScaleEnabled={false}` weights.
 */

const SHADOW_COLOR = "rgba(0, 0, 0, 0.22)";
const SHADOW_BLUR_PX = 16;
const SHADOW_OFFSET_Y_PX = 3;

/** Konva shadow props for the page rect, in stage-local (inch) units. */
export type PageShadowProps = {
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
};

/**
 * @param scale The stage scale in px per inch (`DPI × zoom`), which is what
 *   Konva multiplies the returned blur and offset by.
 */
export function pageShadow(scale: number): PageShadowProps {
  return {
    shadowColor: SHADOW_COLOR,
    shadowBlur: SHADOW_BLUR_PX / scale,
    shadowOffsetX: 0,
    shadowOffsetY: SHADOW_OFFSET_Y_PX / scale,
  };
}
