import type { ColorValue } from "../model";

/**
 * Color arithmetic (PLAN.md §6.6 colour model, §4.3 Colour & swatches):
 * hex parsing and formatting, scaling between the model's 0–1 channels and
 * what people type (percent for CMYK, 0–255 for RGB), the HSV helpers a
 * visual picker needs, and the NAIVE device conversions. The naive formulas
 * are the fallback and the test oracle only — preview goes through the
 * press-profile tables in proof.ts, because (1 − c)(1 − k) renders 100%
 * cyan as pure #00ffff, which no press prints.
 *
 * Framework-free core (§6.1): pure functions, no DOM.
 */

/** 0–1 channels, the model's convention. */
export type Rgb = readonly [number, number, number];
export type Cmyk = readonly [number, number, number, number];

/** HSV for a visual picker: h in [0, 360), s and v in [0, 1]. */
export type Hsv = { h: number; s: number; v: number };

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/* ── Constructors ── */

/** A cmyk literal from integer-percent channels — the values a print
    operator works in. */
export function cmykPercent(c: number, m: number, y: number, k: number): ColorValue {
  return {
    space: "cmyk",
    values: [clamp01(c / 100), clamp01(m / 100), clamp01(y / 100), clamp01(k / 100)],
  };
}

/* ── Hex ── */

/** Six hex digits, with or without `#`, any case. Three-digit shorthand and
    eight-digit alpha are rejected: the model carries no alpha, and silent
    coercion hides typos. */
export function parseHex(text: string): Rgb | null {
  const match = /^\s*#?([0-9a-fA-F]{6})\s*$/.exec(text);
  const digits = match?.[1];
  if (digits === undefined) return null;
  const n = Number.parseInt(digits, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/** `#rrggbb`, lowercase. */
export function formatHex(rgb: Rgb): string {
  const to2 = (v: number) => to255(v).toString(16).padStart(2, "0");
  return `#${to2(rgb[0])}${to2(rgb[1])}${to2(rgb[2])}`;
}

/** A hex string as an rgb literal. Malformed input resolves to black — the
    soft-failure rule paint.ts already follows for a bad hex. */
export function colorFromHex(hex: string): ColorValue {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  return { space: "rgb", values: [rgb[0], rgb[1], rgb[2]] };
}

/* ── Display scaling ── */

export function to255(v: number): number {
  return Math.round(clamp01(v) * 255);
}

export function toPercent(v: number): number {
  return Math.round(clamp01(v) * 100);
}

/* ── Naive device conversion (fallback + oracle) ── */

/** channel = (1 − ink)(1 − k): deterministic both ways, never print-accurate. */
export function naiveCmykToRgb([c, m, y, k]: Cmyk): Rgb {
  const paper = 1 - k;
  return [(1 - c) * paper, (1 - m) * paper, (1 - y) * paper];
}

/** The inverse with a K-only black: any color whose brightest channel is 0
    is 0/0/0/100, never rich black. */
export function naiveRgbToCmyk([r, g, b]: Rgb): Cmyk {
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 1];
  const ink = (v: number) => clamp01((1 - v - k) / (1 - k));
  return [ink(r), ink(g), ink(b), k];
}

/* ── HSV ── */

export function rgbToHsv([r, g, b]: Rgb): Hsv {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  const [r, g, b]: Rgb =
    hh < 1 ? [c, x, 0] :
    hh < 2 ? [x, c, 0] :
    hh < 3 ? [0, c, x] :
    hh < 4 ? [0, x, c] :
    hh < 5 ? [x, 0, c] :
    [c, 0, x];
  return [clamp01(r + m), clamp01(g + m), clamp01(b + m)];
}
