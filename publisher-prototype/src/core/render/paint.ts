import type { ColorValue, Paint, Swatch } from "../model";

/**
 * Paint → CSS resolution — portable, framework-free preview color logic
 * shared by the Konva stage, the SVG overlay, and any future preview
 * surface. Print-fidelity color management is out of scope: cmyk and spot
 * render their fallback values, exactly as the color model specifies for
 * preview/separations-off output.
 */

type Rgb = readonly [number, number, number];

const FALLBACK_BLACK: Rgb = [0, 0, 0];

/** Naive preview conversion, channel = (1 − ink)(1 − k) — the fallback
    formula, not color management. */
function cmykToRgb(values: readonly [number, number, number, number]): Rgb {
  const [c, m, y, k] = values;
  return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
}

function colorValueToRgb(color: ColorValue): Rgb {
  return color.space === "rgb" ? color.values : cmykToRgb(color.values);
}

/** ASSUMPTION: a tint renders as a mix toward paper white (ink at t%), the
    print convention — the color model defines tint's strength, not its
    preview math. */
function applyTint(rgb: Rgb, tint: number): Rgb {
  const [r, g, b] = rgb;
  return [1 - tint * (1 - r), 1 - tint * (1 - g), 1 - tint * (1 - b)];
}

function toCss(rgb: Rgb): string {
  const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${to255(rgb[0])}, ${to255(rgb[1])}, ${to255(rgb[2])})`;
}

/** Parse a `#rrggbb` hex string (the `<input type="color">` form, the
    registry's color-option default format) into a literal rgb ColorValue
    with normalized 0–1 channels. A malformed string resolves to fallback
    black — this module's soft-failure rule, never an error. */
export function hexToColorValue(hex: string): ColorValue {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  const digits = match?.[1];
  if (digits === undefined) return { space: "rgb", values: [...FALLBACK_BLACK] };
  const n = Number.parseInt(digits, 16);
  return {
    space: "rgb",
    values: [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255],
  };
}

/** Resolve a Paint to a CSS color. Swatch references resolve through the
    given swatch list (spot swatches render their CMYK process fallback); a
    dangling swatchId renders the literal fallback black — the soft-reference
    rule, never an error. */
export function paintToCss(paint: Paint, swatches: readonly Swatch[]): string {
  if (paint.kind === "color") {
    return toCss(colorValueToRgb(paint.color));
  }
  const swatch = swatches.find((s) => s.id === paint.swatchId);
  const rgb =
    swatch === undefined
      ? FALLBACK_BLACK
      : swatch.space === "rgb"
        ? swatch.values
        : cmykToRgb(swatch.values);
  return toCss(paint.tint === undefined ? rgb : applyTint(rgb, paint.tint));
}
