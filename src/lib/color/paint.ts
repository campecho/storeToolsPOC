import type { ColorValue, Paint, Swatch } from "@/schema";
import { colorFromHex, formatHex, naiveColorToRgb, to255, toPercent, type Rgb } from "./convert";

/**
 * Paint resolution (redesign plan Phase 12) — the ONE place a Paint becomes a
 * color the canvas, the ribbon faces, the inspector, and the import fidelity
 * harness can use. Two distinct outputs, on purpose:
 *
 *   • `paintToCss` is the PREVIEW: what the screen shows for this paint.
 *   • `paintToHex` is the LITERAL: an rgb literal's exact hex (the picker's
 *     hex field, the fidelity harness's color check); a cmyk literal has no
 *     exact hex, so it reports the naive device value.
 *
 * Swatch references resolve through the document's swatch list (a spot
 * swatch renders its CMYK process fallback); a dangling id renders the
 * literal fallback black rather than erroring — the soft-reference rule
 * `masterId` already follows.
 */

const FALLBACK_BLACK: ColorValue = { space: "rgb", values: [0, 0, 0] };

export function solidPaint(color: ColorValue): Paint {
  return { kind: "color", color };
}

/** A literal rgb Paint from a hex string (malformed → black, see colorFromHex). */
export function hexPaint(hex: string): Paint {
  return solidPaint(colorFromHex(hex));
}

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

/** The literal color a paint stands for, with any swatch tint applied. */
export function resolvePaintColor(paint: Paint, swatches: readonly Swatch[]): ColorValue {
  if (paint.kind === "color") return paint.color;
  const swatch = swatches.find((s) => s.id === paint.swatchId);
  if (!swatch) return FALLBACK_BLACK;
  const color: ColorValue =
    swatch.space === "rgb" ? { space: "rgb", values: swatch.values } : { space: "cmyk", values: swatch.values };
  return applyTint(color, paint.tint);
}

/** PREVIEW rgb (0–1) for a paint. Naive device conversion until the
    GRACoL-derived tables land (Phase 12, print preview). */
export function paintToRgb(paint: Paint, swatches: readonly Swatch[]): Rgb {
  return naiveColorToRgb(resolvePaintColor(paint, swatches));
}

/** PREVIEW as a CSS color — what every canvas, thumbnail, and face renders. */
export function paintToCss(paint: Paint, swatches: readonly Swatch[]): string {
  const [r, g, b] = paintToRgb(paint, swatches);
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
}

/** LITERAL hex, lowercase: exact for an rgb literal (round-trips a v3 hex
    unchanged), the naive device value for cmyk. Not the preview. */
export function paintToHex(paint: Paint, swatches: readonly Swatch[]): string {
  return formatHex(naiveColorToRgb(resolvePaintColor(paint, swatches)));
}

/** Canonical identity at display precision — run-style grouping and
    active-swatch checks compare this, never JSON key order. */
export function paintKey(paint: Paint): string {
  if (paint.kind === "swatch") return `swatch:${paint.swatchId}:${paint.tint ?? 1}`;
  const c = paint.color;
  const scaled = c.space === "rgb" ? c.values.map(to255) : c.values.map(toPercent);
  return `${c.space}:${scaled.join(",")}`;
}

export function paintEquals(a: Paint | null | undefined, b: Paint | null | undefined): boolean {
  if (!a || !b) return a === b;
  return paintKey(a) === paintKey(b);
}
