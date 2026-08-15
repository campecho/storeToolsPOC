import type { ColorRef, ColorValue, Fill, Swatch } from "./primitives";

/**
 * Colour resolution (PLAN.md §6.6, requirements §9.4) — turning a stored
 * `ColorRef` into something a renderer can paint.
 *
 * SCREEN PREVIEW ONLY. The CMYK and spot conversions here are the naive
 * algebraic ones, which is honest for a preview and wrong for output: real
 * conversion is ICC-profiled and belongs to the print/export seam (§6.7),
 * where the POC's `lcms2` lane is the working reference. §9.4's "color
 * conversion warnings" are a design-checker rule reading the same data, not a
 * better conversion here.
 */

/** Naive CMYK → sRGB, adequate for on-screen preview only (see module note). */
function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
}

/** A colour value as sRGB components in 0–1. */
export function toRgb(value: ColorValue): [number, number, number] {
  if (value.space === "rgb") {
    const [r = 0, g = 0, b = 0] = value.values;
    return [r, g, b];
  }
  // Spot previews through its CMYK alternate — the same four components.
  const [c = 0, m = 0, y = 0, k = 0] = value.values;
  return cmykToRgb(c, m, y, k);
}

/** A colour value as a CSS colour, optionally screened back to a tint. */
export function toCss(value: ColorValue, tint = 1): string {
  const [r, g, b] = toRgb(value);
  const channel = (v: number) => Math.round(Math.min(1, Math.max(0, 1 - tint * (1 - v))) * 255);
  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
}

/**
 * Resolve an ink reference against the document palette. A swatch id with no
 * matching swatch returns null rather than throwing — swatch ids are soft
 * references (see document.ts), so a dangling one must degrade.
 */
export function resolveColorRef(ref: ColorRef, swatches: readonly Swatch[]): string | null {
  if (ref.kind === "literal") return toCss(ref.value);
  const swatch = swatches.find((s) => s.id === ref.swatchId);
  return swatch ? toCss(swatch.value, ref.tint) : null;
}

/**
 * The flat colour to paint a fill with, or null for no paint. Gradients
 * resolve to their first stop until the Shapes group renders ramps properly —
 * a placeholder that is visibly the right hue rather than invisible.
 */
export function resolveFill(fill: Fill, swatches: readonly Swatch[]): string | null {
  if (fill.kind === "none") return null;
  if (fill.kind === "solid") return resolveColorRef(fill.color, swatches);
  const first = fill.stops[0];
  return first ? resolveColorRef(first.color, swatches) : null;
}
