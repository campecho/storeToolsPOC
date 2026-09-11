import type { ColorValue, Paint, Swatch } from "../model";
import { cmykPercent, to255, type Rgb } from "../color/convert";
import { proofColor } from "../color/proof";

/**
 * Paint → CSS resolution — portable, framework-free preview color logic
 * shared by the Konva stage, the SVG overlay, and any future preview
 * surface. Every CSS color this module emits is the PRINT PREVIEW: a cmyk
 * literal as the press renders it, an rgb literal as it will look once
 * separated and printed, a spot swatch through its CMYK process fallback
 * (proof.ts, the "Print preview tables" surface in SEAMS.md). A field that
 * shows what was typed reads the literal through `resolvePaintColor`.
 */

/** A dangling swatch renders the print black, 100% K — the same black the
    contract-default stroke uses — never a rich rgb black. */
const FALLBACK_BLACK: ColorValue = cmykPercent(0, 0, 0, 100);

/** A tint is ink at t% of full strength: cmyk channels scale; rgb mixes
    toward paper white. Absent tint = full strength. */
function applyTint(color: ColorValue, tint: number | undefined): ColorValue {
  if (tint === undefined || tint >= 1) return color;
  if (color.space === "cmyk") {
    const [c, m, y, k] = color.values;
    return { space: "cmyk", values: [c * tint, m * tint, y * tint, k * tint] };
  }
  const [r, g, b] = color.values;
  return { space: "rgb", values: [1 - tint * (1 - r), 1 - tint * (1 - g), 1 - tint * (1 - b)] };
}

function toCss(rgb: Rgb): string {
  return `rgb(${to255(rgb[0])}, ${to255(rgb[1])}, ${to255(rgb[2])})`;
}

/** The literal color a paint stands for, with any swatch tint applied: a
    swatch reference through the list (spot → its CMYK fallback), a dangling
    swatchId → black — the soft-reference rule, never an error. */
export function resolvePaintColor(paint: Paint, swatches: readonly Swatch[]): ColorValue {
  if (paint.kind === "color") return paint.color;
  const swatch = swatches.find((s) => s.id === paint.swatchId);
  if (swatch === undefined) return FALLBACK_BLACK;
  const color: ColorValue =
    swatch.space === "rgb"
      ? { space: "rgb", values: swatch.values }
      : { space: "cmyk", values: swatch.values };
  return applyTint(color, paint.tint);
}

/** Resolve a Paint to a CSS color — the print preview. */
export function paintToCss(paint: Paint, swatches: readonly Swatch[]): string {
  return toCss(resolvePaint(paint, swatches));
}

/**
 * A Paint resolved to CSS and scaled toward black — what a shape's SHADED
 * parts render in (the banner's folds are the only ones today). Scaling every
 * channel keeps the hue and reads as the same surface in shadow, which mixing
 * toward a fixed grey would not.
 *
 * ASSUMPTION: 0.8 is measured off the reference ribbon, whose shaded fold is
 * its fill times 0.80 on all three channels — a working guess for SME review
 * beyond that one sample.
 */
export const SHADE_SCALE = 0.8;

export function paintToShadedCss(paint: Paint, swatches: readonly Swatch[]): string {
  const [r, g, b] = resolvePaint(paint, swatches);
  return toCss([r * SHADE_SCALE, g * SHADE_SCALE, b * SHADE_SCALE]);
}

/** PREVIEW rgb (0–1) for a paint: the print proof of its literal. */
function resolvePaint(paint: Paint, swatches: readonly Swatch[]): Rgb {
  return proofColor(resolvePaintColor(paint, swatches));
}
